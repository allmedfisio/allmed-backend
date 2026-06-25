"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupCompensationsRoutes = setupCompensationsRoutes;
const express_1 = require("express");
const firebase_1 = require("../firebase");
function setupCompensationsRoutes() {
    const router = (0, express_1.Router)();
    // GET /professional-compensations — lista compensi correnti (ultima config per ogni medico)
    router.get("/", (_req, res) => __awaiter(this, void 0, void 0, function* () {
        try {
            const snapshot = yield firebase_1.db
                .collection("professional_compensations")
                .orderBy("professional_name")
                .get();
            // Ordina in memoria per effective_from discendente e prendi la più recente
            const docs = snapshot.docs.map((doc) => (Object.assign({ id: doc.id }, doc.data())));
            docs.sort((a, b) => (b.effective_from || "").localeCompare(a.effective_from || ""));
            const byProfessional = new Map();
            docs.forEach((doc) => {
                if (!byProfessional.has(doc.professional_name)) {
                    byProfessional.set(doc.professional_name, {
                        id: doc.id,
                        professional_name: doc.professional_name,
                        compensation_pct: doc.compensation_pct,
                        effective_from: doc.effective_from,
                        effective_to: doc.effective_to || null,
                        created_at: doc.created_at,
                        updated_at: doc.updated_at,
                    });
                }
            });
            res.json(Array.from(byProfessional.values()));
        }
        catch (error) {
            console.error("Error getting compensations:", error);
            res.status(500).json({ error: error.message });
        }
    }));
    // GET /professional-compensations/:name — storico compensi per un medico
    router.get("/:name", (req, res) => __awaiter(this, void 0, void 0, function* () {
        try {
            const { name } = req.params;
            const snapshot = yield firebase_1.db
                .collection("professional_compensations")
                .where("professional_name", "==", name)
                .orderBy("effective_from", "desc")
                .get();
            const history = [];
            snapshot.forEach((doc) => {
                history.push(Object.assign({ id: doc.id }, doc.data()));
            });
            res.json(history);
        }
        catch (error) {
            console.error("Error getting compensation history:", error);
            res.status(500).json({ error: error.message });
        }
    }));
    // POST /professional-compensations — crea nuova configurazione compenso
    router.post("/", (req, res) => __awaiter(this, void 0, void 0, function* () {
        try {
            const { professional_name, compensation_pct, effective_from } = req.body;
            if (!professional_name || compensation_pct === undefined) {
                res
                    .status(400)
                    .json({ error: "professional_name e compensation_pct sono obbligatori" });
                return;
            }
            const now = new Date().toISOString();
            const docRef = yield firebase_1.db.collection("professional_compensations").add({
                professional_name,
                compensation_pct: Number(compensation_pct),
                effective_from: effective_from || now.split("T")[0],
                effective_to: null,
                created_at: now,
                updated_at: now,
            });
            // Se esiste una configurazione precedente per lo stesso medico, chiudila
            const previous = yield firebase_1.db
                .collection("professional_compensations")
                .where("professional_name", "==", professional_name)
                .where("effective_to", "==", null)
                .get();
            const batch = firebase_1.db.batch();
            previous.forEach((doc) => {
                if (doc.id !== docRef.id) {
                    batch.update(doc.ref, {
                        effective_to: effective_from || now.split("T")[0],
                        updated_at: now,
                    });
                }
            });
            yield batch.commit();
            res.status(201).json({
                id: docRef.id,
                professional_name,
                compensation_pct: Number(compensation_pct),
                effective_from: effective_from || now.split("T")[0],
            });
        }
        catch (error) {
            console.error("Error creating compensation:", error);
            res.status(500).json({ error: error.message });
        }
    }));
    // PUT /professional-compensations/:id — aggiorna una configurazione
    router.put("/:id", (req, res) => __awaiter(this, void 0, void 0, function* () {
        try {
            const { id } = req.params;
            const { compensation_pct, effective_from, effective_to } = req.body;
            const updateData = { updated_at: new Date().toISOString() };
            if (compensation_pct !== undefined)
                updateData.compensation_pct = Number(compensation_pct);
            if (effective_from !== undefined)
                updateData.effective_from = effective_from;
            if (effective_to !== undefined)
                updateData.effective_to = effective_to;
            yield firebase_1.db.collection("professional_compensations").doc(id).update(updateData);
            res.json(Object.assign({ id }, updateData));
        }
        catch (error) {
            console.error("Error updating compensation:", error);
            res.status(500).json({ error: error.message });
        }
    }));
    // DELETE /professional-compensations/:id — rimuovi una configurazione
    router.delete("/:id", (req, res) => __awaiter(this, void 0, void 0, function* () {
        try {
            const { id } = req.params;
            yield firebase_1.db.collection("professional_compensations").doc(id).delete();
            res.json({ success: true });
        }
        catch (error) {
            console.error("Error deleting compensation:", error);
            res.status(500).json({ error: error.message });
        }
    }));
    // GET /professional-compensations/lookup/:name — ottieni compenso corrente per un medico
    router.get("/lookup/:name", (req, res) => __awaiter(this, void 0, void 0, function* () {
        try {
            const { name } = req.params;
            const snapshot = yield firebase_1.db
                .collection("professional_compensations")
                .where("professional_name", "==", name)
                .where("effective_to", "==", null)
                .limit(1)
                .get();
            if (snapshot.empty) {
                res.json({ professional_name: name, compensation_pct: null });
                return;
            }
            const doc = snapshot.docs[0];
            res.json(Object.assign({ id: doc.id }, doc.data()));
        }
        catch (error) {
            console.error("Error looking up compensation:", error);
            res.status(500).json({ error: error.message });
        }
    }));
    return router;
}
