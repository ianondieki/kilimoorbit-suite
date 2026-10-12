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
import { sendDigest, type DigestInput, type DigestResult } from "./api";
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
 * Sends the digest after a record is saved: a few entries typed in a row go
 * out as one email (the last one wins), and nothing is reported back; the
 * Records tab's own button shows the outcome when the farmer wants it.
 */
let pending: ReturnType<typeof setTimeout> | null = null;
export const DIGEST_DEBOUNCE_MS = 1500;
export function scheduleDigest(input: DigestInput | null, onDone?: (r: DigestResult | null) => void) {
  if (!input) return;
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    pending = null;
    sendDigest(input).then((r) => onDone?.(r)).catch(() => onDone?.(null));
  }, DIGEST_DEBOUNCE_MS);
}
