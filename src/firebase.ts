import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
//import * as serviceAccount from "../firebase-key.json";

console.log("📦 Inizio inizializzazione Firebase");
const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG!);

if (getApps().length === 0) {
  console.log("🚀 Nessuna app Firebase trovata, inizializzo...");
  initializeApp({
    credential: cert(serviceAccount as any),
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
