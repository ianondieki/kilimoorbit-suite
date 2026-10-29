/**
 * The top of Today, the photo almanac hero: a turning sequence of Kenyan farm
 * photographs under the forest scrim, the greeting in large Fraunces with the
 * farmer's name in gold italic, and the three numbers a farmer checks first
 * (the next rain, today's best price for their crop, the tasks due this week)
 * as a ledger line under a maize-gold rule. The same hero serves every theme.
 */
import React from "react";
import { View, useWindowDimensions } from "react-native";
import Text from "./Text";
import { T, S } from "./Kit";
import Icon, { type IconName } from "./Icon";
import { DISPLAY } from "../lib/typography";
import { PHOTO_SETS } from "../lib/photos";
import { PhotoHero, HERO_DIM, HERO_GOLD, HERO_INK } from "./PhotoHero";

export type HeroStat = { label: string; value: string; icon: IconName };

const RULE = "rgba(255, 255, 255, 0.18)";

export function TodayHero({ title, name, subtitle, stats }: { title: string; name?: string; subtitle: string; stats: HeroStat[] }) {
  const { width } = useWindowDimensions();
  const wide = width >= 600;
  return (
    <PhotoHero
      photo={PHOTO_SETS.today[0]} photos={PHOTO_SETS.today}
      title={name ? `${title},` : title} titleAccent={name} subtitle={subtitle}
      height={wide ? 340 : 300} testID="today-hero"
    >
      {/* A ledger line: the numbers in ruled columns under a gold rule, no boxes. */}
      {stats.length > 0 && (
        // Capped so one or two numbers still read as a ledger line, not a lonely cell under a long rule.
        <View style={{ flexDirection: "row", maxWidth: 200 * Math.max(stats.length, 2), borderTopWidth: 2, borderTopColor: HERO_GOLD, paddingTop: S.md }} testID="hero-stats">
          {stats.map((s, i) => (
            <View
              key={s.label}
              style={{ flex: 1, minWidth: 0, gap: S.xs, paddingLeft: i ? S.md : 0, paddingRight: S.md, borderLeftWidth: i ? 1 : 0, borderLeftColor: RULE }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Icon name={s.icon} size={16} color={HERO_GOLD} />
                <Text numberOfLines={2} style={{ flexShrink: 1, color: HERO_DIM, ...T.label }}>{s.label}</Text>
              </View>
              <Text numberOfLines={2} style={{ color: HERO_INK, fontFamily: DISPLAY["600"], fontSize: 22, lineHeight: 26, letterSpacing: -0.2, fontVariant: ["tabular-nums"] }}>
                {s.value}
              </Text>
            </View>
          ))}
        </View>
      )}
    </PhotoHero>
  );
}
