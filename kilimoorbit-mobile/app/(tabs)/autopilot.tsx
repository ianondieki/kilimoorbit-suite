import React, { useState } from "react";
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Pill from "../../components/Pill";
import { Enter, PressScale } from "../../components/Motion";
import { useTheme } from "../../lib/theme-context";
import { runAutopilot, type AutopilotStep } from "../../lib/api";

export default function Autopilot() {
  const t = useTheme();
  const [steps, setSteps] = useState<AutopilotStep[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const engage = async () => {
    setBusy(true); setErr(null); setSteps(null);
    try {
      const res = await runAutopilot();
      setSteps(res.steps);
    } catch (e: any) {
      setErr(`Autopilot failed — ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const brief = steps?.find((s) => s.agent === "MISSION-BRIEF")?.output;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]}>
      <View style={[s.top, { borderBottomColor: t.line }]}>
        <Text style={[s.title, { color: t.ink }]}>SENTINEL <Text style={{ color: t.accent }}>AUTOPILOT</Text></Text>
        <PressScale onPress={engage} disabled={busy} style={[s.engage, { backgroundColor: t.accent, opacity: busy ? 0.5 : 1 }]}>
          <Text style={{ color: t.bg, fontWeight: "800" }}>{busy ? "Running…" : "Engage"}</Text>
        </PressScale>
      </View>
      <Text style={[s.sub, { color: t.dim }]}>sense → arbitrage → weather gate → broadcast → brief</Text>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
        {busy && <ActivityIndicator color={t.accent} style={{ marginTop: 30 }} />}
        {err && <Text style={{ color: t.alert, marginTop: 20 }}>{err}</Text>}
        {!steps && !busy && !err && (
          <View style={[s.emptyBox, { borderColor: t.line }]}>
            <Text style={{ color: t.dim, textAlign: "center", lineHeight: 21 }}>
              Autopilot chains Apex routes autonomously: it compiles the arbitrage run, applies the
              §2.4 weather gate, auto-broadcasts a hold alert to farmers if the corridor is unsafe,
              and files a mission brief.
            </Text>
          </View>
        )}

        {steps?.map((st9, i) => (
          <Enter key={i} index={i}>
          <View style={s.stepRow}>
            <View style={s.railCol}>
              <View style={[s.node, { borderColor: t.accent, backgroundColor: t.panel }]}>
                <Text style={{ color: t.accent, fontFamily: "monospace", fontSize: 10 }}>{i + 1}</Text>
              </View>
              {i < steps.length - 1 && <View style={[s.rail, { backgroundColor: t.line }]} />}
            </View>
            <View style={[s.stepBody, { backgroundColor: t.raised, borderColor: t.line }]}>
              <Text style={{ color: t.accent, fontFamily: "monospace", fontSize: 10, letterSpacing: 1.5 }}>
                {st9.agent}
              </Text>
              <Text style={{ color: t.ink, marginTop: 3, marginBottom: 6, fontSize: 13.5 }}>{st9.action}</Text>
              <StepSummary step={st9} />
              <Text style={{ color: t.dim, fontFamily: "monospace", fontSize: 9.5, marginTop: 6 }}>
                {st9.latency_ms} ms
              </Text>
            </View>
          </View>
          </Enter>
        ))}

        {brief && (
          <Enter index={(steps?.length ?? 0)}>
          <View style={[s.brief, { borderColor: t.accent, backgroundColor: t.panel }]}>
            <Text style={{ color: t.accent, fontFamily: "monospace", fontSize: 10, letterSpacing: 2, marginBottom: 6 }}>
              MISSION BRIEF · CONFIDENCE {brief.confidence ?? "—"}
            </Text>
            <Text style={{ color: t.ink, fontSize: 15, lineHeight: 22 }}>{brief.headline}</Text>
            <Text style={{ color: t.dim, marginTop: 8, fontSize: 12.5 }}>{brief.next_review}</Text>
          </View>
          </Enter>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StepSummary({ step }: { step: AutopilotStep }) {
  const t = useTheme();
  const o = step.output ?? {};
  if (step.agent === "WEATHER-GATE")
    return (
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        <Pill label={String(o.logistics_risk_flag)} tone={o.logistics_risk_flag === "CLEAR" ? "ok" : "warn"} />
        <Pill label={String(o.decision)} tone={o.decision === "DISPATCH_APPROVED" ? "ok" : "bad"} />
      </View>
    );
  if (step.agent === "APEX·ROUTE-C")
    return (
      <Text style={{ color: t.dim, fontSize: 12.5 }}>
        {o.severity} · "{o.farmer_push_message}" → {(o.affected_farmer_ids ?? []).length} farmers
      </Text>
    );
  if (step.agent === "APEX·ROUTE-A")
    return (
      <Text style={{ color: t.dim, fontSize: 12.5 }}>
        {o.cargo_optimized_route?.optimal_market_destination} · net{" "}
        {o.cargo_optimized_route?.net_profit_projection_kes?.toLocaleString?.("en-KE") ?? "—"} KES ·{" "}
        {o.climate_risk_sentinel?.pre_farming_risk_level} climate risk
      </Text>
    );
  if (step.agent === "SENSE")
    return (
      <Text style={{ color: t.dim, fontSize: 12.5 }}>
        {o.farm} · {o.crop} · {o.vehicle} · rain {o.rainfall_24h_mm}mm
      </Text>
    );
  return <Text style={{ color: t.dim, fontSize: 12.5 }} numberOfLines={3}>{JSON.stringify(o)}</Text>;
}

const s = StyleSheet.create({
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  title: { fontSize: 14, fontWeight: "800", letterSpacing: 2 },
  engage: { borderRadius: 10, paddingHorizontal: 18, paddingVertical: 9 },
  sub: { fontFamily: "monospace", fontSize: 10, paddingHorizontal: 16, paddingTop: 8, letterSpacing: 0.5 },
  emptyBox: { borderWidth: 1, borderStyle: "dashed", borderRadius: 14, padding: 22, marginTop: 24 },
  stepRow: { flexDirection: "row", gap: 12 },
  railCol: { alignItems: "center", width: 26 },
  node: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  rail: { width: 2, flex: 1, marginVertical: 2 },
  stepBody: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 14 },
  brief: { borderWidth: 1.5, borderRadius: 14, padding: 16, marginTop: 6 },
});
