/**
 * Read-aloud preference ("ko-voice"): one shared value for the sidebar switch
 * and Apex Chat, so changing it in either place updates both immediately.
 * A tiny module store (no provider); hydrates from AsyncStorage on first use.
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "ko-voice";
let value = true; // default: replies are read aloud
let hydrating: Promise<void> | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

function hydrate(force = false) {
  if (hydrating && !force) return hydrating;
  hydrating = AsyncStorage.getItem(KEY)
    .then((v) => {
      if (v != null && (v === "1") !== value) { value = v === "1"; emit(); }
    })
    .catch(() => {});
  return hydrating;
}

export function setVoicePref(v: boolean) {
  if (v !== value) { value = v; emit(); }
  AsyncStorage.setItem(KEY, v ? "1" : "0").catch(() => {});
}

/** Re-reads storage (e.g. on screen focus); cheap and safe to call often. */
export const refreshVoicePref = () => { hydrate(true); };

export function useVoicePref(): [boolean, (v: boolean) => void] {
  const subscribe = useCallback((l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; }, []);
  const v = useSyncExternalStore(subscribe, () => value, () => value);
  useEffect(() => { hydrate(); }, []);
  return [v, setVoicePref];
}
