/**
 * "Shamba" context panel on the login screen: the current season (from the
 * date) and today's staple wholesale prices (from /api/meta or the offline
 * cache). Variants: "side" (wide left pane), "strip" (phone, collapsible),
 * "tiles" (medium widths).
 */
import React, { useEffect, useState } from "react";
import { View, Pressable, type LayoutChangeEvent } from "react-native";
import Text from "./Text";
import { Eyebrow } from "./Kit";
import Animated, {
  Easing, FadeIn, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming,
} from "react-native-reanimated";
import { useTheme } from "../lib/theme-context";
import { useLang } from "../lib/session";
import { monthName, type Season } from "../lib/season";
import {
  SAFE_EMOJI, cropLetters, cropName, freshnessText, isDemoBoard, rowA11y, type PriceBoard, type StapleRow,
} from "../lib/prices";
import type { Key } from "../lib/i18n";
import { focusRing, isWeb, webCursor, type PressState } from "../lib/ui";
import { Wordmark } from "./auth/Controls";
import SeasonOrbit from "./SeasonOrbit";
import { Skeleton } from "./Motion";
import { ChevronGlyph, SignalOffGlyph, CoinGlyph, LeafGlyph, SproutGlyph } from "./Glyphs";

type Props = {
  variant: "side" | "strip" | "tiles";
  board: PriceBoard;
  season: Season;
  width: number;
  height: number;
  expanded?: boolean;
  onToggle?: () => void;
  /** Strip only: horizontal margin, so the strip shares the screen's content edge. */
  inset?: number;
};

export default function ShambaPanel(props: Props) {
  if (props.variant === "side") return <Side {...props} />;
  if (props.variant === "tiles") return <Tiles {...props} />;
  return <Strip {...props} />;
}

/* ── shared bits ── */
/**
 * Web: a role-less div ignores aria-label, so screen readers would read the
 * visual children ("KES 52/kg ·0"). role="img" makes the label the element's
 * name and its children presentational, so the "shilingi" sentence is read.
 * Native already groups `accessible` views under their label.
 */
const groupRole: Record<string, unknown> = isWeb ? { role: "img" } : {};
/** Web: the visual children of a labelled group, hidden so only its label is read. */
const webHidden: Record<string, unknown> = isWeb ? { "aria-hidden": true } : {};

function useSeasonCopy(season: Season) {
  const { lang, t: tt } = useLang();
  const k = season.key;
  return {
    name: tt(`season.${k}.name` as Key),
    desc: tt(`season.${k}.desc` as Key),
    next: tt("season.next", {
      name: tt(`season.${season.next}.name` as Key),
      desc: tt(`season.${season.next}.desc` as Key),
      month: monthName(lang, season.nextStartMonth),
    }),
  };
}

/** letters: override for the lettered coin (the English-only dashboard uses the
 *  English name; the login uses the Kiswahili name, per the spec). */
export function CropCoin({ cropKey, size, letters }: { cropKey: string; size: number; letters?: string }) {
  const t = useTheme();
  const emoji = SAFE_EMOJI[cropKey];
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      {...webHidden}
      style={{ width: size, height: size, borderRadius: 999, backgroundColor: t.raised, alignItems: "center", justifyContent: "center" }}
    >
      {emoji ? (
        <Text maxFontSizeMultiplier={1} style={{ fontSize: Math.round(size * 0.55), lineHeight: Math.round(size * 0.75) }}>{emoji}</Text>
      ) : (
        <Text maxFontSizeMultiplier={1} style={{ color: t.ink, fontSize: 13, fontWeight: "800" }}>{letters ?? cropLetters(cropKey)}</Text>
      )}
    </View>
  );
}

function Delta({ d }: { d: number }) {
  const t = useTheme();
  if (d === 0) return <Text style={{ color: t.dim, fontSize: 13, fontFamily: "monospace" }}>·0</Text>;
  return (
    <Text style={{ fontSize: 13, fontFamily: "monospace" }}>
      <Text style={{ color: d > 0 ? t.ok : t.alert }}>{d > 0 ? "▲" : "▼"}</Text>
      <Text style={{ color: t.dim }}>{Math.abs(d)}</Text>
    </Text>
  );
}

export function DemoTag() {
  const t = useTheme();
  const { t: tt } = useLang();
  return (
    <View style={{ borderWidth: 1.5, borderColor: t.dim, borderRadius: 999, paddingHorizontal: 8, minHeight: 22, justifyContent: "center", alignSelf: "center" }}>
      <Text style={{ color: t.ink, fontSize: 11, fontFamily: "monospace", fontWeight: "700" }}>{tt("prices.demo")}</Text>
    </View>
  );
}

