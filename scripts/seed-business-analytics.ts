/**
 * Seed Script — Business Analytics 2025
 *
 * Genera ~200 visite per il 2025 con stagionalità realistica,
 * ~20 cicli (5 e 10 sedute), 3-4 cicli multi-professionista,
 * e configura i compensi per 7 medici al 70%.
 *
 * Uso: npm run seed:analytics
 */

import * as dotenv from "dotenv";
dotenv.config();

// Usa la stessa inizializzazione Firebase del backend
import { db } from "../src/firebase";

/* ──────────────────────────────────────────
   CONFIGURAZIONE
   ────────────────────────────────────────── */

const DOCTORS = [
  "Perlo Cristina",
  "Zuccaro Paolo",
  "Benedetto Simone",
  "Boccone Isabella",
  "Boglione Arianna",
  "Giachino Corrado",
  "Piazza Giovanni",
];

const BRANCHES: Record<string, { service: string; unitPrice: number }> = {
  Fisioterapia: { service: "Fisioterapia", unitPrice: 50 },
  Osteopatia: { service: "Osteopatia", unitPrice: 70 },
  Posturologia: { service: "Posturologia", unitPrice: 60 },
  Neurologia: { service: "Neurologia", unitPrice: 55 },
  Riabilitazione: { service: "Riabilitazione", unitPrice: 45 },
  Ortopedia: { service: "Ortopedia", unitPrice: 80 },
};

const COMPENSATION_PCT = 70; // 70% al professionista, 30% alla clinica

// Stagionalità 2025: peso relativo per mese
const SEASONALITY: Record<number, number> = {
  1: 0.85,  // Gennaio - medio
  2: 0.90,  // Febbraio - medio
  3: 1.10,  // Marzo - primavera
  4: 1.15,  // Aprile - picco primaverile
  5: 1.10,  // Maggio - primavera
  6: 0.95,  // Giugno - fine stagione
  7: 0.55,  // Luglio - vacanze
  8: 0.35,  // Agosto - ferie (molto basso)
  9: 1.00,  // Settembre - ripresa
  10: 1.15, // Ottobre - picco autunnale
  11: 1.05, // Novembre - autunno
  12: 0.65, // Dicembre - festività
};

// Nomi pazienti italiani realistici
const PATIENTS = [
  "Marco Rossi", "Giulia Bianchi", "Alessandro Verdi", "Francesca Neri",
  "Lorenzo Ricci", "Sofia Marino", "Matteo Ferrari", "Aurora Esposito",
  "Leonardo Conti", "Giorgia Mancini", "Tommaso Gallo", "Beatrice Costa",
  "Gabriele Fontana", "Chiara Rinaldi", "Riccardo Bruno", "Alice Moretti",
  "Federico Greco", "Elena Barbieri", "Antonio Lombardi", "Martina Giordano",
  "Pietro Caruso", "Valentina Ferrara", "Davide Martini", "Emma Pellegrini",
  "Giovanni Rizzo", "Sara Testa", "Simone Vitale", "Ilaria Santoro",
  "Andrea Riva", "Laura Marchetti", "Francesco Sala", "Noemi Benedetti",
  "Emanuele Palma", "Alice De Angelis", "Roberto Farina", "Anna Vitali",
  "Stefano Rossetti", "Cristina Monti", "Paolo Grasso", "Lucia Basile",
];

