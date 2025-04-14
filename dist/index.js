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
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const db_1 = require("./db");
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const patients_1 = require("./routes/patients");
const doctors_1 = require("./routes/doctors");
const auth_1 = __importDefault(require("./routes/auth"));
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Creiamo il server HTTP e WebSocket
const httpServer = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(httpServer, {
    cors: { origin: "*" }
});
app.use("/patients", (0, patients_1.setupPatientRoutes)(io));
app.use("/doctors", (0, doctors_1.setupDoctorRoutes)(io));
app.use("/auth", auth_1.default);
// Evento WebSocket quando un client si connette
io.on("connection", (socket) => {
    console.log("🔗 Client connesso:", socket.id);
    // Quando un paziente viene aggiornato, lo notifichiamo a tutti
    socket.on("updatePatients", () => __awaiter(void 0, void 0, void 0, function* () {
        const result = yield db_1.pool.query("SELECT * FROM patients WHERE status = 'in_attesa' ORDER BY assigned_number");
        io.emit("patientsUpdated", result.rows);
    }));
    // Quando un medico viene aggiornato, lo notifichiamo a tutti
    socket.on("updateDoctors", () => __awaiter(void 0, void 0, void 0, function* () {
        const result = yield db_1.pool.query("SELECT * FROM doctors ORDER BY study");
        io.emit("doctorsUpdated", result.rows);
    }));
    socket.on("disconnect", () => {
        console.log("❌ Client disconnesso:", socket.id);
    });
});
// Avvio del server
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
    console.log(`🚀 Server WebSocket attivo su http://localhost:${PORT}`);
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