function PriceRow({ row, coin, big }: { row: StapleRow; coin: number; big?: boolean }) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  return (
    <View
      accessible
      accessibilityLabel={rowA11y(lang, row)}
      {...groupRole}
      style={{
        minHeight: big ? 56 : 52, flexDirection: "row", gap: 12, alignItems: "center",
        ...(big ? { borderBottomWidth: 1, borderBottomColor: t.line, paddingVertical: 6 } : { paddingVertical: 4 }),
      }}
    >
      <CropCoin cropKey={row.key} size={coin} />
      <View style={{ flex: 1 }} {...webHidden}>
        <Text style={{ color: t.ink, fontSize: big ? 16 : 15, lineHeight: big ? 22 : 20, fontWeight: "700" }}>{cropName(lang, row.key)}</Text>
        <Text numberOfLines={1} style={{ color: t.dim, fontSize: 12, lineHeight: 16, fontFamily: "monospace" }}>
          {tt("prices.best", { market: row.best.market })}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end" }} {...webHidden}>
        <Text style={{ color: t.ink, fontSize: big ? 16 : 15, lineHeight: 20, fontFamily: "monospace", fontWeight: "700" }}>
          KES {row.best.price}/kg
        </Text>
        <Delta d={row.best.delta} />
      </View>
    </View>
  );
}

function FreshLine({ board, style }: { board: PriceBoard; style?: any }) {
  const t = useTheme();
  const { lang } = useLang();
  const text = freshnessText(lang, board);
  if (!text && !isDemoBoard(board)) return null;
  return (
    <View style={[{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }, style]}>
      {!!text && <Text style={{ color: t.dim, fontSize: 12, lineHeight: 16, fontFamily: "monospace" }}>{text}</Text>}
      {isDemoBoard(board) && <DemoTag />}
    </View>
  );
}

