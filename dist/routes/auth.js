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
exports.authenticateToken = void 0;
const express_1 = __importDefault(require("express"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = __importDefault(require("../db"));
const router = express_1.default.Router();
const SECRET_KEY = "tuo_segretissimo_token"; // ⚠️ Da sostituire con una variabile d'ambiente!
// Endpoint di login
router.post("/login", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { username, password } = req.body;
    try {
        const result = yield db_1.default.query("SELECT * FROM admins WHERE username = $1", [username]);
        if (result.rows.length === 0)
            return res.status(401).json({ error: "Nessun utente" });
        const user = result.rows[0];
        const validPassword = yield bcrypt_1.default.compare(password, user.password);
        if (!validPassword)
            return res.status(401).json({ error: "Password sbagliata" });
        const token = jsonwebtoken_1.default.sign({ id: user.id, username: user.username }, SECRET_KEY, { expiresIn: "2h" });
        res.json({ token });
    }
    catch (err) {
        res.status(500).json({ error: "Errore nel server" });
    }
}));
// 🔐 Registrazione nuovo utente
router.post("/register", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { username, password } = req.body;
    try {
        // Verifica che i campi siano presenti
        if (!username || !password) {
            return res.status(400).json({ error: "Username e password obbligatorie" });
        }
        // Verifica se l'email è già registrata
        const existing = yield db_1.default.query("SELECT * FROM admins WHERE username = $1", [username]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: "Username già in uso" });
        }
        // Hash della password
        const hashedPassword = yield bcrypt_1.default.hash(password, 10);
        // Inserisci nel DB
        const result = yield db_1.default.query("INSERT INTO admins (username, password) VALUES ($1, $2) RETURNING id, username", [username, hashedPassword]);
        res.status(201).json({ message: "Utente registrato", user: result.rows[0] });
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
exports.default = router;
