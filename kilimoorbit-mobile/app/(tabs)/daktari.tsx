/**
 * Daktari wa mimea / Crop doctor: pick the crop, tick what you see, get the
 * likely pests or diseases with what to do now and how to prevent them next
 * season. Works offline; "Ask Apex" hands the case to the chat.
 */
import React, { useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, Pressable, Platform, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import Header from "../../components/Header";
import { Bounded } from "../../components/Bounded";
import { Btn, Card, Chip, ChipRow, Eyebrow, T, Tag } from "../../components/Kit";
import { Enter } from "../../components/Motion";
import { CropCoin } from "../../components/ShambaPanel";
import { ChatGlyph, ChevronGlyph, CrossGlyph } from "../../components/Glyphs";
import { useTheme } from "../../lib/theme-context";
import { useLang } from "../../lib/session";
import { focusRing, webCursor, webLang, type PressState } from "../../lib/ui";
import { cropName } from "../../lib/prices";
import { CROP_KEYS, pick, type CropKey } from "../../lib/agronomy";
import { diagnose, problemsFor, symptomsFor, type Part, type Problem } from "../../lib/pests";
import { useFarm } from "../../lib/farm";
import type { Key } from "../../lib/i18n";

const PARTS: Part[] = ["leaf", "stem", "fruit"];

export default function Daktari() {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const { farm, ready } = useFarm();
  const [crop, setCrop] = useState<CropKey>("maize");
  const [picked, setPicked] = useState<string[]>([]);
  const [touched, setTouched] = useState(false);

  // Start on the farmer's own first crop, until they choose.
  useEffect(() => {
    if (ready && !touched && farm.plantings[0]) setCrop(farm.plantings[0].crop);
  }, [ready]);

  const choose = (k: CropKey) => { setTouched(true); setCrop(k); setPicked([]); };
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const symptoms = symptomsFor(crop);
  const matches = diagnose(crop, picked);
  const name = cropName(lang, crop);

  // On a phone the answers sit below a long list of signs: offer a jump to them
  // while they are out of view.
  const scroller = useRef<ScrollView>(null);
  const [resultsY, setResultsY] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const [viewH, setViewH] = useState(0);
  const { height } = useWindowDimensions();
  const showJump = picked.length > 0 && resultsY > 0 && scrollY + (viewH || height) - 80 < resultsY;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]} {...webLang(lang)}>
      <Header title={tt("dr.title")} />
      <ScrollView
        ref={scroller}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={64}
        onScroll={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
        onLayout={(e) => setViewH(e.nativeEvent.layout.height)}
      >
        <Bounded style={{ padding: 16, gap: 14 }}>
          <Card>
            <Text accessibilityRole="header" style={{ color: t.ink, ...T.title, marginBottom: 12 }}>{tt("dr.step1")}</Text>
            <ChipRow role="radiogroup" label={tt("dr.step1")}>
              {CROP_KEYS.map((k) => (
                <Chip key={k} role="radio" selected={k === crop} onPress={() => choose(k)} label={cropName(lang, k)} leading={<CropCoin cropKey={k} size={26} />} testID={`dr-crop-${k}`} />
              ))}
            </ChipRow>
          </Card>

          <Card>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
              <Text accessibilityRole="header" style={{ flex: 1, color: t.ink, ...T.title }}>{tt("dr.step2")}</Text>
              {picked.length > 0 && (
                <Btn kind="ghost" small label={tt("dr.clear")} onPress={() => setPicked([])} icon={(c) => <CrossGlyph size={11} color={c} />} />
              )}
            </View>
            {PARTS.map((part) => {
              const list = symptoms.filter((s) => s.part === part);
              if (!list.length) return null;
              return (
                <View key={part} style={{ marginTop: 12, gap: 8 }}>
                  <Text style={{ color: t.dim, ...T.meta, fontWeight: "700" }}>{tt(`dr.part.${part}` as Key)}</Text>
                  <ChipRow role="group" label={tt(`dr.part.${part}` as Key)}>
                    {list.map((s) => (
                      <Chip key={s.id} role="checkbox" selected={picked.includes(s.id)} onPress={() => toggle(s.id)} label={pick(lang, s.label)} testID={`sym-${s.id}`} />
                    ))}
                  </ChipRow>
                </View>
              );
            })}
          </Card>

          <View
            accessibilityLiveRegion="polite"
            aria-live="polite"
            style={{ gap: 12 }}
            onLayout={(e) => setResultsY(e.nativeEvent.layout.y)}
          >
            {picked.length > 0 ? (
              <>
                <Eyebrow text={tt("dr.results")} style={{ marginBottom: 0, marginTop: 4 }} />
                {matches.length === 0 ? (
                  <Card><Text style={{ color: t.ink, ...T.body }}>{tt("dr.none")}</Text></Card>
                ) : (
                  matches.map((m, i) => (
                    <Enter key={`r:${crop}:${m.problem.id}`} index={i}>
                      <ProblemCard p={m.problem} crop={crop} strength={m.strength} matched={m.matched.length} startOpen={i === 0 && m.strength === "strong"} />
                    </Enter>
                  ))
                )}
              </>
            ) : (
              <>
                <Eyebrow text={tt("dr.common", { crop: name.toUpperCase() })} style={{ marginBottom: 0, marginTop: 4 }} />
                {problemsFor(crop).map((p, i) => (
                  <Enter key={`c:${crop}:${p.id}`} index={i}>
                    <ProblemCard p={p} crop={crop} />
                  </Enter>
                ))}
              </>
            )}
          </View>

          <View style={{ padding: 14, borderRadius: 16, borderWidth: 1, borderColor: t.line, gap: 6 }}>
            <Text style={{ color: t.ink, fontSize: 15, lineHeight: 20, fontWeight: "800" }}>{tt("dr.safety")}</Text>
            <Text style={{ color: t.ink, ...T.meta }}>{tt("dr.safetyBody")}</Text>
            <Text style={{ color: t.dim, ...T.meta, marginTop: 4 }}>{tt("dr.disclaimer")}</Text>
          </View>
        </Bounded>
      </ScrollView>
      {showJump && (
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 16, alignItems: "center", pointerEvents: "box-none" }}>
          <Btn
            label={matches.length ? tt("dr.jump", { n: matches.length }) : tt("dr.jumpNone")}
            onPress={() => scroller.current?.scrollTo({ y: Math.max(0, resultsY - 8), animated: true })}
            icon={(c) => <ChevronGlyph size={12} color={c} dir="down" />}
            style={[{ flexDirection: "row-reverse", borderRadius: 999, paddingHorizontal: 22, elevation: 6 }, Platform.OS === "web" ? ({ boxShadow: "0 4px 14px rgba(0,0,0,0.35)" } as object) : { shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }]}
            testID="dr-jump"
          />
        </View>
      )}
    </SafeAreaView>
  );
}

