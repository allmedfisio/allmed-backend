import * as dotenv from "dotenv";
import admin from "firebase-admin";
import { readFileSync } from "fs";

// Carica subito le variabili d’ambiente
dotenv.config();
const serviceAccount = JSON.parse(readFileSync("./firebase-key.json", "utf8"));

if (!admin.apps.length) {
  console.log("🚀 Inizializzo Firebase Admin SDK...");
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log("✅ Firebase inizializzato con successo!");
} else {
  console.log("⚠️ Firebase app già inizializzata");
}

export const db = admin.firestore();
console.log("🔗 Firestore pronto");