/* ──────────────────────────────────────────
   UTILITY
   ────────────────────────────────────────── */

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function formatDate(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function addMonths(dateStr: string, offset: number): string {
  const [y, m] = dateStr.split("-").map((p) => parseInt(p, 10));
  const d = new Date(y, m - 1, 1);
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Stima giornata lavorativa casuale nel mese (1-28, evita date impossibili) */
function randomDay(): number {
  return randomInt(1, 28);
}

/* ──────────────────────────────────────────
   SEEDING FUNCTIONS
   ────────────────────────────────────────── */

async function seedCompensations() {
  console.log("🔧 Configurazione compensi...");
  const effectiveFrom = "2025-01-01";
  const now = new Date().toISOString();

  const batch = db.batch();
  let count = 0;

  for (const doctor of DOCTORS) {
    // Verifica se esiste già una configurazione attiva
    const existing = await db
      .collection("professional_compensations")
      .where("professional_name", "==", doctor)
      .where("effective_to", "==", null)
      .limit(1)
      .get();

    if (!existing.empty) {
      console.log(`  ⏭️  ${doctor}: già configurato`);
      continue;
    }

    const docRef = db.collection("professional_compensations").doc();
    batch.set(docRef, {
      professional_name: doctor,
      compensation_pct: COMPENSATION_PCT,
      effective_from: effectiveFrom,
      effective_to: null,
      created_at: now,
      updated_at: now,
    });
    count++;
    console.log(`  ✓ ${doctor}: ${COMPENSATION_PCT}%`);
  }

  if (count > 0) {
    await batch.commit();
    console.log(`  ✅ ${count} compensi creati`);
  } else {
    console.log("  ✅ Tutti già configurati");
  }
}

async function seedVisits() {
  console.log("\n🏥 Generazione visite 2025...");

  const batchSize = 400;
  let batches = [db.batch()];
  let batchIndex = 0;
  let opCount = 0;
  const addToBatch = (ref: any, data: any) => {
    if (opCount >= batchSize) {
      batches.push(db.batch());
      batchIndex++;
      opCount = 0;
    }
    batches[batchIndex].set(ref, data);
    opCount++;
  };

  let singlesCreated = 0;
  let cyclesCreated = 0;
  let sessionsCreated = 0;
  const pct = COMPENSATION_PCT;

  /* ── 1. VISITE SINGOLE (~80) ── */
  console.log("  📋 Visite singole...");

  // Distribuisci ~80 visite proporzionalmente ai mesi con stagionalità
  const totalSingles = 80;
  const totalWeight = Object.values(SEASONALITY).reduce((a, b) => a + b, 0);

  for (let m = 1; m <= 12; m++) {
    const monthWeight = SEASONALITY[m];
    const monthVisits = Math.round((monthWeight / totalWeight) * totalSingles);

    for (let v = 0; v < monthVisits; v++) {
      const day = randomDay();
      const date = formatDate(2025, m, day);
      const doctor = randomItem(DOCTORS);
      const branchName = randomItem(Object.keys(BRANCHES));
      const branch = BRANCHES[branchName];
      const patient = randomItem(PATIENTS);
      const amount = branch.unitPrice;
      const fee = Math.round(amount * pct) / 100;
      const clinicRev = Math.round((amount - fee) * 100) / 100;

      addToBatch(db.collection("business_analytics_visits").doc(), {
        patient_name: patient,
        professional_name: doctor,
        service_name: branch.service,
        branch: branchName,
        amount,
        professional_pct: pct,
        professional_fee: fee,
        clinic_revenue: clinicRev,
        n_sessions: 1,
        unit_price: amount,
        unit_professional_fee: fee,
        unit_clinic_revenue: clinicRev,
        date,
        year: "2025",
        month: String(m).padStart(2, "0"),
        quarter: `Q${Math.floor((m - 1) / 3) + 1}`,
        import_source: "seed",
        imported_at: new Date().toISOString(),
        is_cycle: false,
        is_cycle_contract: false,
        status: "completed",
      });
      singlesCreated++;
    }
  }
  console.log(`    ✓ ${singlesCreated} visite singole create`);

  /* ── 2. CICLI ── */

  // Configurazione cicli: [mese_inizio, n_sedute, branca, multi_prof?]
  interface CycleDef {
    patient: string;
    doctor: string;
    branch: string;
    startMonth: number;
    sessions: number;
    multiProf?: Array<{ range: [number, number]; professional: string }>;
  }

  const cycleDefs: CycleDef[] = [];

  // 15 cicli da 5 sedute
  const fiveSessionMonths = [1, 2, 3, 3, 4, 4, 5, 6, 9, 9, 10, 10, 10, 11, 12];
  for (const startMonth of fiveSessionMonths) {
    const branch = randomItem(["Fisioterapia", "Fisioterapia", "Osteopatia", "Posturologia", "Riabilitazione", "Neurologia"]);
    cycleDefs.push({
      patient: randomItem(PATIENTS.filter((_, i) => i % 2 === Math.floor(Math.random() * 2))),
      doctor: randomItem(DOCTORS),
      branch,
      startMonth,
      sessions: 5,
    });
  }

  // 5 cicli da 10 sedute
  const tenSessionMonths = [1, 2, 5, 9, 11];
  for (const startMonth of tenSessionMonths) {
    cycleDefs.push({
      patient: randomItem(PATIENTS.filter((_, i) => i % 3 === 1)),
      doctor: randomItem(DOCTORS),
      branch: randomItem(["Fisioterapia", "Fisioterapia", "Osteopatia"]),
      startMonth,
      sessions: 10,
    });
  }

  // 3 cicli multi-professionista
  cycleDefs.push({
    patient: "Giuseppe Verdi",
    doctor: "Perlo Cristina",
    branch: "Fisioterapia",
    startMonth: 3,
    sessions: 10,
    multiProf: [
      { range: [1, 6], professional: "Perlo Cristina" },
      { range: [7, 10], professional: "Zuccaro Paolo" },
    ],
  });
  cycleDefs.push({
    patient: "Maria Neri",
    doctor: "Benedetto Simone",
    branch: "Osteopatia",
    startMonth: 5,
    sessions: 6,
    multiProf: [
      { range: [1, 3], professional: "Benedetto Simone" },
      { range: [4, 6], professional: "Boglione Arianna" },
    ],
  });
  cycleDefs.push({
    patient: "Antonio Marini",
    doctor: "Boccone Isabella",
    branch: "Fisioterapia",
    startMonth: 9,
    sessions: 8,
    multiProf: [
      { range: [1, 4], professional: "Boccone Isabella" },
      { range: [5, 8], professional: "Giachino Corrado" },
    ],
  });

  console.log(`  🔄 Cicli...`);

  for (const cycleDef of cycleDefs) {
    const startDay = randomDay();
    const startDate = formatDate(2025, cycleDef.startMonth, startDay);
    const branchData = BRANCHES[cycleDef.branch];
    const branchUnitPrice = branchData.unitPrice;
    const nSessions = cycleDef.sessions;
    // Piccolo sconto sul totale per i cicli (~10%)
    const totalAmount = Math.round(branchUnitPrice * nSessions * 0.9 * 100) / 100;
    // Prezzo unitario effettivo (scontato) per ogni sessione
    const discountedUnitPrice = Math.round((totalAmount / nSessions) * 100) / 100;
    const fee = Math.round(totalAmount * pct) / 100;
    const clinicRev = Math.round((totalAmount - fee) * 100) / 100;
    const unitFee = Math.round((fee / nSessions) * 100) / 100;
    const unitRev = Math.round((clinicRev / nSessions) * 100) / 100;

    // Multi-prof: mapping sessioni → professionista
    const sessionProfessionals: Array<{ session_number: number; professional_name: string }> = [];
    if (cycleDef.multiProf) {
      for (const mp of cycleDef.multiProf) {
        for (let s = mp.range[0]; s <= mp.range[1]; s++) {
          sessionProfessionals.push({ session_number: s, professional_name: mp.professional });
        }
      }
    } else {
      for (let s = 1; s <= nSessions; s++) {
        sessionProfessionals.push({ session_number: s, professional_name: cycleDef.doctor });
      }
    }

    const uniqueProfessionals = [...new Set(sessionProfessionals.map((sp) => sp.professional_name))];
    const cycleId = generateUUID();

    // 1. Contratto
    const [year, month] = startDate.split("-");
    const q = Math.floor((parseInt(month, 10) - 1) / 3) + 1;
    addToBatch(db.collection("business_analytics_visits").doc(), {
      patient_name: cycleDef.patient,
      professional_name: cycleDef.doctor,
      service_name: branchData.service,
      branch: cycleDef.branch,
      amount: totalAmount,
      professional_pct: pct,
      professional_fee: fee,
      clinic_revenue: clinicRev,
      n_sessions: nSessions,
      unit_price: discountedUnitPrice,
      unit_professional_fee: unitFee,
      unit_clinic_revenue: unitRev,
      date: startDate,
      year,
      month,
      quarter: `Q${q}`,
      import_source: "seed",
      imported_at: new Date().toISOString(),
      cycle_id: cycleId,
      cycle_total: totalAmount,
      cycle_sessions_total: nSessions,
      cycle_session_number: 0,
      is_cycle: true,
      is_cycle_contract: true,
      status: "completed",
    });

    // 2. Sessioni (alcune completate, altre pending se ciclo non ancora finito)
    const isCycleComplete = cycleDef.startMonth + Math.ceil(nSessions / 2) <= 12; // cicli che finirebbero entro l'anno

    for (let s = 1; s <= nSessions; s++) {
      const sessionDate = addMonths(startDate, s - 1);
      // Se la sessione cade nel 2025 ed è tra quelle "completate"
      const sessionYear = parseInt(sessionDate.split("-")[0], 10);
      const isCompleted = sessionYear <= 2025 && (isCycleComplete || s <= Math.ceil(nSessions / 2));

      const [sy, sm] = sessionDate.split("-");
      const sq = Math.floor((parseInt(sm, 10) - 1) / 3) + 1;

      const sp = sessionProfessionals.find((x) => x.session_number === s);
      const sessionProfessional = sp?.professional_name || cycleDef.doctor;

      addToBatch(db.collection("business_analytics_visits").doc(), {
        patient_name: cycleDef.patient,
        professional_name: sessionProfessional,
        service_name: branchData.service,
        branch: cycleDef.branch,
        amount: discountedUnitPrice,
        professional_pct: pct,
        professional_fee: unitFee,
        clinic_revenue: unitRev,
        n_sessions: 1,
        unit_price: discountedUnitPrice,
        unit_professional_fee: unitFee,
        unit_clinic_revenue: unitRev,
        date: sessionDate,
        year: sy,
        month: sm,
        quarter: `Q${sq}`,
        import_source: "seed",
        imported_at: new Date().toISOString(),
        cycle_id: cycleId,
        cycle_total: totalAmount,
        cycle_sessions_total: nSessions,
        cycle_session_number: s,
        is_cycle: true,
        is_cycle_contract: false,
        status: isCompleted ? "completed" : "pending",
      });
      sessionsCreated++;
    }

    // 3. Record ciclo
    const completedSessions = sessionProfessionals.filter((sp) => {
      const sessionYear = parseInt(addMonths(startDate, sp.session_number - 1).split("-")[0], 10);
      return sessionYear <= 2025 && (isCycleComplete || sp.session_number <= Math.ceil(nSessions / 2));
    }).length;

    const cycleEndDate = isCycleComplete
      ? addMonths(startDate, nSessions - 1)
      : null;

    addToBatch(db.collection("business_analytics_cycles").doc(cycleId), {
      patient_name: cycleDef.patient,
      professional_name: cycleDef.doctor,
      service_name: branchData.service,
      branch: cycleDef.branch,
      total_sessions: nSessions,
      completed_sessions: completedSessions,
      total_amount: totalAmount,
      unit_price: discountedUnitPrice,
      professional_pct: pct,
      start_date: startDate,
      end_date: cycleEndDate,
      status: isCycleComplete ? "completed" : "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      professionals: uniqueProfessionals,
      session_professionals: sessionProfessionals,
    });
    cyclesCreated++;
  }

  console.log(`    ✓ ${cyclesCreated} cicli creati (${sessionsCreated} sessioni)`);

  // Commit di tutti i batch
  console.log(`\n  💾 Commit ${batches.length} batch su Firestore...`);
  for (let i = 0; i < batches.length; i++) {
    await batches[i].commit();
    console.log(`    ✓ Batch ${i + 1}/${batches.length} completato`);
  }

  return { singles: singlesCreated, cycles: cyclesCreated, sessions: sessionsCreated };
}

/* ──────────────────────────────────────────
   MAIN
   ────────────────────────────────────────── */

async function main() {
  console.log("══════════════════════════════════════════");
  console.log("  Seed Business Analytics — Dati 2025");
  console.log("══════════════════════════════════════════\n");

  const startTime = Date.now();

  // 1. Compensi
  await seedCompensations();

  // 2. Visite e cicli
  const result = await seedVisits();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n══════════════════════════════════════════`);
  console.log(`  ✅ SEED COMPLETATO in ${elapsed}s`);
  console.log(`  📊 ${result.singles} visite singole`);
  console.log(`  🔄 ${result.cycles} cicli`);
  console.log(`  📋 ${result.sessions} sessioni ciclo`);
  console.log(`  💰 ${DOCTORS.length} compensi configurati al ${COMPENSATION_PCT}%`);
  console.log(`  📁 Totale documenti: ~${result.singles + result.cycles + result.sessions + DOCTORS.length}`);
  console.log(`══════════════════════════════════════════`);
}

main().catch((err) => {
  console.error("❌ Errore durante il seed:", err);
  process.exit(1);
});
