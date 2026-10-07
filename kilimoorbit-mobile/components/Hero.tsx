/**
 * The top of Today: the greeting on a deep-green block with the three numbers
 * a farmer checks first — the next rain, today's best price for their crop,
 * the tasks due this week — as a stats strip. The light theme uses the
 * brand's forest green; the dark themes their raised surface.
 */
import React from "react";
import { View } from "react-native";
import Text from "./Text";
import { useTheme } from "../lib/theme-context";
import { T, tint } from "./Kit";
import Icon, { type IconName } from "./Icon";

export type HeroStat = { label: string; value: string; icon: IconName };

export function TodayHero({ title, subtitle, stats }: { title: string; subtitle: string; stats: HeroStat[] }) {
  const t = useTheme();
  const light = t.key === "savanna";
  const bg = light ? "#00231A" : t.raised;
  const fg = light ? "#F3EFE3" : t.ink;
  const dim = light ? "rgba(243, 239, 227, 0.72)" : t.dim;
  const leaf = light ? "#9BD35A" : t.accent;
  return (
    <View style={{ borderRadius: 20, padding: 18, backgroundColor: bg, gap: 14, overflow: "hidden" }} testID="today-hero">
      <View style={{ position: "absolute", right: -70, top: -70, width: 200, height: 200, borderRadius: 100, backgroundColor: light ? "rgba(90, 138, 0, 0.32)" : tint(t.accent, 0.1) }} />
      <View style={{ position: "absolute", right: 30, top: 40, width: 90, height: 90, borderRadius: 45, backgroundColor: light ? "rgba(155, 211, 90, 0.16)" : tint(t.accent, 0.06) }} />
      <View style={{ gap: 2 }}>
        <Text accessibilityRole="header" style={{ color: fg, ...T.display }}>{title}</Text>
        <Text style={{ color: dim, ...T.body }}>{subtitle}</Text>
      </View>
      {stats.length > 0 && (
        <View style={{ flexDirection: "row", gap: 8 }} testID="hero-stats">
          {stats.map((s) => (
            <View key={s.label} style={{ flex: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 10, backgroundColor: light ? "rgba(255, 255, 255, 0.08)" : tint(t.ink, 0.06), gap: 4 }}>
              <Icon name={s.icon} size={16} color={leaf} />
              <Text numberOfLines={2} style={{ color: fg, fontSize: 15, lineHeight: 19, fontWeight: "800", marginTop: 2 }}>{s.value}</Text>
              <Text numberOfLines={2} style={{ color: dim, fontSize: 10.5, lineHeight: 13, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" }}>{s.label}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
