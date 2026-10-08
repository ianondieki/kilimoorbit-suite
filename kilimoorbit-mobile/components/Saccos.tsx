/**
 * "Join a farmers' SACCO": the nearest SACCOs and co-operatives to the farm
 * (dairy farmers see dairy co-operatives first), what each offers — inputs on
 * credit, an inputs shop, equipment loans — the fare to the office, and a
 * one-tap join request. The request is saved on the server with a reference
 * and the farmer gets the checklist to finish joining at the office; the
 * card says plainly that SACCOs are not yet connected to the app.
 */
import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import Animated, { FadeInDown, useReducedMotion } from "react-native-reanimated";
import Text from "./Text";
import Field from "./Field";
import Icon, { type IconName } from "./Icon";
import { PhotoHero } from "./PhotoHero";
import { Btn, Card, Chip, ChipRow, Group, Sheet, T, Tag, tint } from "./Kit";
import { CheckCoin } from "./Glyphs";
import { useTheme } from "../lib/theme-context";
import { useLang, useSession } from "../lib/session";
import { useFarm, fmtMoney } from "../lib/farm";
import { useHerd } from "../lib/herd";
import { ApiError, getSaccos, joinSacco, withdrawSacco, type Sacco, type SaccoApplication, type SaccoService } from "../lib/api";
import { DEFAULT_INTERESTS, farmFocus, saccoActions, seasonInputs, useMySaccos } from "../lib/saccos";
import { fareText, kmText, mapsUrl } from "../lib/nurseries";
import { openLink } from "../lib/news";
import { haptic } from "../lib/haptics";
import { announce } from "../lib/ui";
import type { Key } from "../lib/i18n";

const KIND_ICON: Record<Sacco["kind"], IconName> = { sacco: "bank-outline", dairy_coop: "cow", union: "account-group-outline", office: "office-building-outline" };
const INPUTS: SaccoService[] = ["input_credit", "inputs_shop", "asset_finance"];
const PHONE_RE = /^(?:\+?254|0)(?:7|1)\d{8}$/;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

export function SaccosCard() {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const { farm } = useFarm();
  const { herd } = useHerd();
  const county = farm.county ?? "Nakuru";
  const cows = herd.animals.filter((a) => a.species === "cow").length;
  const focus = farmFocus(farm.plantings, cows);
  const inputs = seasonInputs(farm.plantings, farm.prices);
  const mine = useMySaccos();
  const [phase, setPhase] = useState<"idle" | "loading" | "done" | "failed">("idle");
  const [rows, setRows] = useState<Sacco[]>([]);
  const [joining, setJoining] = useState<Sacco | null>(null);
  const seq = useRef(0);

  const load = async () => {
    const my = ++seq.current;
    setPhase("loading");
    try {
      const r = await getSaccos({ county, focus });
      if (my !== seq.current) return;
      setRows(r.saccos); setPhase("done"); haptic.success();
      announce(`${r.saccos.length} ${tt("sc.eyebrow")}`);
    } catch {
      if (my === seq.current) { setPhase("failed"); haptic.error(); }
    }
  };
  // A new county means a new list.
  useEffect(() => { if (phase === "done") load(); }, [county, focus]);

  const withdraw = async (id: string, token: string) => {
    try { await withdrawSacco(id, token); } catch (e) { if (!(e instanceof ApiError && e.status === 404)) { haptic.error(); return; } }
    saccoActions.forget(id); haptic.tap(); announce(tt("sc.withdrawn"));
  };

  return (
    <Card>
      <View style={{ gap: 14 }} testID="saccos-card">
        <PhotoHero photo="sacco" compact height={176} icon="account-group-outline" eyebrow={tt("sc.eyebrow")} title={tt("sc.title")} />
        <Text style={{ color: t.dim, ...T.body }}>{tt("sc.body")}</Text>
        {inputs.total > 0 && <Tag block tone="ok" label={tt("sc.inputs", { amount: fmtMoney(inputs.total) })} />}
        {phase !== "done" && (
          <Btn
            label={phase === "loading" ? tt("sc.loading", { county }) : phase === "failed" ? tt("sc.retry") : tt("sc.find")}
            onPress={load} disabled={phase === "loading"}
            icon={(c) => <Icon name="map-marker-radius-outline" size={18} color={c} />} testID="sc-find"
          />
        )}
        {phase === "failed" && <Tag block tone="warn" label={tt("sc.failed")} />}
        {phase === "done" && (
          <View style={{ gap: 10 }} testID="sc-list">
            {rows.map((s, i) => (
              <SaccoRow key={s.id} s={s} first={i === 0} focus={focus} requested={mine.find((m) => m.sacco_id === s.id)?.reference} onJoin={() => setJoining(s)} />
            ))}
            <Text style={{ color: t.dim, ...T.meta }}>{tt("sc.honest")}</Text>
          </View>
        )}
        {mine.length > 0 && (
          <View style={{ gap: 8 }} testID="sc-mine">
            <Text style={{ color: t.ink, fontSize: 15, lineHeight: 20, fontWeight: "700" }}>{tt("sc.mine")}</Text>
            {mine.map((m) => (
              <View key={m.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 12, backgroundColor: t.raised, borderWidth: 1, borderColor: t.line }}>
                <Icon name="file-document-check-outline" size={20} color={t.ok} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.ink, fontSize: 15, lineHeight: 20, fontWeight: "700" }}>{m.name}</Text>
                  <Text style={{ color: t.dim, ...T.meta }}>{m.reference} · {m.town}</Text>
                </View>
                <Btn kind="ghost" small label={tt("sc.withdraw")} onPress={() => withdraw(m.id, m.token)} testID={`sc-withdraw-${m.sacco_id}`} />
              </View>
            ))}
          </View>
        )}
      </View>
      <JoinSheet sacco={joining} onClose={() => setJoining(null)} county={county} acres={farm.acres} />
    </Card>
  );
}

