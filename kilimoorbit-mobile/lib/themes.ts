export type Theme = {
  key: string;
  name: string;
  bg: string; panel: string; raised: string; line: string;
  accent: string; alert: string; ok: string;
  ink: string; dim: string; field: string;
  /** Rain and water marks (forecast drops, rain bars). */
  water: string;
  /** Section hues: news and the season (violet), the trivia (teal), livestock (rose), shows and the store (amber). */
  violet: string; teal: string; rose: string; amber: string;
};

export const THEMES: Theme[] = [
  // Daylight (default): cream canvas, white cards, forest-green text, a leaf-green primary.
  { key: "savanna", name: "Shamba",  bg: "#F3EFE3", panel: "#FFFFFF", raised: "#F0F6EA", line: "#DCE4D2", accent: "#5A8A00", alert: "#C62828", ok: "#0E7A4A", ink: "#00231A", dim: "#5C6B57", field: "#FFFFFF", water: "#1D4ED8", violet: "#6B4FBF", teal: "#0E7A6B", rose: "#B5485D", amber: "#C2680C" },
  { key: "loam",    name: "Loam",    bg: "#101B12", panel: "#18271B", raised: "#223827", line: "#35503A", accent: "#E9B44C", alert: "#E0532F", ok: "#6FBF73", ink: "#EFEADB", dim: "#ADB7A0", field: "#0C150E", water: "#8EC5E8", violet: "#C9B9F2", teal: "#7CD4C1", rose: "#F0A4A4", amber: "#F2A65A" },
  { key: "nyota",   name: "Nyota",   bg: "#0B1020", panel: "#121A30", raised: "#1B2848", line: "#324470", accent: "#7FD1E8", alert: "#FF6E5E", ok: "#8BE8A0", ink: "#EEF3FB", dim: "#A0ACCB", field: "#080D1A", water: "#A9C8FF", violet: "#C4B5FD", teal: "#5EEAD4", rose: "#FDA4AF", amber: "#FDBA74" },
];
