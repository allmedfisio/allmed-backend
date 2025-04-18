import express from "express";
//import pool from "../db";
import { Server } from "socket.io";
import { authenticateToken } from "./auth";
import { db } from "../firebase";

const router = express.Router();

export function setupDoctorRoutes(io: Server) {
    // 1️⃣ Aggiungere un nuovo medico
    router.post("/", authenticateToken, async (req: any, res: any) => {
        try {
            const { name, study } = req.body;
            if (!name || !study) {
                return res.status(400).json({ error: "Nome e studio sono obbligatori" });
            }

            /* const newDoctor = await pool.query(
                "INSERT INTO doctors (name, study) VALUES ($1, $2) RETURNING *",
                [name, study]
            ); */

            const newDoctorRef = await db.collection("doctors").add({ name, study });
            const newDoctor = await newDoctorRef.get();
            io.emit("doctorsUpdated");
            res.json({ id: newDoctorRef.id, ...newDoctor.data() });
        } catch (err) {
            res.status(500).json({ error: "Errore nel server" });
        }
    });

    // Ottenere i medici attivi e il loro ultimo paziente chiamato
    router.get("/active-doctors", authenticateToken, async (req, res) => {
        //try {
            /* const result = await pool.query(`
                SELECT d.name, d.study, d.id, p.assigned_number AS current_patient
                FROM doctors d
                LEFT JOIN patients p ON d.study = p.assigned_study AND p.status = 'chiamato'
                ORDER BY d.study;
        `   ); */

        try {
            const doctorsSnap = await db.collection("doctors").get();
            const patientsSnap = await db.collection("patients")
              .where("status", "==", "chiamato")
              .get();
      
            const calledPatients = patientsSnap.docs.map((doc) => doc.data());
      
            const doctors = doctorsSnap.docs.map((doc) => {
              const doctor = doc.data();
              const currentPatient = calledPatients.find(
                (p) => p.assigned_study === doctor.study
              );
              return {
                id: doc.id,
                name: doctor.name,
                study: doctor.study,
                current_patient: currentPatient?.assigned_number || null,
              };
            });
            res.json(doctors);
        } catch (err) {
            res.status(500).json({ error: "Errore nel server" });
        }
    });

    // Rimuovere un medico dalla lista
        router.delete("/:id", authenticateToken, async (req, res) => {
            try {
                const { id } = req.params;
                //await pool.query("DELETE FROM doctors WHERE id = $1", [id]);
                await db.collection("doctors").doc(id).delete();
                res.json({ message: "Medico rimosso" });
            } catch (err) {
                res.status(500).json({ error: "Errore nel server" });
            }
        });

    return router;
}