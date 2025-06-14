import express from "express";
import { Server } from "socket.io";
import { authenticateToken, authorizeRoles } from "./auth";
import { db } from "../firebase";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = express.Router();

// Configura Multer per salvare su disco in uploads/ticket-promos
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(__dirname, "../uploads/ticket-promos");
    // assicuriamoci che esista
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    // es. 1697312345678_india.png
    const name = `${Date.now()}_${file.originalname}`;
    cb(null, name);
  },
});
const upload = multer({ storage });

export function setupTicketRoutes(io: Server) {
  // puntiamo al documento “default”
  const tplRef = db.collection("ticketTemplates").doc("default");

  router.get(
    "/",
    authenticateToken,
    authorizeRoles("admin", "segreteria"),
    async (req: any, res: any) => {
      try {
        const snap = await tplRef.get();
        if (!snap.exists) {
          return res.status(404).json({ error: "Template non trovato" });
        }
        return res.json(snap.data());
      } catch (err) {
        console.error("GET /ticket-templates error", err);
        return res.status(500).json({ error: "Errore server" });
      }
    }
  );

  router.put(
    "/",
    authenticateToken,
    authorizeRoles("admin", "segreteria"),
    async (req: any, res: any) => {
      try {
        // aggiorniamo solo i campi presenti in body
        console.log("BODY ricevuto in /ticket:", req.body);
        await tplRef.set(req.body, { merge: true });
        const updated = await tplRef.get();
        io.emit("ticketTemplateUpdated", updated.data()); // notifica eventuali UI in realtime
        return res.json(updated.data());
      } catch (err) {
        console.error("PUT /ticket-templates error", err);
        return res.status(500).json({ error: "Errore server" });
      }
    }
  );

  router.post("/promo-image", upload.single("image"), (req: any, res: any) => {
    if (!req.file) {
      return res.status(400).json({ error: "Nessun file ricevuto" });
    }
    // Costruisci URL pubblico
    const url = `${req.protocol}://${req.get("host")}/uploads/ticket-promos/${req.file.filename}`;
    res.json({ url });
  });

  return router;
}
