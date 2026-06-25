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
exports.setupDoctorRoutes = setupDoctorRoutes;
const express_1 = __importDefault(require("express"));
const auth_1 = require("./auth");
const firebase_1 = require("../firebase");
const router = express_1.default.Router();
function setupDoctorRoutes(io) {
    //Aggiungere un nuovo medico
    router.post("/", auth_1.authenticateToken, (0, auth_1.authorizeRoles)("admin", "segreteria"), (req, res) => __awaiter(this, void 0, void 0, function* () {
        try {
            const { name, study } = req.body;
            if (!name || !study) {
                return res
                    .status(400)
                    .json({ error: "Nome e studio sono obbligatori" });
            }
            const newDoctorRef = yield firebase_1.db
                .collection("doctors")
                .add({ name, study });
            const newDoctor = yield newDoctorRef.get();
            io.emit("doctorsUpdated");
            res.json(Object.assign({ id: newDoctorRef.id }, newDoctor.data()));
        }
        catch (err) {
            res.status(500).json({ error: "Errore nel server" });
        }
    }));
    // Ottenere i medici attivi e il loro ultimo paziente chiamato
    router.get("/active-doctors", auth_1.authenticateToken, (0, auth_1.authorizeRoles)("admin", "segreteria", "medico", "sala-attesa"), (req, res) => __awaiter(this, void 0, void 0, function* () {
        try {
            const doctorsSnap = yield firebase_1.db.collection("doctors").get();
            const doctors = doctorsSnap.docs.map((doc) => (Object.assign({ id: doc.id }, doc.data())));
            res.json(doctors);
        }
        catch (err) {
            res.status(500).json({ error: "Errore nel server" });
        }
    }));
    //Aggiornare ultimo paziente chiamato del medico
    router.put("/:id/call", auth_1.authenticateToken, (0, auth_1.authorizeRoles)("admin", "segreteria", "medico"), (req, res) => __awaiter(this, void 0, void 0, function* () {
        try {
            const id = req.params.id;
            const patientName = req.body;
            console.log("id: ", id, "nome: ", patientName);
            yield firebase_1.db.collection("doctors").doc(id).update(patientName);
            io.emit("doctorsUpdated");
            res.json({
                message: "Paziente aggiunto come ultimo paziente al medico",
            });
        }
        catch (err) {
            res.status(500).json({ error: "Errore nel server" });
        }
    }));
    // Rimuovere un medico dalla lista
    router.delete("/:id", auth_1.authenticateToken, (0, auth_1.authorizeRoles)("admin", "segreteria"), (req, res) => __awaiter(this, void 0, void 0, function* () {
        const { id } = req.params;
        try {
            // Cancella il medico
            yield firebase_1.db.collection("doctors").doc(id).delete();
            // Trova e imposta a "completato" i pazienti in_visita assegnati a questo medico
            const patientsRef = firebase_1.db.collection("patients");
            const inVisitaSnap = yield patientsRef
                .where("assigned_doctor_id", "==", id)
                .where("status", "==", "in_visita")
                .get();
            if (!inVisitaSnap.empty) {
                const batch = firebase_1.db.batch();
                inVisitaSnap.docs.forEach((pDoc) => {
                    batch.update(pDoc.ref, { status: "completato" });
                    // Notifica il client del cambio di status
                    io.emit("patientChanged", { id: pDoc.id, status: "completato" });
                });
                yield batch.commit();
            }
            // Aggiorna i client sui medici
            io.emit("doctorsUpdated");
            res.json({ message: "Medico rimosso" });
        }
        catch (err) {
            console.error("Errore removendo medico e paziente:", err);
            res.status(500).json({ error: "Errore nel server" });
        }
    }));
    // ========== DOCTOR-LIST Routes ==========
    // Ottenere TUTTI i medici con i loro dati (sia attivi che non)
    router.get("/all-doctors", auth_1.authenticateToken, (0, auth_1.authorizeRoles)("admin", "segreteria"), (req, res) => __awaiter(this, void 0, void 0, function* () {
        try {
            // Ottieni la lista master (doctor-list)
            const doctorListSnap = yield firebase_1.db.collection("doctor-list").get();
            const doctorNames = doctorListSnap.docs.map((doc) => doc.data().name);
            // Ottieni i medici dalla collection doctors
            const doctorsSnap = yield firebase_1.db.collection("doctors").get();
            const doctorsData = doctorsSnap.docs.reduce((acc, doc) => {
                acc[doc.data().name] = Object.assign({ id: doc.id }, doc.data());
                return acc;
            }, {});
            // Combina: per ogni nome in doctor-list, usa i dati da doctors se disponibili
            const allDoctors = doctorNames.map((name) => {
                if (doctorsData[name]) {
                    return doctorsData[name];
                }
                else {
                    // Se il nome è in doctor-list ma non in doctors, crea un record minimo
                    return { id: `temp-${name}`, name, study: "N/A" };
                }
            });
            // Funzione per estrarre il cognome (primo token dopo aver rimosso i prefissi come "Dott.", "Dott.ssa", "D.O.")
            const extractLastName = (fullName) => {
                const cleanName = fullName
                    .replace(/^(Dott\.|Dott\.ssa|D\.O\.)\s*/i, "")
                    .trim();
                const parts = cleanName.split(/\s+/);
                return parts[0].toLowerCase(); // Primo token = cognome
            };
            // Ordina per cognome
            allDoctors.sort((a, b) => {
                const lastNameA = extractLastName(a.name);
                const lastNameB = extractLastName(b.name);
                return lastNameA.localeCompare(lastNameB, "it");
            });
            res.json(allDoctors);
        }
        catch (err) {
            console.error("Errore recuperando all-doctors:", err);
            res.status(500).json({ error: "Errore nel server" });
        }
    }));
    // Ottenere la lista di tutti i nomi dei medici disponibili
    router.get("/doctor-list", auth_1.authenticateToken, (0, auth_1.authorizeRoles)("admin", "segreteria"), (req, res) => __awaiter(this, void 0, void 0, function* () {
        try {
            const doctorListSnap = yield firebase_1.db.collection("doctor-list").get();
            const doctorNames = doctorListSnap.docs.map((doc) => doc.data().name);
            // Ordina alfabeticamente
            doctorNames.sort();
            res.json(doctorNames);
        }
        catch (err) {
            console.error("Errore recuperando doctor-list:", err);
            res.status(500).json({ error: "Errore nel server" });
        }
    }));
    // Ottenere la lista di tutti i nomi dei medici con le rispettive branche
    router.get("/doctor-list-branches", auth_1.authenticateToken, (0, auth_1.authorizeRoles)("admin", "segreteria"), (req, res) => __awaiter(this, void 0, void 0, function* () {
        try {
            const doctorListSnap = yield firebase_1.db.collection("doctor-list").get();
            const doctors = doctorListSnap.docs.map((doc) => ({
                name: doc.data().name,
                branch: doc.data().branch || null,
            }));
            // Ordina per nome
            doctors.sort((a, b) => a.name.localeCompare(b.name, "it"));
            res.json(doctors);
        }
        catch (err) {
            console.error("Errore recuperando doctor-list-branches:", err);
            res.status(500).json({ error: "Errore nel server" });
        }
    }));
    // Aggiungere un nuovo nome alla lista dei medici disponibili
    router.post("/doctor-list", auth_1.authenticateToken, (0, auth_1.authorizeRoles)("admin", "segreteria"), (req, res) => __awaiter(this, void 0, void 0, function* () {
        try {
            const { name } = req.body;
            if (!name) {
                return res.status(400).json({ error: "Nome è obbligatorio" });
            }
            // Verifica se il nome esiste già
            const existingSnap = yield firebase_1.db
                .collection("doctor-list")
                .where("name", "==", name)
                .get();
            if (!existingSnap.empty) {
                return res
                    .status(400)
                    .json({ error: "Nome già presente nella lista" });
            }
            // Aggiungi il nuovo nome
            yield firebase_1.db.collection("doctor-list").add({ name });
            res.json({ message: "Nome aggiunto alla lista", name });
        }
        catch (err) {
            console.error("Errore aggiungendo nome a doctor-list:", err);
            res.status(500).json({ error: "Errore nel server" });
        }
    }));
    return router;
}
