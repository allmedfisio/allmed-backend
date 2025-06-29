import express from "express";
import { Server } from "socket.io";
import { authenticateToken, authorizeRoles } from "./auth";
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
    const max = snapshot.empty
      ? 0
      : snapshot.docs[0].data().assigned_number || 0;
    return max + 1;
  }

  // Aggiungere un nuovo paziente
  router.post(
    "/",
    authenticateToken,
    authorizeRoles("admin", "segreteria"),
    async (req: any, res: any) => {
      try {
        const { full_name, assigned_study, appointment_time, status } =
          req.body;
        if (!full_name || !assigned_study || !appointment_time || !status) {
          return res.status(400).json({
            error:
              "Nome, studio, orario appuntamento e status sono obbligatori",
          });
        }
        const assigned_number = await getNextNumber();
        const newPatient = {
          full_name,
          assigned_study,
          assigned_number,
          appointment_time: appointment_time,
          status,
        };
        const docRef = await patientsRef.add(newPatient);

        // ✨ invia solo il nuovo paziente
        io.emit("patientChanged", {
          id: docRef.id,
          full_name: newPatient.full_name,
          assigned_study: newPatient.assigned_study,
          assigned_number: newPatient.assigned_number,
          appointment_time: newPatient.appointment_time,
          status: newPatient.status,
        });
        res.json({ id: docRef.id, ...newPatient });
      } catch (err) {
        res.status(500).json({ error: "Errore nel server" });
      }
    }
  );

  // Bulk insert
  router.post("/bulk", async (req, res) => {
    try {
      const incoming: Array<{
        full_name: string;
        assigned_study: number;
        appointment_time: string;
      }> = req.body;
      const created = [];

      for (const p of incoming) {
        // skip duplicates
        const dup = await patientsRef
          .where("full_name", "==", p.full_name)
          .where("assigned_study", "==", p.assigned_study)
          .where("appointment_time", "==", p.appointment_time)
          .get();
        if (!dup.empty) continue;

        // next number from existing function
        const assigned_number = await getNextNumber();
        const data = {
          full_name: p.full_name,
          assigned_study: p.assigned_study,
          appointment_time: p.appointment_time,
          assigned_number,
          status: "prenotato",
        };
        await patientsRef.add(data);
        created.push(data);
      }

      res.status(201).json({ created });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Bulk insert failed" });
    }
  });

  // Ottenere la lista dei pazienti
  router.get(
    "/waiting",
    authenticateToken,
    authorizeRoles("admin", "segreteria"),
    async (req, res) => {
      try {
        const snapshot = await patientsRef.orderBy("assigned_number").get();
        const patients = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        //io.emit("patientListGenerated");
        res.json(patients);
      } catch (err) {
        res.status(500).json({ error: "Errore nel server" });
      }
    }
  );

  router.put(
    "/:id/call",
    authenticateToken,
    authorizeRoles("admin", "segreteria", "medico"),
    async (req, res): Promise<void> => {
      const { id } = req.params;
      try {
        // Recupera il paziente corrente
        const patientRef = patientsRef.doc(id);
        const patientSnap = await patientRef.get();
        if (!patientSnap.exists) {
          res.status(404).json({ error: "Paziente non trovato" });
          return;
        }
        const { assigned_study } = patientSnap.data()!;
        // Trova eventuali pazienti già in visita per questo stesso studio
        const prevSnap = await patientsRef
          .where("assigned_study", "==", assigned_study)
          .where("status", "==", "in_visita")
          .get();

        // Elimina i vecchi, notificali ai client
        const batch = db.batch();
        prevSnap.docs.forEach((doc) => {
          if (doc.id !== id) {
            batch.delete(patientsRef.doc(doc.id));
            io.to("segreteria").emit("patientRemoved", { id: doc.id });
          }
        });
        await batch.commit();

        // Aggiorna lo stato del paziente chiamato
        await patientRef.update({ status: "in_visita" });
        io.emit("patientChanged", { id, status: "in_visita" });

        res.json({ id, status: "in_visita" });
        return;
      } catch (err) {
        console.error("Errore in PUT /patients/:id/call", err);
        res.status(500).json({ error: "Errore del server" });
        return;
      }
    }
  );

  // Segnala arrivo: da “prenotato” → “in_attesa”
  router.put(
    "/:id/arrive",
    authenticateToken,
    authorizeRoles("admin", "segreteria"),
    async (req, res): Promise<void> => {
      const { id } = req.params;
      try {
        // Aggiorna lo status
        await patientsRef.doc(id).update({ status: "in_attesa" });
        io.emit("patientChanged", { id, status: "in_attesa" });

        res.status(200).json({ id, status: "in_attesa" });
        return;
      } catch (err) {
        console.error("Errore segnalazione arrivo:", err);
        res.status(500).json({ error: "Impossibile aggiornare lo status" });
        return;
      }
    }
  );

  // Ottenere i pazienti di un determinato studio
  router.get(
    "/study/:studyId",
    authenticateToken,
    authorizeRoles("admin", "segreteria", "medico"),
    async (req, res) => {
      const { studyId } = req.params;
      try {
        // Ottiene paziente in visita
        const currentSnapshot = await patientsRef
          .where("assigned_study", "==", studyId)
          .where("status", "==", "in_visita")
          .limit(1)
          .get();

        const currentPatient = !currentSnapshot.empty
          ? {
              id: currentSnapshot.docs[0].id,
              ...currentSnapshot.docs[0].data(),
            }
          : null;

        // Ottiene il prossimo paziente in attesa ordinato per appointment_time
        const nextSnapshot = await patientsRef
          .where("assigned_study", "==", studyId)
          .where("status", "==", "in_attesa")
          .orderBy("appointment_time")
          .limit(1)
          .get();

        const nextPatient = !nextSnapshot.empty
          ? { id: nextSnapshot.docs[0].id, ...nextSnapshot.docs[0].data() }
          : null;

        res.json({
          current: currentPatient,
          next: nextPatient,
        });
      } catch (err) {
        console.error("Errore nel recupero pazienti:", err);
        res.status(500).json({ error: "Errore del server" });
      }
    }
  );

  // Modificare un paziente
  router.put(
    "/:id",
    authenticateToken,
    authorizeRoles("admin", "segreteria"),
    async (req, res) => {
      try {
        const id: any = req.params.id;
        const data = req.body;
        console.log(id, data);
        await patientsRef.doc(id).update(data);
        //io.emit("patientsChanged");
        io.emit("patientChanged", { data });
        res.json({ message: "Paziente aggiornato con successo" });
      } catch (err) {
        res.status(500).json({ error: "Errore nel server" });
      }
    }
  );

  // Rimuovere un paziente dalla lista
  router.delete(
    "/:id",
    authenticateToken,
    authorizeRoles("admin", "segreteria"),
    async (req, res) => {
      try {
        const { id } = req.params;
        await patientsRef.doc(id).delete();

        // ✨ avvisa i client di rimuovere localmente questo id
        io.emit("patientRemoved", { id });
        res.json({ message: "Paziente rimosso" });
      } catch (err) {
        res.status(500).json({ error: "Errore nel server" });
      }
    }
  );

  // Rimuove tutti i pazienti dalla lista -> rotta non utilizzata per adesso
  router.delete(
    "/",
    authenticateToken,
    authorizeRoles("admin", "segreteria"),
    async (req: any, res: any) => {
      try {
        // Preleva tutti i documenti
        const snapshot = await patientsRef.get();
        // Batch delete (max 500 ops per batch)
        const batch = db.batch();
        snapshot.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
        // Notifica i client Reactivi
        io.emit("patientsSnapshot", []);
        return res.sendStatus(204);
      } catch (err) {
        console.error("Errore eliminazione pazienti:", err);
        return res
          .status(500)
          .json({ error: "Impossibile eliminare i pazienti" });
      }
    }
  );
  return router;
}
