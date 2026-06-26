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
exports.setupPingRoutes = setupPingRoutes;
const express_1 = __importDefault(require("express"));
const firebase_1 = require("../firebase");
const router = express_1.default.Router();
function setupPingRoutes(io) {
    // Ping base
    router.get("/", (req, res) => __awaiter(this, void 0, void 0, function* () {
        res.status(200).send("pong");
    }));
    // Health check con test Firestore
    router.get("/health", (req, res) => __awaiter(this, void 0, void 0, function* () {
        try {
            const t0 = Date.now();
            // Test: proviamo a leggere un documento qualunque da 'admins'
            const snapshot = yield firebase_1.db.collection("admins").limit(1).get();
            const firestoreMs = Date.now() - t0;
            res.json({
                status: "ok",
                firestore: {
                    reachable: true,
                    responseMs: firestoreMs,
                    adminsCount: snapshot.size,
                },
                uptime: process.uptime(),
            });
        }
        catch (err) {
            console.error("[HEALTH] /ping/health Firestore error:", err.message, err.code);
            res.status(503).json({
                status: "error",
                firestore: {
                    reachable: false,
                    error: err.message,
                    code: err.code || null,
                },
            });
        }
    }));
    return router;
}
