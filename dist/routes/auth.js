"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
exports.authenticateToken = void 0;
exports.authorizeRoles = authorizeRoles;
const express_1 = __importDefault(require("express"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const firebase_1 = require("../firebase");
const admin = __importStar(require("firebase-admin"));
const router = express_1.default.Router();
const SECRET_KEY = process.env.JWT_SECRET_KEY;
// Endpoint di login
router.post("/login", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { username, password } = req.body;
    try {
        const snapshot = yield firebase_1.db
            .collection("admins")
            .where("username", "==", username)
            .get();
        if (snapshot.empty)
            return res.status(401).json({ error: "Nessun utente" });
        const userDoc = snapshot.docs[0];
        const user = userDoc.data();
        const validPassword = yield bcryptjs_1.default.compare(password, user.password);
        if (!validPassword)
            return res.status(401).json({ error: "Password sbagliata" });
        const payload = {
            id: userDoc.id,
            username: user.username,
            role: user.role, // 'admin' | 'segreteria' | 'medico'
        };
        const token = jsonwebtoken_1.default.sign(payload, SECRET_KEY, { expiresIn: "12h" });
        res.json({ token });
    }
    catch (err) {
        console.error("Login error:", err.message);
        console.error(err.stack);
        const detail = err.code !== undefined
            ? `[${err.code}] ${err.message}`
            : err.message || "Errore sconosciuto";
        res.status(500).json({ error: "Errore nel server", detail });
    }
}));
// 🔐 Registrazione nuovo utente (attualmente non utilizzato)
router.post("/register", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { username, password, avatarUrl } = req.body;
    try {
        // Verifica che i campi siano presenti
        if (!username || !password || !avatarUrl) {
            return res
                .status(400)
                .json({ error: "Mancano username, password o immagine" });
        }
        // Verifica se l'email è già registrata
        const snapshot = yield firebase_1.db
            .collection("admins")
            .where("username", "==", username)
            .get();
        if (!snapshot.empty) {
            return res.status(400).json({ error: "Username già in uso" });
        }
        // Hash della password
        const hashedPassword = yield bcryptjs_1.default.hash(password, 10);
        // Inserisci nel DB
        yield firebase_1.db.collection("admins").add({
            username,
            password: hashedPassword,
            avatarUrl: avatarUrl || "",
        });
        res.status(201).json({
            message: "Utente registrato",
        });
    }
    catch (err) {
        console.error("Errore registrazione:", err);
        res.status(500).json({ error: "Errore del server" });
    }
}));
// Middleware per proteggere le rotte
const authenticateToken = (req, res, next) => {
    var _a;
    const token = (_a = req.header("Authorization")) === null || _a === void 0 ? void 0 : _a.split(" ")[1];
    if (!token)
        return res.status(403).json({ error: "Accesso negato" });
    jsonwebtoken_1.default.verify(token, SECRET_KEY, (err, user) => {
        if (err)
            return res.status(403).json({ error: "Token non valido" });
        req.user = user;
        next();
    });
};
exports.authenticateToken = authenticateToken;
// Middleware di autorizzazione
function authorizeRoles(...allowed) {
    return (req, res, next) => {
        var _a;
        const role = (_a = req.user) === null || _a === void 0 ? void 0 : _a.role; // ← messo da authenticateToken
        if (!allowed.includes(role)) {
            res.sendStatus(403);
            return;
        }
        next();
    };
}
// Restituisce il profilo dell’utente loggato
router.get("/me", exports.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const adminId = req.user.id;
        const userDoc = yield admin
            .firestore()
            .collection("admins")
            .doc(adminId)
            .get();
        if (!userDoc.exists) {
            res.status(404).json({ error: "Utente non trovato" });
            return;
        }
        const { username, avatarUrl } = userDoc.data();
        res.json({ name: username, avatarUrl });
    }
    catch (err) {
        console.error("Errore in GET /auth/me", err);
        res.status(500).json({ error: "Errore del server" });
    }
}));
exports.default = router;
