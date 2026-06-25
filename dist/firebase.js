"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bucket = exports.db = void 0;
const dotenv = __importStar(require("dotenv"));
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const fs_1 = require("fs");
// Carica subito le variabili d’ambiente
dotenv.config();
let serviceAccount;
if (process.env.SERVICE_ACCOUNT_JSON) {
    serviceAccount = JSON.parse(process.env.SERVICE_ACCOUNT_JSON);
}
else {
    serviceAccount = JSON.parse((0, fs_1.readFileSync)("./firebase-key.json", "utf8"));
}
if (!firebase_admin_1.default.apps.length) {
    console.log("🚀 Inizializzo Firebase Admin SDK...");
    console.log("   project_id:", serviceAccount.project_id);
    console.log("   client_email:", serviceAccount.client_email);
    console.log("   private_key_id:", serviceAccount.private_key_id);
    console.log("   private_key presente:", !!serviceAccount.private_key);
    firebase_admin_1.default.initializeApp({
        credential: firebase_admin_1.default.credential.cert(serviceAccount),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });
    console.log("✅ Firebase inizializzato con successo!");
}
else {
    console.log("⚠️ Firebase app già inizializzata");
}
exports.db = firebase_admin_1.default.firestore();
exports.bucket = firebase_admin_1.default.storage().bucket();
console.log("🔗 Firestore pronto");
