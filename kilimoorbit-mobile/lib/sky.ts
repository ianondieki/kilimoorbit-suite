/**
 * Pure helpers for the weather pictures (no React, no assets): which
 * photograph and which pictogram show a sky at an hour, and the colours
 * behind them. The files themselves are bundled by components/SkyScene.tsx
 * and components/Pic.tsx. Unit-tested in e2e/logic.spec.ts.
 */
import type { Sky } from "./api";

export type Daypart = "dawn" | "day" | "dusk" | "night";
export const daypart = (hour: number): Daypart => (hour < 6 ? "night" : hour < 8 ? "dawn" : hour < 17 ? "day" : hour < 19 ? "dusk" : "night");

const WET: Sky[] = ["showers", "rain", "heavy", "storm"];
export const isWet = (sky: Sky) => WET.includes(sky);

export type SkyPhoto =
  | "sunny-day" | "partly-day" | "cloudy-day" | "rain-day" | "heavy-day" | "heavy-night" | "storm"
  | "clear-night" | "sunny-dawn" | "sunny-dusk" | "cloudy-dawn" | "cloudy-dusk";

/** Which photograph shows this sky at this hour. */
export function skyPhoto(sky: Sky, part: Daypart): SkyPhoto {
  if (sky === "storm") return "storm";
  const wet = isWet(sky);
  if (part === "night") return wet || sky === "cloudy" ? "heavy-night" : "clear-night";
  if (wet) return sky === "heavy" ? "heavy-day" : "rain-day";
  if (part === "dawn") return sky === "cloudy" ? "cloudy-dawn" : "sunny-dawn";
  if (part === "dusk") return sky === "cloudy" ? "cloudy-dusk" : "sunny-dusk";
  return sky === "sunny" ? "sunny-day" : sky === "partly" ? "partly-day" : "cloudy-day";
}

/** The colour behind the photograph while it loads, by conditions and hour. */
export function skyColors(sky: Sky, part: Daypart): [string, string] {
  const wet = isWet(sky);
  if (part === "night") return wet ? ["#0A1226", "#1C2740"] : ["#0B1535", "#243458"];
  if (part === "dawn") return wet ? ["#4A5A7A", "#9A98B0"] : ["#E89A5B", "#8FC0E8"];
  if (part === "dusk") return wet ? ["#3A4663", "#746E90"] : ["#D9734A", "#5A6DB0"];
  switch (sky) {
    case "sunny": return ["#2F7DD1", "#8CCBF2"];
    case "partly": return ["#3B7CC0", "#A6CBE8"];
    case "cloudy": return ["#5C7391", "#AEBCCB"];
    case "showers": return ["#4C6A8E", "#8FA8C2"];
    case "rain": return ["#3C5574", "#7A91AB"];
    case "heavy": return ["#2F4660", "#5F7691"];
    default: return ["#27354C", "#525E78"]; // storm
  }
}

export type WxPicName =
  | "clear-day" | "clear-night" | "partly-cloudy-day" | "partly-cloudy-night" | "cloudy" | "overcast-day" | "overcast-night"
  | "drizzle" | "partly-cloudy-day-rain" | "partly-cloudy-night-rain" | "rain" | "extreme-day-rain" | "extreme-night-rain"
  | "thunderstorms-day-rain" | "thunderstorms-night-rain" | "wind" | "thermometer" | "humidity" | "raindrops" | "sunrise" | "sunset";

/** The pictogram for a sky, by day or night (the 7-day strip is always "day"). */
export function wxPicName(sky: Sky, part: Daypart = "day"): WxPicName {
  const night = part === "night";
  switch (sky) {
    case "sunny": return night ? "clear-night" : "clear-day";
    case "partly": return night ? "partly-cloudy-night" : "partly-cloudy-day";
    case "cloudy": return night ? "overcast-night" : "overcast-day";
    case "showers": return night ? "partly-cloudy-night-rain" : "partly-cloudy-day-rain";
    case "rain": return "rain";
    case "heavy": return night ? "extreme-night-rain" : "extreme-day-rain";
    default: return night ? "thunderstorms-night-rain" : "thunderstorms-day-rain";
  }
}
