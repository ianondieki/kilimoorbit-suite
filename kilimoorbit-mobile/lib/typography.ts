/**
 * The app's type, bundled so every phone shows the same letters whatever its
 * system font (DESIGN.md): Fraunces, a soft serif, for greetings, titles,
 * headlines and the big numbers, with its italic for the one accent word;
 * Space Grotesk for the small uppercase labels; Nunito Sans for everything
 * else. Android cannot pick a weight out of a custom family by itself, so each
 * weight is its own file and components/Text.tsx maps fontWeight to the right one.
 */
export const FONTS = {
  NunitoSans_400Regular: require("@expo-google-fonts/nunito-sans/400Regular/NunitoSans_400Regular.ttf"),
  NunitoSans_500Medium: require("@expo-google-fonts/nunito-sans/500Medium/NunitoSans_500Medium.ttf"),
  NunitoSans_600SemiBold: require("@expo-google-fonts/nunito-sans/600SemiBold/NunitoSans_600SemiBold.ttf"),
  NunitoSans_700Bold: require("@expo-google-fonts/nunito-sans/700Bold/NunitoSans_700Bold.ttf"),
  NunitoSans_800ExtraBold: require("@expo-google-fonts/nunito-sans/800ExtraBold/NunitoSans_800ExtraBold.ttf"),
  Fraunces_500Medium: require("@expo-google-fonts/fraunces/500Medium/Fraunces_500Medium.ttf"),
  Fraunces_600SemiBold: require("@expo-google-fonts/fraunces/600SemiBold/Fraunces_600SemiBold.ttf"),
  Fraunces_400Regular_Italic: require("@expo-google-fonts/fraunces/400Regular_Italic/Fraunces_400Regular_Italic.ttf"),
  SpaceGrotesk_600SemiBold: require("@expo-google-fonts/space-grotesk/600SemiBold/SpaceGrotesk_600SemiBold.ttf"),
};

export type SansWeight = "400" | "500" | "600" | "700" | "800";
export const SANS: Record<SansWeight, keyof typeof FONTS> = {
  "400": "NunitoSans_400Regular",
  "500": "NunitoSans_500Medium",
  "600": "NunitoSans_600SemiBold",
  "700": "NunitoSans_700Bold",
  "800": "NunitoSans_800ExtraBold",
};
/** The display face (greetings, titles, headlines, big numbers). "600" is the heavier cut for small headlines; "700" maps to it too. */
export const DISPLAY: Record<"500" | "600" | "700", keyof typeof FONTS> = {
  "500": "Fraunces_500Medium",
  "600": "Fraunces_600SemiBold",
  "700": "Fraunces_600SemiBold",
};
/** The display italic: one accent word per line at most (a name, the "Orbit" of the wordmark). */
export const ITALIC: keyof typeof FONTS = "Fraunces_400Regular_Italic";
/** The label face: small uppercase tracked captions and eyebrows. One cut is bundled; "700" maps to it (no screen needs a heavier label). */
export const LABEL: Record<"600" | "700", keyof typeof FONTS> = {
  "600": "SpaceGrotesk_600SemiBold",
  "700": "SpaceGrotesk_600SemiBold",
};
/** @deprecated name kept for older imports. */
export const SERIF = DISPLAY;

/** Any React Native fontWeight → the nearest bundled sans weight. */
export function weightKey(w: string | number | undefined | null): SansWeight {
  const s = String(w ?? "400");
  if (s === "bold") return "700";
  if (s === "normal" || s === "light" || s === "ultralight" || s === "thin") return "400";
  const n = Number(s);
  if (!Number.isFinite(n)) return "400";
  if (n >= 800) return "800";
  if (n >= 700) return "700";
  if (n >= 600) return "600";
  if (n >= 500) return "500";
  return "400";
}

export const isBundled = (family: unknown): family is keyof typeof FONTS => typeof family === "string" && family in FONTS;

/** Whether the bundled fonts loaded on this device (shown under Settings, so "nothing changed" has an answer). */
export type FontStatus = "loading" | "ready" | "failed";
let fontStatus: FontStatus = "loading";
export const setFontStatus = (s: FontStatus) => { fontStatus = s; };
export const getFontStatus = () => fontStatus;
