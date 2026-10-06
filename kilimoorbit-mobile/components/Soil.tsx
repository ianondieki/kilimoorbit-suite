/**
 * Soil and inputs, inside the crop input calculator: lime for acid soils
 * (from the farm's soil-test pH, lib/soil.ts), and how to avoid fake seed
 * and get subsidised fertiliser in Kenya. Plus the pH field of the farm
 * profile.
 */
import React from "react";
import { View } from "react-native";
import Text from "./Text";
import { useTheme } from "../lib/theme-context";
import { useLang } from "../lib/session";
import { limeAdvice, phBand } from "../lib/soil";
import type { CropKey } from "../lib/agronomy";
import type { Key } from "../lib/i18n";
import { Chip, ChipRow, Group, Stepper, T } from "./Kit";

/** The lime row of an input list: amount for the plot, when, and the cheaper microdose. */
export function LimeLine({ crop, acres, ph, planted }: { crop: CropKey; acres: number; ph: number | null; planted?: boolean }) {
  const t = useTheme();
  const { t: tt } = useLang();
  const a = limeAdvice(ph, crop, acres);
  if (a.kind === "unknown")
    return <Text style={{ color: t.dim, fontSize: 12.5, lineHeight: 17 }} testID="lime-unknown">{tt("soil.unknown")}</Text>;
  if (a.kind === "none")
    return <Text style={{ color: t.dim, fontSize: 12.5, lineHeight: 17 }} testID="lime-none">{tt(crop === "potatoes" && a.ph < 5.5 ? "soil.okPotato" : "soil.ok", { ph: a.ph })}</Text>;
  return (
    <View style={{ flexDirection: "row", gap: 12 }} testID="lime-line">
      <Text style={{ width: 84, color: t.dim, fontSize: 14, lineHeight: 20, fontWeight: "700" }}>{tt("soil.lime")}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.ink, fontSize: 15, lineHeight: 20, fontWeight: "700" }}>
          {tt("soil.limeAmount", { kg: a.kg.toLocaleString("en-KE"), bags: a.bags })}
        </Text>
        <Text style={{ color: t.dim, ...T.meta }}>
          {tt(planted ? "soil.limeNext" : "soil.limeWhen", { ph: a.ph })} {tt("soil.micro", { kg: a.microKg })}
        </Text>
      </View>
    </View>
  );
}

/** Kenya: KEPHIS scratch-and-SMS seed check, and the KIAMIS fertiliser subsidy. */
export function GenuineNote() {
  const t = useTheme();
  const { t: tt } = useLang();
  return (
    <View style={{ gap: 4, borderTopWidth: 1, borderTopColor: t.line, paddingTop: 8 }} testID="genuine-note">
      <Text style={{ color: t.ink, fontSize: 12.5, lineHeight: 17, fontWeight: "700" }}>{tt("inputs.genuine")}</Text>
      <Text style={{ color: t.dim, fontSize: 12.5, lineHeight: 17 }}>{tt("inputs.subsidy")}</Text>
    </View>
  );
}

/** Farm profile: soil pH from a soil test, or "not tested". */
export function SoilPhField({ ph, onChange }: { ph: number | null; onChange: (ph: number | null) => void }) {
  const t = useTheme();
  const { t: tt } = useLang();
  return (
    <Group label={tt("soil.label")}>
      <ChipRow role="radiogroup" label={tt("soil.label")}>
        <Chip role="radio" selected={ph == null} onPress={() => onChange(null)} label={tt("soil.notTested")} testID="ph-none" />
        <Chip role="radio" selected={ph != null} onPress={() => onChange(ph ?? 5.5)} label={tt("soil.tested")} testID="ph-set" />
      </ChipRow>
      {ph != null ? (
        <>
          <Stepper value={ph} onChange={(v) => onChange(Math.round(v * 10) / 10)} step={0.1} min={3.5} max={8.5} format={(v) => v.toFixed(1)} label={tt("soil.label")} />
          <Text style={{ color: t.ink, ...T.meta, fontWeight: "700" }} testID="ph-band">{tt(`soil.band.${phBand(ph)}` as Key)}</Text>
        </>
      ) : (
        <Text style={{ color: t.dim, ...T.meta }}>{tt("soil.howTest")}</Text>
      )}
    </Group>
  );
}
