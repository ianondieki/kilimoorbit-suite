/**
 * View-only glyph kit (no SVG, no icon fonts). Every glyph is decorative:
 * hidden from assistive tech, the adjacent text carries the meaning.
 */
import React from "react";
import { View, type ViewStyle, type StyleProp } from "react-native";
import Animated from "react-native-reanimated";

export type GlyphProps = {
  size?: number;
  color: string;
  dir?: "left" | "right" | "up" | "down";
  style?: StyleProp<ViewStyle>;
};

const r = Math.round;
const strokeFor = (size: number) => Math.max(2, r(size * 0.1));

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

/** Absolutely centered child inside the glyph box. */
const center = (size: number, w: number, h: number): ViewStyle => ({
  position: "absolute",
  left: r((size - w) / 2),
  top: r((size - h) / 2),
  width: w,
  height: h,
});

export function CheckGlyph({ size = 24, color, style }: GlyphProps) {
  const s = strokeFor(size);
  return (
    <Root size={size} style={style}>
      <View
        style={{
          width: r(size * 0.5), height: r(size * 0.25),
          borderLeftWidth: s, borderBottomWidth: s, borderColor: color,
          transform: [{ rotate: "-45deg" }], marginTop: -r(size * 0.1),
        }}
      />
    </Root>
  );
}

export function CrossGlyph({ size = 24, color, style }: GlyphProps) {
  const s = strokeFor(size);
  const len = r(size * 0.7);
  return (
    <Root size={size} style={style}>
      <View style={[center(size, len, s), { backgroundColor: color, borderRadius: s / 2, transform: [{ rotate: "45deg" }] }]} />
      <View style={[center(size, len, s), { backgroundColor: color, borderRadius: s / 2, transform: [{ rotate: "-45deg" }] }]} />
    </Root>
  );
}

const CHEVRON_ROT = { right: "-45deg", down: "45deg", left: "135deg", up: "-135deg" } as const;

export function ChevronGlyph({ size = 24, color, dir = "right", style }: GlyphProps) {
  const s = strokeFor(size);
  const box = r(size * 0.35);
  // Nudge the chevron against its direction so the visual centre sits in the box.
  const nudge = r(box * 0.2);
  const offset: ViewStyle =
    dir === "right" ? { marginLeft: -nudge } : dir === "left" ? { marginLeft: nudge } :
    dir === "down" ? { marginTop: -nudge } : { marginTop: nudge };
  return (
    <Root size={size} style={style}>
      <View
        style={[{
          width: box, height: box, borderRightWidth: s, borderBottomWidth: s, borderColor: color,
          transform: [{ rotate: CHEVRON_ROT[dir] }],
        }, offset]}
      />
    </Root>
  );
}

export function ArrowGlyph({ size = 24, color, style }: GlyphProps) {
  const s = strokeFor(size);
  const bar = r(size * 0.6);
  const head = r(size * 0.32);
  return (
    <Root size={size} style={style}>
      <View style={[center(size, bar, s), { backgroundColor: color, borderRadius: s / 2 }]} />
      <View
        style={{
          position: "absolute",
          left: r((size - bar) / 2) + bar - head - r(s * 0.3),
          top: r((size - head) / 2),
          width: head, height: head,
          borderRightWidth: s, borderTopWidth: s, borderColor: color,
          transform: [{ rotate: "45deg" }],
        }}
      />
    </Root>
  );
}

export function PlusGlyph({ size = 24, color, style }: GlyphProps) {
  const s = strokeFor(size);
  const len = r(size * 0.7);
  return (
    <Root size={size} style={style}>
      <View style={[center(size, len, s), { backgroundColor: color, borderRadius: s / 2 }]} />
      <View style={[center(size, s, len), { backgroundColor: color, borderRadius: s / 2 }]} />
    </Root>
  );
}

