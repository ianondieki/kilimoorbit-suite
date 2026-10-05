/**
 * The county pest watch (GET /api/pests/watch), shared by the crop doctor and
 * Today: one fetch per county per 10 minutes, kept in memory, refreshed when
 * the farmer shares a scouting walk. Offline it is simply absent; nothing
 * here can throw into the UI.
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { getPestWatch, reportPest, type PestWatch } from "./api";

const FRESH_MS = 10 * 60_000;
const cache = new Map<string, { data: PestWatch; ts: number }>();
const inflight = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function load(county: string) {
  const hit = cache.get(county);
  if (hit && Date.now() - hit.ts < FRESH_MS) return;
  if (inflight.has(county)) return;
  const p = getPestWatch(county)
    .then((data) => { cache.set(county, { data, ts: Date.now() }); emit(); })
    .catch(() => {})
    .finally(() => { inflight.delete(county); });
  inflight.set(county, p);
}

export function usePestWatch(county: string | null | undefined): PestWatch | null {
  const subscribe = useCallback((l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; }, []);
  const data = useSyncExternalStore(subscribe, () => (county ? cache.get(county)?.data ?? null : null), () => null);
  useEffect(() => { if (county) load(county); }, [county]);
  return data;
}

/** Shares a scouting walk anonymously; true when the server took it. */
export async function shareScout(input: { county: string; plants: number; hit: number; ageDays: number | null }): Promise<boolean> {
  try {
    const data = await reportPest({ county: input.county, crop: "maize", plants: input.plants, hit: input.hit, age_days: input.ageDays });
    cache.set(input.county, { data, ts: Date.now() });
    emit();
    return true;
  } catch {
    return false;
  }
}

/** For sign-out "forget": nothing personal is cached here, but start clean anyway. */
export function clearPestWatchMemory() { cache.clear(); emit(); }
