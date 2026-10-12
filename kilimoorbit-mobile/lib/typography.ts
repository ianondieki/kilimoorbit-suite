/**
 * The app's type, bundled so every phone shows the same letters whatever its
 * system font: Fraunces (a soft serif) for titles, greetings, headlines and
 * the trivia questions; Space Grotesk (a geometric grotesk with tabular
 * figures) for the numbers, eyebrows and tags, so a price, a temperature or a
 * section label reads differently from a sentence; Nunito Sans for
 * everything else. Android cannot pick a weight out of a custom family by
 * itself, so each weight is its own file and components/Text.tsx maps
 * fontWeight to the right one ("monospace" is the figures face).
 */
export const FONTS = {
  NunitoSans_400Regular: require("@expo-google-fonts/nunito-sans/400Regular/NunitoSans_400Regular.ttf"),
  NunitoSans_500Medium: require("@expo-google-fonts/nunito-sans/500Medium/NunitoSans_500Medium.ttf"),
  NunitoSans_600SemiBold: require("@expo-google-fonts/nunito-sans/600SemiBold/NunitoSans_600SemiBold.ttf"),
  NunitoSans_700Bold: require("@expo-google-fonts/nunito-sans/700Bold/NunitoSans_700Bold.ttf"),
  NunitoSans_800ExtraBold: require("@expo-google-fonts/nunito-sans/800ExtraBold/NunitoSans_800ExtraBold.ttf"),
  Fraunces_600SemiBold: require("@expo-google-fonts/fraunces/600SemiBold/Fraunces_600SemiBold.ttf"),
  Fraunces_700Bold: require("@expo-google-fonts/fraunces/700Bold/Fraunces_700Bold.ttf"),
  SpaceGrotesk_500Medium: require("@expo-google-fonts/space-grotesk/500Medium/SpaceGrotesk_500Medium.ttf"),
  SpaceGrotesk_700Bold: require("@expo-google-fonts/space-grotesk/700Bold/SpaceGrotesk_700Bold.ttf"),
};

export type SansWeight = "400" | "500" | "600" | "700" | "800";
export const SANS: Record<SansWeight, keyof typeof FONTS> = {
  "400": "NunitoSans_400Regular",
  "500": "NunitoSans_500Medium",
  "600": "NunitoSans_600SemiBold",
  "700": "NunitoSans_700Bold",
  "800": "NunitoSans_800ExtraBold",
};
export const SERIF: Record<"600" | "700", keyof typeof FONTS> = {
  "600": "Fraunces_600SemiBold",
  "700": "Fraunces_700Bold",
};
/** The figures face (numbers, eyebrows, tags): what `fontFamily: "monospace"` means in this app. */
export const FIGURES: Record<"500" | "700", keyof typeof FONTS> = {
  "500": "SpaceGrotesk_500Medium",
  "700": "SpaceGrotesk_700Bold",
};

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