export function MenuGlyph({ size = 24, color, style }: GlyphProps) {
  const s = strokeFor(size);
  const w = r(size * 0.75);
  return (
    <Root size={size} style={style}>
      <View style={{ gap: r(size * 0.18) }}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ width: w, height: s, borderRadius: s / 2, backgroundColor: color }} />
        ))}
      </View>
    </Root>
  );
}

export function PhoneGlyph({ size = 24, color, style }: GlyphProps) {
  const s = strokeFor(size);
  return (
    <Root size={size} style={style}>
      <View
        style={{
          width: r(size * 0.5), height: r(size * 0.83), borderWidth: s, borderColor: color, borderRadius: 3,
          alignItems: "center", justifyContent: "flex-end", paddingBottom: r(size * 0.06),
        }}
      >
        <View style={{ width: r(size * 0.17), height: s, backgroundColor: color, borderRadius: 1 }} />
      </View>
    </Root>
  );
}

export function PersonGlyph({ size = 24, color, style }: GlyphProps) {
  const s = strokeFor(size);
  const head = r(size * 0.38);
  const sh = r(size * 0.38);
  return (
    <Root size={size} style={style}>
      <View style={{ alignItems: "center" }}>
        <View style={{ width: head, height: head, borderRadius: head / 2, borderWidth: s, borderColor: color }} />
        <View
          style={{
            width: r(size * 0.75), height: sh, marginTop: 2,
            borderWidth: s, borderBottomWidth: 0, borderColor: color,
            borderTopLeftRadius: size * 0.38, borderTopRightRadius: size * 0.38,
          }}
        />
      </View>
    </Root>
  );
}

export function SpeakerGlyph({
  size = 24, color, style, arcStyle,
}: GlyphProps & { arcStyle?: any }) {
  const s = strokeFor(size);
  const body = { w: r(size * 0.2), h: r(size * 0.33) };
  const tri = r(size * 0.3);
  const arc = r(size * 0.55);
  return (
    <Root size={size} style={style}>
      <View style={{ flexDirection: "row", alignItems: "center", marginLeft: -r(size * 0.2) }}>
        <View style={{ width: body.w, height: body.h, backgroundColor: color, borderRadius: 1 }} />
        <View
          style={{
            width: 0, height: 0, marginLeft: -r(size * 0.02),
            borderRightWidth: tri, borderRightColor: color,
            borderTopWidth: tri, borderBottomWidth: tri,
            borderTopColor: "transparent", borderBottomColor: "transparent",
          }}
        />
      </View>
      <Animated.View
        style={[{
          position: "absolute", width: arc, height: arc, borderRadius: arc / 2,
          left: r(size * 0.28), top: r((size - arc) / 2),
          borderWidth: s, borderColor: "transparent", borderRightColor: color,
        }, arcStyle]}
      />
    </Root>
  );
}

export function SunGlyph({ size = 24, color, style }: GlyphProps) {
  const core = r(size * 0.42);
  const ray = { w: Math.max(2, r(size * 0.1)), h: Math.max(3, r(size * 0.17)) };
  return (
    <Root size={size} style={style}>
      <View style={{ width: core, height: core, borderRadius: core / 2, backgroundColor: color }} />
      {Array.from({ length: 8 }, (_, i) => (
        <View
          key={i}
          style={{ position: "absolute", left: 0, top: 0, width: size, height: size, alignItems: "center", transform: [{ rotate: `${i * 45}deg` }] }}
        >
          <View style={{ width: ray.w, height: ray.h, borderRadius: ray.w / 2, backgroundColor: color }} />
        </View>
      ))}
    </Root>
  );
}

export function MoonGlyph({ size = 24, color, cutout, style }: GlyphProps & { cutout: string }) {
  const d = r(size * 0.67);
  const c = r(size * 0.58);
  return (
    <Root size={size} style={style}>
      <View style={{ width: d, height: d, borderRadius: d / 2, backgroundColor: color, overflow: "hidden" }}>
        <View
          style={{
            position: "absolute", width: c, height: c, borderRadius: c / 2, backgroundColor: cutout,
            left: r(size * 0.22), top: -r(size * 0.06),
          }}
        />
      </View>
    </Root>
  );
}

