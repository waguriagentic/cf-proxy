// Centralized fetch. Optional bearer key (from the dashboard's key input) is
// stored in localStorage so it survives reloads and is sent on every call.

const KEY_STORAGE = "cf-proxy-api-key";

export function getKey() {
  return localStorage.getItem(KEY_STORAGE) || "";
}
export function setKey(value) {
  if (value) localStorage.setItem(KEY_STORAGE, value);
  else localStorage.removeItem(KEY_STORAGE);
}

async function req(path, options = {}) {
  const key = getKey();
  const headers = { ...(options.headers || {}) };
  if (key) headers.Authorization = `Bearer ${key}`;
  const res = await fetch(path, { ...options, headers });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j.error) detail = j.error;
    } catch {
      /* non-JSON body */
    }
    throw new Error(detail);
  }
  return res.json();
}

export const fetchAccounts = () => req("/api/accounts");
export const fetchStats = () => req("/api/stats");
export const fetchModels = (fresh = false) => req(fresh ? "/api/models?fresh=1" : "/api/models");
export const runImport = () => req("/api/import", { method: "POST" });