/** Season name · description, then the lead staple price (or loading / offline). */
function HeaderLines({ board, season }: { board: PriceBoard; season: Season }) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const s = useSeasonCopy(season);
  const lead = board.rows[0];
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {/* Sample prices are labelled even while the strip is collapsed. The
            season description gives way on narrow phones; the price never does. */}
        <View style={{ flexShrink: 1, minWidth: 0 }}>
          <SeasonLine name={s.name} desc={s.desc} />
        </View>
        {isDemoBoard(board) && board.rows.length > 0 && <DemoTag />}
      </View>
      <View style={{ marginTop: 2, minHeight: 20, justifyContent: "center" }}>
        {board.status === "loading" ? (
          <Skeleton height={12} width={140} color={t.raised} />
        ) : lead ? (
          <Text numberOfLines={1}>
            <Text style={{ color: t.ink, fontSize: 14, lineHeight: 20, fontFamily: "monospace", fontWeight: "700" }}>
              {cropName(lang, lead.key)} KES {lead.best.price}/kg
            </Text>
            <Text> </Text>
            <Delta d={lead.best.delta} />
          </Text>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <SignalOffGlyph size={14} color={t.ink} />
            {/* When offline the form shows a full banner, so keep this short. */}
            <Text numberOfLines={1} style={{ flex: 1, color: t.ink, fontSize: 14, lineHeight: 20, fontWeight: "500" }}>
              {tt(board.offline ? "strip.offlineShort" : "strip.offline")}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

/** "Kipupwe · Baridi na ukame". In English the season name already says it
 *  ("Long rains"), so the description is left out instead of truncating. */
function SeasonLine({ name, desc }: { name: string; desc: string }) {
  const t = useTheme();
  const { lang } = useLang();
  return (
    <Text numberOfLines={1}>
      <Text style={{ color: t.ink, fontSize: 16, lineHeight: 22, fontWeight: "800" }}>{name}</Text>
      {lang === "sw" && <Text style={{ color: t.dim, fontSize: 14, lineHeight: 22, fontWeight: "500" }}>{" · " + desc}</Text>}
    </Text>
  );
}

function headerA11y(lang: "sw" | "en", s: { name: string; desc: string }, board: PriceBoard, offlineText: string) {
  const lead = board.rows[0];
  return `${s.name}, ${s.desc}. ${lead ? rowA11y(lang, lead) : board.status === "loading" ? "" : offlineText}`.trim();
}

/* ── strip (phone) ── */
function Strip({ board, season, expanded = false, onToggle, inset = 16 }: Props) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const reduce = useReducedMotion();
  const s = useSeasonCopy(season);
  const [contentH, setContentH] = useState(0);

  const h = useSharedValue(0);
  const rot = useSharedValue(expanded ? 180 : 0);
  const rows = useSharedValue(expanded ? 1 : 0);
  useEffect(() => {
    const target = expanded ? contentH : 0;
    const dur = expanded ? 240 : 200;
    const cfg = { duration: dur, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.System };
    if (reduce) {
      h.value = target; rot.value = expanded ? 180 : 0; rows.value = expanded ? 1 : 0;
      return;
    }
    h.value = withTiming(target, cfg);
    rot.value = withTiming(expanded ? 180 : 0, cfg);
    rows.value = expanded ? withDelay(80, withTiming(1, { duration: 160, reduceMotion: ReduceMotion.System })) : withTiming(0, { duration: 120 });
  }, [expanded, contentH, reduce]);
  const hStyle = useAnimatedStyle(() => ({ height: h.value }));
  const chevStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }));
  const rowsStyle = useAnimatedStyle(() => ({ opacity: rows.value }));

  return (
    <View style={{ marginTop: 4, marginHorizontal: inset, minHeight: 64, borderRadius: 16, backgroundColor: t.panel, borderWidth: 1, borderColor: t.line }}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={headerA11y(lang, s, board, tt("strip.offline"))}
        accessibilityHint={expanded ? tt("strip.collapse") : tt("strip.expand")}
        accessibilityState={{ expanded }}
        aria-expanded={expanded}
        style={({ focused, pressed }: PressState) => [
          // The whole visible header is the touch box (>= 48; 62 inside the 1px border).
          { flexDirection: "row", gap: 12, alignItems: "center", minHeight: 62, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 15, opacity: pressed ? 0.8 : 1 },
          webCursor, focusRing(focused, t.accent),
        ]}
      >
        <SeasonOrbit size={40} variant="mini" />
        <HeaderLines board={board} season={season} />
        <View style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
          <Animated.View style={chevStyle}>
            <ChevronGlyph size={16} color={t.dim} dir="down" />
          </Animated.View>
        </View>
      </Pressable>

      <Animated.View
        style={[{ overflow: "hidden" }, hStyle]}
        aria-hidden={!expanded}
        importantForAccessibility={expanded ? "auto" : "no-hide-descendants"}
      >
        <View
          onLayout={(e: LayoutChangeEvent) => setContentH(Math.ceil(e.nativeEvent.layout.height))}
          style={{ position: "absolute", left: 0, right: 0, top: 0, paddingHorizontal: 12, paddingBottom: 10 }}
        >
          <View style={{ height: 1, backgroundColor: t.line }} />
          <Animated.View style={[{ paddingTop: 4 }, rowsStyle]}>
            {board.rows.length ? (
              board.rows.map((r) => <PriceRow key={r.key} row={r} coin={32} />)
            ) : board.status === "loading" ? (
              <View style={{ gap: 8, paddingVertical: 6 }}>
                {[0, 1, 2, 3].map((i) => <Skeleton key={i} height={36} color={t.raised} />)}
              </View>
            ) : (
              <Text style={{ color: t.dim, fontSize: 14, lineHeight: 20, marginTop: 8 }}>{tt("prices.none")}</Text>
            )}
            <FreshLine board={board} style={{ marginTop: 6 }} />
            <Text style={{ color: t.dim, fontSize: 14, lineHeight: 20, fontWeight: "500", marginTop: 8 }}>{s.next}</Text>
          </Animated.View>
        </View>
      </Animated.View>
    </View>
  );
}

/* ── tiles (medium) ── */
function Tiles({ board, season }: Props) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const s = useSeasonCopy(season);
  return (
    <View style={{ borderRadius: 16, backgroundColor: t.panel, borderWidth: 1, borderColor: t.line, padding: 14 }}>
      <View accessible accessibilityLabel={`${s.name}, ${s.desc}. ${s.next}`} {...groupRole} style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <SeasonOrbit size={40} variant="mini" />
        <View style={{ flex: 1 }} {...webHidden}>
          <SeasonLine name={s.name} desc={s.desc} />
          <Text style={{ color: t.dim, fontSize: 14, lineHeight: 20, fontWeight: "500", marginTop: 2 }}>{s.next}</Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
        {board.status === "loading"
          ? [0, 1, 2].map((i) => <Skeleton key={i} height={76} radius={14} width={"30%"} color={t.raised} style={{ flex: 1 }} />)
          : board.rows.length
            ? board.rows.slice(0, 3).map((r) => (
                <View key={r.key} accessible accessibilityLabel={rowA11y(lang, r)} {...groupRole} style={{ flex: 1, minHeight: 76, borderRadius: 14, backgroundColor: t.raised, padding: 10 }}>
                  <View {...webHidden}>
                    <Text numberOfLines={1} style={{ color: t.ink, fontSize: 14, lineHeight: 20, fontWeight: "700" }}>{cropName(lang, r.key)}</Text>
                    <Text style={{ color: t.ink, fontSize: 16, lineHeight: 22, fontFamily: "monospace", fontWeight: "700" }}>KES {r.best.price}/kg</Text>
                    <Delta d={r.best.delta} />
                  </View>
                </View>
              ))
            : (
              <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, minHeight: 48 }}>
                <SignalOffGlyph size={16} color={t.ink} />
                <Text style={{ flex: 1, color: t.dim, fontSize: 15, lineHeight: 22 }}>{tt("prices.none")}</Text>
              </View>
            )}
      </View>
      <FreshLine board={board} style={{ marginTop: 8 }} />
    </View>
  );
}

