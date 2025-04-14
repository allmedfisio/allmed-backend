import express from "express";
import pool from "../db";
import { Server } from "socket.io";
import { authenticateToken } from "./auth";

const router = express.Router();

// Funzione per ottenere il prossimo numero progressivo
async function getNextNumber(): Promise<number> {
    const result = await pool.query("SELECT COALESCE(MAX(assigned_number), 0) + 1 AS next FROM patients");
    return result.rows[0].next;
}

export function setupPatientRoutes(io: Server) {

    // Aggiungere un nuovo paziente
    router.post("/", authenticateToken, async (req: any, res: any) => {
        try {
            const { full_name, assigned_study } = req.body;
            if (!full_name || !assigned_study) {
                return res.status(400).json({ error: "Nome e studio sono obbligatori" });
            }

            const result = await pool.query("SELECT COALESCE(MAX(assigned_number), 0) + 1 AS next FROM patients");
            const assigned_number = result.rows[0].next;

            const newPatient = await pool.query(
                "INSERT INTO patients (full_name, assigned_study, assigned_number) VALUES ($1, $2, $3) RETURNING *",
                [full_name, assigned_study, assigned_number]
            );

            io.emit("patientsUpdated");
            res.json(newPatient.rows[0]);
        } catch (err) {
            res.status(500).json({ error: "Errore nel server" });
        }
    });

    // Ottenere la lista dei pazienti in attesa per uno studio specifico
    router.get("/waiting", authenticateToken, async (req, res) => {
        try {
            const patients = await pool.query(
                "SELECT * FROM patients WHERE status = 'in_attesa' ORDER BY assigned_number"
            );
            io.emit("patientListGenerated");
            res.json(patients.rows);
        } catch (err) {
            res.status(500).json({ error: "Errore nel server" });
        }
    });

    // Chiamare un paziente
    router.put("/:id/call", authenticateToken, async (req, res) => {
        try {
            const { id } = req.params;
            const updatedPatient = await pool.query(
                "UPDATE patients SET status = 'chiamato' WHERE id = $1 RETURNING *",
                [id]
            );

            io.emit("patientsUpdatedChiamato");
            res.json(updatedPatient.rows[0]);
        } catch (err) {
            res.status(500).json({ error: "Errore nel server" });
        }
    });

    // Segnare paziente come "in visita"
    router.put("/:id/in-visit", authenticateToken, async (req, res) => {
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
    });

    // Segnare paziente come "completato"
    router.put("/:id/complete", authenticateToken, async (req, res) => {
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
    });

    // Ottenere i pazienti di un determinato studio
    router.get("/study/:studyId", authenticateToken, async (req, res) => {
        try {
            const { studyId } = req.params;
            const result = await pool.query(
                "SELECT * FROM patients WHERE assigned_study = $1 AND status = 'in_attesa' ORDER BY assigned_number",
                [studyId]
            );
            io.emit("patientListStudy");
            res.json(result.rows);
        } catch (err) {
            res.status(500).json({ error: "Errore nel server" });
        }
    });

    // Rimuovere un paziente dalla lista
    router.delete("/:id", authenticateToken, async (req, res) => {
        try {
            const { id } = req.params;
            await pool.query("DELETE FROM patients WHERE id = $1", [id]);
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