export function LeafGlyph({ size = 24, color, style }: GlyphProps) {
  const d = r(size * 0.67);
  return (
    <Root size={size} style={style}>
      <View style={{ width: d, height: d, backgroundColor: color, borderTopLeftRadius: d, borderBottomRightRadius: d }} />
    </Root>
  );
}

export function GridGlyph({ size = 24, color, style }: GlyphProps) {
  const q = r(size * 0.33);
  const g = r(size * 0.12);
  return (
    <Root size={size} style={style}>
      <View style={{ width: q * 2 + g, flexDirection: "row", flexWrap: "wrap", gap: g }}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={{ width: q, height: q, borderRadius: 2, backgroundColor: color }} />
        ))}
      </View>
    </Root>
  );
}

export function ChatGlyph({ size = 24, color, style }: GlyphProps) {
  const s = strokeFor(size);
  const w = r(size * 0.75);
  const h = r(size * 0.58);
  const tail = r(size * 0.14);
  return (
    <Root size={size} style={style}>
      <View style={{ marginTop: -r(size * 0.08) }}>
        <View style={{ width: w, height: h, borderWidth: s, borderColor: color, borderRadius: 5 }} />
        <View
          style={{
            position: "absolute", left: r(size * 0.12), top: h - 1, width: 0, height: 0,
            borderTopWidth: tail, borderTopColor: color,
            borderRightWidth: tail, borderRightColor: "transparent",
          }}
        />
      </View>
    </Root>
  );
}

export function RouteGlyph({ size = 24, color, style }: GlyphProps) {
  const s = strokeFor(size);
  const dot = r(size * 0.25);
  const dash = r(size * 0.15);
  const ring = r(size * 0.33);
  return (
    <Root size={size} style={style}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: Math.max(1, r(size * 0.04)) }}>
        <View style={{ width: dot, height: dot, borderRadius: dot / 2, backgroundColor: color }} />
        <View style={{ width: dash, height: s, backgroundColor: color }} />
        <View style={{ width: dash, height: s, backgroundColor: color, opacity: 0.6 }} />
        <View style={{ width: ring, height: ring, borderRadius: ring / 2, borderWidth: s, borderColor: color }} />
      </View>
    </Root>
  );
}

export function SignalOffGlyph({ size = 24, color, style }: GlyphProps) {
  const s = strokeFor(size);
  const w = r(size * 0.16);
  const hs = [0.25, 0.46, 0.67].map((f) => r(size * f));
  return (
    <Root size={size} style={style}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: r(size * 0.08), height: hs[2] }}>
        {hs.map((h, i) => (
          <View key={i} style={{ width: w, height: h, borderRadius: 1, backgroundColor: color, opacity: i === 0 ? 1 : 0.35 }} />
        ))}
      </View>
      <View
        style={{
          position: "absolute", width: r(size * 0.72), height: s, borderRadius: s / 2, backgroundColor: color,
          left: r(size * 0.62 - size * 0.36), top: r(size * 0.5 - s / 2), transform: [{ rotate: "45deg" }],
        }}
      />
    </Root>
  );
}

export function ExitGlyph({ size = 24, color, style }: GlyphProps) {
  const s = strokeFor(size);
  const arrow = r(size * 0.6);
  return (
    <Root size={size} style={style}>
      <View
        style={{
          position: "absolute", left: r(size * 0.14), top: r(size * 0.125),
          width: r(size * 0.42), height: r(size * 0.75),
          borderWidth: s, borderRightWidth: 0, borderColor: color, borderTopLeftRadius: 2, borderBottomLeftRadius: 2,
        }}
      />
      <ArrowGlyph size={arrow} color={color} style={{ position: "absolute", left: r(size * 0.38), top: r((size - arrow) / 2) }} />
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
      <CheckGlyph size={r(size * 0.5)} color={fg} />
    </View>
  );
}
