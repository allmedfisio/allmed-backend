import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { pool } from './db';
import { createServer } from "http";
import { Server } from "socket.io";
import { setupPatientRoutes } from "./routes/patients";
import { setupDoctorRoutes } from "./routes/doctors";
import { setupPingRoutes } from "./routes/ping";
import authRoutes from "./routes/auth";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

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
      const result = await pool.query("SELECT * FROM patients WHERE status = 'in_attesa' ORDER BY assigned_number");
      io.emit("patientsUpdated", result.rows);
  });

  // Quando un medico viene aggiornato, lo notifichiamo a tutti
  socket.on("updateDoctors", async () => {
    const result = await pool.query("SELECT * FROM doctors ORDER BY study");
    io.emit("doctorsUpdated", result.rows);
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

/*pool.connect()
  .then(() => {
    console.log("Database connesso con successo");
  })
  .catch((err) => {
    console.error("Errore nella connessione al database:", err);
  });

app.get("/", (req, res) => {
    res.send("AllMed Manager API is running!");
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
}); */
