/**
 * Farm news on Today: the county's headlines first, then national, one story
 * per page with its photo when the feed carries one; the slider turns by
 * itself every few seconds until the farmer touches it. A story opens in the
 * browser; a SAMPLE tip (server with no internet) opens the app screen it is
 * about. Data: lib/news.ts.
 */
import React, { useState } from "react";
import { Image, View } from "react-native";
import Text from "./Text";
import { router } from "expo-router";
import { useTheme } from "../lib/theme-context";
import { useLang } from "../lib/session";
import { announce, webLang } from "../lib/ui";
import { ageText } from "../lib/prices";
import { minutesSince, openLink, useNews } from "../lib/news";
import { shareText } from "../lib/report";
import type { NewsItem } from "../lib/api";
import { Btn, Card, Eyebrow, T, Tag } from "./Kit";
import { DemoTag } from "./ShambaPanel";
import { Skeleton } from "./Motion";
import { ArrowGlyph, SignalOffGlyph, ShareGlyph } from "./Glyphs";
import Pager from "./Pager";

/** Stories turn every 8 s (the shows every 9, so the two sliders never move in step). */
export const NEWS_AUTOPLAY_MS = 8000;

export function NewsCard({ county }: { county: string | null }) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const news = useNews(county);
  const d = news.data;
  const name = (d?.county ?? county ?? "").toUpperCase();
  return (
    <Card>
      <Eyebrow domain="news" text={name ? tt("news.eyebrow", { county: name }) : tt("news.eyebrowAll")} right={d?.source === "SAMPLE" ? <DemoTag /> : null} />
      {news.status === "loading" && !d ? (
        <View style={{ gap: 10 }}>
          <Skeleton height={14} width={"40%"} color={t.raised} />
          <Skeleton height={44} color={t.raised} radius={10} />
          <Skeleton height={14} width={"80%"} color={t.raised} />
        </View>
      ) : !d ? (
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <SignalOffGlyph size={20} color={t.dim} />
          <Text style={{ flex: 1, color: t.dim, ...T.body }}>{tt("news.none")}</Text>
        </View>
      ) : (
        <View testID="news-card">
          {news.status === "cached" && news.cachedAgeMin != null && (
            <Text style={{ color: t.dim, ...T.meta, marginTop: -6, marginBottom: 8 }}>{tt("news.cached", { age: ageText(lang, news.cachedAgeMin) })}</Text>
          )}
          <Pager items={d.items} keyOf={(i) => i.id} label={tt("news.eyebrowAll")} testID="news" autoplay={NEWS_AUTOPLAY_MS} render={(item) => <Story item={item} />} />
          {d.source === "SAMPLE" && <Text style={{ color: t.dim, fontSize: 12.5, lineHeight: 17, marginTop: 8 }}>{tt("news.sampleNote")}</Text>}
        </View>
      )}
    </Card>
  );
}

function Story({ item }: { item: NewsItem }) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  // A photo that fails to load (an expired link, a feed on a slow day) simply leaves.
  const [photoOk, setPhotoOk] = useState(true);
  // "Share": the phone's share sheet (WhatsApp, SMS…); on the web the link is copied instead.
  const [shared, setShared] = useState<null | "copied" | "failed">(null);
  const mins = minutesSince(item.published);
  const when = mins == null ? "" : mins >= 2880 ? tt("news.daysAgo", { n: Math.round(mins / 1440) }) : ageText(lang, mins);
  const title = lang === "sw" && item.title_sw ? item.title_sw : item.title;
  const open = async () => {
    if (item.link) {
      if (!(await openLink(item.link))) announce(tt("news.openFail"));
    } else if (item.route) {
      router.navigate(item.route as any);
    }
  };
  return (
    <View style={{ gap: 6, paddingRight: 2 }}>
      {item.image && photoOk ? (
        <Image
          source={{ uri: item.image }}
          resizeMode="cover"
          onError={() => setPhotoOk(false)}
          accessible={false}
          style={{ width: "100%", height: 150, borderRadius: 14, marginBottom: 4, backgroundColor: t.raised }}
          testID={`news-photo-${item.id}`}
        />
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Text style={{ color: t.dim, ...T.meta, fontWeight: "700", fontFamily: "monospace" }} {...webLang("en")}>{[item.source, when].filter(Boolean).join(" · ")}</Text>
        {item.scope === "county" && item.county ? <Tag tone="water" label={item.county} /> : null}
      </View>
      <Text {...(item.title_sw && lang === "sw" ? {} : webLang("en"))} style={{ color: t.ink, ...T.headline }} numberOfLines={3}>{title}</Text>
      {item.summary ? <Text {...webLang("en")} style={{ color: t.ink, ...T.meta }} numberOfLines={3}>{item.summary}</Text> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 14, marginTop: 2 }}>
        <Btn
          kind="ghost"
          small
          label={tt(item.link ? "news.read" : "news.openTip")}
          onPress={open}
          icon={(c) => <ArrowGlyph size={14} color={c} />}
          style={{ flexDirection: "row-reverse", alignSelf: "flex-start" }}
          testID={`news-open-${item.id}`}
        />
        {item.link ? (
          <Btn
            kind="ghost"
            small
            label={shared === "copied" ? tt("news.copied") : shared === "failed" ? tt("rec.shareFail") : tt("news.share")}
            onPress={async () => {
              const r = await shareText(`${title}\n${item.link}`);
              if (r !== "shared") { setShared(r); announce(tt(r === "copied" ? "news.copied" : "rec.shareFail")); setTimeout(() => setShared(null), 2500); }
            }}
            icon={(c) => <ShareGlyph size={14} color={c} />}
            style={{ alignSelf: "flex-start" }}
            testID={`news-share-${item.id}`}
          />
        ) : null}
      </View>
    </View>
  );
}
