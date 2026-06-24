// Shared palette with the KilimoOrbit Sentinel app so the suite feels like one product.
export type Theme = {
  key: string;
  name: string;
  bg: string; panel: string; raised: string; line: string;
  accent: string; alert: string; ok: string;
  ink: string; dim: string; field: string;
};

export const THEMES: Theme[] = [
  { key: "loam",    name: "Loam",    bg: "#101B12", panel: "#18271B", raised: "#223827", line: "#35503A", accent: "#E9B44C", alert: "#E0532F", ok: "#6FBF73", ink: "#EFEADB", dim: "#ADB7A0", field: "#0C150E" },
  { key: "nyota",   name: "Nyota",   bg: "#0B1020", panel: "#121A30", raised: "#1B2848", line: "#324470", accent: "#7FD1E8", alert: "#FF6E5E", ok: "#8BE8A0", ink: "#EEF3FB", dim: "#A0ACCB", field: "#080D1A" },
  { key: "savanna", name: "Savanna", bg: "#EFE6D3", panel: "#F8F2E4", raised: "#FFFBEF", line: "#D6C9A8", accent: "#9A5B22", alert: "#C03A1E", ok: "#3E7A3E", ink: "#241F12", dim: "#59503A", field: "#FFF9EA" },
];
