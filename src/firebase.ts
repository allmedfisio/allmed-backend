import * as dotenv from "dotenv";
import admin from "firebase-admin";
import { readFileSync } from "fs";

// Carica subito le variabili d’ambiente
dotenv.config();
let serviceAccount: any;
if (process.env.SERVICE_ACCOUNT_JSON) {
  serviceAccount = JSON.parse(process.env.SERVICE_ACCOUNT_JSON);
} else {
  serviceAccount = JSON.parse(readFileSync("./firebase-key.json", "utf8"));
}

if (!admin.apps.length) {
  console.log("🚀 Inizializzo Firebase Admin SDK...");
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });
  console.log("✅ Firebase inizializzato con successo!");
} else {
  console.log("⚠️ Firebase app già inizializzata");
}

export const db = admin.firestore();
export const bucket = admin.storage().bucket();
console.log("🔗 Firestore pronto");
