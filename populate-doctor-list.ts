import * as dotenv from "dotenv";
import admin from "firebase-admin";
import { readFileSync } from "fs";

// Carica le variabili d'ambiente
dotenv.config();

// Inizializza Firebase Admin
let serviceAccount: any;
if (process.env.SERVICE_ACCOUNT_JSON) {
  serviceAccount = JSON.parse(process.env.SERVICE_ACCOUNT_JSON);
} else {
  try {
    serviceAccount = JSON.parse(readFileSync("./firebase-key.json", "utf8"));
  } catch (err) {
    console.error("❌ Errore: firebase-key.json non trovato");
    process.exit(1);
  }
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });
}

const db = admin.firestore();

const doctorNames = [
  "Dott. Benedetto Simone",
  "Dott.ssa Boccone Isabella",
  "Dott.ssa Boglione Arianna",
  "Dott.ssa Cagliero Daniela",
  "Dott. Canfora Amedeo",
  "Dott. Chiacchio Ferdinando",
  "Dott.ssa Delfino Caludia",
  "Dott. Giachino Corrado",
  "Dott.ssa Giraudo Isabel",
  "Dott. Martorana Stefano",
  "Dott.ssa Panero Marta",
  "Dott.ssa Paoletti Chiara",
  "Dott.ssa Perlo Cristina",
  "Dott. Piazza Giovanni",
  "Dott.ssa Pittatore Giulia",
  "D.O. Riorda Guglielmo",
  "Dott. Riorda Luca",
  "Dott. Zerbino Ezio",
  "Dott.ssa Zorzan Alessandra",
  "Dott. Zuccaro Paolo",
];

async function populateDoctorList() {
  console.log("🚀 Inizio popolamento collection doctor-list...\n");

  let added = 0;
  let skipped = 0;

  // Usa batch per inserimenti più efficienti (max 500 operazioni)
  const batch = db.batch();

  for (const name of doctorNames) {
    // Verifica se esiste già
    const existing = await db
      .collection("doctor-list")
      .where("name", "==", name)
      .get();

    if (existing.empty) {
      const docRef = db.collection("doctor-list").doc();
      batch.set(docRef, { name });
      console.log(`✅ Aggiungo: ${name}`);
      added++;
    } else {
      console.log(`⏭️  Già presente: ${name}`);
      skipped++;
    }
  }

  if (added > 0) {
    await batch.commit();
    console.log(`\n✅ Popolamento completato!`);
    console.log(`   - Aggiunti: ${added} nomi`);
    console.log(`   - Già presenti: ${skipped} nomi`);
  } else {
    console.log(`\n✅ Tutti i nomi sono già presenti nella collection!`);
    console.log(`   - Già presenti: ${skipped} nomi`);
  }

  // Mostra il totale finale
  const totalSnap = await db.collection("doctor-list").get();
  console.log(`\n📊 Totale documenti in doctor-list: ${totalSnap.size}`);

  process.exit(0);
}

populateDoctorList().catch((err) => {
  console.error("❌ Errore durante il popolamento:", err);
  process.exit(1);
});
