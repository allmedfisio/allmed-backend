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
exports.setupTicketRoutes = setupTicketRoutes;
const express_1 = __importDefault(require("express"));
const auth_1 = require("./auth");
const firebase_1 = require("../firebase");
const multer_1 = __importDefault(require("multer"));
//import path from "path";
//import fs from "fs";
const firebase_2 = require("../firebase");
const router = express_1.default.Router();
// Configura Multer per salvare su disco in uploads/ticket-promos
/*
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
*/
// Configura Multer per usare memoria (per upload su Firebase Storage)
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
function setupTicketRoutes(io) {
    // puntiamo al documento “default”
    const tplRef = firebase_1.db.collection("ticketTemplates").doc("default");
    router.get("/", auth_1.authenticateToken, (0, auth_1.authorizeRoles)("admin", "segreteria"), (req, res) => __awaiter(this, void 0, void 0, function* () {
        try {
            const snap = yield tplRef.get();
            if (!snap.exists) {
                return res.status(404).json({ error: "Template non trovato" });
            }
            return res.json(snap.data());
        }
        catch (err) {
            console.error("GET /ticket-templates error", err);
            return res.status(500).json({ error: "Errore server" });
        }
    }));
    router.put("/", auth_1.authenticateToken, (0, auth_1.authorizeRoles)("admin", "segreteria"), (req, res) => __awaiter(this, void 0, void 0, function* () {
        try {
            // aggiorniamo solo i campi presenti in body
            console.log("BODY ricevuto in /ticket:", req.body);
            yield tplRef.set(req.body, { merge: true });
            const updated = yield tplRef.get();
            io.emit("ticketTemplateUpdated", updated.data()); // notifica eventuali UI in realtime
            return res.json(updated.data());
        }
        catch (err) {
            console.error("PUT /ticket-templates error", err);
            return res.status(500).json({ error: "Errore server" });
        }
    }));
    /*
    router.post("/promo-image", upload.single("image"), (req: any, res: any) => {
      if (!req.file) {
        return res.status(400).json({ error: "Nessun file ricevuto" });
      }
      // Costruisci URL pubblico
      const url = `${req.protocol}://${req.get("host")}/uploads/ticket-promos/${req.file.filename}`;
      res.json({ url });
    });
    */
    router.post("/promo-image", auth_1.authenticateToken, (0, auth_1.authorizeRoles)("admin", "segreteria"), upload.single("image"), (req, res) => __awaiter(this, void 0, void 0, function* () {
        if (!req.file)
            return res.status(400).json({ error: "Nessun file" });
        const file = req.file;
        const filename = `ticket-promos/${Date.now()}_${file.originalname}`;
        const fileRef = firebase_2.bucket.file(filename);
        const stream = fileRef.createWriteStream({
            metadata: { contentType: file.mimetype },
        });
        stream.end(file.buffer);
        stream.on("finish", () => __awaiter(this, void 0, void 0, function* () {
            // Rendi pubblico (opzionale)
            yield fileRef.makePublic();
            const publicUrl = `https://storage.googleapis.com/${firebase_2.bucket.name}/${filename}`;
            res.json({ url: publicUrl });
        }));
        stream.on("error", (err) => {
            console.error("Upload error:", err);
            res.status(500).json({ error: "Upload failed" });
        });
    }));
    return router;
}
