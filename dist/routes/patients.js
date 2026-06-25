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
exports.setupPatientRoutes = setupPatientRoutes;
const express_1 = __importDefault(require("express"));
const auth_1 = require("./auth");
const firebase_1 = require("../firebase");
const router = express_1.default.Router();
function setupPatientRoutes(io) {
    const patientsRef = firebase_1.db.collection("patients");
    // Funzione per ottenere il prossimo numero progressivo
    function getNextNumber() {
        return __awaiter(this, void 0, void 0, function* () {
            const snapshot = yield patientsRef
                .orderBy("assigned_number", "desc")
                .limit(1)
                .get();
            const max = snapshot.empty
                ? 0
                : snapshot.docs[0].data().assigned_number || 0;
            return max + 1;
        });
    }
    // Aggiungere un nuovo paziente
    router.post("/", auth_1.authenticateToken, (0, auth_1.authorizeRoles)("admin", "segreteria"), (req, res) => __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            const { full_name, assigned_doctor, appointment_time, status, phone } = req.body;
            if (!full_name || !assigned_doctor || !appointment_time || !status) {
                return res.status(400).json({
                    error: "Nome, medico, orario appuntamento e status sono obbligatori",
                });
            }
            // Cerca il medico per ID o per nome
            let doctorId;
            let doctorName = assigned_doctor;
            let doctorDoc = yield firebase_1.db
                .collection("doctors")
                .doc(assigned_doctor)
                .get();
            if (doctorDoc.exists) {
                // È un ID valido
                doctorId = assigned_doctor;
                doctorName = ((_a = doctorDoc.data()) === null || _a === void 0 ? void 0 : _a.name) || assigned_doctor;
            }
            else {
                // Non è un ID, proviamo per nome
                const doctorByName = yield firebase_1.db
                    .collection("doctors")
                    .where("name", "==", assigned_doctor)
                    .limit(1)
                    .get();
                if (!doctorByName.empty) {
                    // Trovato per nome
                    doctorId = doctorByName.docs[0].id;
                    doctorName = doctorByName.docs[0].data().name;
                }
                else {
                    // Non trovato - mantieni il nome come stringa (per pazienti prenotati con medici non attivi)
                    doctorName = assigned_doctor;
                }
            }
            const assigned_number = yield getNextNumber();
            // Costruisci il paziente in base allo status
            const newPatient = Object.assign({ full_name,
                assigned_number, appointment_time: appointment_time, status, assigned_doctor_name: doctorName }, (phone && { phone }));
            // Se status è in_attesa, aggiungi anche l'ID
            if (status === "in_attesa" && doctorId) {
                newPatient.assigned_doctor_id = doctorId;
            }
            const docRef = yield patientsRef.add(newPatient);
            // ✨ invia solo il nuovo paziente
            io.emit("patientChanged", Object.assign({ id: docRef.id, full_name: newPatient.full_name, assigned_number: newPatient.assigned_number, appointment_time: newPatient.appointment_time, status: newPatient.status, assigned_doctor_name: newPatient.assigned_doctor_name }, (newPatient.assigned_doctor_id && {
                assigned_doctor_id: newPatient.assigned_doctor_id,
            })));
            res.status(201).json(Object.assign({ id: docRef.id }, newPatient));
        }
        catch (error) {
            console.error("Errore POST paziente:", error);
            res.status(500).json({ error: "Errore creazione paziente" });
        }
    }));
    // ✅ BULK IMPORT
    router.post("/bulk", auth_1.authenticateToken, (0, auth_1.authorizeRoles)("admin", "segreteria"), (req, res) => __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            const { data } = req.body;
            if (!data || !Array.isArray(data)) {
                return res
                    .status(400)
                    .json({ error: "Invalid data format: expected array" });
            }
            const created = [];
            for (const p of data) {
                try {
                    if (!p.full_name || !p.appointment_time) {
                        console.log(`Skipping invalid entry: ${JSON.stringify(p)}`);
                        continue; // skip invalid entries
                    }
                    // skip duplicates - controlla per full_name e appointment_time
                    const dup = yield patientsRef
                        .where("full_name", "==", p.full_name)
                        .where("appointment_time", "==", p.appointment_time)
                        .get();
                    if (!dup.empty) {
                        console.log(`Skipping duplicate: ${p.full_name} at ${p.appointment_time}`);
                        continue;
                    }
                    // Cerca il medico per ID o per nome (stesso logic di POST)
                    let doctorId;
                    let doctorName = p.assigned_doctor || "N/A";
                    if (p.assigned_doctor) {
                        let doctorDoc = yield firebase_1.db
                            .collection("doctors")
                            .doc(p.assigned_doctor)
                            .get();
                        if (doctorDoc.exists) {
                            // È un ID valido
                            doctorId = p.assigned_doctor;
                            doctorName = ((_a = doctorDoc.data()) === null || _a === void 0 ? void 0 : _a.name) || p.assigned_doctor;
                        }
                        else {
                            // Non è un ID, proviamo per nome
                            const doctorByName = yield firebase_1.db
                                .collection("doctors")
                                .where("name", "==", p.assigned_doctor)
                                .limit(1)
                                .get();
                            if (!doctorByName.empty) {
                                // Trovato per nome
                                doctorId = doctorByName.docs[0].id;
                                doctorName = doctorByName.docs[0].data().name;
                            }
                            else {
                                // Non trovato - mantieni il nome come stringa (per pazienti prenotati)
                                console.log(`Doctor not found in active list, using name: ${p.assigned_doctor}`);
                                doctorName = p.assigned_doctor;
                            }
                        }
                    }
                    const newData = Object.assign({ full_name: p.full_name, assigned_doctor_name: doctorName, appointment_time: p.appointment_time, assigned_number: yield getNextNumber(), status: p.status || "prenotato" }, (p.phone && { phone: p.phone }));
                    // Se status è in_attesa, aggiungi anche l'ID
                    if (newData.status === "in_attesa" && doctorId) {
                        newData.assigned_doctor_id = doctorId;
                    }
                    const docRef = yield patientsRef.add(newData);
                    // Notifica il frontend del nuovo paziente
                    io.emit("patientChanged", Object.assign(Object.assign({ id: docRef.id, full_name: newData.full_name, assigned_doctor_name: newData.assigned_doctor_name, assigned_number: newData.assigned_number, appointment_time: newData.appointment_time, status: newData.status }, (newData.assigned_doctor_id && {
                        assigned_doctor_id: newData.assigned_doctor_id,
                    })), (p.phone && { phone: p.phone })));
                    created.push(Object.assign({ id: docRef.id }, newData));
                }
                catch (innerErr) {
                    console.error(`Error processing patient ${p.full_name}:`, innerErr);
                    // Continua con il prossimo paziente invece di fallire tutto
                }
            }
            res.status(201).json({ created, processed: data.length });
        }
        catch (err) {
            console.error("Bulk import error:", err);
            res
                .status(500)
                .json({ error: "Bulk insert failed", details: err.message });
        }
    }));
    // Ottenere la lista dei pazienti
    router.get("/waiting", auth_1.authenticateToken, (0, auth_1.authorizeRoles)("admin", "segreteria"), (req, res) => __awaiter(this, void 0, void 0, function* () {
        try {
            const snapshot = yield patientsRef.orderBy("assigned_number").get();
            const patients = snapshot.docs.map((doc) => (Object.assign({ id: doc.id }, doc.data())));
            //io.emit("patientListGenerated");
            res.json(patients);
        }
        catch (err) {
            res.status(500).json({ error: "Errore nel server" });
        }
    }));
    router.put("/:id/call", auth_1.authenticateToken, (0, auth_1.authorizeRoles)("admin", "segreteria", "medico"), (req, res) => __awaiter(this, void 0, void 0, function* () {
        const { id } = req.params;
        try {
            // Recupera il paziente corrente
            const patientRef = patientsRef.doc(id);
            const patientSnap = yield patientRef.get();
            if (!patientSnap.exists) {
                res.status(404).json({ error: "Paziente non trovato" });
                return;
            }
            const { assigned_doctor_id } = patientSnap.data();
            if (!assigned_doctor_id) {
                res.status(400).json({ error: "Paziente senza medico assegnato" });
                return;
            }
            // Trova eventuali pazienti già in visita per questo stesso medico
            const prevSnap = yield patientsRef
                .where("assigned_doctor_id", "==", assigned_doctor_id)
                .where("status", "==", "in_visita")
                .get();
            // Imposta lo status a "completato" per i pazienti precedenti, notificali ai client
            const batch = firebase_1.db.batch();
            prevSnap.docs.forEach((doc) => {
                if (doc.id !== id) {
                    batch.update(patientsRef.doc(doc.id), { status: "completato" });
                    io.to("segreteria").emit("patientChanged", {
                        id: doc.id,
                        status: "completato",
                    });
                }
            });
            yield batch.commit();
            // Aggiorna lo stato del paziente chiamato
            yield patientRef.update({ status: "in_visita" });
            io.emit("patientChanged", { id, status: "in_visita" });
            res.json({ id, status: "in_visita" });
            return;
        }
        catch (err) {
            console.error("Errore in PUT /patients/:id/call", err);
            res.status(500).json({ error: "Errore del server" });
            return;
        }
    }));
    // Segnala arrivo: da "prenotato" → "in_attesa" (aggiunge assigned_doctor_id)
    router.put("/:id/arrive", auth_1.authenticateToken, (0, auth_1.authorizeRoles)("admin", "segreteria"), (req, res) => __awaiter(this, void 0, void 0, function* () {
        const { id } = req.params;
        try {
            // Leggi il paziente per ottenere il nome del medico
            const patientDoc = yield patientsRef.doc(id).get();
            const patientData = patientDoc.data();
            const doctorName = patientData === null || patientData === void 0 ? void 0 : patientData.assigned_doctor_name;
            // Cerca l'ID del medico dal nome
            let doctorId;
            if (doctorName) {
                const doctorByName = yield firebase_1.db
                    .collection("doctors")
                    .where("name", "==", doctorName)
                    .limit(1)
                    .get();
                if (!doctorByName.empty) {
                    doctorId = doctorByName.docs[0].id;
                }
                else {
                    // Medico non attivo - non permettere il passaggio a in_attesa
                    res.status(400).json({
                        error: "Il medico assegnato non è attualmente attivo",
                    });
                    return;
                }
            }
            else {
                // Nessun medico assegnato
                res.status(400).json({
                    error: "Nessun medico assegnato al paziente",
                });
                return;
            }
            // Aggiorna lo status e aggiungi l'ID del medico
            const updateData = { status: "in_attesa" };
            if (doctorId) {
                updateData.assigned_doctor_id = doctorId;
            }
            yield patientsRef.doc(id).update(updateData);
            io.emit("patientChanged", Object.assign({ id, status: "in_attesa" }, (doctorId && { assigned_doctor_id: doctorId })));
            res.status(200).json(Object.assign({ id, status: "in_attesa" }, (doctorId && { assigned_doctor_id: doctorId })));
            return;
        }
        catch (err) {
            console.error("Errore segnalazione arrivo:", err);
            res.status(500).json({ error: "Impossibile aggiornare lo status" });
            return;
        }
    }));
    // Ottenere i pazienti di un determinato medico
    router.get("/doctor/:doctorId", auth_1.authenticateToken, (0, auth_1.authorizeRoles)("admin", "segreteria", "medico"), (req, res) => __awaiter(this, void 0, void 0, function* () {
        const { doctorId } = req.params;
        try {
            // Ottiene paziente in visita
            const currentSnapshot = yield patientsRef
                .where("assigned_doctor_id", "==", doctorId)
                .where("status", "==", "in_visita")
                .limit(1)
                .get();
            const currentPatient = !currentSnapshot.empty
                ? Object.assign({ id: currentSnapshot.docs[0].id }, currentSnapshot.docs[0].data()) : null;
            // Ottiene il prossimo paziente in attesa ordinato per appointment_time
            const nextSnapshot = yield patientsRef
                .where("assigned_doctor_id", "==", doctorId)
                .where("status", "==", "in_attesa")
                .orderBy("appointment_time")
                .limit(1)
                .get();
            const nextPatient = !nextSnapshot.empty
                ? Object.assign({ id: nextSnapshot.docs[0].id }, nextSnapshot.docs[0].data()) : null;
            res.json({
                current: currentPatient,
                next: nextPatient,
            });
        }
        catch (err) {
            console.error("Errore nel recupero pazienti:", err);
            res.status(500).json({ error: "Errore del server" });
        }
    }));
    // Manteniamo la route /study/:studyId per retrocompatibilità, ma deprecata
    router.get("/study/:studyId", auth_1.authenticateToken, (0, auth_1.authorizeRoles)("admin", "segreteria", "medico"), (req, res) => __awaiter(this, void 0, void 0, function* () {
        res
            .status(410)
            .json({ error: "Route deprecata. Usare /doctor/:doctorId" });
    }));
    // Modificare un paziente
    router.put("/:id", auth_1.authenticateToken, (0, auth_1.authorizeRoles)("admin", "segreteria"), (req, res) => __awaiter(this, void 0, void 0, function* () {
        try {
            const id = req.params.id;
            const data = req.body;
            console.log(id, data);
            yield patientsRef.doc(id).update(data);
            //io.emit("patientsChanged");
            io.emit("patientChanged", Object.assign({ id }, data));
            res.json({ message: "Paziente aggiornato con successo" });
        }
        catch (err) {
            res.status(500).json({ error: "Errore nel server" });
        }
    }));
    // Rimuovere un paziente dalla lista
    // Archiviare un paziente: status -> "in_archivio", registra last_visit_date e assigned_doctor_name
    router.put("/:id/archive", auth_1.authenticateToken, (0, auth_1.authorizeRoles)("admin", "segreteria"), (req, res) => __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            const { id } = req.params;
            const now = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
            // Ottieni il paziente
            const patientDoc = yield patientsRef.doc(id).get();
            const patientData = patientDoc.data();
            // Recupera il nome del medico (priorità: assigned_doctor_name > ID lookup)
            let doctorName = (patientData === null || patientData === void 0 ? void 0 : patientData.assigned_doctor_name) || "N/A";
            // Se non abbiamo il nome, prova a recuperarlo dall'ID
            if ((!doctorName || doctorName === "N/A") &&
                (patientData === null || patientData === void 0 ? void 0 : patientData.assigned_doctor_id)) {
                const doctorRef = yield firebase_1.db
                    .collection("doctors")
                    .doc(patientData.assigned_doctor_id)
                    .get();
                if (doctorRef.exists) {
                    doctorName = ((_a = doctorRef.data()) === null || _a === void 0 ? void 0 : _a.name) || "N/A";
                }
            }
            // Aggiorna il paziente con status, data e nome medico
            yield patientsRef.doc(id).update({
                status: "in_archivio",
                last_visit_date: now,
                assigned_doctor_name: doctorName,
            });
            io.emit("patientChanged", {
                id,
                status: "in_archivio",
                last_visit_date: now,
                assigned_doctor_name: doctorName,
            });
            res.json({ message: "Paziente archiviato con successo" });
        }
        catch (err) {
            console.error("Errore archiviazione paziente:", err);
            res.status(500).json({ error: "Errore nel server" });
        }
    }));
    router.delete("/:id", auth_1.authenticateToken, (0, auth_1.authorizeRoles)("admin", "segreteria"), (req, res) => __awaiter(this, void 0, void 0, function* () {
        try {
            const { id } = req.params;
            yield patientsRef.doc(id).delete();
            // ✨ avvisa i client di rimuovere localmente questo id
            io.emit("patientRemoved", { id });
            res.json({ message: "Paziente rimosso" });
        }
        catch (err) {
            res.status(500).json({ error: "Errore nel server" });
        }
    }));
    // Rimuove tutti i pazienti dalla lista -> rotta non utilizzata per adesso
    router.delete("/", auth_1.authenticateToken, (0, auth_1.authorizeRoles)("admin", "segreteria"), (req, res) => __awaiter(this, void 0, void 0, function* () {
        try {
            // Preleva tutti i documenti
            const snapshot = yield patientsRef.get();
            // Batch delete (max 500 ops per batch)
            const batch = firebase_1.db.batch();
            snapshot.docs.forEach((doc) => batch.delete(doc.ref));
            yield batch.commit();
            // Notifica i client Reactivi
            io.emit("patientsSnapshot", []);
            return res.sendStatus(204);
        }
        catch (err) {
            console.error("Errore eliminazione pazienti:", err);
            return res
                .status(500)
                .json({ error: "Impossibile eliminare i pazienti" });
        }
    }));
    return router;
}