function ProblemCard({
  p, crop, strength, matched, startOpen = false,
}: { p: Problem; crop: CropKey; strength?: "strong" | "possible"; matched?: number; startOpen?: boolean }) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const [open, setOpen] = useState(startOpen);
  const name = pick(lang, p.name);

  const ask = () => {
    const q = tt("dr.askText", { crop: cropName(lang, crop).toLowerCase(), problem: name });
    router.navigate({ pathname: "/chat", params: { q } });
  };

  return (
    <Card tone={strength === "strong" ? "accent" : "plain"}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        testID={`problem-${p.id}`}
        style={({ pressed, focused }: PressState) => [
          { flexDirection: "row", alignItems: "flex-start", gap: 12, borderRadius: 10, opacity: pressed ? 0.8 : 1 },
          webCursor, focusRing(focused, t.accent),
        ]}
      >
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={{ color: t.ink, fontSize: 18, lineHeight: 24, fontWeight: "800" }}>{name}</Text>
          {p.latin ? <Text {...webLang("la")} style={{ color: t.dim, ...T.meta, fontStyle: "italic", marginTop: -4 }}>{p.latin}</Text> : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {strength && <Tag label={tt(strength === "strong" ? "dr.strong" : "dr.possible")} tone={strength === "strong" ? "warn" : "dim"} />}
            <Tag label={tt(`dr.kind.${p.kind}` as Key)} tone={p.kind === "pest" ? "bad" : p.kind === "disease" ? "water" : "dim"} />
            {matched ? <Tag label={tt("dr.matched", { n: matched })} /> : null}
          </View>
        </View>
        <View style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }}>
          <ChevronGlyph size={14} color={t.dim} dir={open ? "up" : "down"} />
        </View>
      </Pressable>

      <Text style={{ color: t.ink, ...T.body, marginTop: 10 }}>{pick(lang, p.look)}</Text>

      {open && (
        <View style={{ marginTop: 14, gap: 14 }}>
          <Section title={tt("dr.act")} items={p.act.map((a) => pick(lang, a))} numbered />
          <Section title={tt("dr.prevent")} items={p.prevent.map((a) => pick(lang, a))} />
          <Btn kind="secondary" label={tt("dr.ask")} onPress={ask} icon={(c) => <ChatGlyph size={20} color={c} />} testID={`ask-${p.id}`} />
        </View>
      )}
    </Card>
  );
}

function Section({ title, items, numbered }: { title: string; items: string[]; numbered?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <Text accessibilityRole="header" aria-level={3} style={{ color: t.dim, fontSize: 11, lineHeight: 14, fontFamily: "monospace", fontWeight: "700", letterSpacing: 1.6 }}>
        {title.toUpperCase()}
      </Text>
      {items.map((it, i) => (
        <View key={i} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
          <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: t.raised, alignItems: "center", justifyContent: "center", marginTop: -1 }}>
            {numbered ? (
              <Text style={{ color: t.accent, fontSize: 12.5, fontWeight: "800" }}>{i + 1}</Text>
            ) : (
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.ok }} />
            )}
          </View>
          <Text style={{ flex: 1, color: t.ink, ...T.body }}>{it}</Text>
        </View>
      ))}
    </View>
  );
}
