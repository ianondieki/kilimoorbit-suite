/**
 * "Imani ya leo" (today's belief) on Today: one Kiswahili proverb a day with
 * its meaning and what it says on the farm today (lib/proverbs.ts). A quiet
 * card in the serif voice, the same for everyone on the same date.
 */
import React from "react";
import { View } from "react-native";
import Text from "./Text";
import { useTheme } from "../lib/theme-context";
import { useLang } from "../lib/session";
import { todayKey } from "../lib/dates";
import { proverbFor } from "../lib/proverbs";
import { Card, Eyebrow, T, domainColor, tint } from "./Kit";
import { webLang } from "../lib/ui";

export function BeliefCard() {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const p = proverbFor(todayKey());
  const c = domainColor(t, "belief");
  return (
    <Card style={{ borderColor: tint(c, 0.45) }}>
      <Eyebrow domain="belief" text={tt("belief.eyebrow")} />
      <View style={{ gap: 8 }} testID="belief-card">
        <Text {...webLang("sw")} style={{ color: t.ink, ...T.display, fontSize: 22, lineHeight: 29 }} testID="belief-proverb">
          “{p.sw}”
        </Text>
        <Text style={{ color: t.dim, ...T.body }}>{p.meaning[lang]}</Text>
        <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start", marginTop: 2, paddingLeft: 12, borderLeftWidth: 3, borderLeftColor: c }}>
          <Text style={{ flex: 1, color: t.ink, ...T.body, fontWeight: "600" }}>
            <Text style={{ color: c, ...T.meta, fontWeight: "800", fontFamily: "monospace" }}>{tt("belief.farm")} </Text>
            {p.farm[lang]}
          </Text>
        </View>
      </View>
    </Card>
  );
}
