import { Router } from "express";
import { authenticateToken, authorizeRoles } from "./auth";

export function setupWhatsappRoutes(): Router {
  const router = Router();
  router.use(authenticateToken, authorizeRoles("admin", "segreteria"));

  const OPENWA_URL = process.env.OPENWA_API_URL || "http://localhost:2785/api";
  const OPENWA_KEY = process.env.OPENWA_API_KEY || "";
  const SESSION_ID = process.env.OPENWA_SESSION_ID || "";

  /* ── POST /send — invia messaggio WhatsApp ── */
  router.post("/send", async (req: any, res: any) => {
    try {
      const { phoneNumber, patientName, landingLink } = req.body;

      if (!phoneNumber || !patientName) {
        res
          .status(400)
          .json({ error: "phoneNumber e patientName obbligatori" });
        return;
      }

      /* ── Sanitizzazione numero ── */
      let cleanNumber = phoneNumber
        .replace(/[+\s\-()]/g, "")
        .replace(/^0+/, "");
      if (cleanNumber.startsWith("00")) cleanNumber = cleanNumber.slice(2);
      if (!cleanNumber.startsWith("39")) cleanNumber = "39" + cleanNumber;

      // Valida che il numero contenga solo cifre e sia di lunghezza corretta
      const digits = cleanNumber.replace(/\D/g, "");
      if (digits.length < 10 || digits.length > 15 || digits !== cleanNumber) {
        res
          .status(400)
          .json({ error: `Numero di telefono non valido: "${phoneNumber}"` });
        return;
      }

      const chatId = `${digits}@c.us`;

      /* ── Pulisci nome (rimuovi data di nascita) ── */
      const cleanName = patientName
        .replace(/\s*\(\d{2}\/\d{2}\/\d{4}\)\s*$/, "")
        .trim();

      const link =
        landingLink ||
        "https://www.allmedfisio.it/recensione/?n=" +
          encodeURIComponent(cleanName);

      const message = [
        `\u{1F44B} *Gentile ${cleanName}*,`,
        ``,
        `grazie per aver scelto *ALLMEDfisio* per la tua salute`,
        ``,
        `Ci farebbe molto piacere conoscere la tua opinione sull’esperienza nel nostro centro.`,
        ``,
        `Puoi lasciare una recensione qui: \u{1F447}`,
        `${link}`,
        ``,
        `Il tuo feedback ci aiuta a migliorare ogni giorno. A presto! \u{1F64F}`,
      ].join("\n");

      /* ── Chiamata OpenWA ── */
      if (!OPENWA_KEY || !SESSION_ID) {
        console.warn(
          "⚠️ OpenWA non configurato (manca OPENWA_API_KEY o OPENWA_SESSION_ID). Messaggio NON inviato.",
        );
        res.status(503).json({
          error: "Servizio WhatsApp non configurato",
          preview: { chatId, message },
        });
        return;
      }

      const response = await fetch(
        `${OPENWA_URL}/sessions/${SESSION_ID}/messages/send-text`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": OPENWA_KEY,
          },
          body: JSON.stringify({ chatId, text: message }),
        },
      );

      if (!response.ok) {
        const errBody = await response.text();
        console.error(`OpenWA error ${response.status}: ${errBody}`);
        res.status(502).json({ error: `Errore OpenWA: ${response.status}` });
        return;
      }

      const result = await response.json();
      console.log(`✅ WhatsApp inviato a ${cleanName} (${chatId})`);

      res.json({
        success: true,
        patientName: cleanName,
        chatId,
        messageId: result.id || null,
      });
    } catch (error: any) {
      console.error("❌ WhatsApp send error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  /* ── GET /status — verifica connessione OpenWA ── */
  router.get("/status", async (_req: any, res: any) => {
    try {
      if (!OPENWA_KEY || !SESSION_ID) {
        res.json({ connected: false, reason: "not_configured" });
        return;
      }
      const response = await fetch(`${OPENWA_URL}/sessions/${SESSION_ID}`, {
        headers: { "X-API-Key": OPENWA_KEY },
      });
      if (!response.ok) throw new Error(`Status ${response.status}`);
      const data = await response.json();
      res.json({ connected: true, session: data });
    } catch (error: any) {
      res.json({ connected: false, error: error.message });
    }
  });

  return router;
}
