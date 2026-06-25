import * as dotenv from "dotenv";
import admin from "firebase-admin";
import { readFileSync, existsSync } from "fs";
import path from "path";

// Carica subito le variabili d'ambiente
dotenv.config();

let serviceAccount: any;

// Ordine di caricamento credenziali:
//  1) Secret File su Render  → /etc/secrets/firebase-key.json
//  2) File locale (dev)      → firebase-key.json
//  3) Variabile d'ambiente   → SERVICE_ACCOUNT_JSON

const secretPath = "/etc/secrets/firebase-key.json";
const localPath = path.resolve(__dirname, "..", "firebase-key.json");

let loaded = false;
for (const filePath of [secretPath, localPath]) {
  if (existsSync(filePath)) {
    console.log("📄 Carico credenziali da:", filePath);
    serviceAccount = JSON.parse(readFileSync(filePath, "utf8"));
    loaded = true;
    break;
  }
}

if (!loaded && process.env.SERVICE_ACCOUNT_JSON) {
  console.log("🌍 Carico credenziali da SERVICE_ACCOUNT_JSON");
  serviceAccount = JSON.parse(process.env.SERVICE_ACCOUNT_JSON);
  loaded = true;
}

if (!loaded) {
  console.error(
    "❌ Nessuna credenziale Firebase trovata!\n" +
    "   Su Render: crea un Secret File chiamato firebase-key.json\n" +
    "   In locale: metti firebase-key.json nella root del progetto"
  );
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
