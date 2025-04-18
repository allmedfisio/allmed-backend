import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as serviceAccount from "../firebase-key.json";

if (getApps().length === 0) {
  initializeApp({
    credential: cert(serviceAccount as any),
  });
} else {
  console.log("Firebase app already initialized");
}
/*initializeApp({
  credential: cert(serviceAccount as any),
}); */

export const db = getFirestore();
