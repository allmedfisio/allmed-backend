import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv";
//import * as serviceAccount from "../firebase-key.json";

console.log("📦 Inizio inizializzazione Firebase");
//const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG!);
dotenv.config();

if (getApps().length === 0) {
  console.log("🚀 Nessuna app Firebase trovata, inizializzo...");
  initializeApp({
    //credential: cert(serviceAccount as any),
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
  console.log("✅ Firebase inizializzato con successo!");
} else {
  console.log("⚠️ Firebase app già inizializzata");
}
/*initializeApp({
  credential: cert(serviceAccount as any),
}); */

export const db = getFirestore();
console.log("🔗 Firestore pronto");