function SaccoRow({ s, first, focus, requested, onJoin }: { s: Sacco; first: boolean; focus: string | null; requested?: string; onJoin: () => void }) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const office = s.kind === "office";
  return (
    <View style={{ borderRadius: 14, borderWidth: first ? 2 : 1, borderColor: first ? t.accent : t.line, backgroundColor: first ? tint(t.accent, 0.08) : t.raised, padding: 12, gap: 8 }} testID={`sc-row-${s.id}`}>
      <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: tint(office ? t.water : t.ok, 0.16), alignItems: "center", justifyContent: "center" }}>
          <Icon name={KIND_ICON[s.kind]} size={20} color={office ? t.water : t.ok} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.ink, fontSize: 15.5, lineHeight: 21, fontWeight: "800" }}>{s.name}</Text>
          <Text style={{ color: t.dim, ...T.meta }}>{tt(`sc.kind.${s.kind}` as Key)} · {s.town === s.county ? s.town : `${s.town}, ${s.county}`}</Text>
        </View>
        <Text style={{ color: t.ink, fontSize: 16, lineHeight: 20, fontWeight: "800" }}>{kmText(s.distance_km)}</Text>
      </View>
      <Text style={{ color: !office && focus && s.focus.includes(focus as any) ? t.ok : t.dim, ...T.meta, fontWeight: "700" }}>
        {office ? "" : focus && s.focus.includes(focus as any) ? `${tt("sc.focus", { focus: tt(`sc.focus.${focus}` as Key) })} · ` : s.focus.includes("general") ? `${tt("sc.forAll")} · ` : ""}{fareText(lang, s.transport)}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {[...s.services].sort((a, b) => Number(!INPUTS.includes(a)) - Number(!INPUTS.includes(b))).slice(0, 5).map((k) => <Tag key={k} label={tt(`sc.service.${k}` as Key)} tone={k === "input_credit" || k === "inputs_shop" || k === "asset_finance" ? "ok" : "dim"} />)}
      </View>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {requested ? (
          <Tag label={tt("sc.requested", { ref: requested })} tone="ok" />
        ) : (
          <Btn small label={office ? tt("sc.officeJoin") : tt("sc.join")} onPress={onJoin} icon={(c) => <Icon name="account-plus-outline" size={16} color={c} />} style={{ alignSelf: "flex-start" }} testID={`sc-join-${s.id}`} />
        )}
        <Btn kind="secondary" small label={tt("nz.directions")} onPress={() => openLink(mapsUrl(s.lat, s.lon))} icon={(c) => <Icon name="directions" size={16} color={c} />} style={{ alignSelf: "flex-start" }} />
      </View>
    </View>
  );
}

