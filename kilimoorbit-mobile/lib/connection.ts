/**
 * The connection check behind the "Fix connection" button: one request to
 * the server's /api/health, with the reason it failed in plain words so a
 * farmer (or whoever set up the laptop) can fix it. Pure fetch, no React.
 */
export type Probe =
  | { ok: true; ms: number; version: string; engine: string }
  | { ok: false; reason: "timeout" | "unreachable" | "http" | "notSentinel"; detail: string };

export async function probe(base: string, timeoutMs = 6000, fetchImpl: typeof fetch = fetch): Promise<Probe> {
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${base}/api/health`, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (!res.ok) return { ok: false, reason: "http", detail: `HTTP ${res.status}` };
    const body: any = await res.json().catch(() => null);
    if (!body || body.status !== "ok" || typeof body.version !== "string") return { ok: false, reason: "notSentinel", detail: "not a KilimoOrbit server" };
    return { ok: true, ms: Date.now() - started, version: body.version, engine: String(body.engine ?? "") };
  } catch (e: any) {
    if (e?.name === "AbortError") return { ok: false, reason: "timeout", detail: `no answer in ${Math.round(timeoutMs / 1000)}s` };
    return { ok: false, reason: "unreachable", detail: String(e?.message ?? e).slice(0, 80) };
  } finally {
    clearTimeout(timer);
  }
}

/** "192.168.0.12:4517" from a base URL, for the status line. */
export function hostOf(base: string): string {
  return base.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

/** What the farmer typed, as a usable base URL ("192.168.0.12" → "http://192.168.0.12:4517"), or null. */
export function cleanBase(raw: string | null | undefined, defaultPort = 4517): string | null {
  let s = String(raw ?? "").trim().replace(/\/+$/, "");
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  const m = s.match(/^(https?):\/\/([a-z0-9.-]+)(?::(\d{2,5}))?$/i);
  if (!m) return null;
  const port = m[3] ? Number(m[3]) : m[1].toLowerCase() === "https" ? null : defaultPort;
  if (port != null && (port < 1 || port > 65535)) return null;
  return `${m[1].toLowerCase()}://${m[2].toLowerCase()}${port != null ? `:${port}` : ""}`;
}
