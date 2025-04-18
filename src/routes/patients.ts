import express from "express";
//import pool from "../db";
import { Server } from "socket.io";
import { authenticateToken } from "./auth";
import { db } from "../firebase"; // <-- Firestore inizializzato

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

            //const result = await pool.query("SELECT COALESCE(MAX(assigned_number), 0) + 1 AS next FROM patients");
            //const assigned_number = result.rows[0].next;

            const assigned_number = await getNextNumber();

            /* const newPatient = await pool.query(
                "INSERT INTO patients (full_name, assigned_study, assigned_number) VALUES ($1, $2, $3) RETURNING *",
                [full_name, assigned_study, assigned_number]
            ); */

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
            /* const patients = await pool.query(
                "SELECT * FROM patients WHERE status = 'in_attesa' ORDER BY assigned_number"
            ); */
            const snapshot = await patientsRef
                .where("status", "==", "in_attesa")
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

    //router.put("/:id/call", authenticateToken, async (req, res) => {

        router.put("/:id/call", authenticateToken, async (req, res) => {
            await updateStatus(req.params.id, "chiamato", "patientsUpdatedChiamato", res);
        });
    
        router.put("/:id/in-visit", authenticateToken, async (req, res) => {
            await updateStatus(req.params.id, "in_visita", "patientUpdatedInVisita", res);
        });
    
        router.put("/:id/complete", authenticateToken, async (req, res) => {
            await updateStatus(req.params.id, "completato", "patientUpdatedCompletato", res);
        });
        /* try {
            const { id } = req.params;
            const updatedPatient = await pool.query(
                "UPDATE patients SET status = 'chiamato' WHERE id = $1 RETURNING *",
                [id]
            );

            io.emit("patientsUpdatedChiamato");
            res.json(updatedPatient.rows[0]);
        } catch (err) {
            res.status(500).json({ error: "Errore nel server" });
        } */
    //});

    // Segnare paziente come "in visita"
    /* router.put("/:id/in-visit", authenticateToken, async (req, res) => {
        try {
            const { id } = req.params;
            const updatedPatient = await pool.query(
                "UPDATE patients SET status = 'in_visita' WHERE id = $1 RETURNING *",
                [id]
            );
            io.emit("patientUpdatedInVisita");
            res.json(updatedPatient.rows[0]);
        } catch (err) {
            res.status(500).json({ error: "Errore nel server" });
        }
    }); */

    // Segnare paziente come "completato"
    /* router.put("/:id/complete", authenticateToken, async (req, res) => {
        try {
            const { id } = req.params;
            const updatedPatient = await pool.query(
                "UPDATE patients SET status = 'completato' WHERE id = $1 RETURNING *",
                [id]
            );
            io.emit("patientUpdatedCompletato");
            res.json(updatedPatient.rows[0]);
        } catch (err) {
            res.status(500).json({ error: "Errore nel server" });
        }
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
            /* const result = await pool.query(
                "SELECT * FROM patients WHERE assigned_study = $1 AND status = 'in_attesa' ORDER BY assigned_number",
                [studyId]
            ); */
            io.emit("patientListStudy");
            res.json(patients);
        } catch (err) {
            res.status(500).json({ error: "Errore nel server" });
        }
    });

    // Rimuovere un paziente dalla lista
    router.delete("/:id", authenticateToken, async (req, res) => {
        try {
            const { id } = req.params;
            //await pool.query("DELETE FROM patients WHERE id = $1", [id]);
            await patientsRef.doc(id).delete();
            io.emit("patientsUpdated"); // opzionale
            res.json({ message: "Paziente rimosso" });
        } catch (err) {
            res.status(500).json({ error: "Errore nel server" });
        }
    });

    return router;
}

/*

// 1️⃣ Aggiungere un nuovo paziente
router.post("/", async (req: any, res: any) => {
    try {
        const { full_name, assigned_study } = req.body as {
            full_name: string;
            assigned_study: number;
          };

        if (!full_name || !assigned_study) {
            return res.status(400).json({ error: "Nome e studio sono obbligatori" });
        }

        const assigned_number = await getNextNumber();
        const newPatient = await pool.query(
            "INSERT INTO patients (full_name, assigned_study, assigned_number) VALUES ($1, $2, $3) RETURNING *",
            [full_name, assigned_study, assigned_number] as any[]
        );

        res.json(newPatient.rows[0]);
    } catch (err) {
        res.status(500).json({ error: "Errore nel server" });
    }
});

// 2️⃣ Ottenere la lista dei pazienti in attesa per uno studio specifico
router.get("/:studyId", async (req, res) => {
    try {
        const { studyId } = req.params;
        const patients = await pool.query(
            "SELECT * FROM patients WHERE assigned_study = $1 AND status = 'in_attesa' ORDER BY assigned_number",
            [studyId]
        );
        res.json(patients.rows);
    } catch (err) {
        res.status(500).json({ error: "Errore nel server" });
    }
});

// 3️⃣ Chiamare un paziente (cambia stato)
router.put("/:id/call", async (req, res) => {
    try {
        const { id } = req.params;
        const updatedPatient = await pool.query(
            "UPDATE patients SET status = 'chiamato' WHERE id = $1 RETURNING *",
            [id]
        );
        res.json(updatedPatient.rows[0]);
    } catch (err) {
        res.status(500).json({ error: "Errore nel server" });
    }
});

// 4️⃣ Segnare paziente come "in visita"
router.put("/:id/in-visit", async (req, res) => {
    try {
        const { id } = req.params;
        const updatedPatient = await pool.query(
            "UPDATE patients SET status = 'in_visita' WHERE id = $1 RETURNING *",
            [id]
        );
        res.json(updatedPatient.rows[0]);
    } catch (err) {
        res.status(500).json({ error: "Errore nel server" });
    }
});

// 5️⃣ Segnare paziente come "completato"
router.put("/:id/complete", async (req, res) => {
    try {
        const { id } = req.params;
        const updatedPatient = await pool.query(
            "UPDATE patients SET status = 'completato' WHERE id = $1 RETURNING *",
            [id]
        );
        res.json(updatedPatient.rows[0]);
    } catch (err) {
        res.status(500).json({ error: "Errore nel server" });
    }
});

export default router; */