function JoinSheet({ sacco, onClose, county, acres }: { sacco: Sacco | null; onClose: () => void; county: string; acres: number | null }) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const { profile } = useSession();
  const reduce = useReducedMotion();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [want, setWant] = useState<SaccoService[]>(DEFAULT_INTERESTS);
  const [tried, setTried] = useState(false);
  const [phase, setPhase] = useState<"form" | "sending" | "done" | "failed">("form");
  const [result, setResult] = useState<SaccoApplication | null>(null);
  const [shown, setShown] = useState(0);

  // Pre-fill once per opening, so a field the farmer clears stays cleared.
  const opened = useRef<string | null>(null);
  useEffect(() => {
    if (!sacco) { opened.current = null; return; }
    if (opened.current === sacco.id) return;
    opened.current = sacco.id;
    setName(profile?.name ?? ""); setPhone(profile?.phone ? profile.phone.replace(/^\+254/, "0") : ""); setEmail(profile?.email ?? "");
    setWant(sacco.kind === "office" ? ["register"] : DEFAULT_INTERESTS.filter((k) => sacco.services.includes(k)).length ? DEFAULT_INTERESTS.filter((k) => sacco.services.includes(k)) : sacco.services.slice(0, 2));
    setTried(false); setPhase("form"); setResult(null); setShown(0);
  }, [sacco?.id]);
  useEffect(() => {
    if (!result || shown > result.steps.length) return;
    const id = setTimeout(() => setShown((s) => s + 1), reduce ? 0 : 380);
    return () => clearTimeout(id);
  }, [result, shown]);

  const cleanPhone = phone.replace(/[\s-]/g, "");
  const phoneOk = !cleanPhone || PHONE_RE.test(cleanPhone);
  const emailOk = !email || EMAIL_RE.test(email);
  const hasContact = !!cleanPhone || !!email;
  const valid = name.trim().length >= 2 && phoneOk && emailOk && hasContact;

  const send = async () => {
    setTried(true);
    if (!valid || !sacco) { haptic.warn(); return; }
    setPhase("sending");
    try {
      const r = await joinSacco({ sacco_id: sacco.id, name: name.trim(), phone: cleanPhone || null, email: email || null, county, interests: want, acres, lang });
      saccoActions.remember(r);
      setResult(r); setShown(1); setPhase("done"); haptic.success();
      announce(tt("sc.done.title", { ref: r.reference }));
    } catch {
      setPhase("failed"); haptic.error();
    }
  };
  const toggle = (k: SaccoService) => setWant((w) => (w.includes(k) ? w.filter((x) => x !== k) : [...w, k]));

  return (
    <Sheet visible={!!sacco} onClose={onClose} title={sacco?.name ?? tt("sc.sheet")} testID="sheet-sacco"
      footer={phase === "done" ? <Btn label={tt("common.close")} onPress={onClose} testID="sc-close" /> : <Btn label={tt("sc.send")} onPress={send} disabled={phase === "sending"} icon={(c) => <Icon name="send-outline" size={18} color={c} />} testID="sc-send" />}
    >
      {phase !== "done" ? (
        <View style={{ gap: 12 }}>
          <Field label={tt("sc.name")} glyph={null} value={name} onChangeText={(v) => setName(v.slice(0, 60))} height={52} inputStyle={{ fontSize: 16 }}
            error={tried && name.trim().length < 2} status={null} statusMinHeight={0} inputProps={{ autoCapitalize: "words", testID: "sc-name" } as any} />
          <Field label={tt("sc.phone")} glyph={null} value={phone} onChangeText={(v) => setPhone(v.replace(/[^\d+\s-]/g, "").slice(0, 16))} height={52} inputStyle={{ fontSize: 16 }}
            error={tried && (!phoneOk || !hasContact)} status={tried && !phoneOk ? { kind: "error", text: tt("sc.badContact") } : null} statusMinHeight={0}
            inputProps={{ keyboardType: "phone-pad", placeholder: "07XX XXX XXX", testID: "sc-phone" } as any} />
          <Field label={tt("sc.email")} glyph={null} value={email} onChangeText={(v) => setEmail(v.replace(/\s/g, "").slice(0, 254))} height={52} inputStyle={{ fontSize: 16 }}
            error={tried && !emailOk} status={tried && !emailOk ? { kind: "error", text: tt("sc.badContact") } : null} statusMinHeight={0}
            inputProps={{ keyboardType: "email-address", autoCapitalize: "none", autoCorrect: false, placeholder: "jina@mfano.com", testID: "sc-email" } as any} />
          {tried && !hasContact && <Tag block tone="warn" label={tt("sc.contactNeeded")} />}
          <Group label={tt("sc.want")}>
            <ChipRow role="group" label={tt("sc.want")}>
              {(sacco?.services ?? []).map((k) => <Chip key={k} role="checkbox" label={tt(`sc.service.${k}` as Key)} selected={want.includes(k)} onPress={() => toggle(k)} testID={`sc-want-${k}`} />)}
            </ChipRow>
          </Group>
          {phase === "failed" && <Tag block tone="warn" label={tt("sc.failedJoin")} />}
        </View>
      ) : result && (
        <View style={{ gap: 12 }} testID="sc-done">
          <View style={{ gap: 10 }}>
            {result.steps.slice(0, shown).map((s, i) => (
              <Animated.View key={i} entering={reduce ? undefined : FadeInDown.duration(200)} style={{ flexDirection: "row", gap: 10 }} testID={`sc-step-${i}`}>
                <CheckCoin size={22} bg={t.ok} fg={t.field} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.ink, fontSize: 15, lineHeight: 20, fontWeight: "700" }}>{s.agent}</Text>
                  <Text style={{ color: t.dim, ...T.meta }}>{s.action}</Text>
                </View>
              </Animated.View>
            ))}
          </View>
          <Text style={{ color: t.ink, ...T.headline }}>{tt("sc.done.title", { ref: result.reference })}</Text>
          <Text style={{ color: t.dim, ...T.body }}>{tt("sc.done.body", { name: result.sacco.name, town: result.sacco.town })}</Text>
          <View style={{ gap: 8 }} testID="sc-checklist">
            {result.checklist.map((c, i) => (
              <View key={i} style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
                <Icon name="checkbox-marked-circle-outline" size={18} color={t.ok} />
                <Text style={{ color: t.ink, ...T.body, flex: 1 }}>{lang === "sw" ? c.sw : c.en}</Text>
              </View>
            ))}
          </View>
          <Tag block tone="warn" label={tt("sc.done.pay")} />
          {result.email !== "NONE" && <Text style={{ color: t.dim, ...T.meta }}>{tt(`sc.email.${result.email}` as Key)}</Text>}
        </View>
      )}
    </Sheet>
  );
}
