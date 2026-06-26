"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const patients_1 = require("./routes/patients");
const doctors_1 = require("./routes/doctors");
const ping_1 = require("./routes/ping");
const auth_1 = __importDefault(require("./routes/auth"));
const firebase_1 = require("./firebase");
const ticket_1 = require("./routes/ticket");
const business_analytics_1 = require("./routes/business-analytics");
const professional_compensations_1 = require("./routes/professional-compensations");
const whatsapp_1 = require("./routes/whatsapp");
const path_1 = __importDefault(require("path"));
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use((0, cors_1.default)({ origin: true, credentials: true }));
app.use(express_1.default.json({ limit: "20mb" }));
app.use(express_1.default.urlencoded({ extended: true, limit: "20mb" }));
app.use("/uploads", express_1.default.static(path_1.default.join(__dirname, "uploads")));
// Creiamo il server HTTP e WebSocket
const httpServer = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(httpServer, {
    cors: { origin: "*" },
});
let latestPatients = [];
// Definisci la query che i client dei front-end dovranno "ascoltare"
const waitingQuery = firebase_1.db
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
const unsubscribe = waitingQuery.onSnapshot((snapshot) => {
    const list = snapshot.docs.map((d) => (Object.assign({ id: d.id }, d.data())));
    latestPatients = list;
    console.log("[LISTENER] onSnapshot patients: " + list.length + " documenti ricevuti");
    // emetti solo alla stanza segreteria (cosi' non svegli gli studi)
    io.to("segreteria").emit("patientsSnapshot", list);
}, (err) => {
    console.error("[LISTENER] ERRORE onSnapshot patients:", err.message);
    console.error("   code:", err.code);
    console.error("   stack:", err.stack);
});
app.use("/patients", (0, patients_1.setupPatientRoutes)(io));
app.use("/doctors", (0, doctors_1.setupDoctorRoutes)(io));
app.use("/auth", auth_1.default);
app.use("/ticket", (0, ticket_1.setupTicketRoutes)(io));
app.use("/business-analytics", (0, business_analytics_1.setupBusinessAnalyticsRoutes)());
app.use("/professional-compensations", (0, professional_compensations_1.setupCompensationsRoutes)());
app.use("/whatsapp", (0, whatsapp_1.setupWhatsappRoutes)());
app.use("/ping", (0, ping_1.setupPingRoutes)(io));
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
    socket.on("joinStudio", (studyId) => {
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
