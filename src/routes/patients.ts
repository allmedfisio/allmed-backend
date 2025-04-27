import express from "express";
import { Server } from "socket.io";
import { authenticateToken } from "./auth";
import { db } from "../firebase";

const router = express.Router();

export function setupPatientRoutes(io: Server) {

    const patientsRef = db.collection("patients");

    // Funzione per ottenere il prossimo numero progressivo
    async function getNextNumber(): Promise<number> {
        const snapshot = await patientsRef
            .orderBy("assigned_number", "desc")
            .limit(1)
            .get();
        const max = snapshot.empty ? 0 : snapshot.docs[0].data().assigned_number || 0;
        return max + 1;
    }

    // Aggiungere un nuovo paziente
    router.post("/", authenticateToken, async (req: any, res: any) => {
        try {
            const { full_name, assigned_study } = req.body;
            if (!full_name || !assigned_study) {
                return res.status(400).json({ error: "Nome e studio sono obbligatori" });
            }
            const assigned_number = await getNextNumber();
            const newPatient = {
                full_name,
                assigned_study,
                assigned_number,
                status: "in_attesa",
            };
            const docRef = await patientsRef.add(newPatient);
            io.emit("patientsUpdated");
            res.json({ id: docRef.id, ...newPatient });
        } catch (err) {
            res.status(500).json({ error: "Errore nel server" });
        }
    });

    // Ottenere la lista dei pazienti in attesa
    router.get("/waiting", authenticateToken, async (req, res) => {
        try {
            const snapshot = await patientsRef
                .orderBy("assigned_number")
                .get();
            const patients = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            io.emit("patientListGenerated");
            res.json(patients);
        } catch (err) {
            res.status(500).json({ error: "Errore nel server" });
        }
    });

    // Cambiare stato (chiamato, in visita, completato)
    async function updateStatus(id: string, status: string, eventName: string, res: any) {
        try {
            const docRef = patientsRef.doc(id);
            await docRef.update({ status });
            const updatedDoc = await docRef.get();

            io.emit(eventName);
            res.json({ id, ...updatedDoc.data() });
        } catch (err) {
            res.status(500).json({ error: "Errore nel server" });
        }
    }

        router.put("/:id/call", authenticateToken, async (req, res) => {
            await updateStatus(req.params.id, "in_visita", "patientsUpdatedChiamato", res);
        });
    
        /*router.put("/:id/in-visit", authenticateToken, async (req, res) => {
            await updateStatus(req.params.id, "in_visita", "patientUpdatedInVisita", res);
        });
    
        router.put("/:id/complete", authenticateToken, async (req, res) => {
            await updateStatus(req.params.id, "completato", "patientUpdatedCompletato", res);
        }); */

    // Ottenere i pazienti di un determinato studio
    router.get("/study/:studyId", authenticateToken, async (req, res) => {
        try {
            const { studyId } = req.params;
            const snapshot = await patientsRef
                .where("assigned_study", "==", Number(studyId))
                .where("status", "==", "in_attesa")
                .orderBy("assigned_number")
                .get();
            const patients = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            io.emit("patientListStudy");
            res.json(patients);
        } catch (err) {
            res.status(500).json({ error: "Errore nel server" });
        }
    });

    // Modificare un paziente
    router.put("/:id", authenticateToken, async (req, res) => {
        try {
            const id: any = req.params.id;
            const data  = req.body;
            console.log(id, data)
            await patientsRef.doc(id).update(data);
            io.emit("patientsUpdated");
            res.json({ message: "Paziente aggiornato con successo" });
        } catch (err) {
            res.status(500).json({ error: "Errore nel server" });
        }
    });

    // Rimuovere un paziente dalla lista
    router.delete("/:id", authenticateToken, async (req, res) => {
        try {
            const { id } = req.params;
            await patientsRef.doc(id).delete();
            io.emit("patientsUpdated");
            res.json({ message: "Paziente rimosso" });
        } catch (err) {
            res.status(500).json({ error: "Errore nel server" });
        }
    });

    return router;
}