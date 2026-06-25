"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupBusinessAnalyticsRoutes = setupBusinessAnalyticsRoutes;
const express_1 = __importDefault(require("express"));
const auth_1 = require("./auth");
const firebase_1 = require("../firebase");
const router = express_1.default.Router();
const COLLECTION = "business_analytics_visits";
const CYCLES_COLLECTION = "business_analytics_cycles";
/* ──────────────────────────────────────────
   UTILITY
   ────────────────────────────────────────── */
function parseNumber(value) {
    if (value == null || value === "")
        return 0;
    const n = Number(String(value).replace(",", "."));
    return Number.isFinite(n) ? n : 0;
}
function toIsoDate(value) {
    if (!value)
        return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().split("T")[0];
    }
    if (typeof value === "number") {
        const date = new Date(Math.round((value - 25569) * 86400 * 1000));
        if (!Number.isNaN(date.getTime()))
            return date.toISOString().split("T")[0];
    }
    const raw = String(value).trim();
    if (!raw)
        return null;
    if (raw.includes("/")) {
        const [datePart] = raw.split(" ");
        const parts = datePart.split("/");
        if (parts.length === 3) {
            const [dd, mm, yyyy] = parts;
            return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
        }
    }
    if (raw.includes("-"))
        return raw.split(" ")[0];
    return null;
}
function getPeriodRange(period, year, month, quarter) {
    const now = new Date();
    const y = year ? parseInt(year, 10) : now.getFullYear();
    if (period === "year")
        return { startDate: `${y}-01-01`, endDate: `${y}-12-31` };
    if (period === "quarter") {
        const q = quarter ? parseInt(quarter, 10) : Math.floor(now.getMonth() / 3) + 1;
        const startMonth = (q - 1) * 3 + 1;
        const endMonth = startMonth + 2;
        const endDay = new Date(y, endMonth, 0).getDate();
        return {
            startDate: `${y}-${String(startMonth).padStart(2, "0")}-01`,
            endDate: `${y}-${String(endMonth).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`,
        };
    }
    const m = month ? parseInt(month, 10) : now.getMonth() + 1;
    const lastDay = new Date(y, m, 0).getDate();
    return {
        startDate: `${y}-${String(m).padStart(2, "0")}-01`,
        endDate: `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
    };
}
function getPreviousPeriod(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const duration = end.getTime() - start.getTime();
    const prevEnd = new Date(start.getTime() - 86400000);
    const prevStart = new Date(prevEnd.getTime() - duration);
    return {
        startDate: prevStart.toISOString().split("T")[0],
        endDate: prevEnd.toISOString().split("T")[0],
    };
}
function getVisits(startDate, endDate) {
    return __awaiter(this, void 0, void 0, function* () {
        const snapshot = yield firebase_1.db
            .collection(COLLECTION)
            .where("date", ">=", startDate)
            .where("date", "<=", endDate)
            .orderBy("date", "desc")
            .get();
        return snapshot.docs.map((doc) => (Object.assign({ id: doc.id }, doc.data())));
    });
}
function getAllVisits() {
    return __awaiter(this, void 0, void 0, function* () {
        const snapshot = yield firebase_1.db.collection(COLLECTION).orderBy("date", "asc").get();
        return snapshot.docs.map((doc) => doc.data());
    });
}
function addMonths(dateStr, offset) {
    const [y, m] = dateStr.split("-").map((p) => parseInt(p, 10));
    const d = new Date(y, m - 1, 1);
    d.setMonth(d.getMonth() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function generateUUID() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}
/**
 * Filtro standard per escludere contratti e sessioni pending.
 * Da applicare in tutti gli endpoint che calcolano ricavi "realizzati".
 * Include: visite singole (is_cycle=false) E sessioni ciclo completate.
 * Esclude: contratti ciclo (is_cycle_contract=true) E sessioni pending.
 */
const REAL_VISIT_FILTER = (v) => !v.is_cycle_contract && (!v.is_cycle || v.status === "completed");
/* ──────────────────────────────────────────
   FORECAST UTILITIES (fix Bug 4: corrected CI formula)
   ────────────────────────────────────────── */
function buildMonthlySeries(visits) {
    const monthly = {};
    visits.forEach((v) => {
        if (!v.date)
            return;
        const key = String(v.date).slice(0, 7);
        // Usa clinic_revenue per il forecast (ricavo netto clinica)
        monthly[key] = (monthly[key] || 0) + (v.clinic_revenue || v.amount || 0);
    });
    const keys = Object.keys(monthly).sort();
    return keys.map((k) => ({ month: k, revenue: monthly[k] }));
}
function movingAverage(series, windowSize) {
    return series.map((_, i) => {
        const start = Math.max(0, i - windowSize + 1);
        const slice = series.slice(start, i + 1);
        return slice.reduce((a, b) => a + b, 0) / slice.length;
    });
}
function computeSeasonalityWeighted(series) {
    const monthBuckets = {};
    series.forEach((s) => {
        const m = s.month.slice(5, 7);
        if (!monthBuckets[m])
            monthBuckets[m] = [];
        monthBuckets[m].push(s.revenue);
    });
    // Calcola media pesata: ultimi anni pesano di più (exp decay α=0.7)
    const seasonalIndex = {};
    for (let m = 1; m <= 12; m++) {
        const key = String(m).padStart(2, "0");
        const values = monthBuckets[key] || [];
        if (values.length === 0) {
            seasonalIndex[key] = 1;
            continue;
        }
        let weightedSum = 0;
        let weightSum = 0;
        values.forEach((v, i) => {
            const weight = Math.pow(0.7, values.length - 1 - i);
            weightedSum += v * weight;
            weightSum += weight;
        });
        const weightedAvg = weightSum > 0 ? weightedSum / weightSum : 0;
        const allValues = Object.values(monthBuckets).flat();
        const overallAvg = allValues.length > 0
            ? allValues.reduce((a, b) => a + b, 0) / allValues.length
            : 1;
        seasonalIndex[key] = overallAvg > 0 ? weightedAvg / overallAvg : 1;
    }
    return seasonalIndex;
}
/**
 * Bug 4 FIX: linearForecast ora restituisce anche meanX e sumSqD
 * per il calcolo corretto dell'intervallo di confidenza.
 */
function linearForecast(series) {
    if (series.length < 2) {
        const avg = series.length ? series[0].revenue : 0;
        return { slope: 0, intercept: avg, stdDev: 0, meanX: 1, sumSqD: 0, n: 1 };
    }
    const points = series.map((s, i) => ({ x: i + 1, y: s.revenue }));
    const n = points.length;
    const sumX = points.reduce((s, p) => s + p.x, 0);
    const sumY = points.reduce((s, p) => s + p.y, 0);
    const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
    const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
    const denom = n * sumX2 - sumX * sumX || 1;
    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;
    const meanX = sumX / n;
    const sumSqD = sumX2 - (sumX * sumX) / n; // somma degli scarti quadratici
    // Deviazione standard dei residui
    const residuals = points.map((p) => {
        const predicted = intercept + slope * p.x;
        return p.y - predicted;
    });
    const meanResidual = residuals.reduce((a, b) => a + b, 0) / residuals.length;
    const variance = residuals.reduce((s, r) => s + Math.pow((r - meanResidual), 2), 0) /
        (residuals.length - 1 || 1);
    const stdDev = Math.sqrt(variance);
    return { slope, intercept, stdDev, meanX, sumSqD, n };
}
/**
 * Bug 4 FIX: formula corretta per prediction interval.
 * SE = stdDev * sqrt(1 + 1/n + (x_new - mean_x)^2 / sumSqD)
 * CI = 1.96 * SE (95% confidence)
 */
function computeConfInterval(stdDev, step, n, meanX, sumSqD) {
    const xNew = n + step; // punto di predizione
    const se = stdDev * Math.sqrt(1 + 1 / n + Math.pow(xNew - meanX, 2) / (sumSqD || 1));
    return 1.96 * se; // z-score per 95% CI
}
function buildMonthlySeriesByKey(visits, keyField, valueField) {
    const groups = {};
    visits.forEach((v) => {
        if (!v.date)
            return;
        const month = String(v.date).slice(0, 7);
        const key = v[keyField] || "Altro";
        if (!groups[key])
            groups[key] = {};
        groups[key][month] =
            (groups[key][month] || 0) + (v[valueField] || v.amount || 0);
    });
    const result = {};
    for (const [key, monthly] of Object.entries(groups)) {
        result[key] = Object.entries(monthly)
            .map(([m, r]) => ({ month: m, revenue: r }))
            .sort((a, b) => a.month.localeCompare(b.month));
    }
    return result;
}
/* ──────────────────────────────────────────
   HELPERS
   ────────────────────────────────────────── */
function computeStrengths(byKey) {
    const rows = Object.entries(byKey).map(([name, v]) => ({
        name,
        revenue: v.revenue,
        visits: v.visits,
        avgTicket: v.visits > 0 ? v.revenue / v.visits : 0,
        margin: v.margin,
    }));
    const sorted = [...rows].sort((a, b) => b.revenue - a.revenue);
    return { top: sorted.slice(0, 3), bottom: sorted.slice(-3).reverse() };
}
function getCurrentCompensation(professionalName) {
    return __awaiter(this, void 0, void 0, function* () {
        const snapshot = yield firebase_1.db
            .collection("professional_compensations")
            .where("professional_name", "==", professionalName)
            .where("effective_to", "==", null)
            .limit(1)
            .get();
        if (snapshot.empty)
            return null;
        return snapshot.docs[0].data().compensation_pct || null;
    });
}
/**
 * Bug 5 FIX: batch-load di TUTTI i compensi attivi in una sola query.
 * Da usare prima dei loop di import/manual-entry invece di chiamare
 * getCurrentCompensation() per ogni riga.
 */
function loadAllCompensations() {
    return __awaiter(this, void 0, void 0, function* () {
        const snapshot = yield firebase_1.db
            .collection("professional_compensations")
            .where("effective_to", "==", null)
            .get();
        const map = new Map();
        snapshot.forEach((doc) => {
            const data = doc.data();
            if (data.professional_name && data.compensation_pct != null) {
                map.set(data.professional_name, Number(data.compensation_pct));
            }
        });
        return map;
    });
}
/**
 * Parsing dei session_professionals da formato import.
 * Supporta sia range ("1-6") che numeri singoli.
 * Se non fornito, tutte le sessioni usano il professionista principale.
 */
function parseSessionProfessionals(raw, nSessions, defaultProfessional) {
    const result = [];
    const rawList = (raw === null || raw === void 0 ? void 0 : raw.sedute_professionisti) || (raw === null || raw === void 0 ? void 0 : raw.session_professionals);
    if (Array.isArray(rawList) && rawList.length > 0) {
        for (const sp of rawList) {
            const prof = String(sp.professional || sp.professional_name || defaultProfessional).trim();
            const range = String(sp.session_range || sp.session_number || "");
            if (range.includes("-")) {
                const [start, end] = range.split("-").map(Number);
                if (!isNaN(start) && !isNaN(end)) {
                    for (let s = start; s <= end && s <= nSessions; s++) {
                        result.push({ session_number: s, professional_name: prof });
                    }
                }
            }
            else {
                const num = Number(range);
                if (!isNaN(num) && num >= 1 && num <= nSessions) {
                    result.push({ session_number: num, professional_name: prof });
                }
            }
        }
    }
    // Default: tutte le sessioni non mappate usano il professionista principale
    if (result.length === 0) {
        for (let s = 1; s <= nSessions; s++) {
            result.push({ session_number: s, professional_name: defaultProfessional });
        }
    }
    return result;
}
/* ──────────────────────────────────────────
   ROUTES
   ────────────────────────────────────────── */
function setupBusinessAnalyticsRoutes() {
    router.use(auth_1.authenticateToken, (0, auth_1.authorizeRoles)("admin"));
    /* ==========================================
       POST /import  (enhanced — cycle support, auto-compensation, multi-prof)
       ========================================== */
    router.post("/import", (req, res) => __awaiter(this, void 0, void 0, function* () {
        try {
            const { data } = req.body;
            if (!Array.isArray(data) || data.length === 0) {
                return res.status(400).json({ error: "Dati non validi, atteso array non vuoto" });
            }
            // Bug 5 FIX: batch-load compensi prima del loop
            const compensationMap = yield loadAllCompensations();
            const batchSize = 400;
            let batches = [firebase_1.db.batch()];
            let batchIndex = 0;
            let opCount = 0;
            const addToBatch = (ref, docData) => {
                if (opCount >= batchSize) {
                    batches.push(firebase_1.db.batch());
                    batchIndex++;
                    opCount = 0;
                }
                batches[batchIndex].set(ref, docData);
                opCount++;
            };
            let imported = 0;
            for (const row of data) {
                const date = toIsoDate(row.Mese || row.mese || row.date || row.Data);
                if (!row.Professionista && !row.professionista)
                    continue;
                if (!row.Paziente && !row.paziente)
                    continue;
                if (!date)
                    continue;
                const professional = String(row.Professionista || row.professionista).trim();
                const patient = String(row.Paziente || row.paziente).trim();
                const service = String(row.Prestazione || row.prestazione || "").trim();
                const amount = parseNumber(row.Prezzo || row.prezzo);
                const nSessions = parseNumber(row.n_sedute || row.N_sedute) || 1;
                const unitPrice = nSessions > 1 && amount > 0
                    ? Math.round((amount / nSessions) * 100) / 100
                    : parseNumber(row.prezzo_unit || row.Prezzo_unit) || amount;
                const branch = String(row.Branca || row.branca || "Altro").trim();
                // Auto-detect compensation % from doctor config
                let pct = parseNumber(row.Spettanza || row.spettanza);
                if (!pct || pct === 0) {
                    // Bug 5 FIX: lookup from pre-loaded map instead of per-row query
                    const configPct = compensationMap.get(professional);
                    if (configPct !== undefined && configPct !== null)
                        pct = configPct;
                }
                const professionalFee = amount > 0 ? Math.round(amount * pct) / 100 : 0;
                const profit = parseNumber(row.Utile || row.utile) ||
                    Math.round((amount - professionalFee) * 100) / 100;
                const unitFee = parseNumber(row.spettanza_unit || row.Spettanza_unit) ||
                    (nSessions > 0 ? Math.round((professionalFee / nSessions) * 100) / 100 : 0);
                const unitProfit = parseNumber(row.Utile_unit || row.utile_unit) ||
                    (nSessions > 0 ? Math.round((profit / nSessions) * 100) / 100 : 0);
                const [year, month] = date.split("-");
                const q = Math.floor((parseInt(month, 10) - 1) / 3) + 1;
                const isCycle = nSessions > 1;
                if (isCycle) {
                    const cycleId = generateUUID();
                    // Multi-prof: parsing session_professionals
                    const sessionProfessionals = parseSessionProfessionals(row, nSessions, professional);
                    const uniqueProfessionals = [
                        ...new Set(sessionProfessionals.map((sp) => sp.professional_name)),
                    ];
                    // Crea il contratto (riga a valore pieno)
                    addToBatch(firebase_1.db.collection(COLLECTION).doc(), {
                        patient_name: patient,
                        professional_name: professional,
                        service_name: service,
                        branch,
                        amount,
                        professional_pct: pct,
                        professional_fee: professionalFee,
                        clinic_revenue: profit,
                        n_sessions: nSessions,
                        unit_price: unitPrice,
                        unit_professional_fee: unitFee,
                        unit_clinic_revenue: unitProfit,
                        date,
                        year,
                        month,
                        quarter: `Q${q}`,
                        import_source: row.import_source || "import",
                        imported_at: new Date().toISOString(),
                        cycle_id: cycleId,
                        cycle_total: amount,
                        cycle_sessions_total: nSessions,
                        cycle_session_number: 0,
                        is_cycle: true,
                        is_cycle_contract: true,
                        status: "completed",
                    });
                    imported++;
                    // Crea le N sedute con professionista corretto per sessione
                    for (let s = 1; s <= nSessions; s++) {
                        const sessionDate = addMonths(date, s - 1);
                        const [sy, sm] = sessionDate.split("-");
                        const sq = Math.floor((parseInt(sm, 10) - 1) / 3) + 1;
                        // Multi-prof: trova il professionista per questa sessione
                        const sp = sessionProfessionals.find((x) => x.session_number === s);
                        const sessionProfessional = (sp === null || sp === void 0 ? void 0 : sp.professional_name) || professional;
                        addToBatch(firebase_1.db.collection(COLLECTION).doc(), {
                            patient_name: patient,
                            professional_name: sessionProfessional,
                            service_name: service,
                            branch,
                            amount: unitPrice,
                            professional_pct: pct,
                            professional_fee: unitFee,
                            clinic_revenue: unitProfit,
                            n_sessions: 1,
                            unit_price: unitPrice,
                            unit_professional_fee: unitFee,
                            unit_clinic_revenue: unitProfit,
                            date: sessionDate,
                            year: sy,
                            month: sm,
                            quarter: `Q${sq}`,
                            import_source: row.import_source || "import",
                            imported_at: new Date().toISOString(),
                            cycle_id: cycleId,
                            cycle_total: amount,
                            cycle_sessions_total: nSessions,
                            cycle_session_number: s,
                            is_cycle: true,
                            is_cycle_contract: false,
                            status: "pending",
                        });
                        imported++;
                    }
                    // Crea il record ciclo con metadati multi-professionista
                    addToBatch(firebase_1.db.collection(CYCLES_COLLECTION).doc(cycleId), {
                        patient_name: patient,
                        professional_name: professional,
                        service_name: service,
                        branch,
                        total_sessions: nSessions,
                        completed_sessions: 0,
                        total_amount: amount,
                        unit_price: unitPrice,
                        professional_pct: pct,
                        start_date: date,
                        end_date: null,
                        status: "active",
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                        // Multi-prof: lista professionisti e mapping sessioni
                        professionals: uniqueProfessionals,
                        session_professionals: sessionProfessionals,
                    });
                }
                else {
                    // Visita singola
                    addToBatch(firebase_1.db.collection(COLLECTION).doc(), {
                        patient_name: patient,
                        professional_name: professional,
                        service_name: service,
                        branch,
                        amount,
                        professional_pct: pct,
                        professional_fee: professionalFee,
                        clinic_revenue: profit,
                        n_sessions: 1,
                        unit_price: unitPrice,
                        unit_professional_fee: unitFee,
                        unit_clinic_revenue: unitProfit,
                        date,
                        year,
                        month,
                        quarter: `Q${q}`,
                        import_source: row.import_source || "import",
                        imported_at: new Date().toISOString(),
                        is_cycle: false,
                        is_cycle_contract: false,
                        status: "completed",
                    });
                    imported++;
                }
            }
            for (const batch of batches) {
                yield batch.commit();
            }
            res.json({ imported });
        }
        catch (err) {
            console.error("POST /business-analytics/import error:", err);
            res.status(500).json({ error: "Errore durante l'importazione" });
        }
    }));
    /* ==========================================
       POST /manual-entry  (fix Bug 5 + multi-prof support)
       ========================================== */
    router.post("/manual-entry", (req, res) => __awaiter(this, void 0, void 0, function* () {
        try {
            const { patient_name, professional_name, service_name, branch, amount, professional_pct, n_sessions, date, session_professionals, } = req.body;
            if (!patient_name || !professional_name) {
                return res.status(400).json({ error: "Paziente e Professionista obbligatori" });
            }
            // Bug 5 FIX: batch-load invece di per-row query
            const compensationMap = yield loadAllCompensations();
            let pct = professional_pct
                ? Number(professional_pct)
                : compensationMap.get(professional_name) || 0;
            const isoDate = toIsoDate(date) || new Date().toISOString().split("T")[0];
            const sessions = Math.max(1, parseInt(String(n_sessions), 10) || 1);
            const totalAmount = parseNumber(amount);
            const unitPrice = sessions > 0 ? Math.round((totalAmount / sessions) * 100) / 100 : 0;
            const fee = totalAmount > 0 ? Math.round(totalAmount * pct) / 100 : 0;
            const clinicRev = Math.round((totalAmount - fee) * 100) / 100;
            const unitFee = sessions > 0 ? Math.round((fee / sessions) * 100) / 100 : 0;
            const unitRev = sessions > 0 ? Math.round((clinicRev / sessions) * 100) / 100 : 0;
            const [year, month] = isoDate.split("-");
            const q = Math.floor((parseInt(month, 10) - 1) / 3) + 1;
            const batch = firebase_1.db.batch();
            const created = [];
            if (sessions > 1) {
                const cycleId = generateUUID();
                // Multi-prof: parsing session_professionals
                const sessionProfs = parseSessionProfessionals({ session_professionals }, sessions, professional_name);
                const uniqueProfessionals = [
                    ...new Set(sessionProfs.map((sp) => sp.professional_name)),
                ];
                // Contratto
                const contractRef = firebase_1.db.collection(COLLECTION).doc();
                const contractData = {
                    patient_name,
                    professional_name,
                    service_name: service_name || "",
                    branch: branch || "Altro",
                    amount: totalAmount,
                    professional_pct: pct,
                    professional_fee: fee,
                    clinic_revenue: clinicRev,
                    n_sessions: sessions,
                    unit_price: unitPrice,
                    unit_professional_fee: unitFee,
                    unit_clinic_revenue: unitRev,
                    date: isoDate,
                    year,
                    month,
                    quarter: `Q${q}`,
                    import_source: "manual",
                    imported_at: new Date().toISOString(),
                    cycle_id: cycleId,
                    cycle_total: totalAmount,
                    cycle_sessions_total: sessions,
                    cycle_session_number: 0,
                    is_cycle: true,
                    is_cycle_contract: true,
                    status: "completed",
                };
                batch.set(contractRef, contractData);
                created.push(Object.assign({ id: contractRef.id }, contractData));
                // N sedute pending con professionista per sessione
                for (let s = 1; s <= sessions; s++) {
                    const sessionDate = addMonths(isoDate, s - 1);
                    const [sy, sm] = sessionDate.split("-");
                    const sq = Math.floor((parseInt(sm, 10) - 1) / 3) + 1;
                    // Multi-prof: professionista corretto per questa sessione
                    const sp = sessionProfs.find((x) => x.session_number === s);
                    const sessionProfessional = (sp === null || sp === void 0 ? void 0 : sp.professional_name) || professional_name;
                    const ref = firebase_1.db.collection(COLLECTION).doc();
                    const sessionData = {
                        patient_name,
                        professional_name: sessionProfessional,
                        service_name: service_name || "",
                        branch: branch || "Altro",
                        amount: unitPrice,
                        professional_pct: pct,
                        professional_fee: unitFee,
                        clinic_revenue: unitRev,
                        n_sessions: 1,
                        unit_price: unitPrice,
                        unit_professional_fee: unitFee,
                        unit_clinic_revenue: unitRev,
                        date: sessionDate,
                        year: sy,
                        month: sm,
                        quarter: `Q${sq}`,
                        import_source: "manual",
                        imported_at: new Date().toISOString(),
                        cycle_id: cycleId,
                        cycle_total: totalAmount,
                        cycle_sessions_total: sessions,
                        cycle_session_number: s,
                        is_cycle: true,
                        is_cycle_contract: false,
                        status: "pending",
                    };
                    batch.set(ref, sessionData);
                    created.push(Object.assign({ id: ref.id }, sessionData));
                }
                // Record ciclo con metadati multi-prof
                batch.set(firebase_1.db.collection(CYCLES_COLLECTION).doc(cycleId), {
                    patient_name,
                    professional_name,
                    service_name: service_name || "",
                    branch: branch || "Altro",
                    total_sessions: sessions,
                    completed_sessions: 0,
                    total_amount: totalAmount,
                    unit_price: unitPrice,
                    professional_pct: pct,
                    start_date: isoDate,
                    end_date: null,
                    status: "active",
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    professionals: uniqueProfessionals,
                    session_professionals: sessionProfs,
                });
            }
            else {
                // Visita singola
                const ref = firebase_1.db.collection(COLLECTION).doc();
                const visitData = {
                    patient_name,
                    professional_name,
                    service_name: service_name || "",
                    branch: branch || "Altro",
                    amount: totalAmount,
                    professional_pct: pct,
                    professional_fee: fee,
                    clinic_revenue: clinicRev,
                    n_sessions: 1,
                    unit_price: totalAmount,
                    unit_professional_fee: fee,
                    unit_clinic_revenue: clinicRev,
                    date: isoDate,
                    year,
                    month,
                    quarter: `Q${q}`,
                    import_source: "manual",
                    imported_at: new Date().toISOString(),
                    is_cycle: false,
                    is_cycle_contract: false,
                    status: "completed",
                };
                batch.set(ref, visitData);
                created.push(Object.assign({ id: ref.id }, visitData));
            }
            yield batch.commit();
            res.status(201).json({ created: created.length, visits: created });
        }
        catch (err) {
            console.error("POST /business-analytics/manual-entry error:", err);
            res.status(500).json({ error: "Errore nell'inserimento manuale" });
        }
    }));
    /* ==========================================
       POST /cycle — FIX Bug 2: ora crea anche le righe visita
       ========================================== */
    router.post("/cycle", (req, res) => __awaiter(this, void 0, void 0, function* () {
        try {
            const { patient_name, professional_name, service_name, branch, total_sessions, total_amount, professional_pct, start_date, session_professionals, } = req.body;
            if (!patient_name || !professional_name || !total_sessions || !total_amount) {
                return res.status(400).json({
                    error: "patient_name, professional_name, total_sessions, total_amount obbligatori",
                });
            }
            // Bug 5 FIX: batch-load compensi
            const compensationMap = yield loadAllCompensations();
            let pct = professional_pct
                ? Number(professional_pct)
                : compensationMap.get(professional_name) || 0;
            const sessions = parseInt(String(total_sessions), 10);
            const amount = parseNumber(total_amount);
            const unitPrice = Math.round((amount / sessions) * 100) / 100;
            const fee = Math.round(amount * pct) / 100;
            const clinicRev = Math.round((amount - fee) * 100) / 100;
            const unitFee = sessions > 0 ? Math.round((fee / sessions) * 100) / 100 : 0;
            const unitRev = sessions > 0 ? Math.round((clinicRev / sessions) * 100) / 100 : 0;
            const isoDate = toIsoDate(start_date) || new Date().toISOString().split("T")[0];
            const cycleId = generateUUID();
            const [year, month] = isoDate.split("-");
            const q = Math.floor((parseInt(month, 10) - 1) / 3) + 1;
            // Multi-prof: parsing session_professionals
            const sessionProfs = parseSessionProfessionals({ session_professionals }, sessions, professional_name);
            const uniqueProfessionals = [
                ...new Set(sessionProfs.map((sp) => sp.professional_name)),
            ];
            const batch = firebase_1.db.batch();
            // Bug 2 FIX: Crea le righe visita (contratto + N sessioni)
            // 1. Contratto
            batch.set(firebase_1.db.collection(COLLECTION).doc(), {
                patient_name,
                professional_name,
                service_name: service_name || "",
                branch: branch || "Altro",
                amount,
                professional_pct: pct,
                professional_fee: fee,
                clinic_revenue: clinicRev,
                n_sessions: sessions,
                unit_price: unitPrice,
                unit_professional_fee: unitFee,
                unit_clinic_revenue: unitRev,
                date: isoDate,
                year,
                month,
                quarter: `Q${q}`,
                import_source: "manual",
                imported_at: new Date().toISOString(),
                cycle_id: cycleId,
                cycle_total: amount,
                cycle_sessions_total: sessions,
                cycle_session_number: 0,
                is_cycle: true,
                is_cycle_contract: true,
                status: "completed",
            });
            // 2. N sessioni pending con multi-prof
            for (let s = 1; s <= sessions; s++) {
                const sessionDate = addMonths(isoDate, s - 1);
                const [sy, sm] = sessionDate.split("-");
                const sq = Math.floor((parseInt(sm, 10) - 1) / 3) + 1;
                const sp = sessionProfs.find((x) => x.session_number === s);
                const sessionProfessional = (sp === null || sp === void 0 ? void 0 : sp.professional_name) || professional_name;
                batch.set(firebase_1.db.collection(COLLECTION).doc(), {
                    patient_name,
                    professional_name: sessionProfessional,
                    service_name: service_name || "",
                    branch: branch || "Altro",
                    amount: unitPrice,
                    professional_pct: pct,
                    professional_fee: unitFee,
                    clinic_revenue: unitRev,
                    n_sessions: 1,
                    unit_price: unitPrice,
                    unit_professional_fee: unitFee,
                    unit_clinic_revenue: unitRev,
                    date: sessionDate,
                    year: sy,
                    month: sm,
                    quarter: `Q${sq}`,
                    import_source: "manual",
                    imported_at: new Date().toISOString(),
                    cycle_id: cycleId,
                    cycle_total: amount,
                    cycle_sessions_total: sessions,
                    cycle_session_number: s,
                    is_cycle: true,
                    is_cycle_contract: false,
                    status: "pending",
                });
            }
            // 3. Record ciclo
            batch.set(firebase_1.db.collection(CYCLES_COLLECTION).doc(cycleId), {
                patient_name,
                professional_name,
                service_name: service_name || "",
                branch: branch || "Altro",
                total_sessions: sessions,
                completed_sessions: 0,
                total_amount: amount,
                unit_price: unitPrice,
                professional_pct: pct,
                start_date: isoDate,
                end_date: null,
                status: "active",
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                professionals: uniqueProfessionals,
                session_professionals: sessionProfs,
            });
            yield batch.commit();
            res.status(201).json({ cycle_id: cycleId, sessions_created: sessions });
        }
        catch (err) {
            console.error("POST /business-analytics/cycle error:", err);
            res.status(500).json({ error: "Errore nella creazione del ciclo" });
        }
    }));
    /* ==========================================
       PUT /cycle/:id/session — FIX Bug 6 (dedup) + Bug 8 (validation)
       ========================================== */
    router.put("/cycle/:id/session", (req, res) => __awaiter(this, void 0, void 0, function* () {
        try {
            const { id } = req.params;
            const { session_number, date } = req.body;
            // Bug 8 FIX: validazione degli input
            const sessionNum = parseInt(String(session_number), 10);
            if (isNaN(sessionNum) || sessionNum < 1) {
                return res.status(400).json({ error: "Numero seduta non valido" });
            }
            const sessionDate = toIsoDate(date);
            if (date && !sessionDate) {
                return res.status(400).json({ error: "Data non valida" });
            }
            const cycleRef = firebase_1.db.collection(CYCLES_COLLECTION).doc(id);
            const cycleDoc = yield cycleRef.get();
            if (!cycleDoc.exists) {
                return res.status(404).json({ error: "Ciclo non trovato" });
            }
            const cycle = cycleDoc.data();
            // Bug 8 FIX: validazione range session_number
            if (sessionNum > (cycle.total_sessions || 0)) {
                return res.status(400).json({
                    error: `Numero seduta ${sessionNum} supera il totale di ${cycle.total_sessions}`,
                });
            }
            // Trova la seduta corrispondente
            const visitsSnap = yield firebase_1.db
                .collection(COLLECTION)
                .where("cycle_id", "==", id)
                .where("cycle_session_number", "==", sessionNum)
                .where("is_cycle_contract", "==", false)
                .limit(1)
                .get();
            if (visitsSnap.empty) {
                return res.status(404).json({ error: "Seduta non trovata" });
            }
            const visitDoc = visitsSnap.docs[0];
            const visitData = visitDoc.data();
            // Bug 6 FIX: controllo deduplica — non incrementare se già completata
            if (visitData.status === "completed") {
                return res.status(400).json({ error: "Seduta già completata" });
            }
            const completedDate = sessionDate || new Date().toISOString().split("T")[0];
            yield visitDoc.ref.update({
                status: "completed",
                date: completedDate,
            });
            // Aggiorna il contatore del ciclo
            const newCompleted = (cycle.completed_sessions || 0) + 1;
            const updateData = {
                completed_sessions: newCompleted,
                updated_at: new Date().toISOString(),
            };
            if (newCompleted >= cycle.total_sessions) {
                updateData.status = "completed";
                updateData.end_date = completedDate;
            }
            yield cycleRef.update(updateData);
            res.json({
                cycle_id: id,
                completed_sessions: newCompleted,
                total_sessions: cycle.total_sessions,
                status: updateData.status || cycle.status,
            });
        }
        catch (err) {
            console.error("PUT /business-analytics/cycle/:id/session error:", err);
            res.status(500).json({ error: "Errore nell'aggiornamento seduta" });
        }
    }));
    /* ==========================================
       GET /revenue-trend — FIX Bug 1: pending non contate come realizzato
       ========================================== */
    router.get("/revenue-trend", (req, res) => __awaiter(this, void 0, void 0, function* () {
        try {
            const { year, compareYoY } = req.query;
            const y = year ? parseInt(year, 10) : new Date().getFullYear();
            const startDate = `${y}-01-01`;
            const endDate = `${y}-12-31`;
            const visits = yield getVisits(startDate, endDate);
            const monthly = {};
            for (let m = 1; m <= 12; m++) {
                const key = `${y}-${String(m).padStart(2, "0")}`;
                monthly[key] = { contract: 0, realized: 0, singles: 0, visits: 0, patients: new Set(), clinic_revenue: 0 };
            }
            // Bug 1 FIX: separare contratto / realizzato / pending correttamente
            // singles = solo visite non-ciclo, usato per totale non-double-countato
            visits.forEach((v) => {
                if (!v.date)
                    return;
                const key = String(v.date).slice(0, 7);
                if (!monthly[key])
                    return;
                if (v.is_cycle_contract) {
                    monthly[key].contract += v.amount || 0;
                }
                else if (!v.is_cycle || v.status === "completed") {
                    monthly[key].realized += v.amount || 0;
                    monthly[key].visits += 1;
                    monthly[key].clinic_revenue += v.clinic_revenue || 0;
                    if (v.patient_name)
                        monthly[key].patients.add(v.patient_name);
                    if (!v.is_cycle) {
                        monthly[key].singles += v.amount || 0;
                    }
                }
            });
            let prevYearData = null;
            if (compareYoY === "true" || compareYoY === "1") {
                const prevStart = `${y - 1}-01-01`;
                const prevEnd = `${y - 1}-12-31`;
                const prevVisits = yield getVisits(prevStart, prevEnd);
                const prevMonthly = {};
                prevVisits.forEach((v) => {
                    if (!v.date)
                        return;
                    // Bug 1 FIX: anche per YoY escludere pending
                    if (!v.is_cycle_contract && (!v.is_cycle || v.status === "completed")) {
                        const key = String(v.date).slice(0, 7);
                        prevMonthly[key] = (prevMonthly[key] || 0) + (v.amount || 0);
                    }
                });
                prevYearData = Object.entries(prevMonthly)
                    .map(([month, revenue]) => ({ month, revenue }));
            }
            const trend = Object.entries(monthly)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([month, data]) => ({
                month,
                contract: Math.round(data.contract * 100) / 100,
                realized: Math.round(data.realized * 100) / 100,
                total: Math.round((data.contract + data.singles) * 100) / 100,
                visits: data.visits,
                uniquePatients: data.patients.size,
                clinicRevenue: Math.round(data.clinic_revenue * 100) / 100,
                avgTicket: data.visits > 0
                    ? Math.round((data.realized / data.visits) * 100) / 100
                    : 0,
                marginPct: data.realized > 0
                    ? Math.round((data.clinic_revenue / data.realized) * 1000) / 10
                    : 0,
            }));
            const totals = trend.reduce((acc, m) => ({
                contract: acc.contract + m.contract,
                realized: acc.realized + m.realized,
                total: acc.total + m.total,
                visits: acc.visits + m.visits,
                clinicRevenue: acc.clinicRevenue + m.clinicRevenue,
            }), { contract: 0, realized: 0, total: 0, visits: 0, clinicRevenue: 0 });
            res.json({
                year: y,
                trend,
                totals: {
                    contract: Math.round(totals.contract * 100) / 100,
                    realized: Math.round(totals.realized * 100) / 100,
                    total: Math.round(totals.total * 100) / 100,
                    visits: totals.visits,
                    clinicRevenue: Math.round(totals.clinicRevenue * 100) / 100,
                    avgMonthly: Math.round((totals.total / 12) * 100) / 100,
                },
                prevYear: prevYearData,
            });
        }
        catch (err) {
            console.error("GET /business-analytics/revenue-trend error:", err);
            res.status(500).json({ error: "Errore nel server" });
        }
    }));
    /* ==========================================
       GET /by-branch — FIX Bug 1 (pending) + Bug 7 (rimosso cycleRatio)
       ========================================== */
    router.get("/by-branch", (req, res) => __awaiter(this, void 0, void 0, function* () {
        try {
            const { period = "year", year, month, quarter } = req.query;
            const { startDate, endDate } = getPeriodRange(period, year, month, quarter);
            const visits = yield getVisits(startDate, endDate);
            // Bug 1 FIX: filtra solo visite reali
            const realVisits = visits.filter(REAL_VISIT_FILTER);
            const totalRevenue = realVisits.reduce((s, v) => s + (v.amount || 0), 0) || 1;
            const byBranch = {};
            realVisits.forEach((v) => {
                const branch = v.branch || "Altro";
                if (!byBranch[branch]) {
                    byBranch[branch] = { revenue: 0, visits: 0, clinicRevenue: 0, cycles: 0, singles: 0 };
                }
                byBranch[branch].revenue += v.amount || 0;
                byBranch[branch].visits += 1;
                byBranch[branch].clinicRevenue += v.clinic_revenue || 0;
                if (v.is_cycle)
                    byBranch[branch].cycles += 1;
                else
                    byBranch[branch].singles += 1;
            });
            // Trend mensile per branca (usa visite reali)
            const monthlyTrend = buildMonthlySeriesByKey(realVisits, "branch", "amount");
            // Bug 7 FIX: rimosso cycleRatio — era fuorviante (cycles/visits tra le sole righe reali)
            const rows = Object.entries(byBranch)
                .map(([name, data]) => ({
                name,
                revenue: Math.round(data.revenue * 100) / 100,
                visits: data.visits,
                clinicRevenue: Math.round(data.clinicRevenue * 100) / 100,
                share: Math.round((data.revenue / totalRevenue) * 1000) / 10,
                avgTicket: data.visits > 0 ? Math.round((data.revenue / data.visits) * 100) / 100 : 0,
                marginPct: data.revenue > 0 ? Math.round((data.clinicRevenue / data.revenue) * 1000) / 10 : 0,
            }))
                .sort((a, b) => b.revenue - a.revenue);
            res.json({
                period: { startDate, endDate, type: period },
                rows,
                monthlyTrend,
            });
        }
        catch (err) {
            console.error("GET /business-analytics/by-branch error:", err);
            res.status(500).json({ error: "Errore nel server" });
        }
    }));
    /* ==========================================
       GET /patient-flow — FIX Bug 1: pending non contate
       ========================================== */
    router.get("/patient-flow", (req, res) => __awaiter(this, void 0, void 0, function* () {
        try {
            const { period = "year", year, month, quarter } = req.query;
            const { startDate, endDate } = getPeriodRange(period, year, month, quarter);
            const visits = yield getVisits(startDate, endDate);
            // Bug 1 FIX: filtra solo visite reali
            const realVisits = visits.filter(REAL_VISIT_FILTER);
            // Per determinare nuovi vs ritornanti, carica anche visite precedenti
            const allVisitsSnap = yield firebase_1.db
                .collection(COLLECTION)
                .where("date", "<=", endDate)
                .orderBy("date", "asc")
                .get();
            const allVisits = allVisitsSnap.docs.map((doc) => doc.data());
            // Patients nel periodo corrente (da visite reali)
            const periodPatients = new Set(realVisits.map((v) => v.patient_name).filter(Boolean));
            // Pazienti con visite (reali) prima del periodo corrente → ritornanti
            const priorPatients = new Set();
            allVisits
                .filter((v) => v.date < startDate && REAL_VISIT_FILTER(v))
                .forEach((v) => {
                if (v.patient_name)
                    priorPatients.add(v.patient_name);
            });
            let newPatients = 0;
            let returningPatients = 0;
            periodPatients.forEach((name) => {
                if (priorPatients.has(name))
                    returningPatients++;
                else
                    newPatients++;
            });
            // Statistiche sui pazienti del periodo
            const patientVisits = {};
            const patientBranches = {};
            const patientRevenue = {};
            realVisits.forEach((v) => {
                const name = v.patient_name || "N/A";
                patientVisits[name] = (patientVisits[name] || 0) + 1;
                if (!patientBranches[name])
                    patientBranches[name] = new Set();
                patientBranches[name].add(v.branch || "Altro");
                patientRevenue[name] = (patientRevenue[name] || 0) + (v.amount || 0);
            });
            const freqDistribution = {
                "1": 0,
                "2-3": 0,
                "4-6": 0,
                "7-10": 0,
                "10+": 0,
            };
            let multiServiceCount = 0;
            Object.entries(patientVisits).forEach(([, count]) => {
                if (count === 1)
                    freqDistribution["1"]++;
                else if (count <= 3)
                    freqDistribution["2-3"]++;
                else if (count <= 6)
                    freqDistribution["4-6"]++;
                else if (count <= 10)
                    freqDistribution["7-10"]++;
                else
                    freqDistribution["10+"]++;
            });
            Object.values(patientBranches).forEach((branches) => {
                if (branches.size >= 2)
                    multiServiceCount++;
            });
            const topByRevenue = Object.entries(patientRevenue)
                .map(([name, revenue]) => ({ name, revenue: Math.round(revenue * 100) / 100 }))
                .sort((a, b) => b.revenue - a.revenue)
                .slice(0, 10);
            const topByVisits = Object.entries(patientVisits)
                .map(([name, visits]) => ({ name, visits }))
                .sort((a, b) => b.visits - a.visits)
                .slice(0, 10);
            // Trend mensile nuovi vs ritornanti (usa visite reali)
            const monthlyFlow = {};
            const start = new Date(startDate);
            const end = new Date(endDate);
            const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
            while (cursor <= end) {
                const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
                monthlyFlow[key] = { newPx: 0, returning: 0 };
                cursor.setMonth(cursor.getMonth() + 1);
            }
            const months = Object.keys(monthlyFlow).sort();
            const seenBefore = new Set();
            months.forEach((mKey) => {
                const monthVisits = realVisits.filter((v) => v.date && String(v.date).startsWith(mKey));
                const monthPatients = new Set(monthVisits.map((v) => v.patient_name).filter(Boolean));
                monthPatients.forEach((name) => {
                    if (seenBefore.has(name)) {
                        monthlyFlow[mKey].returning++;
                    }
                    else {
                        monthlyFlow[mKey].newPx++;
                        seenBefore.add(name);
                    }
                });
            });
            res.json({
                period: { startDate, endDate, type: period },
                totalPatients: periodPatients.size,
                newPatients,
                returningPatients,
                returnRate: periodPatients.size > 0
                    ? Math.round((returningPatients / periodPatients.size) * 1000) / 10
                    : 0,
                avgVisitsPerPatient: periodPatients.size > 0
                    ? Math.round((realVisits.length / periodPatients.size) * 10) / 10
                    : 0,
                multiServicePatients: multiServiceCount,
                multiServiceRate: periodPatients.size > 0
                    ? Math.round((multiServiceCount / periodPatients.size) * 1000) / 10
                    : 0,
                freqDistribution,
                monthlyFlow: Object.entries(monthlyFlow)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([month, data]) => (Object.assign({ month }, data))),
                topByRevenue,
                topByVisits,
            });
        }
        catch (err) {
            console.error("GET /business-analytics/patient-flow error:", err);
            res.status(500).json({ error: "Errore nel server" });
        }
    }));
    /* ==========================================
       GET /cycle-analysis — FIX multi-prof support
       ========================================== */
    router.get("/cycle-analysis", (req, res) => __awaiter(this, void 0, void 0, function* () {
        try {
            const { period = "year", year, branch, professional } = req.query;
            const { startDate, endDate } = getPeriodRange(period, year);
            const visits = yield getVisits(startDate, endDate);
            // Filtra le righe contratto
            let contracts = visits.filter((v) => v.is_cycle_contract);
            if (branch)
                contracts = contracts.filter((v) => v.branch === branch);
            // Multi-prof: filtra anche se il professional è tra i professionals del ciclo
            if (professional) {
                const matchingCycleIds = new Set();
                // Prima: filtra contratti per nome diretto
                const directContracts = contracts.filter((v) => v.professional_name === professional);
                directContracts.forEach((v) => v.cycle_id && matchingCycleIds.add(v.cycle_id));
                // Poi: carica i cicli che hanno questo professional in session_professionals
                // (lo facciamo dopo quando carichiamo i cicli)
                contracts = contracts.filter((v) => v.professional_name === professional || matchingCycleIds.has(v.cycle_id));
            }
            const cycleIds = [...new Set(contracts.map((v) => v.cycle_id).filter(Boolean))];
            // Carica i record cicli
            const cyclesSnap = yield firebase_1.db
                .collection(CYCLES_COLLECTION)
                .where("start_date", ">=", startDate)
                .where("start_date", "<=", endDate)
                .get();
            let cycles = cyclesSnap.docs.map((d) => (Object.assign({ id: d.id }, d.data())));
            // Multi-prof: se filtro per professional, includi anche cicli dove il professional
            // appare in session_professionals ma non come professional_name principale
            if (professional) {
                const profCycles = cycles.filter((c) => c.professional_name === professional ||
                    (Array.isArray(c.professionals) && c.professionals.includes(professional)));
                const profCycleIds = new Set(profCycles.map((c) => c.id));
                cycles = cycles.filter((c) => profCycleIds.has(c.id));
            }
            const totalCycles = cycles.length;
            const completedCycles = cycles.filter((c) => c.status === "completed").length;
            const activeCycles = cycles.filter((c) => c.status === "active").length;
            const completionRate = totalCycles > 0 ? Math.round((completedCycles / totalCycles) * 1000) / 10 : 0;
            // Durata media completamento
            const completedWithDuration = cycles
                .filter((c) => c.status === "completed" && c.end_date && c.start_date)
                .map((c) => {
                const start = new Date(c.start_date).getTime();
                const end = new Date(c.end_date).getTime();
                const days = (end - start) / 86400000;
                return Object.assign(Object.assign({}, c), { durationDays: Math.max(0, days) });
            })
                .filter((c) => c.durationDays > 0);
            const avgDurationDays = completedWithDuration.length > 0
                ? Math.round(completedWithDuration.reduce((sum, c) => sum + c.durationDays, 0) /
                    completedWithDuration.length)
                : 0;
            // Ricavi cicli
            const totalContractValue = contracts.reduce((s, v) => s + (v.amount || 0), 0);
            // Realizzato (sedute completate)
            const realizedVisits = visits.filter((v) => v.is_cycle && !v.is_cycle_contract && v.status === "completed");
            const totalRealized = realizedVisits.reduce((s, v) => s + (v.amount || 0), 0);
            // Distribuzione durata
            const durationBuckets = { "0-30": 0, "31-60": 0, "61-90": 0, "91-120": 0, "120+": 0 };
            completedWithDuration.forEach((c) => {
                const days = (new Date(c.end_date).getTime() - new Date(c.start_date).getTime()) / 86400000;
                if (days <= 30)
                    durationBuckets["0-30"]++;
                else if (days <= 60)
                    durationBuckets["31-60"]++;
                else if (days <= 90)
                    durationBuckets["61-90"]++;
                else if (days <= 120)
                    durationBuckets["91-120"]++;
                else
                    durationBuckets["120+"]++;
            });
            // Trend mensile cicli venduti vs completati
            const monthlyCycles = {};
            for (let m = 1; m <= 12; m++) {
                const key = `${startDate.slice(0, 4)}-${String(m).padStart(2, "0")}`;
                monthlyCycles[key] = { sold: 0, completed: 0 };
            }
            contracts.forEach((v) => {
                const key = (v.date || "").slice(0, 7);
                if (monthlyCycles[key])
                    monthlyCycles[key].sold += 1;
            });
            cycles.forEach((c) => {
                if (c.status === "completed" && c.end_date) {
                    const key = c.end_date.slice(0, 7);
                    if (monthlyCycles[key])
                        monthlyCycles[key].completed += 1;
                }
            });
            // Media sessioni per ciclo
            const avgSessions = totalCycles > 0
                ? Math.round((cycles.reduce((s, c) => s + (c.total_sessions || 0), 0) / totalCycles) * 10) / 10
                : 0;
            // Cicli per branca
            const byBranch = {};
            cycles.forEach((c) => {
                const b = c.branch || "Altro";
                if (!byBranch[b])
                    byBranch[b] = { cycles: 0, contractValue: 0 };
                byBranch[b].cycles += 1;
                byBranch[b].contractValue += c.total_amount || 0;
            });
            res.json({
                period: { startDate, endDate, type: period },
                kpi: {
                    totalCycles,
                    activeCycles,
                    completedCycles,
                    completionRate,
                    avgDurationDays,
                    avgSessions,
                    totalContractValue: Math.round(totalContractValue * 100) / 100,
                    totalRealized: Math.round(totalRealized * 100) / 100,
                    gap: Math.round((totalContractValue - totalRealized) * 100) / 100,
                },
                durationDistribution: durationBuckets,
                monthlyCycles: Object.entries(monthlyCycles)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([month, data]) => (Object.assign({ month }, data))),
                byBranch: Object.entries(byBranch)
                    .map(([name, data]) => (Object.assign(Object.assign({ name }, data), { contractValue: Math.round(data.contractValue * 100) / 100 })))
                    .sort((a, b) => b.contractValue - a.contractValue),
                // Multi-prof: esponi i metadati multi-professionista nei cicli
                cycles: cycles.map((c) => ({
                    id: c.id,
                    patient_name: c.patient_name,
                    professional_name: c.professional_name,
                    branch: c.branch,
                    total_sessions: c.total_sessions,
                    completed_sessions: c.completed_sessions,
                    total_amount: c.total_amount,
                    status: c.status,
                    start_date: c.start_date,
                    end_date: c.end_date,
                    professionals: c.professionals || [c.professional_name],
                    session_professionals: c.session_professionals || [],
                })),
            });
        }
        catch (err) {
            console.error("GET /business-analytics/cycle-analysis error:", err);
            res.status(500).json({ error: "Errore nel server" });
        }
    }));
    /* ==========================================
       GET /overview  — FIX: double-count di cicli (contratto + sessioni)
       ========================================== */
    router.get("/overview", (req, res) => __awaiter(this, void 0, void 0, function* () {
        try {
            const { period = "month", year, month, quarter } = req.query;
            const { startDate, endDate } = getPeriodRange(period, year, month, quarter);
            const visits = yield getVisits(startDate, endDate);
            const contracts = visits.filter((v) => v.is_cycle_contract);
            const singles = visits.filter((v) => !v.is_cycle);
            // Revenue: solo contratti (valore pieno) + visite singole (valore pieno).
            // Le sessioni di ciclo sono ESCLUSE perché il loro valore è già nel contratto.
            const totalRevenue = contracts.reduce((s, v) => s + (v.amount || 0), 0)
                + singles.reduce((s, v) => s + (v.amount || 0), 0);
            const contractRevenue = contracts.reduce((s, v) => s + (v.amount || 0), 0);
            const totalClinicRevenue = contracts.reduce((s, v) => s + (v.clinic_revenue || 0), 0)
                + singles.reduce((s, v) => s + (v.clinic_revenue || 0), 0);
            const totalProfessionalFees = contracts.reduce((s, v) => s + (v.professional_fee || 0), 0)
                + singles.reduce((s, v) => s + (v.professional_fee || 0), 0);
            // Realizzato: sessioni completate + visite singole
            const realVisits = visits.filter(REAL_VISIT_FILTER);
            const realizedRevenue = realVisits.reduce((s, v) => s + (v.amount || 0), 0);
            const totalVisits = realVisits.length;
            const uniquePatients = new Set(realVisits.map((v) => v.patient_name)).size;
            const avgTicket = totalVisits > 0 ? realizedRevenue / totalVisits : 0;
            const marginPct = totalRevenue > 0 ? (totalClinicRevenue / totalRevenue) * 100 : 0;
            // Confronto con periodo precedente (stessa logica: escludi righe sessione)
            const prev = getPreviousPeriod(startDate, endDate);
            let prevRevenue = 0;
            let prevPatients = 0;
            let deltaRevenue = null;
            let deltaPatients = null;
            let deltaTicket = null;
            try {
                const prevVisits = yield getVisits(prev.startDate, prev.endDate);
                const prevContracts = prevVisits.filter((v) => v.is_cycle_contract);
                const prevSingles = prevVisits.filter((v) => !v.is_cycle);
                prevRevenue = prevContracts.reduce((s, v) => s + (v.amount || 0), 0)
                    + prevSingles.reduce((s, v) => s + (v.amount || 0), 0);
                const prevReal = prevVisits.filter(REAL_VISIT_FILTER);
                const prevVisitsCount = prevReal.length;
                prevPatients = new Set(prevReal.map((v) => v.patient_name)).size;
                const prevTicket = prevVisitsCount > 0 ? prevRevenue / prevVisitsCount : 0;
                deltaRevenue = prevRevenue > 0 ? Math.round(((totalRevenue - prevRevenue) / prevRevenue) * 1000) / 10 : null;
                deltaPatients = prevPatients > 0 ? Math.round(((uniquePatients - prevPatients) / prevPatients) * 1000) / 10 : null;
                deltaTicket = prevTicket > 0 ? Math.round(((avgTicket - prevTicket) / prevTicket) * 1000) / 10 : null;
            }
            catch (_) {
                // Se fallisce il confronto, lascia null
            }
            const byService = {};
            const byProfessional = {};
            realVisits.forEach((v) => {
                const service = v.service_name || "Altro";
                if (!byService[service])
                    byService[service] = { revenue: 0, visits: 0 };
                byService[service].revenue += v.amount || 0;
                byService[service].visits += 1;
                const prof = v.professional_name || "N/A";
                if (!byProfessional[prof])
                    byProfessional[prof] = { revenue: 0, visits: 0, margin: 0 };
                byProfessional[prof].revenue += v.amount || 0;
                byProfessional[prof].visits += 1;
                byProfessional[prof].margin += v.clinic_revenue || 0;
            });
            const topServices = Object.entries(byService)
                .map(([name, data]) => (Object.assign({ name }, data)))
                .sort((a, b) => b.revenue - a.revenue)
                .slice(0, 5);
            const topProfessionals = Object.entries(byProfessional)
                .map(([name, data]) => (Object.assign({ name }, data)))
                .sort((a, b) => b.revenue - a.revenue)
                .slice(0, 5);
            const strengths = computeStrengths(byProfessional);
            res.json({
                period: { startDate, endDate, type: period },
                kpi: {
                    totalRevenue: Math.round(totalRevenue * 100) / 100,
                    contractRevenue: Math.round(contractRevenue * 100) / 100,
                    realizedRevenue: Math.round(realizedRevenue * 100) / 100,
                    totalClinicRevenue: Math.round(totalClinicRevenue * 100) / 100,
                    totalProfessionalFees: Math.round(totalProfessionalFees * 100) / 100,
                    totalVisits,
                    uniquePatients,
                    avgTicket: Math.round(avgTicket * 100) / 100,
                    marginPct: Math.round(marginPct * 10) / 10,
                    deltaRevenue,
                    deltaPatients,
                    deltaTicket,
                },
                topServices,
                topProfessionals,
                strengths,
            });
        }
        catch (err) {
            console.error("GET /business-analytics/overview error:", err);
            res.status(500).json({ error: "Errore nel server" });
        }
    }));
    /* ==========================================
       GET /mix — FIX Bug 1: pending escluse
       ========================================== */
    router.get("/mix", (req, res) => __awaiter(this, void 0, void 0, function* () {
        try {
            const { period = "month", year, month, quarter } = req.query;
            const { startDate, endDate } = getPeriodRange(period, year, month, quarter);
            const visits = yield getVisits(startDate, endDate);
            // Bug 1 FIX: filtra solo visite reali
            const realVisits = visits.filter(REAL_VISIT_FILTER);
            const totalRevenue = realVisits.reduce((s, v) => s + (v.amount || 0), 0) || 1;
            const byService = {};
            const byBranch = {};
            const byProfessional = {};
            realVisits.forEach((v) => {
                const service = v.service_name || "Altro";
                const branch = v.branch || "Altro";
                const prof = v.professional_name || "N/A";
                if (!byService[service])
                    byService[service] = { revenue: 0, visits: 0 };
                if (!byBranch[branch])
                    byBranch[branch] = { revenue: 0, visits: 0 };
                if (!byProfessional[prof])
                    byProfessional[prof] = { revenue: 0, visits: 0 };
                byService[service].revenue += v.amount || 0;
                byService[service].visits += 1;
                byBranch[branch].revenue += v.amount || 0;
                byBranch[branch].visits += 1;
                byProfessional[prof].revenue += v.amount || 0;
                byProfessional[prof].visits += 1;
            });
            const normalize = (data) => Object.entries(data)
                .map(([name, v]) => ({
                name,
                revenue: Math.round(v.revenue * 100) / 100,
                visits: v.visits,
                share: Math.round((v.revenue / totalRevenue) * 1000) / 10,
            }))
                .sort((a, b) => b.revenue - a.revenue);
            res.json({
                period: { startDate, endDate, type: period },
                byService: normalize(byService),
                byBranch: normalize(byBranch),
                byProfessional: normalize(byProfessional),
            });
        }
        catch (err) {
            console.error("GET /business-analytics/mix error:", err);
            res.status(500).json({ error: "Errore nel server" });
        }
    }));
    /* ==========================================
       GET /performance  (già corretto, invariato)
       ========================================== */
    router.get("/performance", (req, res) => __awaiter(this, void 0, void 0, function* () {
        try {
            const { period = "month", year, month, quarter } = req.query;
            const { startDate, endDate } = getPeriodRange(period, year, month, quarter);
            const visits = yield getVisits(startDate, endDate);
            const realVisits = visits.filter((v) => !v.is_cycle_contract && (!v.is_cycle || v.status === "completed"));
            const byProfessional = {};
            realVisits.forEach((v) => {
                const prof = v.professional_name || "N/A";
                if (!byProfessional[prof])
                    byProfessional[prof] = { revenue: 0, visits: 0, margin: 0, patients: new Set() };
                byProfessional[prof].revenue += v.amount || 0;
                byProfessional[prof].visits += 1;
                byProfessional[prof].margin += v.clinic_revenue || 0;
                if (v.patient_name)
                    byProfessional[prof].patients.add(v.patient_name);
            });
            const rows = Object.entries(byProfessional)
                .map(([name, v]) => ({
                name,
                revenue: Math.round(v.revenue * 100) / 100,
                visits: v.visits,
                patients: v.patients.size,
                avgTicket: v.visits > 0 ? Math.round((v.revenue / v.visits) * 100) / 100 : 0,
                marginPct: v.revenue > 0 ? Math.round((v.margin / v.revenue) * 1000) / 10 : 0,
            }))
                .sort((a, b) => b.revenue - a.revenue);
            res.json({ period: { startDate, endDate, type: period }, rows });
        }
        catch (err) {
            console.error("GET /business-analytics/performance error:", err);
            res.status(500).json({ error: "Errore nel server" });
        }
    }));
    /* ==========================================
       GET /retention — FIX Bug 1: pending escluse
       ========================================== */
    router.get("/retention", (req, res) => __awaiter(this, void 0, void 0, function* () {
        try {
            const { period = "month", year, month, quarter } = req.query;
            const { startDate, endDate } = getPeriodRange(period, year, month, quarter);
            const visits = yield getVisits(startDate, endDate);
            // Bug 1 FIX: filtra solo visite reali
            const realVisits = visits.filter(REAL_VISIT_FILTER);
            const byPatient = {};
            realVisits.forEach((v) => {
                const name = v.patient_name || "N/A";
                if (!byPatient[name])
                    byPatient[name] = { visits: 0, revenue: 0 };
                byPatient[name].visits += 1;
                byPatient[name].revenue += v.amount || 0;
            });
            const totalPatients = Object.keys(byPatient).length;
            const returning = Object.values(byPatient).filter((p) => p.visits > 1).length;
            const avgVisits = totalPatients > 0 ? Math.round((realVisits.length / totalPatients) * 10) / 10 : 0;
            const totalRevenue = realVisits.reduce((s, v) => s + (v.amount || 0), 0);
            const avgRevenuePerPatient = totalPatients > 0 ? Math.round((totalRevenue / totalPatients) * 100) / 100 : 0;
            res.json({
                period: { startDate, endDate, type: period },
                totalPatients,
                returningPatients: returning,
                returnRate: totalPatients > 0 ? Math.round((returning / totalPatients) * 1000) / 10 : 0,
                avgVisits,
                avgRevenuePerPatient,
            });
        }
        catch (err) {
            console.error("GET /business-analytics/retention error:", err);
            res.status(500).json({ error: "Errore nel server" });
        }
    }));
    /* ==========================================
       GET /forecast — FIX Bug 3 (pending) + Bug 4 (CI formula)
       ========================================== */
    router.get("/forecast", (req, res) => __awaiter(this, void 0, void 0, function* () {
        try {
            const horizon = Math.min(parseInt(req.query.months || "12", 10), 12);
            const targetMultiplier = parseNumber(req.query.targetMultiplier || 1);
            const branch = req.query.branch;
            let visits = yield getAllVisits();
            // Filtra per branca in memoria (evita necessità di indice composito Firestore)
            if (branch) {
                visits = visits.filter((v) => v.branch === branch);
            }
            // Bug 3 FIX: filtra solo visite reali per il forecast (non pending)
            const realVisits = visits.filter(REAL_VISIT_FILTER);
            const history = buildMonthlySeries(realVisits);
            if (history.length < 2) {
                return res.json({
                    history,
                    forecast: [],
                    seasonality: {},
                    error: "Dati storici insufficienti (minimo 2 mesi)",
                });
            }
            // Smoothing con media mobile a 3 mesi
            const rawRevenues = history.map((h) => h.revenue);
            const smoothed = movingAverage(rawRevenues, 3);
            const smoothedHistory = history.map((h, i) => ({ month: h.month, revenue: smoothed[i] }));
            const seasonality = computeSeasonalityWeighted(history);
            // Bug 4 FIX: usa i nuovi campi restituiti da linearForecast
            const { slope, intercept, stdDev, meanX, sumSqD, n } = linearForecast(smoothedHistory);
            const lastMonth = history[history.length - 1].month;
            const forecast = [];
            for (let i = 1; i <= horizon; i++) {
                const monthKey = addMonths(lastMonth, i);
                const trendValue = intercept + slope * (n + i);
                const seasonal = seasonality[monthKey.slice(5, 7)] || 1;
                const base = Math.max(0, trendValue * seasonal);
                // Bug 4 FIX: computeConfInterval con formula corretta
                const ci = computeConfInterval(stdDev, i, n, meanX, sumSqD);
                forecast.push({
                    month: monthKey,
                    base: Math.round(base * 100) / 100,
                    upper: Math.round((base + ci) * 100) / 100,
                    lower: Math.round(Math.max(0, base - ci) * 100) / 100,
                    seasonalFactor: Math.round(seasonal * 1000) / 1000,
                });
            }
            const baselineTotal = forecast.reduce((s, f) => s + f.base, 0);
            const targetTotal = targetMultiplier > 0
                ? Math.round(baselineTotal * targetMultiplier * 100) / 100
                : baselineTotal;
            const gap = Math.round((targetTotal - baselineTotal) * 100) / 100;
            // Crescita prevista
            const lastYearRevenue = history.slice(-12).reduce((s, h) => s + h.revenue, 0);
            const forecastYearRevenue = forecast.slice(0, 12).reduce((s, f) => s + f.base, 0);
            const projectedGrowth = lastYearRevenue > 0
                ? Math.round(((forecastYearRevenue - lastYearRevenue) / lastYearRevenue) * 1000) / 10
                : 0;
            // Mese di picco previsto
            const peakMonth = [...forecast].sort((a, b) => b.base - a.base)[0];
            res.json({
                history,
                smoothedHistory,
                forecast,
                seasonality,
                target: {
                    baselineTotal: Math.round(baselineTotal * 100) / 100,
                    targetTotal,
                    gap,
                },
                kpi: {
                    projectedGrowth,
                    peakMonth: (peakMonth === null || peakMonth === void 0 ? void 0 : peakMonth.month) || null,
                    peakValue: (peakMonth === null || peakMonth === void 0 ? void 0 : peakMonth.base) || 0,
                    lastYearRevenue: Math.round(lastYearRevenue * 100) / 100,
                    forecastYearRevenue: Math.round(forecastYearRevenue * 100) / 100,
                },
                branch: branch || null,
            });
        }
        catch (err) {
            console.error("GET /business-analytics/forecast error:", err);
            res.status(500).json({ error: "Errore nel server" });
        }
    }));
    return router;
}
