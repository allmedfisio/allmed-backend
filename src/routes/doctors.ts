import express from "express";
import { Server } from "socket.io";
import { authenticateToken } from "./auth";
import { db } from "../firebase";

const router = express.Router();

export function setupDoctorRoutes(io: Server) {
    //Aggiungere un nuovo medico
    router.post("/", authenticateToken, async (req: any, res: any) => {
        try {
            const { name, study } = req.body;
            if (!name || !study) {
                return res.status(400).json({ error: "Nome e studio sono obbligatori" });
            }
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
                await db.collection("doctors").doc(id).delete();
                res.json({ message: "Medico rimosso" });
            } catch (err) {
                res.status(500).json({ error: "Errore nel server" });
            }
        });

    return router;
}