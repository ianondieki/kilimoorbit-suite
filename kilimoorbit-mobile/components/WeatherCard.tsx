/**
 * Today's weather for the farmer's county: the sky as a photograph with the
 * big numbers on it, three stat tiles, a 7-day strip of weather pictograms
 * and the three farming windows in plain words ("Not today (rain expected).
 * Next good day: Thursday"). Sample forecasts carry the DEMO / MAJARIBIO tag.
 */
import React from "react";
import { View } from "react-native";
import Text from "./Text";
import { useTheme } from "../lib/theme-context";
import { useLang } from "../lib/session";
import { isWeb } from "../lib/ui";
import { ageText } from "../lib/prices";
import { weekday, weekdayShort, todayKey, addDays } from "../lib/dates";
import type { Forecast, WxDay } from "../lib/api";
import type { WeatherState } from "../lib/weather";
import type { Key, Lang, Vars } from "../lib/i18n";
import { Btn, Card, Eyebrow, T } from "./Kit";
import { DemoTag } from "./ShambaPanel";
import { Skeleton } from "./Motion";
import { CheckCoin, ChevronGlyph, CrossGlyph, SignalOffGlyph } from "./Glyphs";
import SkyScene from "./SkyScene";
import { WxPic } from "./Pic";
import { daypart, wxPicName, type WxPicName } from "../lib/sky";

export type Win = "spray" | "plant" | "dry";

export default function WeatherCard({
  wx, county, countySet, onChooseCounty,
}: { wx: WeatherState; county: string; countySet: boolean; onChooseCounty: () => void }) {
  const t = useTheme();
  const { t: tt } = useLang();
  const f = wx.data;

  return (
    <Card>
      <Eyebrow domain="weather"
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
  const hour = new Date().getHours();
  const part = daypart(hour);
  const skyWord = part === "night" && d0.sky === "sunny" ? tt("wx.clearNight") : sky(d0);

  return (
    <View style={{ gap: 14 }}>
      {/* The sky as it is today, with the big numbers on it. */}
      <View
        accessible
        accessibilityLabel={tt("wx.dayA11y", { day: tt("common.today"), sky: sky(d0), tmax: d0.tmax, tmin: d0.tmin, p: d0.rain_chance })}
        style={{ borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: t.line }}
        testID="wx-hero"
      >
        <SkyScene sky={d0.sky} hour={hour} height={196} />
        <View style={{ position: "absolute", left: 16, top: 14, right: 96 }}>
          <Text style={{ color: "#FFFFFF", fontSize: 58, lineHeight: 62, fontWeight: "800", fontFamily: "monospace", letterSpacing: -2.5 }}>{d0.tmax}°</Text>
          <Text display numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ color: "#FFFFFF", fontSize: 23, lineHeight: 29 }}>{skyWord}</Text>
          <Text style={{ color: "rgba(255,255,255,0.88)", ...T.meta, fontWeight: "700", fontFamily: "monospace", marginTop: 3 }}>{tt("wx.low", { n: d0.tmin })}</Text>
        </View>
        <View style={{ position: "absolute", right: 10, top: 8 }}>
          <WxPic name={wxPicName(d0.sky, part)} size={84} />
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 8 }}>
        <Stat pic="thermometer" label={tt("wx.lowLabel")} value={`${d0.tmin}°`} color={t.ink} testID="wx-stat-low" />
        <Stat pic="raindrops" label={tt("wx.rainLabel")} value={`${d0.rain_chance}%`} color={d0.rain_chance >= 50 ? t.water : t.ink} testID="wx-stat-rain" />
        <Stat pic="wind" label={tt("wx.windLabel")} value={`${d0.wind_kmh} km/h`} color={d0.wind_kmh >= 25 ? t.accent : t.ink} testID="wx-stat-wind" />
      </View>

      {cachedAgeMin != null ? (
        <Text style={{ color: t.dim, ...T.meta, marginTop: -6 }}>{tt("wx.cached", { age: ageText(lang, cachedAgeMin) })}</Text>
      ) : f.source === "OPEN_METEO" ? (
        <Text style={{ color: t.dim, ...T.meta, marginTop: -6 }} testID="wx-live">{tt("wx.live")}</Text>
      ) : null}

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
              <Text style={{ color: isToday ? t.accent : t.dim, fontSize: 11.5, lineHeight: 15, fontWeight: "700", fontFamily: "monospace", letterSpacing: 0.4 }} numberOfLines={1}>{name}</Text>
              <WxPic name={wxPicName(d.sky)} size={36} style={{ marginVertical: -3 }} />
              <Text style={{ color: t.ink, fontSize: 14.5, lineHeight: 18, fontWeight: "700", fontFamily: "monospace" }}>{d.tmax}°</Text>
              <Text style={{ color: d.rain_chance >= 50 ? t.water : t.dim, fontSize: 11.5, lineHeight: 15, fontWeight: "700", fontFamily: "monospace" }}>{d.rain_chance}%</Text>
            </View>
          );
        })}
      </View>

      <View style={{ gap: 10 }}>
        <Text accessibilityRole="header" aria-level={3} style={{ color: t.dim, ...T.eyebrow, fontSize: 11 }}>
          {tt("win.eyebrow")}
        </Text>
        {(["spray", "plant", "dry"] as Win[]).map((w) => (
          <WindowRow key={w} kind={w} days={f.days} />
        ))}
      </View>
    </View>
  );
}

/** A small tile: pictogram, value, label. */
function Stat({ pic, label, value, color, testID }: { pic: WxPicName; label: string; value: string; color: string; testID?: string }) {
  const t = useTheme();
  return (
    <View testID={testID} style={{ flex: 1, backgroundColor: t.raised, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 10, gap: 2 }}>
      <WxPic name={pic} size={30} style={{ marginLeft: -5, marginTop: -4 }} />
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ color, ...T.figure, fontSize: 17, lineHeight: 21 }}>{value}</Text>
      <Text numberOfLines={1} style={{ color: t.dim, fontSize: 11, lineHeight: 14, fontWeight: "700", fontFamily: "monospace", letterSpacing: 0.6, textTransform: "uppercase" }}>{label}</Text>
    </View>
  );
}

/** The plain-language verdict for one window, shared with Today's spoken summary. */
export function windowText(kind: Win, days: WxDay[], lang: Lang, tt: (k: Key, v?: Vars) => string): string {
  const v = days[0][kind];
  if (v.ok) return kind === "plant" ? tt("win.plantToday", { mm: Math.round(v.rain_3d_mm ?? 0) }) : tt("win.today");
  const why = tt(`win.why.${v.reason === "wind" ? "wind" : v.reason === "dry" ? "dry" : "rain"}` as Key);
  const next = days.slice(1).find((d) => d[kind].ok);
  const tomorrow = addDays(days[0].date, 1);
  return next
    ? tt("win.next", { why, day: next.date === tomorrow ? tt("common.tomorrow") : weekday(lang, next.date) })
    : tt("win.none", { why });
}

function WindowRow({ kind, days }: { kind: Win; days: WxDay[] }) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const v = days[0][kind];
  const text = windowText(kind, days, lang, tt);
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
