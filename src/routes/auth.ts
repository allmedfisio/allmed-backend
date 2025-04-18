import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
// import pool from "../db"; 
import { db } from "../firebase";

const router = express.Router();
const SECRET_KEY = "tuo_segretissimo_token"; // ⚠️ Da sostituire con una variabile d'ambiente!

// Endpoint di login
router.post("/login", async (req: any, res: any) => {
    const { username, password } = req.body;
    console.log(req.body);
    try {
        //const result = await pool.query("SELECT * FROM admins WHERE username = $1", [username]);
        //if (result.rows.length === 0) return res.status(401).json({ error: "Nessun utente" });
        const snapshot = await db.collection("admins").where("username", "==", username).get();
        console.log("snapshot: ", snapshot)
        if (snapshot.empty) return res.status(401).json({ error: "Nessun utente" });
        const userDoc = snapshot.docs[0];
        console.log("userDOC: ", userDoc)
        //const user = result.rows[0];
        const user = userDoc.data();
        console.log("user: ", user)
        const validPassword = await bcrypt.compare(password, user.password);
        console.log("validPasword: ", validPassword)

        if (!validPassword) return res.status(401).json({ error: "Password sbagliata"});

        const token = jwt.sign({ id: userDoc.id, username: user.username }, SECRET_KEY, { expiresIn: "2h" });
        res.json({ token });
    } catch (err) {
        res.status(500).json({ error: "Errore nel server" });
    }
});

// 🔐 Registrazione nuovo utente
router.post("/register", async (req: any, res: any) => {
    const { username, password } = req.body;
  
    try {
      // Verifica che i campi siano presenti
      if (!username || !password) {
        return res.status(400).json({ error: "Username e password obbligatorie" });
      }
  
      // Verifica se l'email è già registrata
      const snapshot = await db.collection("admins").where("username", "==", username).get();
      if (!snapshot.empty) {
      return res.status(400).json({ error: "Username già in uso" });
    }
      /* const existing = await pool.query("SELECT * FROM admins WHERE username = $1", [username]);
      if (existing.rows.length > 0) {
        return res.status(400).json({ error: "Username già in uso" });
      } */
  
      // Hash della password
      const hashedPassword = await bcrypt.hash(password, 10);
  
      // Inserisci nel DB
      const newUserRef = await db.collection("admins").add({
        username,
        password: hashedPassword,
      });
      /* const result = await pool.query(
        "INSERT INTO admins (username, password) VALUES ($1, $2) RETURNING id, username",
        [username, hashedPassword]
      ); */
  
      res.status(201).json({ message: "Utente registrato", user: { id: newUserRef.id, username } });
    } catch (err) {
      console.error("Errore registrazione:", err);
      res.status(500).json({ error: "Errore del server" });
    }
  });

// Middleware per proteggere le rotte
export const authenticateToken = (req: any, res: any, next: any) => {
    const token = req.header("Authorization")?.split(" ")[1];
    if (!token) return res.status(403).json({ error: "Accesso negato" });

    jwt.verify(token, SECRET_KEY, (err: any, user: any) => {
        if (err) return res.status(403).json({ error: "Token non valido" });
        req.user = user;
        next();
    });
};

export default router;
