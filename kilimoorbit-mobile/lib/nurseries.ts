/**
 * Pure helpers for "seedlings near you": what a farmer can look for (the
 * server's NEEDS taxonomy, labelled in both languages), a map link, and how
 * a distance and fare read. Unit-tested in e2e/logic.spec.ts.
 */
import type { Lang } from "./i18n";

export type NeedKey = "avocado" | "mango" | "macadamia" | "citrus" | "pawpaw" | "passion" | "banana" | "coffee" | "tea" | "vegetables" | "trees" | "potato" | "maize" | "grass" | "coconut";

export const NEEDS: { key: NeedKey; en: string; sw: string; emoji: string }[] = [
  { key: "avocado", en: "Avocado", sw: "Parachichi", emoji: "🥑" },
  { key: "mango", en: "Mango", sw: "Maembe", emoji: "🥭" },
  { key: "macadamia", en: "Macadamia", sw: "Mkadamia", emoji: "🌰" },
  { key: "citrus", en: "Citrus", sw: "Machungwa", emoji: "🍊" },
  { key: "pawpaw", en: "Pawpaw", sw: "Papai", emoji: "🍈" },
  { key: "passion", en: "Passion fruit", sw: "Pasheni", emoji: "🟣" },
  { key: "banana", en: "Banana (TC)", sw: "Ndizi (TC)", emoji: "🍌" },
  { key: "coffee", en: "Coffee", sw: "Kahawa", emoji: "☕" },
  { key: "tea", en: "Tea", sw: "Chai", emoji: "🍃" },
  { key: "vegetables", en: "Vegetables", sw: "Mboga", emoji: "🥬" },
  { key: "trees", en: "Trees", sw: "Miti", emoji: "🌳" },
  { key: "potato", en: "Seed potato", sw: "Mbegu za viazi", emoji: "🥔" },
  { key: "maize", en: "Maize seed", sw: "Mbegu za mahindi", emoji: "🌽" },
  { key: "grass", en: "Napier / Brachiaria", sw: "Napier / Brachiaria", emoji: "🌾" },
  { key: "coconut", en: "Coconut & cashew", sw: "Nazi na korosho", emoji: "🥥" },
];
export const needLabel = (lang: Lang, key: string) => { const n = NEEDS.find((x) => x.key === key); return n ? (lang === "sw" ? n.sw : n.en) : key; };

/** Google Maps directions to a point (opens the app on a phone, the site on the web). */
export const mapsUrl = (lat: number, lon: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(5)},${lon.toFixed(5)}`;

/** "12 km" / "0.8 km" */
export const kmText = (km: number) => (km < 10 ? `${Math.round(km * 10) / 10} km` : `${Math.round(km)} km`);

/** "KES 1,120" */
export const kesText = (n: number) => `KES ${Math.round(n).toLocaleString("en-KE")}`;

/** "20 min" / "2 h 12 min" (Kiswahili: "dakika 20" / "saa 2 dakika 12") */
export function minutesText(lang: Lang, minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60), r = m % 60;
  if (lang === "sw") return h ? (r ? `saa ${h} dakika ${r}` : `saa ${h}`) : `dakika ${m}`;
  return h ? (r ? `${h} h ${r} min` : `${h} h`) : `${m} min`;
}

/** "≈ KES 360 by boda, 20 min" */
export function fareText(lang: Lang, t: { mode: string; round_trip_kes: number; minutes: number }): string {
  const mode = t.mode === "boda" ? "boda" : "matatu";
  return lang === "sw" ? `≈ ${kesText(t.round_trip_kes)} kwa ${mode}, ${minutesText(lang, t.minutes)}` : `≈ ${kesText(t.round_trip_kes)} by ${mode}, ${minutesText(lang, t.minutes)}`;
}
