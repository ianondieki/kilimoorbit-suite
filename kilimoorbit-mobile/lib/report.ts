/**
 * A plain-text season report from the daftari and the calendar, for the
 * farmer to send to a SACCO, lender, buyer or group (WhatsApp, SMS, email).
 * Shared with the phone's share sheet; on web without one, copied instead.
 */
import { Platform, Share } from "react-native";
import { cropName } from "./prices";
import { dayMonth, longDay, todayKey } from "./dates";
import { acresText, byCrop, fmtMoney, totals, type Entry, type Farm } from "./farm";
import type { Key, Lang, Vars } from "./i18n";

type TT = (k: Key, v?: Vars) => string;

export function buildReport(opts: {
  lang: Lang; tt: TT; name?: string; farm: Farm; entries: Entry[]; periodLabel: string;
  /** Livestock line, e.g. "Cow 2, Chickens 50", and litres of milk in the period. */
  herdLine?: string; milkLitres?: number;
}): string {
  const { lang, tt, name, farm, entries, periodLabel, herdLine, milkLitres } = opts;
  const sum = totals(entries);
  const who = [name, farm.county, farm.acres ? acresText(tt, farm.acres) : null].filter(Boolean).join(" · ");
  const lines = [
    tt("report.title"),
    who,
    `${periodLabel} · ${longDay(lang, todayKey())}`,
    "",
    `${tt("rec.income")}: ${fmtMoney(sum.income)}`,
    `${tt("rec.expense")}: ${fmtMoney(sum.expense)}`,
    `${sum.profit < 0 ? tt("rec.loss") : tt("rec.profit")}: ${fmtMoney(Math.abs(sum.profit))}`,
  ];
  const crops = byCrop(entries);
  if (crops.length) {
    lines.push("", tt("report.byCrop"));
    for (const c of crops) {
      const sold = c.avgPerKg ? ` (${tt("report.sold", { kg: c.soldKg.toLocaleString("en-KE"), p: c.avgPerKg })})` : "";
      lines.push(`- ${cropName(lang, c.crop)}: ${c.t.profit < 0 ? "−" : "+"}${fmtMoney(Math.abs(c.t.profit))}${sold}`);
    }
  }
  if (farm.plantings.length) {
    lines.push("", tt("report.crops"));
    for (const p of farm.plantings)
      lines.push(`- ${cropName(lang, p.crop)}: ${acresText(tt, p.acres)}, ${tt("report.planted", { date: dayMonth(lang, p.plantedOn) })}`);
  }
  if (herdLine) {
    lines.push("", tt("report.herd", { list: herdLine }));
    if (milkLitres) lines.push(tt("report.milk", { n: Math.round(milkLitres * 10) / 10 }));
  }
  lines.push("", tt("report.footer"));
  return lines.join("\n");
}

/** "shared" | "copied" | "failed" — the share sheet, or the clipboard on web. */
export async function shareText(message: string): Promise<"shared" | "copied" | "failed"> {
  try {
    await Share.share({ message });
    return "shared";
  } catch {
    if (Platform.OS === "web" && typeof navigator !== "undefined" && (navigator as any).clipboard?.writeText) {
      try { await (navigator as any).clipboard.writeText(message); return "copied"; } catch {}
    }
    return "failed";
  }
}
