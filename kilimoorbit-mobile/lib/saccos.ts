/**
 * Farmers' SACCOs: what the farm's focus is (so dairy farmers see dairy
 * co-operatives first), what this season's inputs would cost (what an input
 * loan from a SACCO would have to cover), and the farmer's join requests,
 * kept on this phone ("ko-saccos") with the token that withdraws them.
 * Pure helpers are unit-tested in e2e/logic.spec.ts.
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SaccoApplication } from "./api";

export { DEFAULT_INTERESTS, farmFocus, seasonInputs, sanitizeSaccos, SACCOS_KEY, type MySacco, type SaccoStore } from "./saccoplan";
import { EMPTY_SACCOS as EMPTY, SACCOS_KEY, sanitizeSaccos, type MySacco, type SaccoStore } from "./saccoplan";
const MAX = 20;

let state: SaccoStore = EMPTY;
let hydrated = false;
let hydrating: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
function hydrate() {
  if (hydrating) return hydrating;
  hydrating = AsyncStorage.getItem(SACCOS_KEY)
    .then((raw) => { if (raw && !hydrated) state = sanitizeSaccos(JSON.parse(raw)); })
    .catch(() => {})
    .finally(() => { hydrated = true; emit(); });
  return hydrating;
}
function write(next: SaccoStore) { state = next; hydrated = true; emit(); AsyncStorage.setItem(SACCOS_KEY, JSON.stringify(next)).catch(() => {}); }
function mutate(fn: (s: SaccoStore) => SaccoStore) { if (hydrated) write(fn(state)); else hydrate().then(() => write(fn(state))); }
export function clearSaccosMemory() { state = EMPTY; hydrated = true; emit(); }

export const saccoActions = {
  remember(a: SaccoApplication) {
    const row: MySacco = { id: a.application_id, token: a.token, reference: a.reference, sacco_id: a.sacco.id, name: a.sacco.name, town: a.sacco.town, county: a.sacco.county, created: new Date().toISOString() };
    mutate((s) => ({ ...s, applications: [...s.applications.filter((x) => x.sacco_id !== row.sacco_id), row].slice(-MAX) }));
  },
  forget(id: string) { mutate((s) => ({ ...s, applications: s.applications.filter((x) => x.id !== id) })); },
};

export function useMySaccos(): MySacco[] {
  const subscribe = useCallback((l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; }, []);
  const s = useSyncExternalStore(subscribe, () => state, () => state);
  useEffect(() => { hydrate(); }, []);
  return s.applications;
}
