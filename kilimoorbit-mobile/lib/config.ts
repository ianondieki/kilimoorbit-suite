/**
 * Where the backend (the KilimoOrbit Sentinel server) is.
 *
 * The address is auto-detected per platform:
 *   - Web (browser on this machine):          http://localhost:4517
 *   - Android emulator → host machine:        http://10.0.2.2:4517
 *   - Physical device / iOS sim (same Wi-Fi): http://<Metro-host-LAN-IP>:4517
 *                                             (reuses the IP Expo is served from)
 *
 * A farmer (or whoever set up the laptop) can override it from the app's
 * Connection screen (kept on the phone, "ko-api-base"), e.g. when the laptop
 * has several network adapters and Expo picked the wrong one, or to point at
 * a deployed server. EXPO_PUBLIC_API_BASE in .env sets the auto value.
 */
import { Platform } from "react-native";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useSyncExternalStore } from "react";
import { cleanBase } from "./connection";

const PORT = 4517;
export const API_BASE_KEY = "ko-api-base";

/** The LAN IP of the machine running Metro — lets a physical device reach the
 *  backend on the same Wi-Fi without hardcoding an address that goes stale. */
function metroLanHost(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants.expoGoConfig as any)?.debuggerHost ??
    ((Constants as any).manifest?.debuggerHost as string | undefined) ??
    null;
  if (!hostUri) return null;
  const host = hostUri.split("://").pop()?.split(":")[0] ?? null;
  return host && host !== "localhost" && host !== "127.0.0.1" ? host : null;
}

function resolveApiBase(): string {
  // 1. Explicit override always wins (deployed backend, custom LAN IP, etc.).
  if (process.env.EXPO_PUBLIC_API_BASE) return process.env.EXPO_PUBLIC_API_BASE;

  // 2. Web: the browser runs on the same machine as the server.
  if (Platform.OS === "web") return `http://localhost:${PORT}`;

  // 3. Physical device / iOS simulator: reuse the IP Metro is served from.
  const lan = metroLanHost();
  if (lan) return `http://${lan}:${PORT}`;

  // 4. Android emulator's loopback alias to the host machine.
  if (Platform.OS === "android") return `http://10.0.2.2:${PORT}`;

  // 5. Fallback (iOS simulator can reach the host on localhost).
  return `http://localhost:${PORT}`;
}

/** The auto-detected address. */
export const API_BASE = resolveApiBase();

let override: string | null = null;
let hydrating: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Reads the saved override once; every request waits for this so the first call goes to the right server. */
export function hydrateApiBase(): Promise<void> {
  if (!hydrating) {
    hydrating = AsyncStorage.getItem(API_BASE_KEY)
      .then((v) => { override = cleanBase(v); if (override) emit(); })
      .catch(() => {});
  }
  return hydrating;
}

export const getApiBase = () => override ?? API_BASE;
export const getApiOverride = () => override;

export async function setApiBaseOverride(raw: string | null): Promise<string | null> {
  override = cleanBase(raw);
  emit();
  try {
    if (override) await AsyncStorage.setItem(API_BASE_KEY, override);
    else await AsyncStorage.removeItem(API_BASE_KEY);
  } catch {}
  return override;
}

export function useApiBase(): { base: string; override: string | null; auto: string } {
  const subscribe = useCallback((l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; }, []);
  const o = useSyncExternalStore(subscribe, () => override, () => override);
  return { base: o ?? API_BASE, override: o, auto: API_BASE };
}
