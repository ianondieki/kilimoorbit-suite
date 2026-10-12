/**
 * The morning brief by email: what the Today screen reads aloud, sent once a
 * day to the farmer's own address through the server (SMTP, or SIMULATED and
 * logged), plus a price alert the moment the board reaches a target. The app
 * composes the sections in the farmer's language (app/(tabs)/index.tsx); the
 * server only lays them out and sends. The preference ("ko-brief", default
 * on) and the "sent today" mark ("ko-brief-sent") live on the phone.
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { mailFailure, sendAlertMail, sendBrief, type AlertMailInput, type BriefInput, type DigestResult } from "./api";
import { todayKey } from "./dates";

export const BRIEF_KEY = "ko-brief";
export const BRIEF_SENT_KEY = "ko-brief-sent";
export const ALERT_MAIL_KEY = "ko-alert-mail";

/* ── "morning brief and price alerts by email" preference ── */
let on = true;
let hydrating: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
function hydrate() {
  if (hydrating) return hydrating;
  hydrating = AsyncStorage.getItem(BRIEF_KEY)
    .then((v) => { if (v != null && (v === "1") !== on) { on = v === "1"; emit(); } })
    .catch(() => {});
  return hydrating;
}
export function setBriefPref(v: boolean) {
  if (v !== on) { on = v; emit(); }
  AsyncStorage.setItem(BRIEF_KEY, v ? "1" : "0").catch(() => {});
}
export function useBriefPref(): [boolean, (v: boolean) => void] {
  const subscribe = useCallback((l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; }, []);
  const v = useSyncExternalStore(subscribe, () => on, () => on);
  useEffect(() => { hydrate(); }, []);
  return [v, setBriefPref];
}

/* ── the brief, once a day ── */
let inFlight: Promise<DigestResult> | null = null;

/** Sends the brief now (the button); throws an ApiError the caller can read with mailFailure. */
export function sendBriefNow(input: BriefInput): Promise<DigestResult> {
  if (inFlight) return inFlight;
  inFlight = sendBrief(input)
    .then((r) => { AsyncStorage.setItem(BRIEF_SENT_KEY, todayKey()).catch(() => {}); return r; })
    .finally(() => { inFlight = null; });
  return inFlight;
}

/**
 * Sends the brief if it has not gone out today (the preference and the email
 * are the caller's to check). The mark is written before the request so two
 * screens opening at once send one brief. A refusal that would not change by
 * retrying (the address not confirmed yet, the day's cap) keeps the mark; a
 * network failure clears it so the next visit tries again.
 */
export async function sendBriefIfDue(input: BriefInput): Promise<"sent" | "already" | "skipped" | "failed"> {
  await hydrate();
  const today = todayKey();
  try {
    if ((await AsyncStorage.getItem(BRIEF_SENT_KEY)) === today) return "already";
    await AsyncStorage.setItem(BRIEF_SENT_KEY, today);
  } catch {}
  try {
    await sendBriefNow(input);
    return "sent";
  } catch (e) {
    if (mailFailure(e) !== "failed") return "skipped";
    AsyncStorage.removeItem(BRIEF_SENT_KEY).catch(() => {});
    return "failed";
  }
}

/* ── price alerts, once per alert per day ── */
/** Emails the hits not yet emailed today; remembers them so the same hit is not sent twice. */
export async function mailNewAlertHits(input: Omit<AlertMailInput, "hits"> & { hits: AlertMailInput["hits"] }): Promise<number> {
  let sent: Record<string, string> = {};
  try { sent = JSON.parse((await AsyncStorage.getItem(ALERT_MAIL_KEY)) ?? "{}") ?? {}; } catch {}
  const today = todayKey();
  const fresh = input.hits.filter((h) => sent[h.key] !== today);
  if (!fresh.length) return 0;
  const next = { ...Object.fromEntries(Object.entries(sent).filter(([, d]) => d === today)), ...Object.fromEntries(fresh.map((h) => [h.key, today])) };
  try { await AsyncStorage.setItem(ALERT_MAIL_KEY, JSON.stringify(next)); } catch {}
  try {
    await sendAlertMail({ ...input, hits: fresh });
    return fresh.length;
  } catch {
    // Not sent: forget the mark so the next visit tries again.
    try { await AsyncStorage.setItem(ALERT_MAIL_KEY, JSON.stringify(sent)); } catch {}
    return 0;
  }
}

export function clearBriefMemory() { on = true; }
