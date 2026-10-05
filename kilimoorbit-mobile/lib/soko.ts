/**
 * The farmer's own Soko listings ("ko-soko"): what they listed from Markets
 * and the private owner token that lets them withdraw it. Statuses are
 * refreshed from the server; the token never leaves this phone except to
 * cancel. Cleared with the farm on sign-out "forget".
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { cancelSokoListing, createSokoListing, getSokoListing, type SokoListing } from "./api";

export const SOKO_KEY = "ko-soko";
const MAX = 20;

export type MyListing = Omit<SokoListing, "owner_token"> & { owner_token: string };

let state: MyListing[] = [];
let hydrated = false;
let hydrating: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function hydrate() {
  if (hydrating) return hydrating;
  hydrating = AsyncStorage.getItem(SOKO_KEY)
    .then((raw) => {
      const v = raw ? JSON.parse(raw) : [];
      if (!hydrated && Array.isArray(v)) state = v.filter((x) => x && typeof x.id === "string" && typeof x.owner_token === "string");
    })
    .catch(() => {})
    .finally(() => { hydrated = true; emit(); });
  return hydrating;
}

function write(next: MyListing[]) {
  state = next.slice(0, MAX);
  hydrated = true;
  emit();
  AsyncStorage.setItem(SOKO_KEY, JSON.stringify(state)).catch(() => {});
}

export function clearSokoMemory() { state = []; hydrated = true; emit(); }

export const sokoActions = {
  /** Lists produce on Soko; throws the API error so the sheet can explain it. */
  async list(input: Parameters<typeof createSokoListing>[0]): Promise<MyListing> {
    await hydrate();
    const { listing } = await createSokoListing(input);
    const mine = { ...listing, owner_token: listing.owner_token ?? "" };
    write([mine, ...state.filter((x) => x.id !== mine.id)]);
    return mine;
  },
  async cancel(id: string) {
    const l = state.find((x) => x.id === id);
    if (!l) return;
    const { listing } = await cancelSokoListing(id, l.owner_token);
    write(state.map((x) => (x.id === id ? { ...x, ...listing, owner_token: x.owner_token } : x)));
  },
  /** Re-reads each listing's status (claimed / delivered happen on the Soko side). */
  async refresh() {
    await hydrate();
    const updated = await Promise.all(
      state.map((x) => getSokoListing(x.id).then(({ listing }) => ({ ...x, ...listing, owner_token: x.owner_token })).catch(() => x))
    );
    write(updated);
  },
  remove(id: string) { write(state.filter((x) => x.id !== id)); },
};

export function useMyListings(): MyListing[] {
  const subscribe = useCallback((l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; }, []);
  const v = useSyncExternalStore(subscribe, () => state, () => state);
  useEffect(() => { hydrate(); }, []);
  return v;
}
