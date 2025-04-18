import { db } from "./firebase";

/* const patients = [
  { full_name: "Mario Rossi", assigned_study: 2, status: "in_attesa", assigned_number: 1 },
  { full_name: "Arya", assigned_study: 1, status: "in_attesa", assigned_number: 2 },
  { full_name: "Loki", assigned_study: 3, status: "in_attesa", assigned_number: 3 },
  { full_name: "Sirius", assigned_study: 1, status: "in_attesa", assigned_number: 4 },
];

const doctors = [
  { name: "Dottorone", study: 2},
  { name: "Dottorino", study: 1},
  { name: "Dottorello", study: 3},
];

const admins = [
  { username: "paolozuccaro", password: "$2b$10$fNCNzkbiTHwfSJIs1PW2luWUEKAux6.Fk9Dvb7IM8smEdbZmiDy4u"},
]; */

/* async function uploadPatients() {
  const batch = db.batch();
  const collectionRef = db.collection("patients");

  for (const patient of patients) {
    const docRef = collectionRef.doc(); // genera ID automatico
    batch.set(docRef, patient);
  }

  await batch.commit();
  console.log("Pazienti caricati con successo su Firestore");
} */
 /*
async function uploadDoctors() {
  const batch = db.batch();
  const collectionRef = db.collection("doctors");

  for (const doctor of doctors) {
    const docRef = collectionRef.doc(); // genera ID automatico
    batch.set(docRef, doctor);
  }

  await batch.commit();
  console.log("Medici caricati con successo su Firestore");
}

async function uploadAdmins() {
  const batch = db.batch();
  const collectionRef = db.collection("admins");

  for (const admin of admins) {
    const docRef = collectionRef.doc(); // genera ID automatico
    batch.set(docRef, admin);
  }

  await batch.commit();
  console.log("Admin caricati con successo su Firestore");
}

uploadPatients();
uploadDoctors();
uploadAdmins();
*/


/* import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

export const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'allmed_manager',
    password: 'Regigigas9!',
    port: 5432,
  });

export default pool; */
