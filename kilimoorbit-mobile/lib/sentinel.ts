/**
 * One shared copy of the Sentinel snapshot (engine, payload library,
 * commodity board and the Route A arbitrage decision) for the Today and
 * Markets screens, so switching tabs never re-runs a 20-second LIVE compile.
 * Falls back to the last good snapshot ("ko-dash-cache") when offline:
 * rural connectivity drops are normal.
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { callApex, getMeta, type ApexError, type ArbitrageResult, type Meta } from "./api";

export const CACHE_KEY = "ko-dash-cache";

export type Engine = "LIVE" | "MOCK" | "OFFLINE";

export type SentinelProblem =
  | { kind: "cached"; mins: number; detail: string }
  | { kind: "offline"; detail: string }
  | { kind: "apex"; detail: string };

export type Sentinel = {
  status: "idle" | "loading" | "ready";
  refreshing: boolean;
  engine: Engine;
  meta: Meta | null;
  arb: ArbitrageResult | null;
  problem: SentinelProblem | null;
};

let state: Sentinel = { status: "idle", refreshing: false, engine: "OFFLINE", meta: null, arb: null, problem: null };
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();
const set = (patch: Partial<Sentinel>) => { state = { ...state, ...patch }; listeners.forEach((l) => l()); };

export function loadSentinel(): Promise<void> {
  if (inflight) return inflight;
  set(state.meta ? { refreshing: true } : { status: "loading" });
  inflight = (async () => {
    try {
      const meta = await getMeta();
      set({ meta, engine: meta.engine });
      const res = await callApex<ArbitrageResult | ApexError>(meta.payloads.arbitrage);
      if ((res.result as ApexError).execution_mode === "error") {
        set({ problem: { kind: "apex", detail: (res.result as ApexError).error_message ?? "Apex returned an error" } });
      } else {
        set({ arb: res.result as ArbitrageResult, problem: null });
        AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ meta, arb: res.result, ts: Date.now() })).catch(() => {});
      }
    } catch (e: any) {
      const detail = String(e?.message ?? e);
      let restored = false;
      const cached = await AsyncStorage.getItem(CACHE_KEY).catch(() => null);
      if (cached) {
        try {
          const { meta, arb, ts } = JSON.parse(cached);
          set({ meta, arb, engine: "OFFLINE", problem: { kind: "cached", mins: Math.max(1, Math.round((Date.now() - ts) / 60000)), detail } });
          restored = true;
        } catch {}
      }
      if (!restored) set({ engine: "OFFLINE", problem: { kind: "offline", detail } });
    } finally {
      set({ status: "ready", refreshing: false });
      inflight = null;
    }
  })();
  return inflight;
}

export function useSentinel(): Sentinel & { reload: () => Promise<void> } {
  const subscribe = useCallback((l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; }, []);
  const s = useSyncExternalStore(subscribe, () => state, () => state);
  useEffect(() => { if (state.status === "idle") loadSentinel(); }, []);
  return { ...s, reload: loadSentinel };
}
