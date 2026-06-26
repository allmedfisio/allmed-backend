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
import { setupBusinessAnalyticsRoutes } from "./routes/business-analytics";
import { setupCompensationsRoutes } from "./routes/professional-compensations";
import { setupWhatsappRoutes } from "./routes/whatsapp";
import path from "path";

dotenv.config();

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Creiamo il server HTTP e WebSocket
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

let latestPatients: any[] = [];

// Definisci la query che i client dei front-end dovranno "ascoltare"
const waitingQuery = db
  .collection("patients")
  .where("status", "in", [
    "prenotato",
    "in_attesa",
    "in_visita",
    "completato",
    "in_archivio",
  ])
  .orderBy("assigned_number");

// Attacca il listener
console.log("[LISTENER] Avvio onSnapshot su collection 'patients'...");
const unsubscribe = waitingQuery.onSnapshot(
  (snapshot) => {
    const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    latestPatients = list;
    console.log("[LISTENER] onSnapshot patients: " + list.length + " documenti ricevuti");
    // emetti solo alla stanza segreteria (cosi' non svegli gli studi)
    io.to("segreteria").emit("patientsSnapshot", list);
  },
  (err) => {
    console.error("[LISTENER] ERRORE onSnapshot patients:", err.message);
    console.error("   code:", (err as any).code);
    console.error("   stack:", (err as any).stack);
  }
);

app.use("/patients", setupPatientRoutes(io));
app.use("/doctors", setupDoctorRoutes(io));
app.use("/auth", authRoutes);
app.use("/ticket", setupTicketRoutes(io));
app.use("/business-analytics", setupBusinessAnalyticsRoutes());
app.use("/professional-compensations", setupCompensationsRoutes());
app.use("/whatsapp", setupWhatsappRoutes());
app.use("/ping", setupPingRoutes(io));

// Evento WebSocket quando un client si connette
io.on("connection", (socket) => {
  console.log("[WS] Client connesso:", socket.id);

  // il client segreteria chiederà di unirsi a questa stanza
  socket.on("joinSegreteria", () => {
    socket.join("segreteria");
    //invia subito l'ultimo snapshot anche a chi arriva adesso
    socket.emit("patientsSnapshot", latestPatients);
  });

  // il client sala d'attesa chiederà di unirsi a questa stanza
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
