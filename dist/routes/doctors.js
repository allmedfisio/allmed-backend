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
exports.setupDoctorRoutes = setupDoctorRoutes;
const express_1 = __importDefault(require("express"));
const db_1 = __importDefault(require("../db"));
const auth_1 = require("./auth");
const router = express_1.default.Router();
function setupDoctorRoutes(io) {
    // 1️⃣ Aggiungere un nuovo medico
    router.post("/", auth_1.authenticateToken, (req, res) => __awaiter(this, void 0, void 0, function* () {
        try {
            const { name, study } = req.body;
            if (!name || !study) {
                return res.status(400).json({ error: "Nome e studio sono obbligatori" });
            }
            const newDoctor = yield db_1.default.query("INSERT INTO doctors (name, study) VALUES ($1, $2) RETURNING *", [name, study]);
            io.emit("doctorsUpdated");
            res.json(newDoctor.rows[0]);
        }
        catch (err) {
            res.status(500).json({ error: "Errore nel server" });
        }
    }));
    // Ottenere i medici attivi e il loro ultimo paziente chiamato
    router.get("/active-doctors", auth_1.authenticateToken, (req, res) => __awaiter(this, void 0, void 0, function* () {
        try {
            const result = yield db_1.default.query(`
                SELECT d.name, d.study, d.id, p.assigned_number AS current_patient
                FROM doctors d
                LEFT JOIN patients p ON d.study = p.assigned_study AND p.status = 'chiamato'
                ORDER BY d.study;
        `);
            res.json(result.rows);
        }
        catch (err) {
            res.status(500).json({ error: "Errore nel server" });
        }
    }));
    // Rimuovere un medico dalla lista
    router.delete("/:id", auth_1.authenticateToken, (req, res) => __awaiter(this, void 0, void 0, function* () {
        try {
            const { id } = req.params;
            yield db_1.default.query("DELETE FROM doctors WHERE id = $1", [id]);
            res.json({ message: "Medico rimosso" });
        }
        catch (err) {
            res.status(500).json({ error: "Errore nel server" });
        }
    }));
    return router;
}
