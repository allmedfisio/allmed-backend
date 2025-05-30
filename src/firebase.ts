//import { getApps, initializeApp, cert } from "firebase-admin/app";
//import { getFirestore } from "firebase-admin/firestore";
//import * as serviceAccount from "../src/firebase-key.json";
import * as dotenv from "dotenv";
import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// Carica subito le variabili d’ambiente
dotenv.config();
const serviceAccount = JSON.parse(readFileSync('./firebase-key.json', 'utf8'));

if (!admin.apps.length) {
  console.log("🚀 Inizializzo Firebase Admin SDK...");
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log("✅ Firebase inizializzato con successo!");
  } else {
   console.log("⚠️ Firebase app già inizializzata");
 }

/* if (getApps().length === 0) {
  console.log("🚀 Nessuna app Firebase trovata, inizializzo...");
  initializeApp({
    //credential: cert(serviceAccount as any),
    credential: admin.credential.cert(serviceAccount),
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY,
    }),
  });
  console.log("✅ Firebase inizializzato con successo!");
  console.log("ENV:", {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    hasPrivateKey: !!process.env.FIREBASE_PRIVATE_KEY,
  });
} else {
  console.log("⚠️ Firebase app già inizializzata");
} */

export const db = admin.firestore();
console.log("🔗 Firestore pronto");
