/**
 * The daftari (records) by email: each time the farmer records a sale or a
 * cost (and on request from the Records tab), the season's income, costs and
 * profit, with the plain-text report the phone already builds, go to the
 * farmer's own email address through the server (SMTP, or SIMULATED and
 * logged when the server has none). The records themselves never leave the
 * phone except as this copy to the farmer. The "email me updates" preference
 * ("ko-digest", default on) is a tiny module store like lib/voice.ts.
 * Pure helpers (the season window, an entry's one-liner): lib/digest.ts.
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ApiError, sendDigest, type DigestInput, type DigestResult } from "./api";
import { todayKey } from "./dates";
import { buildReport } from "./report";
import { byCrop, totals, type Entry, type Farm } from "./farm";
import type { Profile } from "./session";
import type { Lang } from "./i18n";
import { entryLine, periodEntries, type TT } from "./digest";

export const DIGEST_KEY = "ko-digest";

/** What the server emails: totals, profit by crop, the entry just saved and the report text. */
export function buildDigest(opts: {
  lang: Lang; tt: TT; profile: Pick<Profile, "name" | "email">; farm: Farm; period: "season" | "all"; last?: Entry;
  herdLine?: string; milkLitres?: number; eggs?: number;
}): DigestInput | null {
  const { lang, tt, profile, farm, period, last } = opts;
  if (!profile.email) return null;
  const entries = periodEntries(farm.entries, period);
  const sum = totals(entries);
  const text = buildReport({
    lang, tt, name: profile.name, farm, entries, periodLabel: tt(period === "all" ? "rec.all" : "rec.season"),
    herdLine: opts.herdLine, milkLitres: opts.milkLitres, eggs: opts.eggs,
  });
  return {
    name: profile.name, email: profile.email, lang, period: tt(period === "all" ? "rec.all" : "rec.season"),
    totals: { income: sum.income, expense: sum.expense },
    crops: byCrop(entries).map((c) => ({ crop: c.crop, profit: c.t.profit })).slice(0, 20),
    entries: entries.length,
    last: last ? entryLine(lang, tt, last) : null,
    text: text.slice(0, 6000),
  };
}

/* ── "email me updates" preference ── */
let on = true;
let hydrating: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
function hydrate() {
  if (hydrating) return hydrating;
  hydrating = AsyncStorage.getItem(DIGEST_KEY)
    .then((v) => { if (v != null && (v === "1") !== on) { on = v === "1"; emit(); } })
    .catch(() => {});
  return hydrating;
}
export function setDigestPref(v: boolean) {
  if (v !== on) { on = v; emit(); }
  AsyncStorage.setItem(DIGEST_KEY, v ? "1" : "0").catch(() => {});
}
export const getDigestPref = () => on;
export function useDigestPref(): [boolean, (v: boolean) => void] {
  const subscribe = useCallback((l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; }, []);
  const v = useSyncExternalStore(subscribe, () => on, () => on);
  useEffect(() => { hydrate(); }, []);
  return [v, setDigestPref];
}

/* ── sending ── */
/**
 * After a record is saved the digest waits a couple of minutes, so an evening
 * of entries typed one after another goes out as one email with the final
 * totals. A pending digest is remembered on the phone: if the app is closed
 * before it went, Today sends it next time (flushPendingDigest). At most a
 * few automatic digests a day, well under the server's cap; a refusal that
 * will not change by retrying (not confirmed, the cap, bad input) is dropped.
 */
export const DIGEST_DELAY_MS = 2 * 60_000;
export const DIGEST_DAILY_CAP = 6;
export const DIGEST_PENDING_KEY = "ko-digest-pending";
export const DIGEST_COUNT_KEY = "ko-digest-count";
let pending: ReturnType<typeof setTimeout> | null = null;
let pendingInput: DigestInput | null = null;

async function underCap(): Promise<boolean> {
  try {
    const c = JSON.parse((await AsyncStorage.getItem(DIGEST_COUNT_KEY)) ?? "null");
    return !(c && c.day === todayKey() && c.n >= DIGEST_DAILY_CAP);
  } catch { return true; }
}
async function countOne() {
  try {
    const c = JSON.parse((await AsyncStorage.getItem(DIGEST_COUNT_KEY)) ?? "null");
    const n = c && c.day === todayKey() ? c.n + 1 : 1;
    await AsyncStorage.setItem(DIGEST_COUNT_KEY, JSON.stringify({ day: todayKey(), n }));
  } catch {}
}
async function flush(onDone?: (r: DigestResult | null) => void) {
  pending = null;
  const input = pendingInput;
  pendingInput = null;
  if (!input) return;
  if (!(await underCap())) { AsyncStorage.removeItem(DIGEST_PENDING_KEY).catch(() => {}); onDone?.(null); return; }
  try {
    const r = await sendDigest(input);
    await countOne();
    AsyncStorage.removeItem(DIGEST_PENDING_KEY).catch(() => {});
    onDone?.(r);
  } catch (e) {
    // Not confirmed, capped or refused: retrying would not help; anything else (offline) stays pending for the next start.
    if (e instanceof ApiError && e.status >= 400 && e.status < 500) AsyncStorage.removeItem(DIGEST_PENDING_KEY).catch(() => {});
    onDone?.(null);
  }
}
export function scheduleDigest(input: DigestInput | null, onDone?: (r: DigestResult | null) => void) {
  if (!input) return;
  pendingInput = input;
  AsyncStorage.setItem(DIGEST_PENDING_KEY, "1").catch(() => {});
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => { flush(onDone); }, DIGEST_DELAY_MS);
}
/** On Today: a digest the last session never sent goes now, built from today's records. */
export async function flushPendingDigest(build: () => DigestInput | null) {
  if (pending) return;
  try { if ((await AsyncStorage.getItem(DIGEST_PENDING_KEY)) !== "1") return; } catch { return; }
  pendingInput = build();
  await flush();
}
