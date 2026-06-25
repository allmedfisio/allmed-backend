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
  console.log("⚠️ Firebase app già inizializzata");
}

export const db = admin.firestore();
export const bucket = admin.storage().bucket();
console.log("🔗 Firestore pronto");
