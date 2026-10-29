/**
 * The glyph kit: small named marks (check, chevron, speaker, sun...) drawn from
 * Material Design Icons through components/Icon.tsx, so they are crisp vector
 * shapes at any size and match the navigation icons. (They used to be built
 * from bordered boxes, which broke apart at small sizes: the Listen speaker,
 * the "no network" bars.) Every glyph is decorative: hidden from assistive
 * tech, the adjacent text carries the meaning. The props are unchanged, so
 * callers keep their sizes and colours.
 */
import React from "react";
import { View, type ViewStyle, type StyleProp } from "react-native";
import Animated from "react-native-reanimated";
import Icon, { type IconName } from "./Icon";

export type GlyphProps = {
  size?: number;
  color: string;
  dir?: "left" | "right" | "up" | "down";
  style?: StyleProp<ViewStyle>;
};

const r = Math.round;

function Root({ size, children, style }: { size: number; children?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      aria-hidden
      style={[{ pointerEvents: "none", width: size, height: size, alignItems: "center", justifyContent: "center" }, style]}
    >
      {children}
    </View>
  );
}

/** One icon centred in a size × size box; `scale` evens out icons whose drawing is smaller or larger than the box. */
function drawMark(name: IconName, scale: number, { size = 24, color, style }: GlyphProps) {
  // The icon font's line box can sit a pixel off-centre; lineHeight = size pins it.
  const s = r(size * scale);
  return (
    <Root size={size} style={style}>
      <Icon name={name} size={s} color={color} style={{ lineHeight: s, width: s, height: s, textAlign: "center" }} />
    </Root>
  );
}

function mark(name: IconName, scale = 1) {
  return function Mark(p: GlyphProps) {
    return drawMark(name, scale, p);
  };
}

export const CheckGlyph = mark("check-bold", 1.05);
export const CrossGlyph = mark("close-thick");
export const PlusGlyph = mark("plus-thick");
export const MinusGlyph = mark("minus-thick");
export const MenuGlyph = mark("menu", 1.1);
export const PhoneGlyph = mark("cellphone");
export const PersonGlyph = mark("account-outline", 1.1);
export const LeafGlyph = mark("leaf");
export const GridGlyph = mark("view-grid-outline");
export const ChatGlyph = mark("message-text-outline");
export const RouteGlyph = mark("map-marker-path");
export const SignalOffGlyph = mark("wifi-off");
export const ExitGlyph = mark("logout");
export const SproutGlyph = mark("sprout-outline", 1.05);
export const BarsGlyph = mark("chart-bar");
export const LensGlyph = mark("magnify");
export const CloudGlyph = mark("cloud");
export const SunGlyph = mark("white-balance-sunny", 1.05);
/** Three lines of different lengths: a news story. */
export const NewsGlyph = mark("newspaper-variant-outline");
/** A calendar page. */
export const CalendarGlyph = mark("calendar-month-outline");
/** A light bulb: ideas, questions. */
export const BulbGlyph = mark("lightbulb-on-outline");
/** A storage box. */
export const BoxGlyph = mark("package-variant-closed");
/** A coin: money, prices, records. */
export const CoinGlyph = mark("cash-multiple");
/** A drop: milk, water. */
export const DropGlyph = mark("water");
/** An egg. */
export const EggGlyph = mark("egg");

const CHEVRON = { right: "chevron-right", left: "chevron-left", up: "chevron-up", down: "chevron-down" } as const;
const ARROW = { right: "arrow-right", left: "arrow-left", up: "arrow-up", down: "arrow-down" } as const;

export function ChevronGlyph({ size = 24, color, dir = "right", style }: GlyphProps) {
  // The chevron drawing is narrow; a touch larger reads at the same weight as the text beside it.
  return drawMark(CHEVRON[dir], 1.2, { size, color, style });
}

export function ArrowGlyph({ size = 24, color, dir = "right", style }: GlyphProps) {
  return drawMark(ARROW[dir], 1, { size, color, style });
}

/** The moon of the night theme. `cutout` (the old drawn crescent's background) is no longer needed. */
export function MoonGlyph({ size = 24, color, style }: GlyphProps & { cutout?: string }) {
  return drawMark("moon-waning-crescent", 1.05, { size, color, style });
}

/**
 * The Listen speaker: the speaker with one sound wave always shown, and the
 * outer waves on top, whose opacity `arcStyle` pulses while it speaks.
 */
export function SpeakerGlyph({
  size = 24, color, style, arcStyle,
}: GlyphProps & { arcStyle?: any }) {
  const box = { position: "absolute" as const, left: 0, top: 0, width: size, height: size, alignItems: "center" as const, justifyContent: "center" as const };
  const iconStyle = { lineHeight: size, width: size, height: size, textAlign: "center" as const };
  return (
    <Root size={size} style={style}>
      <View style={box}>
        <Icon name="volume-low" size={size} color={color} style={iconStyle} />
      </View>
      <Animated.View style={[box, arcStyle]}>
        <Icon name="volume-high" size={size} color={color} style={iconStyle} />
      </Animated.View>
    </Root>
  );
}

export function CheckCoin({ size = 28, bg, fg, style }: { size?: number; bg: string; fg: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      aria-hidden
      style={[{ pointerEvents: "none", width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: "center", justifyContent: "center" }, style]}
    >
      <CheckGlyph size={r(size * 0.6)} color={fg} />
    </View>
  );
}

export type SkyKind = "sunny" | "partly" | "cloudy" | "showers" | "rain" | "heavy" | "storm";

const SKY: Record<SkyKind, IconName> = {
  sunny: "weather-sunny",
  partly: "weather-partly-cloudy",
  cloudy: "weather-cloudy",
  showers: "weather-partly-rainy",
  rain: "weather-rainy",
  heavy: "weather-pouring",
  storm: "weather-lightning-rainy",
};

/** Forecast pictogram: the sun in its colour on clear days, otherwise the cloud and rain in the water colour. */
export function WeatherGlyph({
  sky, size = 32, sun, cloud, water, alert, style,
}: { sky: SkyKind; size?: number; sun: string; cloud: string; water: string; alert?: string; style?: StyleProp<ViewStyle> }) {
  const color = sky === "sunny" || sky === "partly" ? sun : sky === "cloudy" ? cloud : sky === "storm" ? alert ?? water : water;
  return drawMark(SKY[sky], 1, { size, color, style });
}
