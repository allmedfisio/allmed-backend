import express from "express";
import { Server } from "socket.io";
import { authenticateToken, authorizeRoles } from "./auth";
import { db } from "../firebase";

const router = express.Router();

export function setupDoctorRoutes(io: Server) {
  //Aggiungere un nuovo medico
  router.post(
    "/",
    authenticateToken,
    authorizeRoles("admin", "segreteria"),
    async (req: any, res: any) => {
      try {
        const { name, study } = req.body;
        if (!name || !study) {
          return res
            .status(400)
            .json({ error: "Nome e studio sono obbligatori" });
        }
        const newDoctorRef = await db
          .collection("doctors")
          .add({ name, study });
        const newDoctor = await newDoctorRef.get();
        io.emit("doctorsUpdated");
        res.json({ id: newDoctorRef.id, ...newDoctor.data() });
      } catch (err) {
        res.status(500).json({ error: "Errore nel server" });
      }
    }
  );

  // Ottenere i medici attivi e il loro ultimo paziente chiamato
  router.get(
    "/active-doctors",
    authenticateToken,
    authorizeRoles("admin", "segreteria", "medico", "sala-attesa"),
    async (req, res) => {
      try {
        const doctorsSnap = await db.collection("doctors").get();
        const doctors = doctorsSnap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        res.json(doctors);
      } catch (err) {
        res.status(500).json({ error: "Errore nel server" });
      }
    }
  );

  //Aggiornare ultimo paziente chiamato del medico
  router.put(
    "/:id/call",
    authenticateToken,
    authorizeRoles("admin", "segreteria", "medico"),
    async (req, res) => {
      try {
        const id: any = req.params.id;
        const patientName = req.body;
        console.log("id: ", id, "nome: ", patientName);
        await db.collection("doctors").doc(id).update(patientName);
        io.emit("doctorsUpdated");
        res.json({
          message: "Paziente aggiunto come ultimo paziente al medico",
        });
      } catch (err) {
        res.status(500).json({ error: "Errore nel server" });
      }
    }
  );

  // Rimuovere un medico dalla lista
  router.delete(
    "/:id",
    authenticateToken,
    authorizeRoles("admin", "segreteria"),
    async (req: any, res: any) => {
      const { id } = req.params;
      try {
        // Cancella il medico
        await db.collection("doctors").doc(id).delete();

        // Trova e cancella i pazienti in_visita assegnati a questo medico
        const patientsRef = db.collection("patients");
        const inVisitaSnap = await patientsRef
          .where("assigned_doctor", "==", id)
          .where("status", "==", "in_visita")
          .get();
        if (!inVisitaSnap.empty) {
          const batch = db.batch();
          inVisitaSnap.docs.forEach((pDoc) => {
            batch.delete(pDoc.ref);

            // Notifica il client della rimozione
            io.emit("patientRemoved", { id: pDoc.id });
          });
          await batch.commit();
        }

        // Aggiorna i client sui medici
        io.emit("doctorsUpdated");
        res.json({ message: "Medico rimosso" });
      } catch (err) {
        console.error("Errore removendo medico e paziente:", err);
        res.status(500).json({ error: "Errore nel server" });
      }
    }
  );

  // ========== DOCTOR-LIST Routes ==========
  
  // Ottenere la lista di tutti i nomi dei medici disponibili
  router.get(
    "/doctor-list",
    authenticateToken,
    authorizeRoles("admin", "segreteria"),
    async (req, res) => {
      try {
        const doctorListSnap = await db.collection("doctor-list").get();
        const doctorNames = doctorListSnap.docs.map((doc) => doc.data().name);
        // Ordina alfabeticamente
        doctorNames.sort();
        res.json(doctorNames);
      } catch (err) {
        console.error("Errore recuperando doctor-list:", err);
        res.status(500).json({ error: "Errore nel server" });
      }
    }
  );

  // Aggiungere un nuovo nome alla lista dei medici disponibili
  router.post(
    "/doctor-list",
    authenticateToken,
    authorizeRoles("admin", "segreteria"),
    async (req: any, res: any) => {
      try {
        const { name } = req.body;
        if (!name) {
          return res.status(400).json({ error: "Nome è obbligatorio" });
        }

        // Verifica se il nome esiste già
        const existingSnap = await db
          .collection("doctor-list")
          .where("name", "==", name)
          .get();
        
        if (!existingSnap.empty) {
          return res.status(400).json({ error: "Nome già presente nella lista" });
        }

        // Aggiungi il nuovo nome
        await db.collection("doctor-list").add({ name });
        res.json({ message: "Nome aggiunto alla lista", name });
      } catch (err) {
        console.error("Errore aggiungendo nome a doctor-list:", err);
        res.status(500).json({ error: "Errore nel server" });
      }
    }
  );

  return router;
}
