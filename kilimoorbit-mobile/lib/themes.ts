export type Theme = {
  key: string;
  name: string;
  bg: string; panel: string; raised: string; line: string;
  accent: string; alert: string; ok: string;
  ink: string; dim: string; field: string;
  /** The navigation rail's ground: one step deeper than the page, so the sidebar reads as the almanac's spine. */
  rail: string;
  /** Rain and water marks (forecast drops, rain bars). */
  water: string;
  /** Section hues: news and the season (violet), the trivia (teal), livestock (rose), shows and the store (amber). */
  violet: string; teal: string; rose: string; amber: string;
};

export const THEMES: Theme[] = [
  // Daylight (default): warm paper, near-white surfaces, a tea-leaf forest primary (DESIGN.md).
  // Every text hue is ≥ 5.1:1 on the paper; white on the accent 7.0:1, on the alert 6.5:1.
  { key: "savanna", name: "Shamba",  bg: "#F3EEE2", panel: "#FFFDF8", raised: "#ECF1E6", line: "#E2DACA", accent: "#1A6642", alert: "#B3261E", ok: "#14724A", ink: "#14201B", dim: "#56615B", field: "#FFFFFF", rail: "#ECE5D4", water: "#1F55C2", violet: "#5A45A6", teal: "#0D6E66", rose: "#A23B55", amber: "#8F4F0E" },
  { key: "loam",    name: "Loam",    bg: "#101B12", panel: "#18271B", raised: "#223827", line: "#35503A", accent: "#E9B44C", alert: "#E0532F", ok: "#6FBF73", ink: "#EFEADB", dim: "#ADB7A0", field: "#0C150E", rail: "#0C160E", water: "#8EC5E8", violet: "#C9B9F2", teal: "#7CD4C1", rose: "#F0A4A4", amber: "#F2A65A" },
  { key: "nyota",   name: "Nyota",   bg: "#0B1020", panel: "#121A30", raised: "#1B2848", line: "#324470", accent: "#7FD1E8", alert: "#FF6E5E", ok: "#8BE8A0", ink: "#EEF3FB", dim: "#A0ACCB", field: "#080D1A", rail: "#090E1C", water: "#A9C8FF", violet: "#C4B5FD", teal: "#5EEAD4", rose: "#FDA4AF", amber: "#FDBA74" },
];
