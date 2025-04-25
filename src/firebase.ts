import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv";
import admin from 'firebase-admin';
import { readFileSync } from 'fs';
//import * as serviceAccount from "../src/firebase-key.json";

console.log("📦 Inizio inizializzazione Firebase");
//const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG!);
const serviceAccount = JSON.parse(readFileSync('./firebase-key.json', 'utf8'));
dotenv.config();

if (getApps().length === 0) {
  console.log("🚀 Nessuna app Firebase trovata, inizializzo...");
  initializeApp({
    //credential: cert(serviceAccount as any),
    credential: admin.credential.cert(serviceAccount),
    /*credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY,
    }),*/
  });
  console.log("✅ Firebase inizializzato con successo!");
  console.log("ENV:", {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    hasPrivateKey: !!process.env.FIREBASE_PRIVATE_KEY,
  });
} else {
  console.log("⚠️ Firebase app già inizializzata");
}
/*initializeApp({
  credential: cert(serviceAccount as any),
}); */

export const db = getFirestore();
console.log("🔗 Firestore pronto");
