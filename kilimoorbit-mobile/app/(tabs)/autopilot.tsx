import React, { useState } from "react";
import { View, ScrollView, StyleSheet } from "react-native";
import Text from "../../components/Text";
import { webLang } from "../../lib/ui";
import { SafeAreaView } from "react-native-safe-area-context";
import Header from "../../components/Header";
import { useLang } from "../../lib/session";
import Pill from "../../components/Pill";
import { Enter, PressScale, Skeleton } from "../../components/Motion";
import { Bounded } from "../../components/Bounded";
import { useTheme } from "../../lib/theme-context";
import { runAutopilot, type AutopilotStep } from "../../lib/api";
import { PhotoHero } from "../../components/PhotoHero";
import { PHOTO_SETS } from "../../lib/photos";
import { B, Btn, Card, Notice, R, S, T, TOUCH, surfaceAttr, useSpace } from "../../components/Kit";

export default function Autopilot() {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const [steps, setSteps] = useState<AutopilotStep[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const sp = useSpace();

  const engage = async () => {
    setBusy(true); setErr(null); setSteps(null);
    try {
      const res = await runAutopilot();
      setSteps(res.steps);
    } catch {
      setErr(tt("auto.failed"));
    } finally {
      setBusy(false);
    }
  };

  const brief = steps?.find((s) => s.agent === "MISSION-BRIEF")?.output;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]} {...webLang(lang)}>
      <Header
        title={tt("nav.autopilot")}
        right={
          <PressScale
            onPress={engage}
            disabled={busy}
            accessibilityLabel={busy ? `Autopilot: ${tt("auto.running")}` : `${tt("auto.engage")} autopilot`}
            accessibilityState={{ busy, disabled: busy }}
            focusColor={t.accent}
            style={[s.engage, { backgroundColor: t.accent, opacity: busy ? 0.6 : 1 }]}
          >
            <Text maxFontSizeMultiplier={1.3} style={{ color: t.field, fontSize: 15, lineHeight: 20, fontWeight: "800" }}>
              {busy ? tt("auto.running") : tt("auto.engage")}
            </Text>
          </PressScale>
        }
      />
      <ScrollView contentContainerStyle={s.scroll}>
        <Bounded style={[s.body, { paddingHorizontal: sp.pad, paddingTop: sp.gap, gap: sp.gap }]}>
        <PhotoHero photo="autopilot" photos={PHOTO_SETS.autopilot} icon="robot-outline" eyebrow={tt("ph.auto.eyebrow")} title={tt("ph.auto.title")} subtitle={tt("ph.auto.sub")} style={{ marginBottom: sp.gap }} testID="autopilot-hero" />
        <Text style={[s.sub, { color: t.dim }]}>{tt("auto.pipeline")}</Text>

        {busy && (
          <View style={{ gap: S.md }}>
            <Notice tone="loading" title={tt("auto.running")} />
            {/* Placeholder steps: the shape of the timeline to come (static under reduced motion). */}
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {[0, 1, 2].map((i) => (
                <View key={i} style={s.stepRow}>
                  <View style={s.railCol}>
                    <Skeleton width={28} height={28} radius={R.pill} color={t.line} />
                  </View>
                  <View style={[s.stepBody, { backgroundColor: t.raised, borderColor: t.line, gap: S.sm }]}>
                    <Skeleton width="30%" height={12} radius={R.sm} color={t.line} />
                    <Skeleton width="80%" height={16} radius={R.sm} color={t.line} />
                    <Skeleton width="55%" height={14} radius={R.sm} color={t.line} />
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {err && !busy && (
          <Notice tone="error" body={err} action={{ label: tt("result.retry"), onPress: engage }} />
        )}

        {!steps && !busy && !err && (
          <Card style={{ gap: S.lg }}>
            <Text style={{ color: t.ink, ...T.body, maxWidth: 560 }}>{tt("auto.intro")}</Text>
            {/* Its accessible name starts with the visible word (label in name) but must not contain
                "Engage autopilot": the header button owns that name. */}
            <Btn label={tt("auto.engage")} a11yLabel={`${tt("auto.engage")}: run the autopilot chain`} onPress={engage} style={{ alignSelf: "stretch" }} />
          </Card>
        )}

        {steps && steps.length > 0 && (
        <View>
        {steps.map((st9, i) => (
          <Enter key={i} index={i}>
          <View style={s.stepRow}>
            <View style={s.railCol}>
              <View style={[s.node, { borderColor: t.accent, backgroundColor: t.panel }]}>
                <Text style={{ color: t.accent, fontSize: 12, lineHeight: 16, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{i + 1}</Text>
              </View>
              {i < steps.length - 1 && <View style={[s.rail, { backgroundColor: t.line }]} />}
            </View>
            <View style={[s.stepBody, { backgroundColor: t.raised, borderColor: t.line }]}>
              <Text style={{ color: t.accent, ...T.label }}>{st9.agent}</Text>
              <Text style={{ color: t.ink, ...T.body, marginTop: S.xs, marginBottom: S.sm }}>{st9.action}</Text>
              <StepSummary step={st9} />
              <Text style={{ color: t.dim, fontFamily: "monospace", fontSize: 12, lineHeight: 16, fontVariant: ["tabular-nums"], marginTop: S.sm }}>
                {st9.latency_ms} ms
              </Text>
            </View>
          </View>
          </Enter>
        ))}
        </View>
        )}

        {brief && (
          <Enter index={(steps?.length ?? 0)}>
          <View {...surfaceAttr("accent")} style={[s.brief, { borderColor: t.accent, backgroundColor: t.panel }]}>
            <Text style={{ color: t.accent, ...T.label, marginBottom: S.sm }}>
              MISSION BRIEF · CONFIDENCE {brief.confidence ?? "—"}
            </Text>
            <Text style={{ color: t.ink, ...T.headline }}>{brief.headline}</Text>
            <Text style={{ color: t.dim, ...T.meta, marginTop: S.sm }}>{brief.next_review}</Text>
          </View>
          </Enter>
        )}
        </Bounded>
      </ScrollView>
    </SafeAreaView>
  );
}

function StepSummary({ step }: { step: AutopilotStep }) {
  const t = useTheme();
  const o = step.output ?? {};
  if (step.agent === "WEATHER-GATE")
    return (
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
        <Pill label={String(o.logistics_risk_flag)} tone={o.logistics_risk_flag === "CLEAR" ? "ok" : "warn"} />
        <Pill label={String(o.decision)} tone={o.decision === "DISPATCH_APPROVED" ? "ok" : "bad"} />
      </View>
    );
  if (step.agent === "APEX·ROUTE-C")
    return (
      <Text style={{ color: t.dim, ...T.meta }}>
        {o.severity} · "{o.farmer_push_message}" → {(o.affected_farmer_ids ?? []).length} farmers
      </Text>
    );
  if (step.agent === "APEX·ROUTE-A")
    return (
      <Text style={{ color: t.dim, ...T.meta }}>
        {o.cargo_optimized_route?.optimal_market_destination} · net{" "}
        {o.cargo_optimized_route?.net_profit_projection_kes?.toLocaleString?.("en-KE") ?? "—"} KES ·{" "}
        {o.climate_risk_sentinel?.pre_farming_risk_level} climate risk
      </Text>
    );
  if (step.agent === "SENSE")
    return (
      <Text style={{ color: t.dim, ...T.meta }}>
        {o.farm} · {o.crop} · {o.vehicle} · rain {o.rainfall_24h_mm}mm
      </Text>
    );
  if (step.agent === "MISSION-BRIEF")
    return (
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
        {o.broadcast ? <Pill label={`BROADCAST ${o.broadcast}`} tone={o.broadcast === "FAILED" ? "bad" : o.broadcast === "SENT" ? "warn" : "ok"} /> : null}
        {o.confidence ? <Pill label={`CONFIDENCE ${o.confidence}`} tone="dim" /> : null}
      </View>
    );
  return <Text style={{ color: t.dim, ...T.meta }} numberOfLines={3}>{JSON.stringify(o)}</Text>;
}

const s = StyleSheet.create({
  scroll: { flexGrow: 1 },
  // Blocks are spaced by the gap; the timeline sits in one container so its rail stays unbroken.
  body: { paddingBottom: S.x5 },
  engage: { borderRadius: R.md, paddingHorizontal: S.lg, minHeight: TOUCH, justifyContent: "center" },
  sub: { ...T.label },
  stepRow: { flexDirection: "row", gap: S.md },
  railCol: { alignItems: "center", width: 28 },
  node: { width: 28, height: 28, borderRadius: R.pill, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  rail: { width: 2, flex: 1, marginVertical: 2 },
  stepBody: { flex: 1, borderWidth: B.line, borderRadius: R.md, padding: S.md, marginBottom: S.md },
  brief: { borderWidth: B.line, borderRadius: R.card, padding: S.lg },
});

// A screen that throws shows a "try again" card, never a blank app.
export { ScreenErrorBoundary as ErrorBoundary } from "../../components/ScreenError";
