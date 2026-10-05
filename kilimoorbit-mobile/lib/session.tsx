/**
 * Device session: a lightweight farmer profile stored on this phone.
 * No password and no OTP — identity is unverified by design (see the build
 * spec's known risks). Hydrates once from AsyncStorage before any gate renders,
 * so signed-in farmers never see a flash of the login screen.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { tr, type Key, type Lang, type Vars } from "./i18n";
import { FARM_KEY, clearFarmMemory } from "./farm";
import { SOKO_KEY, clearSokoMemory } from "./soko";
import { HERD_KEY, clearHerdMemory } from "./herd";
import { ALERTS_KEY, clearAlertsMemory } from "./alerts";
import { QUIZ_KEY, clearQuizMemory } from "./quiz";
import { BOOKINGS_KEY, SHOWS_CACHE_KEY, clearBookingsMemory } from "./events";
import { NEWS_CACHE_KEY } from "./news";

export type Profile = {
  v: 2;
  name: string;
  method: "phone" | "email";
  phone?: string;
  email?: string;
  lang: Lang;
  signedInAt: string;
  serverAck: boolean;
  delivery?: "SENT" | "SIMULATED";
};

export type SessionStatus = "loading" | "signedIn" | "guest" | "signedOut";

type Ctx = {
  hydrated: boolean;
  status: SessionStatus;
  profile: Profile | null;
  lastProfile: Profile | null;
  lang: Lang;
  setLang: (l: Lang) => void;
  activate: (p: Profile) => Promise<void>;
  continueAsGuest: () => Promise<void>;
  signOut: (opts?: { forget?: boolean }) => Promise<void>;
  restoreLast: () => Promise<void>;
  forgetLast: () => Promise<void>;
};

const K = {
  profile: "ko-profile",
  last: "ko-last-profile",
  guest: "ko-guest",
  lang: "ko-lang",
} as const;

const noop = async () => {};
const SessionCtx = createContext<Ctx>({
  hydrated: false, status: "loading", profile: null, lastProfile: null, lang: "sw",
  setLang: () => {}, activate: noop, continueAsGuest: noop, signOut: noop, restoreLast: noop, forgetLast: noop,
});

/** Same person: phone when both have one, otherwise email. */
const sameIdentity = (a: Profile, b: Profile) =>
  a.phone || b.phone ? a.phone === b.phone : (a.email ?? "").toLowerCase() === (b.email ?? "").toLowerCase();

