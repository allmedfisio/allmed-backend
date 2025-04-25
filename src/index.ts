import express from "express";
import cors from "cors";
import dotenv from "dotenv";
//import { pool } from './db';
import { createServer } from "http";
import { Server } from "socket.io";
import { setupPatientRoutes } from "./routes/patients";
import { setupDoctorRoutes } from "./routes/doctors";
import { setupPingRoutes } from "./routes/ping";
import authRoutes from "./routes/auth";
import * as admin from "firebase-admin";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const db = admin.firestore();

// Creiamo il server HTTP e WebSocket
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: "*" }
});

app.use("/patients", setupPatientRoutes(io));
app.use("/doctors", setupDoctorRoutes(io));
app.use("/auth", authRoutes);
app.use("/ping", setupPingRoutes(io));

// Evento WebSocket quando un client si connette
io.on("connection", (socket) => {
  console.log("🔗 Client connesso:", socket.id);

  // Quando un paziente viene aggiornato, lo notifichiamo a tutti
  socket.on("updatePatients", async () => {
        try {
          const snapshot = await db
            .collection("patients")
            .where("status", "==", "in_attesa")
            .orderBy("assigned_number")
            .get();
          const patients = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          io.emit("patientsUpdated", patients);
        } catch (error) {
          console.error("Errore durante il recupero dei pazienti:", error);
        }
  });

  // Quando un medico viene aggiornato, lo notifichiamo a tutti
socket.on("updateDoctors", async () => {
  try {
    const snapshot = await db
      .collection("doctors")
      .orderBy("study")
      .get();
    const doctors = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    io.emit("doctorsUpdated", doctors);
  } catch (error) {
    console.error("Errore durante il recupero dei medici:", error);
  }
});

  socket.on("disconnect", () => {
      console.log("❌ Client disconnesso:", socket.id);
  });
});

// Avvio del server
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
    console.log(`🚀 Server WebSocket attivo sulla porta ${PORT}`);
});
