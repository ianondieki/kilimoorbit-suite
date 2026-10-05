/**
 * Today's weather for the farmer's county: a big "now" row, a 7-day strip and
 * the three farming windows in plain words ("Not today (rain expected). Next
 * good day: Thursday"). Sample forecasts carry the DEMO / MAJARIBIO tag.
 */
import React from "react";
import { View, Text } from "react-native";
import { useTheme } from "../lib/theme-context";
import { useLang } from "../lib/session";
import { isWeb } from "../lib/ui";
import { ageText } from "../lib/prices";
import { weekday, weekdayShort, todayKey, addDays } from "../lib/dates";
import type { Forecast, WxDay } from "../lib/api";
import type { WeatherState } from "../lib/weather";
import type { Key } from "../lib/i18n";
import { Btn, Card, Eyebrow, T } from "./Kit";
import { DemoTag } from "./ShambaPanel";
import { Skeleton } from "./Motion";
import { CheckCoin, ChevronGlyph, CrossGlyph, SignalOffGlyph, WeatherGlyph } from "./Glyphs";

type Win = "spray" | "plant" | "dry";

export default function WeatherCard({
  wx, county, countySet, onChooseCounty,
}: { wx: WeatherState; county: string; countySet: boolean; onChooseCounty: () => void }) {
  const t = useTheme();
  const { t: tt } = useLang();
  const f = wx.data;

  return (
    <Card>
      <Eyebrow
        text={tt("wx.eyebrow", { county: county.toUpperCase() })}
        right={f?.source === "SAMPLE" ? <DemoTag /> : null}
      />

      {!countySet && (
        <View style={{ marginTop: -6, marginBottom: 6 }}>
          <Text style={{ color: t.dim, ...T.meta }}>{tt("wx.setCounty")}</Text>
          <Btn
            kind="ghost"
            small
            label={tt("wx.chooseCounty")}
            onPress={onChooseCounty}
            icon={(c) => <ChevronGlyph size={11} color={c} dir="right" />}
            style={{ flexDirection: "row-reverse", alignSelf: "flex-start", minHeight: 40 }}
            testID="choose-county"
          />
        </View>
      )}

      {wx.status === "loading" && !f ? (
        <View style={{ gap: 12 }}>
          <Skeleton height={56} width={"70%"} color={t.raised} radius={12} />
          <Skeleton height={64} color={t.raised} radius={12} />
          <Skeleton height={14} width={"85%"} color={t.raised} />
        </View>
      ) : !f ? (
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center", paddingVertical: 8 }}>
          <SignalOffGlyph size={20} color={t.dim} />
          <Text style={{ flex: 1, color: t.dim, ...T.body }}>{tt("wx.none")}</Text>
        </View>
      ) : (
        <Body f={f} cachedAgeMin={wx.status === "cached" ? wx.cachedAgeMin : undefined} />
      )}
    </Card>
  );
}

function Body({ f, cachedAgeMin }: { f: Forecast; cachedAgeMin?: number }) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const d0 = f.days[0];
  const today = todayKey();
  const sky = (d: WxDay) => tt(`wx.sky.${d.sky}` as Key);

  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <WeatherGlyph sky={d0.sky} size={56} sun={t.accent} cloud={t.dim} water={t.water} alert={t.alert} />
        <Text style={{ color: t.ink, fontSize: 40, lineHeight: 46, fontWeight: "800" }}>{d0.tmax}°</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.ink, ...T.title }}>{sky(d0)}</Text>
          <Text style={{ color: t.dim, ...T.meta }}>
            {[tt("wx.low", { n: d0.tmin }), tt("wx.rain", { p: d0.rain_chance }), tt("wx.wind", { n: d0.wind_kmh })].join(" · ")}
          </Text>
        </View>
      </View>

      {cachedAgeMin != null && (
        <Text style={{ color: t.dim, ...T.meta, marginTop: -6 }}>{tt("wx.cached", { age: ageText(lang, cachedAgeMin) })}</Text>
      )}

      {/* 7-day strip: each day is one labelled group for screen readers. */}
      <View style={{ flexDirection: "row", borderTopWidth: 1, borderBottomWidth: 1, borderColor: t.line, paddingVertical: 10 }}>
        {f.days.slice(0, 7).map((d) => {
          const isToday = d.date === today;
          const name = isToday ? tt("common.today") : weekdayShort(lang, d.date);
          return (
            <View
              key={d.date}
              accessible
              accessibilityLabel={tt("wx.dayA11y", { day: isToday ? tt("common.today") : weekday(lang, d.date), sky: sky(d), tmax: d.tmax, tmin: d.tmin, p: d.rain_chance })}
              {...(isWeb ? ({ role: "img" } as any) : null)}
              style={{ flex: 1, alignItems: "center", gap: 4 }}
            >
              <Text style={{ color: isToday ? t.accent : t.dim, fontSize: 12, lineHeight: 16, fontWeight: "800" }} numberOfLines={1}>{name}</Text>
              <WeatherGlyph sky={d.sky} size={26} sun={t.accent} cloud={t.dim} water={t.water} alert={t.alert} />
              <Text style={{ color: t.ink, fontSize: 14, lineHeight: 18, fontWeight: "700" }}>{d.tmax}°</Text>
              <Text style={{ color: d.rain_chance >= 50 ? t.water : t.dim, fontSize: 11.5, lineHeight: 15, fontWeight: "700" }}>{d.rain_chance}%</Text>
            </View>
          );
        })}
      </View>

      <View style={{ gap: 10 }}>
        <Text accessibilityRole="header" aria-level={3} style={{ color: t.dim, fontSize: 11, lineHeight: 14, fontFamily: "monospace", fontWeight: "700", letterSpacing: 1.6 }}>
          {tt("win.eyebrow")}
        </Text>
        {(["spray", "plant", "dry"] as Win[]).map((w) => (
          <WindowRow key={w} kind={w} days={f.days} />
        ))}
      </View>
    </View>
  );
}

function WindowRow({ kind, days }: { kind: Win; days: WxDay[] }) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const v = days[0][kind];
  let text: string;
  if (v.ok) {
    text = kind === "plant" ? tt("win.plantToday", { mm: Math.round(v.rain_3d_mm ?? 0) }) : tt("win.today");
  } else {
    const why = tt(`win.why.${v.reason === "wind" ? "wind" : v.reason === "dry" ? "dry" : "rain"}` as Key);
    const next = days.slice(1).find((d) => d[kind].ok);
    const tomorrow = addDays(days[0].date, 1);
    text = next
      ? tt("win.next", { why, day: next.date === tomorrow ? tt("common.tomorrow") : weekday(lang, next.date) })
      : tt("win.none", { why });
  }
  const label = tt(`win.${kind}` as Key);
  return (
    <View accessible accessibilityLabel={`${label}: ${text}`} style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
      {v.ok ? (
        <CheckCoin size={24} bg={t.ok} fg={t.field} style={{ marginTop: 1 }} />
      ) : (
        <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: t.dim, alignItems: "center", justifyContent: "center", marginTop: 1 }}>
          <CrossGlyph size={11} color={t.dim} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.ink, fontSize: 15, lineHeight: 20, fontWeight: "700" }}>{label}</Text>
        <Text style={{ color: v.ok ? t.ink : t.dim, ...T.meta }}>{text}</Text>
      </View>
    </View>
  );
}
