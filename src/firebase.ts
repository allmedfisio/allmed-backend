import * as dotenv from "dotenv";
import admin from "firebase-admin";
import { readFileSync, existsSync } from "fs";
import path from "path";

// Carica subito le variabili d'ambiente
dotenv.config();

let serviceAccount: any;

// 1) Preferisci file JSON (ora contiene la chiave valida, niente encoding)
const keyFilePath = path.resolve(__dirname, "..", "firebase-key.json");
if (existsSync(keyFilePath)) {
  console.log("📄 Carico credenziali da file:", keyFilePath);
  serviceAccount = JSON.parse(readFileSync(keyFilePath, "utf8"));
} else if (process.env.SERVICE_ACCOUNT_JSON) {
  console.log("🌍 Carico credenziali da SERVICE_ACCOUNT_JSON");
  serviceAccount = JSON.parse(process.env.SERVICE_ACCOUNT_JSON);
} else {
  console.error("❌ Nessuna credenziale Firebase trovata!");
  process.exit(1);
}

if (!admin.apps.length) {
  console.log("🚀 Inizializzo Firebase Admin SDK...");
  console.log("   project_id:", serviceAccount.project_id);
  console.log("   client_email:", serviceAccount.client_email);
  console.log("   private_key_id:", serviceAccount.private_key_id);
  console.log("   private_key presente:", !!serviceAccount.private_key);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });

  console.log("✅ Firebase inizializzato con successo!");
} else {
  console.warn(
    "⚠️  Firebase già inizializzato (probabilmente da FIREBASE_CONFIG).",
    "   Se il login fallisce, rimuovi la variabile FIREBASE_CONFIG da Render!"
  );
}

export const db = admin.firestore();
export const bucket = admin.storage().bucket();
console.log("🔗 Firestore pronto");
