import express from "express";
import { Server } from "socket.io";
import { authenticateToken } from "./auth";

const router = express.Router();

export function setupPingRoutes(io: Server) {

    // Pingare il server
    router.get("/ping", authenticateToken, async (req, res) => {
        res.status(200).send("pong");
    });

    return router;
}