/* ── side (wide) ── */
function Side({ board, season, width, height }: Props) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const s = useSeasonCopy(season);
  const orbit = width >= 1280 && height >= 820 ? 260 : 220;
  const fresh = freshnessText(lang, board);
  // Capabilities show only when they fit fully below the season and prices
  // (panel padding 40 top + 40 bottom). Heights are measured, never guessed
  // from the window size alone, so a list is never cut at the fold.
  const [topH, setTopH] = useState(0);
  const [capsH, setCapsH] = useState(230);
  const showCaps = topH > 0 && topH + 80 + capsH <= height;
  return (
    <Animated.View entering={FadeIn.duration(240)} style={{ flexGrow: 1, justifyContent: "space-between" }}>
      <View onLayout={(e: LayoutChangeEvent) => setTopH(Math.ceil(e.nativeEvent.layout.height))}>
        {/* Logotype, not a heading: "Karibu" in the form pane is the only level-1 heading. */}
        <Wordmark size="panel" />

        <View style={{ marginTop: 36, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Eyebrow domain="season" icon={(c) => <LeafGlyph size={15} color={c} />} text={tt("season.eyebrow")} />
          <Text style={{ color: t.dim, fontSize: 12, fontFamily: "monospace" }}>
            {season.day} {monthName(lang, season.monthIndex)} {season.year}
          </Text>
        </View>
        <View style={{ marginTop: 16, alignSelf: "center" }}>
          <SeasonOrbit size={orbit} variant="full" />
        </View>
        <View style={{ marginTop: 14, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 20 }} accessible={false} importantForAccessibility="no-hide-descendants">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ width: 4, height: 12, borderRadius: 2, backgroundColor: t.ok }} />
            <Text style={{ color: t.dim, fontSize: 13 }}>{tt("legend.rain")}</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.dim }} />
            <Text style={{ color: t.dim, fontSize: 13 }}>{tt("legend.dry")}</Text>
          </View>
        </View>
        <Text style={{ marginTop: 12, alignSelf: "center", maxWidth: 300, textAlign: "center", color: t.ink, fontSize: 15, lineHeight: 22, fontWeight: "500" }}>
          {s.next}
        </Text>

        {/* Prices */}
        <View style={{ marginTop: 32 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Eyebrow domain="money" icon={(c) => <CoinGlyph size={15} color={c} />} text={tt("prices.eyebrow")} />
              {isDemoBoard(board) && <DemoTag />}
            </View>
            {!!fresh && <Text style={{ color: t.dim, fontSize: 12, fontFamily: "monospace" }}>{fresh}</Text>}
          </View>
          {board.status === "loading" ? (
            <View style={{ gap: 12, marginTop: 8 }}>
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} height={40} color={t.raised} />)}
            </View>
          ) : board.rows.length ? (
            board.rows.map((r) => <PriceRow key={r.key} row={r} coin={36} big />)
          ) : (
            <View style={{ minHeight: 120, borderRadius: 14, borderWidth: 2, borderColor: t.line, alignItems: "center", justifyContent: "center", padding: 16, marginTop: 8, gap: 10 }}>
              <SignalOffGlyph size={20} color={t.dim} />
              <Text style={{ color: t.dim, fontSize: 15, lineHeight: 22, textAlign: "center" }}>{tt("prices.none")}</Text>
            </View>
          )}
        </View>
      </View>

      {showCaps && (
        <View style={{ paddingTop: 32 }} onLayout={(e: LayoutChangeEvent) => setCapsH(Math.ceil(e.nativeEvent.layout.height))}>
          <Eyebrow domain="farm" icon={(c) => <SproutGlyph size={15} color={c} />} text={tt("caps.eyebrow")} />
          <View style={{ marginTop: 8 }}>
            {(["caps.1", "caps.2", "caps.3", "caps.4"] as const).map((k) => (
              <View key={k} style={{ minHeight: 40, flexDirection: "row", gap: 12, alignItems: "center" }}>
                <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: t.accent }} />
                <Text style={{ flex: 1, color: t.ink, fontSize: 15, lineHeight: 22, fontWeight: "600" }}>{tt(k)}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </Animated.View>
  );
}
