import express from "express";
import { Server } from "socket.io";

const router = express.Router();

export function setupPingRoutes(io: Server) {

    // Pingare il server
    router.get("/", async (req, res) => {
        res.status(200).send("pong");
    });

    return router;
}