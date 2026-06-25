/**
 * Seed Script — Professional Branches
 *
 * Associa ogni professionista nella collection `doctor-list` alla
 * propria branca di specializzazione. Se il professionista non esiste
 * ancora in doctor-list, lo crea.
 *
 * Uso: npm run seed:branches
 */

import * as dotenv from "dotenv";
dotenv.config();

import { db } from "../src/firebase";

/* ──────────────────────────────────────────
   MAPPING PROFESSIONISTI → BRANCHE
   ────────────────────────────────────────── */

const PROFESSIONAL_BRANCHES: Record<string, string> = {
  "Benedetto Simone": "Ecografia",
  "Boccone Isabella": "Podologia",
  "Piazza Giovanni": "Podologia",
  "Boglione Arianna": "Nutrizione",
  "Cagliero Federica": "Psicomotricità",
  "Paoletti Giorgia": "Psicomotricità",
  "Pittatore Giulia": "Ginecologia",
  "Canfora Stefano": "Ginecologia",
  "Zerbino Carlo": "Ginecologia",
  "Unia Ilaria": "Psicologia",
  "Chiacchio Aldo": "Onde d'urto",
  "Zuccaro Paolo": "Fisioterapia",
  "Riorda Luca": "Fisioterapia",
  "Martorana Francesco": "Fisioterapia",
  "Perlo Cristina": "Fisioterapia",
  "Chiapello Arianna": "Fisioterapia",
  "Dardanello Paolo": "Fisioterapia",
  "Riorda Guglielmo": "Osteopatia",
  "Delfino Elena": "Logopedia",
  "Panero Noemi": "Logopedia",
  "Giachino Corrado": "Fisiatria",
  "Giraudo Sara": "TNPEE",
  "Zorzan Francesca": "Ortopedia",
};

/* ──────────────────────────────────────────
   MAIN
   ────────────────────────────────────────── */

async function main() {
  console.log("══════════════════════════════════════════");
  console.log("  Seed Professional Branches");
  console.log("══════════════════════════════════════════\n");

  const names = Object.keys(PROFESSIONAL_BRANCHES);
  let updated = 0;
  let created = 0;

  for (const name of names) {
    const branch = PROFESSIONAL_BRANCHES[name];

    // Cerca in doctor-list per nome esatto
    const existingSnap = await db
      .collection("doctor-list")
      .where("name", "==", name)
      .limit(1)
      .get();

    if (!existingSnap.empty) {
      // Esiste → aggiorna con branch
      const doc = existingSnap.docs[0];
      await doc.ref.update({ branch });
      console.log(`  ✓ Aggiornato: ${name} → ${branch}`);
      updated++;
    } else {
      // Non esiste → crea
      await db.collection("doctor-list").add({ name, branch });
      console.log(`  + Creato:    ${name} → ${branch}`);
      created++;
    }
  }

  console.log(`\n══════════════════════════════════════════`);
  console.log(`  ✅ SEED COMPLETATO`);
  console.log(`  📝 ${updated} professionisti aggiornati`);
  console.log(`  ➕ ${created} professionisti creati`);
  console.log(`  📁 Totale processati: ${names.length}`);
  console.log(`══════════════════════════════════════════`);
}

main().catch((err) => {
  console.error("❌ Errore durante il seed:", err);
  process.exit(1);
});
