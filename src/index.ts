import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io";
import { setupPatientRoutes } from "./routes/patients";
import { setupDoctorRoutes } from "./routes/doctors";
import { setupPingRoutes } from "./routes/ping";
import authRoutes from "./routes/auth";
import { db } from "./firebase";
import { setupTicketRoutes } from "./routes/ticket";
import path from "path";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Creiamo il server HTTP e WebSocket
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

let latestPatients: any[] = [];

// Definisci la query che i client dei front-end dovranno “ascoltare”
const waitingQuery = db
  .collection("patients")
  .where("status", "in", ["prenotato", "in_attesa", "in_visita"])
  .orderBy("assigned_number");

// Attacca il listener
waitingQuery.onSnapshot((snapshot) => {
  const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  latestPatients = list;

  // emetti solo alla “stanza” segreteria (così non svegli gli studi)
  io.to("segreteria").emit("patientsSnapshot", list);
});

app.use("/patients", setupPatientRoutes(io));
app.use("/doctors", setupDoctorRoutes(io));
app.use("/auth", authRoutes);
app.use("/ticket", setupTicketRoutes(io));
app.use("/ping", setupPingRoutes(io));

// Evento WebSocket quando un client si connette
io.on("connection", (socket) => {
  console.log("🔗 Client connesso:", socket.id);

  // il client segreteria chiederà di unirsi a questa stanza
  socket.on("joinSegreteria", () => {
    socket.join("segreteria");
    //invia subito l’ultimo snapshot anche a chi arriva adesso
    socket.emit("patientsSnapshot", latestPatients);
  });

  // il client sala d’attesa chiederà di unirsi a questa stanza
  socket.on("joinSala", () => {
    socket.join("sala-attesa");
  });

  // il client medico chiederà di unirsi alla stanza del suo studio
  socket.on("joinStudio", (studyId: string) => {
    socket.join(`studio-${studyId}`);
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
