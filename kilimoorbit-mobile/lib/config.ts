/**
 * Single swap point for the backend (the KilimoOrbit Sentinel server).
 *
 * You normally don't edit this file — the API base is auto-detected per platform:
 *   - Web (browser on this machine):          http://localhost:4517
 *   - Android emulator → host machine:        http://10.0.2.2:4517
 *   - Physical device / iOS sim (same Wi-Fi): http://<Metro-host-LAN-IP>:4517
 *                                             (reuses the IP Expo is served from)
 *
 * To override (e.g. a deployed backend), set EXPO_PUBLIC_API_BASE in .env:
 *   EXPO_PUBLIC_API_BASE=https://kilimoorbit-sentinel.onrender.com
 */
import { Platform } from "react-native";
import Constants from "expo-constants";

const PORT = 4517;

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

export const API_BASE = resolveApiBase();
