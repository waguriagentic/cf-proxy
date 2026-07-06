// Live model list from Cloudflare, cached in-memory. CF is the source of truth —
// no hardcoded list, no "add model" feature: new CF models appear automatically.
//
// GET /accounts/{id}/ai/models/search returns the available models. CF's `per_page`
// is accepted but pagination is unreliable (total_count says 268, page 2 is empty,
// page 1 returns ~60) — so we page defensively until an empty page, which in
// practice is a single page. We exclude third-party/partner models (partner=true)
// per the "Cloudflare-hosted only" requirement, sort newest-first by created_at,
// and surface per-task capability info for the dashboard.

const CF_BASE = "https://api.cloudflare.com/client/v4/accounts";
const TTL_MS = 10 * 60 * 1000; // 10 minutes
const PER_PAGE = 100;

let cache = { at: 0, models: null };

/**
 * Fetch chat models from CF using any account's credentials.
 * @param {() => {account_id:string, api_key:string}|null} pickAccount
 * @param {(msg:string)=>void} [logWarn]
 * @returns {Promise<Array<{id, name, description, task, tags, created_at, partner, capabilities}>>}
 *   sorted newest-first, Cloudflare-hosted only (no third-party/partner models).
 */
export async function getModels(pickAccount, logWarn, { fresh = false } = {}) {
  if (!fresh && cache.models && Date.now() - cache.at < TTL_MS) return cache.models;

  const account = pickAccount();
  if (!account) return cache.models || [];

  try {
    const raw = [];
    for (let page = 1; page <= 10; page++) {
      const url = `${CF_BASE}/${account.account_id}/ai/models/search?per_page=${PER_PAGE}&page=${page}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${account.api_key}` },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        logWarn?.(`model list fetch page ${page} -> ${res.status}`);
        break;
      }
      const body = await res.json();
      const rows = body.result || [];
      raw.push(...rows);
      if (rows.length < PER_PAGE) break; // last page (or CF's unreliable end)
    }

    const models = raw
      .filter((m) => !isPartner(m)) // Cloudflare-hosted only
      .map((m) => ({
        id: m.name,
        name: m.name,
        description: m.description || "",
        task: m.task?.name || "",
        tags: m.tags || [],
        created_at: m.created_at || "",
        partner: false,
        capabilities: capabilityFlags(m),
      }))
      .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || "")); // newest first

    cache = { at: Date.now(), models };
    return models;
  } catch (e) {
    logWarn?.(`model list fetch error: ${e.message}; serving ${cache.models ? "stale cache" : "empty"}`);
    return cache.models || [];
  }
}

// partner=true in the model's properties marks third-party-hosted models.
function isPartner(m) {
  return (m.properties || []).some((p) => p.property_id === "partner" && p.value === true);
}

// Derive human-readable capability flags from the model's declared properties.
function capabilityFlags(m) {
  const ids = new Set((m.properties || []).map((p) => p.property_id));
  const flags = [];
  if (ids.has("vision")) flags.push("vision");
  if (ids.has("reasoning")) flags.push("reasoning");
  if (ids.has("function_calling")) flags.push("tools");
  if (ids.has("realtime")) flags.push("realtime");
  if (ids.has("lora")) flags.push("lora");
  if (ids.has("async_queue")) flags.push("async");
  return flags;
}

/** Drop the cache (e.g. after import, so a fresh account can be used). */
export function invalidateModels() {
  cache = { at: 0, models: null };
}
