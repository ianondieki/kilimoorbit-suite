/**
 * Farm news on Today: the county's headlines first, then national, a row of
 * story cards that turns by itself (the next story peeks at the edge) and
 * holds still under the farmer's finger, pointer or keyboard. A story opens in
 * the browser; a SAMPLE tip (server with no internet) opens the app screen it
 * is about. Data: lib/news.ts.
 */
import React from "react";
import { View } from "react-native";
import Text from "./Text";
import { router } from "expo-router";
import { useTheme } from "../lib/theme-context";
import { useLang } from "../lib/session";
import { announce, webLang } from "../lib/ui";
import { ageText } from "../lib/prices";
import { minutesSince, openLink, useNews } from "../lib/news";
import type { NewsItem } from "../lib/api";
import { Btn, Card, Eyebrow, S, T, Tag } from "./Kit";
import { DemoTag } from "./ShambaPanel";
import { Skeleton } from "./Motion";
import { ArrowGlyph, SignalOffGlyph, NewsGlyph } from "./Glyphs";
import Pager from "./Pager";

/** How long a story stays before the next one comes in. */
export const NEWS_TURN = 6500;

/** `peek`: how much of the next story shows; 0 where the row sits beside another (wide Today). */
export function NewsCard({ county, peek = S.x3 }: { county: string | null; peek?: number }) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const news = useNews(county);
  const d = news.data;
  const name = (d?.county ?? county ?? "").toUpperCase();
  return (
    <View testID="news-block">
      <Eyebrow domain="news" icon={(c) => <NewsGlyph size={15} color={c} />} text={name ? tt("news.eyebrow", { county: name }) : tt("news.eyebrowAll")} right={d?.source === "SAMPLE" ? <DemoTag /> : null} />
      {news.status === "loading" && !d ? (
        <Card domain="news">
          <View style={{ gap: S.md }}>
            <Skeleton height={14} width={"40%"} color={t.raised} />
            <Skeleton height={44} color={t.raised} radius={10} />
            <Skeleton height={14} width={"80%"} color={t.raised} />
          </View>
        </Card>
      ) : !d ? (
        <Card domain="news">
          <View style={{ flexDirection: "row", gap: S.md, alignItems: "center" }}>
            <SignalOffGlyph size={20} color={t.dim} />
            <Text style={{ flex: 1, color: t.dim, ...T.body }}>{tt("news.none")}</Text>
          </View>
        </Card>
      ) : (
        <View testID="news-card">
          {news.status === "cached" && news.cachedAgeMin != null && (
            <Text style={{ color: t.dim, ...T.meta, marginTop: -S.sm, marginBottom: S.md }}>{tt("news.cached", { age: ageText(lang, news.cachedAgeMin) })}</Text>
          )}
          <Pager
            items={d.items}
            keyOf={(i) => i.id}
            label={tt("news.a11y")}
            testID="news"
            autoplay={NEWS_TURN}
            peek={peek}
            render={(item) => <Story item={item} />}
          />
          {d.source === "SAMPLE" && <Text style={{ color: t.dim, ...T.meta, marginTop: S.xs }}>{tt("news.sampleNote")}</Text>}
        </View>
      )}
    </View>
  );
}

function Story({ item }: { item: NewsItem }) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
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
    <Card domain="news" style={{ flex: 1 }}>
      <View style={{ flex: 1, gap: S.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm, flexWrap: "wrap", minHeight: 24 }}>
          <Text style={{ color: t.dim, ...T.meta, fontWeight: "700" }} {...webLang("en")}>{[item.source, when].filter(Boolean).join(" · ")}</Text>
          {item.scope === "county" && item.county ? <Tag tone="water" label={item.county} /> : null}
        </View>
        <Text {...(item.title_sw && lang === "sw" ? {} : webLang("en"))} style={{ color: t.ink, ...T.headline }} numberOfLines={3}>{title}</Text>
        {item.summary ? <Text {...webLang("en")} style={{ color: t.dim, ...T.body }} numberOfLines={3}>{item.summary}</Text> : null}
        <Btn
          kind="ghost"
          small
          label={tt(item.link ? "news.read" : "news.openTip")}
          onPress={open}
          icon={(c) => <ArrowGlyph size={14} color={c} />}
          style={{ flexDirection: "row-reverse", alignSelf: "flex-start", marginTop: "auto", paddingTop: S.sm }}
          testID={`news-open-${item.id}`}
        />
      </View>
    </Card>
  );
}
