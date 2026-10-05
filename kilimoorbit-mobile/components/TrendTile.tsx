/**
 * Price trend as a stat tile: label · today's price · signed change vs last
 * week · a 14-day sparkline (de-emphasis line, today's point in the accent).
 * Drawn with Views (no SVG): 2px line segments, an 8px end dot with a 2px
 * surface ring. Touch, hover or arrow keys (web) read out any day; the
 * low/high line and the accessibility summary carry every number without it.
 */
import React, { useState } from "react";
import { View, Text, Pressable, type LayoutChangeEvent } from "react-native";
import { useTheme } from "../lib/theme-context";
import { useLang } from "../lib/session";
import { isWeb } from "../lib/ui";
import { dayMonth, longDay, todayKey } from "../lib/dates";
import { T } from "./Kit";

const H = 64;
const PAD = 6;

export default function TrendTile({
  label, prices, dates, changePct, a11yName, fmt = (v) => `KES ${v}/kg`, summary: summaryOverride, testID,
}: {
  label: string; prices: number[]; dates: string[]; changePct: number | null; a11yName: string;
  /** How a value reads (default: a price per kilo). */
  fmt?: (v: number) => string;
  /** Screen-reader summary, when the default price wording doesn't fit. */
  summary?: string;
  testID?: string;
}) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const [w, setW] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  const n = prices.length;
  // Nothing to draw: a trend needs two points (callers validate, this is the last line of defence).
  if (n < 2 || dates.length !== n) return null;
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const last = prices[n - 1];
  const x = (i: number) => PAD + (i * (w - PAD * 2)) / Math.max(1, n - 1);
  const y = (p: number) => (hi === lo ? H / 2 : PAD + (1 - (p - lo) / (hi - lo)) * (H - PAD * 2));

  const flat = changePct == null || Math.abs(changePct) < 1;
  const up = (changePct ?? 0) > 0;
  const week = changePct == null ? "" : flat ? tt("trend.flat") : tt("trend.week", { sign: up ? "▲ +" : "▼ −", n: Math.abs(changePct) });
  const summary = summaryOverride ?? tt("trend.a11y", { name: a11yName, first: prices[0], last, lo, hi, week: week.replace(/[▲▼]\s?/, "") });

  const shown = active ?? n - 1;
  const readout = active == null
    ? `${dayMonth(lang, dates[0])} – ${dates[n - 1] === todayKey() ? tt("common.today") : dayMonth(lang, dates[n - 1])}`
    : `${longDay(lang, dates[active])} · ${fmt(prices[active])}`;

  const keys = isWeb
    ? {
        onKeyDown: (e: any) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault?.();
          setActive((a) => Math.min(n - 1, Math.max(0, (a ?? n - 1) + (e.key === "ArrowRight" ? 1 : -1))));
        },
        onBlur: () => setActive(null),
      }
    : {};

  return (
    <View style={{ gap: 6 }} testID={testID}>
      <Text style={{ color: t.dim, ...T.meta, fontWeight: "700" }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <Text style={{ color: t.ink, fontSize: 24, lineHeight: 30, fontWeight: "800" }}>{fmt(prices[shown])}</Text>
        {week ? <Text style={{ color: flat ? t.dim : up ? t.ok : t.alert, fontSize: 13, lineHeight: 18, fontWeight: "800" }}>{week}</Text> : null}
      </View>

      <View
        onLayout={(e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width))}
        accessible
        accessibilityLabel={summary}
        focusable
        {...(isWeb ? ({ role: "img", tabIndex: 0 } as any) : null)}
        {...keys}
        style={{ height: H, marginTop: 4 }}
      >
        {w > 0 && (
          <>
            {/* baseline hairline: recessive */}
            <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 1, backgroundColor: t.line }} />
            {active != null && (
              <View style={{ position: "absolute", left: x(active), top: 0, bottom: 0, width: 1, backgroundColor: t.line }} />
            )}
            {prices.slice(1).map((p, i) => {
              const x1 = x(i), y1 = y(prices[i]), x2 = x(i + 1), y2 = y(p);
              const len = Math.hypot(x2 - x1, y2 - y1);
              return (
                <View
                  key={i}
                  style={{
                    position: "absolute", left: (x1 + x2) / 2 - len / 2, top: (y1 + y2) / 2 - 1, width: len, height: 2,
                    borderRadius: 1, backgroundColor: t.dim, transform: [{ rotate: `${Math.atan2(y2 - y1, x2 - x1)}rad` }],
                  }}
                />
              );
            })}
            {[shown].map((i) => (
              <View
                key="dot"
                style={{
                  position: "absolute", left: x(i) - 6, top: y(prices[i]) - 6, width: 12, height: 12, borderRadius: 6,
                  backgroundColor: i === n - 1 ? t.accent : t.ink, borderWidth: 2, borderColor: t.panel,
                }}
              />
            ))}
            {/* hit columns: wider than the line, one per day (pointer / touch only) */}
            <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, flexDirection: "row" }} {...(isWeb ? ({ "aria-hidden": true } as any) : null)}>
              {prices.map((_, i) => (
                <Pressable
                  key={i}
                  focusable={false}
                  {...(isWeb ? ({ tabIndex: -1 } as any) : null)}
                  onHoverIn={() => setActive(i)}
                  onHoverOut={() => setActive((a) => (a === i ? null : a))}
                  onPressIn={() => setActive(i)}
                  style={{ flex: 1 }}
                />
              ))}
            </View>
          </>
        )}
      </View>

      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
        <Text style={{ color: t.dim, fontSize: 12, lineHeight: 16 }} aria-live="polite">{readout}</Text>
        <Text style={{ color: t.dim, fontSize: 12, lineHeight: 16 }}>{tt("trend.range", { lo, hi })}</Text>
      </View>
    </View>
  );
}
