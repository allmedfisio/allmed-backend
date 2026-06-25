import { Router } from "express";
import { db } from "../firebase";

export function setupCompensationsRoutes(): Router {
  const router = Router();

  // GET /professional-compensations — lista compensi correnti (ultima config per ogni medico)
  router.get("/", async (_req, res) => {
    try {
      const snapshot = await db
        .collection("professional_compensations")
        .orderBy("professional_name")
        .get();

      // Ordina in memoria per effective_from discendente e prendi la più recente
      const docs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as any[];
      docs.sort((a, b) => (b.effective_from || "").localeCompare(a.effective_from || ""));

      const byProfessional = new Map<
        string,
        {
          id: string;
          professional_name: string;
          compensation_pct: number;
          effective_from: string;
          effective_to?: string;
          created_at: string;
          updated_at: string;
        }
      >();

      docs.forEach((doc: any) => {
        if (!byProfessional.has(doc.professional_name)) {
          byProfessional.set(doc.professional_name, {
            id: doc.id,
            professional_name: doc.professional_name,
            compensation_pct: doc.compensation_pct,
            effective_from: doc.effective_from,
            effective_to: doc.effective_to || null,
            created_at: doc.created_at,
            updated_at: doc.updated_at,
          });
        }
      });

      res.json(Array.from(byProfessional.values()));
    } catch (error: any) {
      console.error("Error getting compensations:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /professional-compensations/:name — storico compensi per un medico
  router.get("/:name", async (req, res) => {
    try {
      const { name } = req.params;
      const snapshot = await db
        .collection("professional_compensations")
        .where("professional_name", "==", name)
        .orderBy("effective_from", "desc")
        .get();

      const history: any[] = [];
      snapshot.forEach((doc) => {
        history.push({ id: doc.id, ...doc.data() });
      });

      res.json(history);
    } catch (error: any) {
      console.error("Error getting compensation history:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /professional-compensations — crea nuova configurazione compenso
  router.post("/", async (req, res) => {
    try {
      const { professional_name, compensation_pct, effective_from } = req.body;

      if (!professional_name || compensation_pct === undefined) {
        res
          .status(400)
          .json({ error: "professional_name e compensation_pct sono obbligatori" });
        return;
      }

      const now = new Date().toISOString();
      const docRef = await db.collection("professional_compensations").add({
        professional_name,
        compensation_pct: Number(compensation_pct),
        effective_from: effective_from || now.split("T")[0],
        effective_to: null,
        created_at: now,
        updated_at: now,
      });

      // Se esiste una configurazione precedente per lo stesso medico, chiudila
      const previous = await db
        .collection("professional_compensations")
        .where("professional_name", "==", professional_name)
        .where("effective_to", "==", null)
        .get();

      const batch = db.batch();
      previous.forEach((doc) => {
        if (doc.id !== docRef.id) {
          batch.update(doc.ref, {
            effective_to: effective_from || now.split("T")[0],
            updated_at: now,
          });
        }
      });
      await batch.commit();

      res.status(201).json({
        id: docRef.id,
        professional_name,
        compensation_pct: Number(compensation_pct),
        effective_from: effective_from || now.split("T")[0],
      });
    } catch (error: any) {
      console.error("Error creating compensation:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // PUT /professional-compensations/:id — aggiorna una configurazione
  router.put("/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { compensation_pct, effective_from, effective_to } = req.body;

      const updateData: any = { updated_at: new Date().toISOString() };
      if (compensation_pct !== undefined) updateData.compensation_pct = Number(compensation_pct);
      if (effective_from !== undefined) updateData.effective_from = effective_from;
      if (effective_to !== undefined) updateData.effective_to = effective_to;

      await db.collection("professional_compensations").doc(id).update(updateData);

      res.json({ id, ...updateData });
    } catch (error: any) {
      console.error("Error updating compensation:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /professional-compensations/:id — rimuovi una configurazione
  router.delete("/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await db.collection("professional_compensations").doc(id).delete();
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting compensation:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /professional-compensations/lookup/:name — ottieni compenso corrente per un medico
  router.get("/lookup/:name", async (req, res) => {
    try {
      const { name } = req.params;
      const snapshot = await db
        .collection("professional_compensations")
        .where("professional_name", "==", name)
        .where("effective_to", "==", null)
        .limit(1)
        .get();

      if (snapshot.empty) {
        res.json({ professional_name: name, compensation_pct: null });
        return;
      }

      const doc = snapshot.docs[0];
      res.json({ id: doc.id, ...doc.data() });
    } catch (error: any) {
      console.error("Error looking up compensation:", error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
