import { Router } from "express";
import { authenticateToken, authorizeRoles } from "./auth";
import { db } from "../firebase";

export function setupMarketingRoutes(): Router {
  const router = Router();

  /* ── GET /r/:trackingId — click redirect (PUBBLICO) ── */
  router.get("/r/:trackingId", async (req: any, res: any) => {
    try {
      const { trackingId } = req.params;

      // Cerca il messaggio per tracking_id
      const snapshot = await db
        .collection("whatsapp_messages")
        .where("tracking_id", "==", trackingId)
        .limit(1)
        .get();

      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        const data = doc.data();

        // Registra il click solo se è il primo
        if (!data["clicked_at"]) {
          await doc.ref.update({
            clicked_at: new Date().toISOString(),
            click_ip: req.ip || req.connection?.remoteAddress || null,
            click_user_agent: req.headers["user-agent"] || null,
          });
          console.log(`🔗 Click registrato: ${data.patient_name} → ${data.landing_link}`);
        }

        // Redirect alla landing page originale (con il nome del paziente preservato)
        res.redirect(302, data.landing_link);
        return;
      }

      // Tracking ID non trovato — redirect alla homepage
      console.warn(`⚠️ Tracking ID non trovato: ${trackingId}`);
      res.redirect(302, "https://www.allmedfisio.it/");
    } catch (error: any) {
      console.error("❌ Errore redirect tracking:", error.message);
      // In caso di errore, redirect alla homepage comunque
      res.redirect(302, "https://www.allmedfisio.it/");
    }
  });

  /* ── GET /marketing/stats — statistiche messaggi WhatsApp (PROTETTO) ── */
  router.get(
    "/marketing/stats",
    authenticateToken,
    authorizeRoles("admin", "segreteria"),
    async (req: any, res: any) => {
      try {
        const days = parseInt(req.query.days as string) || 30;

        // Tutti i messaggi
        const allSnapshot = await db
          .collection("whatsapp_messages")
          .orderBy("sent_at", "desc")
          .get();

        const allMessages: any[] = allSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        const total_sent = allMessages.length;
        const total_clicked = allMessages.filter((m) => m.clicked_at).length;
        const click_rate = total_sent > 0 ? (total_clicked / total_sent) * 100 : 0;

        // Raggruppa per giorno
        const now = new Date();
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);

        const dayMap: Record<string, { sent: number; clicked: number }> = {};

        // Inizializza tutti i giorni del periodo
        for (let d = new Date(cutoff); d <= now; d.setDate(d.getDate() + 1)) {
          const key = d.toISOString().slice(0, 10);
          dayMap[key] = { sent: 0, clicked: 0 };
        }

        for (const msg of allMessages) {
          const sentDate = msg.sent_at?.slice(0, 10);
          if (sentDate && dayMap[sentDate]) {
            dayMap[sentDate].sent++;
            if (msg.clicked_at) {
              dayMap[sentDate].clicked++;
            }
          }
        }

        const by_day = Object.entries(dayMap).map(([date, counts]) => ({
          date,
          ...counts,
        }));

        // Ultimi 20 messaggi
        const recent = allMessages.slice(0, 20).map((m: any) => ({
          patient_name: m.patient_name,
          phone: m.phone,
          sent_at: m.sent_at,
          clicked_at: m.clicked_at || null,
        }));

        res.json({
          total_sent,
          total_clicked,
          click_rate: Math.round(click_rate * 10) / 10,
          by_day,
          recent,
        });
      } catch (error: any) {
        console.error("❌ Errore stats marketing:", error.message);
        res.status(500).json({ error: error.message });
      }
    },
  );

  return router;
}
