// Health, models, and dashboard admin API (accounts, stats, manual import).

import { Router } from "express";
import { importFrom9router } from "../lib/importer.js";
import { NEURON_FREE_DAILY, todayUTC } from "../lib/neurons.js";
import { getModels, invalidateModels } from "../lib/models.js";

// Shape one DB row for the dashboard: expose derived neuron figures, never the key.
function shapeAccount(row) {
  const today = todayUTC();
  const usedToday = row.neurons_day === today ? row.neurons_today : 0;
  const reqsToday = row.neurons_day === today ? row.requests_today : 0;
  const now = Date.now() / 1000;
  const inCooldown = row.cooldown_until > now;
  let status = "available";
  if (!row.is_active) status = "inactive";
  else if (usedToday >= NEURON_FREE_DAILY) status = "exhausted";
  else if (inCooldown) status = "cooldown";
  return {
    id: row.id,
    name: row.name,
    account_id: row.account_id.slice(0, 8),
    is_active: !!row.is_active,
    status,
    neurons_today: Math.round(usedToday),
    neurons_remaining: Math.max(0, Math.round(NEURON_FREE_DAILY - usedToday)),
    neurons_free_daily: NEURON_FREE_DAILY,
    requests_today: reqsToday,
    cooldown_seconds: inCooldown ? Math.round(row.cooldown_until - now) : 0,
  };
}

export function adminRouter({ db, pool, ninePath, log }) {
  const router = Router();

  const pick = () => pool.peekAccount();

  router.get("/health", (_req, res) => res.json({ status: "ok", pool: pool.stats() }));

  // OpenAI-compatible model list, fetched live from CF (cached 10 min).
  router.get("/v1/models", async (_req, res) => {
    try {
      const models = await getModels(pick, log.warn);
      res.json({
        object: "list",
        data: models.map((m) => ({ id: m.id, object: "model", owned_by: "cloudflare" })),
      });
    } catch (e) {
      log.error?.(`/v1/models failed: ${e.message}`);
      res.status(502).json({ error: "Failed to fetch model list" });
    }
  });

  // Richer model list for the dashboard (name, description, tags).
  router.get("/api/models", async (req, res) => {
    try {
      const fresh = req.query.fresh === "1";
      const models = await getModels(pick, log.warn, { fresh });
      res.json({ models });
    } catch (e) {
      log.error?.(`/api/models failed: ${e.message}`);
      res.status(502).json({ error: "Failed to fetch model list" });
    }
  });

  router.get("/api/stats", (_req, res) => res.json(pool.stats()));

  // Full account list — the dashboard paginates/sorts client-side.
  router.get("/api/accounts", (_req, res) => {
    const rows = db.prepare("SELECT * FROM accounts ORDER BY id").all();
    res.json({ accounts: rows.map(shapeAccount), stats: pool.stats() });
  });

  router.post("/api/import", (_req, res) => {
    try {
      const result = importFrom9router(db, ninePath, log);
      invalidateModels(); // a freshly-imported account may enable the model fetch
      res.json(result);
    } catch (e) {
      log.error?.(`import failed: ${e.message}`);
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}
