import express from "express";
import { Server } from "socket.io";
import { db } from "../firebase";

const router = express.Router();

export function setupPingRoutes(io: Server) {

    // Ping base
    router.get("/", async (req, res) => {
        res.status(200).send("pong");
    });

    // Health check con test Firestore
    router.get("/health", async (req, res) => {
        try {
            const t0 = Date.now();
            // Test: proviamo a leggere un documento qualunque da 'admins'
            const snapshot = await db.collection("admins").limit(1).get();
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
        } catch (err: any) {
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
    });

    return router;
}