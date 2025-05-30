import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { db } from "../firebase";
import * as admin from "firebase-admin";

const router = express.Router();
const SECRET_KEY = process.env.JWT_SECRET_KEY!;

// Endpoint di login
router.post("/login", async (req: any, res: any) => {
  const { username, password } = req.body;
  try {
    const snapshot = await db
      .collection("admins")
      .where("username", "==", username)
      .get();
    if (snapshot.empty) return res.status(401).json({ error: "Nessun utente" });
    const userDoc = snapshot.docs[0];
    const user = userDoc.data();
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword)
      return res.status(401).json({ error: "Password sbagliata" });

    const token = jwt.sign(
      { id: userDoc.id, username: user.username },
      SECRET_KEY,
      { expiresIn: "2h" }
    );
    res.json({ token });
  } catch (err: any) {
    console.error("Login error:", err.message);
    console.error(err.stack);
    res.status(500).json({ error: "Errore nel server" });
  }
});

// 🔐 Registrazione nuovo utente (attualmente non utilizzato)
router.post("/register", async (req: any, res: any) => {
  const { username, password, avatarUrl } = req.body;

  try {
    // Verifica che i campi siano presenti
    if (!username || !password || !avatarUrl) {
      return res
        .status(400)
        .json({ error: "Mancano username, password o immagine" });
    }

    // Verifica se l'email è già registrata
    const snapshot = await db
      .collection("admins")
      .where("username", "==", username)
      .get();
    if (!snapshot.empty) {
      return res.status(400).json({ error: "Username già in uso" });
    }

    // Hash della password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Inserisci nel DB
    await db.collection("admins").add({
      username,
      password: hashedPassword,
      avatarUrl: avatarUrl || "",
    });

    res.status(201).json({
      message: "Utente registrato",
    });
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

// Restituisce il profilo dell’utente loggato
router.get(
  "/me",
  authenticateToken,
  async (req: any, res: any): Promise<void> => {
    try {
      const adminId = req.user.id;
      const userDoc = await admin
        .firestore()
        .collection("admins")
        .doc(adminId)
        .get();
      if (!userDoc.exists) {
        res.status(404).json({ error: "Utente non trovato" });
        return;
      }
      const { username, avatarUrl } = userDoc.data()!;
      res.json({ name: username, avatarUrl });
    } catch (err) {
      console.error("Errore in GET /auth/me", err);
      res.status(500).json({ error: "Errore del server" });
    }
  }
);

export default router;
