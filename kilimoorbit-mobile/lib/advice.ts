/**
 * Weather-aware task hints: the forecast's farming windows applied to the
 * calendar task in front of the farmer ("Not today (rain expected): spray
 * Thursday", "Heavy rain today: top-dress after it"). Only for tasks that are
 * due now (late by up to two weeks, or due within three days) and only for
 * the tasks whose timing the weather actually decides.
 */
import { CROPS } from "./agronomy";
import { addDays, weekday } from "./dates";
import type { DatedTask } from "./farm";
import type { WxDay } from "./api";
import type { Key, Lang, Vars } from "./i18n";

export type Hint = { tone: "ok" | "warn"; text: string };
type TT = (k: Key, v?: Vars) => string;

const HEAVY_MM = 15;

export function taskHint(task: DatedTask, days: WxDay[] | undefined, lang: Lang, tt: TT): Hint | null {
  if (!task.wx || task.done || !days?.length || task.inDays > 3 || task.inDays < -14) return null;
  const d0 = days[0];
  const tomorrow = addDays(d0.date, 1);
  // Mid-sentence, so "tomorrow" in lower case.
  const dayName = (k: string) => (k === tomorrow ? tt("common.tomorrowLc") : weekday(lang, k));
  const next = (pick: (d: WxDay) => boolean, within = days.length) => days.slice(1, within).find(pick);

  switch (task.wx) {
    case "spray": {
      if (d0.spray.ok) return { tone: "ok", text: tt("hint.sprayToday") };
      const n = next((d) => d.spray.ok);
      const why = tt(d0.spray.reason === "wind" ? "win.why.wind" : "win.why.rain");
      return n ? { tone: "warn", text: tt("hint.sprayLater", { why, day: dayName(n.date) }) } : { tone: "warn", text: tt("hint.sprayNone") };
    }
    case "plant": {
      // Irrigated (transplanted) crops don't wait for the rains.
      if (CROPS[task.planting.crop].water) return null;
      if (d0.plant.ok) return { tone: "ok", text: tt("hint.plantNow") };
      const n = next((d) => d.plant.ok, 7);
      return n ? { tone: "warn", text: tt("hint.plantLater", { day: dayName(n.date) }) } : { tone: "warn", text: tt("hint.plantDry") };
    }
    case "feed": {
      if (d0.rain_mm >= HEAVY_MM) return { tone: "warn", text: tt("hint.feedHeavy") };
      const soon = d0.rain_mm + (days[1]?.rain_mm ?? 0);
      return soon >= 3 ? { tone: "ok", text: tt("hint.feedGood") } : { tone: "warn", text: tt("hint.feedDry") };
    }
    case "dry": {
      if (d0.dry.ok) return { tone: "ok", text: tt("hint.dryToday") };
      const n = next((d) => d.dry.ok);
      return n ? { tone: "warn", text: tt("hint.dryLater", { day: dayName(n.date) }) } : { tone: "warn", text: tt("hint.dryNone") };
    }
  }
}
