/**
 * Cleanup Script — Elimina tutti i dati di prova da Firestore
 *
 * Pulisce le seguenti collection:
 *   - business_analytics_visits (tutti i documenti)
 *   - business_analytics_cycles (tutti i documenti)
 *   - professional_compensations (tutti i documenti)
 *   - patients (tutti i documenti)
 *   - doctors (tutti i documenti)
 *   - doctor-list (tutti i documenti)
 *
 * Uso: npm run cleanup:test-data
 */

import * as dotenv from "dotenv";
dotenv.config();

import { db } from "../src/firebase";

const COLLECTIONS_TO_CLEAN = [
  "business_analytics_visits",
  "business_analytics_cycles",
  "professional_compensations",
  "patients",
  "doctors",
  "doctor-list",
];

async function deleteCollection(collectionName: string, batchSize = 400) {
  console.log(`\n🗑️  Eliminazione documenti da "${collectionName}"...`);

  let deletedCount = 0;
  let totalCount = 0;

  // Conta i documenti totali
  const countSnap = await db.collection(collectionName).count().get();
  totalCount = countSnap.data().count;
  console.log(`   📄 ${totalCount} documenti trovati`);

  if (totalCount === 0) {
    console.log(`   ⏭️  Collection vuota, nessuna eliminazione necessaria`);
    return 0;
  }

  // Elimina in batch
  while (true) {
    const snapshot = await db
      .collection(collectionName)
      .limit(batchSize)
      .get();

    if (snapshot.empty) break;

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    deletedCount += snapshot.docs.length;
    console.log(
      `   ✓ Eliminati ${deletedCount}/${totalCount} documenti`,
    );
  }

  console.log(`   ✅ "${collectionName}" pulita (${deletedCount} eliminati)`);
  return deletedCount;
}

async function main() {
  console.log("══════════════════════════════════════════");
  console.log("  Cleanup Dati di Prova — Firestore");
  console.log("══════════════════════════════════════════");
  console.log(
    "\n⚠️  ATTENZIONE: Questo script eliminerà TUTTI i dati dalle seguenti collection:",
  );
  COLLECTIONS_TO_CLEAN.forEach((c) => console.log(`   - ${c}`));
  console.log("");

  const startTime = Date.now();
  let totalDeleted = 0;

  for (const collectionName of COLLECTIONS_TO_CLEAN) {
    try {
      const deleted = await deleteCollection(collectionName);
      totalDeleted += deleted;
    } catch (err) {
      console.error(`   ❌ Errore eliminando ${collectionName}:`, err);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n══════════════════════════════════════════`);
  console.log(`  ✅ CLEANUP COMPLETATO in ${elapsed}s`);
  console.log(`  📊 Totale documenti eliminati: ${totalDeleted}`);
  console.log(`══════════════════════════════════════════`);
}

main().catch((err) => {
  console.error("❌ Errore durante il cleanup:", err);
  process.exit(1);
});