/** Parses a stored profile. Returns [profile, migrated] — legacy {name,email} becomes v2. */
function readProfile(raw: string | null | undefined, lang: Lang): [Profile | null, boolean] {
  if (!raw) return [null, false];
  let p: any;
  try { p = JSON.parse(raw); } catch { return [null, false]; }
  if (!p || typeof p !== "object") return [null, false];
  let migrated = false;
  if (p.v !== 2) {
    if (typeof p.name === "string" && typeof p.email === "string") {
      p = { v: 2, name: p.name, email: p.email, method: "email", lang, signedInAt: new Date().toISOString(), serverAck: true };
      migrated = true;
    } else return [null, false];
  }
  const name = typeof p.name === "string" ? p.name.trim() : "";
  // Only strings reach the UI (a hand-edited or corrupted store must not crash the sidebar).
  const phone = typeof p.phone === "string" && p.phone ? p.phone : undefined;
  const email = typeof p.email === "string" && p.email ? p.email : undefined;
  if (!name || !(phone || email)) return [null, false];
  return [{
    v: 2, name: name.slice(0, 80), phone, email,
    method: phone ? (p.method === "email" && email ? "email" : "phone") : "email",
    lang: p.lang === "en" ? "en" : p.lang === "sw" ? "sw" : lang,
    signedInAt: typeof p.signedInAt === "string" ? p.signedInAt : new Date().toISOString(),
    serverAck: p.serverAck === true,
    ...(p.delivery === "SENT" || p.delivery === "SIMULATED" ? { delivery: p.delivery } : null),
  }, migrated];
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [lastProfile, setLastProfile] = useState<Profile | null>(null);
  const [guest, setGuest] = useState(false);
  const [lang, setLangState] = useState<Lang>("sw");
  const lastRef = useRef<Profile | null>(null);
  lastRef.current = lastProfile;
  // Set by any farmer action. A storage read that arrives after the safety
  // timeout is still applied, unless the farmer has already acted meanwhile.
  const touched = useRef(false);

  useEffect(() => {
    let done = false;
    const finish = () => { if (!done) { done = true; setHydrated(true); } };
    // Safety net: a stalled storage read must never trap the farmer on a blank
    // screen. A read that finishes later is still applied (below), so a slow
    // cold start never signs out a farmer who is actually signed in.
    const timer = setTimeout(finish, 1500);
    (async () => {
      try {
        const pairs = await AsyncStorage.multiGet([K.profile, K.last, K.guest, K.lang]);
        if (done && touched.current) return;
        const map = Object.fromEntries(pairs) as Record<string, string | null>;
        const l: Lang = map[K.lang] === "en" ? "en" : "sw";
        const [p, migrated] = readProfile(map[K.profile], l);
        const [last] = readProfile(map[K.last], l);
        if (migrated && p) AsyncStorage.setItem(K.profile, JSON.stringify(p)).catch(() => {});
        setLangState(l);
        setProfile(p);
        setLastProfile(last);
        setGuest(map[K.guest] === "1");
      } catch {
        // Treat everything as empty.
      } finally {
        clearTimeout(timer);
        finish();
      }
    })();
    return () => clearTimeout(timer);
  }, []);

  const setLang = useCallback((l: Lang) => {
    touched.current = true;
    setLangState(l);
    AsyncStorage.setItem(K.lang, l).catch(() => {});
  }, []);

  const activate = useCallback(async (p: Profile) => {
    touched.current = true;
    // A different person signing in on this phone (e.g. after "Si mimi")
    // replaces the remembered farmer: their name, number, Apex chat log and
    // farm (crops, tasks, money records) are not kept (none has an owner field,
    // and a shared phone must not show one farmer's data to the next). Cached
    // prices and weather are not personal and stay for offline use.
    const last = lastRef.current;
    const replaceLast = !!last && !sameIdentity(last, p);
    try {
      await AsyncStorage.setItem(K.profile, JSON.stringify(p));
      await AsyncStorage.removeItem(K.guest);
      if (replaceLast) await AsyncStorage.multiRemove([K.last, "ko-chat-log", FARM_KEY, SOKO_KEY, HERD_KEY, ALERTS_KEY, QUIZ_KEY, BOOKINGS_KEY]);
    } catch {}
    setGuest(false);
    if (replaceLast) { setLastProfile(null); clearFarmMemory(); clearSokoMemory(); clearHerdMemory(); clearAlertsMemory(); clearQuizMemory(); clearBookingsMemory(); }
    setProfile(p);
  }, []);

  const continueAsGuest = useCallback(async () => {
    touched.current = true;
    try { await AsyncStorage.setItem(K.guest, "1"); } catch {}
    setGuest(true);
  }, []);

  const signOut = useCallback(async ({ forget = false }: { forget?: boolean } = {}) => {
    touched.current = true;
    const current = profile;
    try {
      await AsyncStorage.removeItem(K.profile);
      if (forget) await AsyncStorage.multiRemove([K.last, "ko-chat-log", "ko-dash-cache", "ko-weather-cache", FARM_KEY, SOKO_KEY, HERD_KEY, ALERTS_KEY, QUIZ_KEY, BOOKINGS_KEY, NEWS_CACHE_KEY, SHOWS_CACHE_KEY, K.guest]);
      else if (current) await AsyncStorage.setItem(K.last, JSON.stringify(current));
      // ko-theme, ko-lang and ko-voice are kept.
    } catch {}
    setProfile(null);
    if (forget) { setLastProfile(null); setGuest(false); clearFarmMemory(); clearSokoMemory(); clearHerdMemory(); clearAlertsMemory(); clearQuizMemory(); clearBookingsMemory(); }
    else if (current) setLastProfile(current);
  }, [profile]);

  const restoreLast = useCallback(async () => {
    if (!lastProfile) return;
    await activate({ ...lastProfile, signedInAt: new Date().toISOString() });
  }, [lastProfile, activate]);

  const forgetLast = useCallback(async () => {
    touched.current = true;
    // "Ondoa kwenye simu hii": the remembered farmer's chat and farm go with
    // them, as with sign-out's "forget" box, so the next person never inherits them.
    try { await AsyncStorage.multiRemove([K.last, "ko-chat-log", FARM_KEY, SOKO_KEY, HERD_KEY, ALERTS_KEY, QUIZ_KEY, BOOKINGS_KEY]); } catch {}
    setLastProfile(null);
    clearFarmMemory();
    clearSokoMemory();
    clearHerdMemory();
    clearAlertsMemory(); clearQuizMemory(); clearBookingsMemory();
  }, []);

  const status: SessionStatus = !hydrated ? "loading" : profile ? "signedIn" : guest ? "guest" : "signedOut";

  const value = useMemo<Ctx>(
    () => ({ hydrated, status, profile, lastProfile, lang, setLang, activate, continueAsGuest, signOut, restoreLast, forgetLast }),
    [hydrated, status, profile, lastProfile, lang, setLang, activate, continueAsGuest, signOut, restoreLast, forgetLast]
  );
  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export const useSession = () => useContext(SessionCtx);

export function useLang() {
  const { lang, setLang } = useContext(SessionCtx);
  const t = useCallback((key: Key, vars?: Vars) => tr(lang, key, vars), [lang]);
  return { lang, setLang, t };
}
