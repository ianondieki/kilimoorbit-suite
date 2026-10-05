/**
 * The three farm forms, as sheets so they open from anywhere (Today's quick
 * actions, the Shamba screen): farm profile (county + size), add a crop (with
 * the input calculator), and a money record for the daftari.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, TextInput } from "react-native";
import { useTheme } from "../lib/theme-context";
import { useLang } from "../lib/session";
import { announce, focusRing, webCursor, type PressState } from "../lib/ui";
import { cropName } from "../lib/prices";
import { searchCounties } from "../lib/counties";
import { CROPS, CROP_KEYS, inputsFor, pick, type CropKey } from "../lib/agronomy";
import { addDays, longDay, todayKey } from "../lib/dates";
import { farmActions, useFarm, type Entry, type ExpenseCat, type IncomeCat } from "../lib/farm";
import type { Key } from "../lib/i18n";
import { Btn, Chip, ChipRow, Group, Sheet, Stepper, T } from "./Kit";
import { CropCoin } from "./ShambaPanel";
import Field from "./Field";
import Segmented from "./Segmented";
import { CheckGlyph, ChevronGlyph, LensGlyph } from "./Glyphs";

const acresFmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, ""));

/* ── shared: day picker with presets and ‹ › nudges ── */
function DateNudge({ value, onChange, label }: { value: string; onChange: (k: string) => void; label: string }) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const arrow = (dir: -1 | 1) => (
    <Pressable
      onPress={() => onChange(addDays(value, dir))}
      accessibilityRole="button"
      accessibilityLabel={tt(dir < 0 ? "common.prevDay" : "common.nextDay")}
      style={({ pressed, hovered, focused }: PressState) => [
        { width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
        (hovered || pressed) && { backgroundColor: t.raised },
        webCursor, focusRing(focused, t.accent),
      ]}
    >
      <ChevronGlyph size={16} color={t.ink} dir={dir < 0 ? "left" : "right"} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 2, borderColor: t.line, borderRadius: 14, backgroundColor: t.field }}>
      {arrow(-1)}
      <Text accessibilityLabel={`${label}: ${longDay(lang, value)}`} aria-live="polite" style={{ flex: 1, textAlign: "center", color: t.ink, fontSize: 16, lineHeight: 22, fontWeight: "700" }}>
        {longDay(lang, value)}
      </Text>
      {arrow(1)}
    </View>
  );
}

/* ── Farm profile: county + size ── */
export function FarmProfileSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useTheme();
  const { t: tt } = useLang();
  const { farm } = useFarm();
  const [county, setCounty] = useState<string | null>(farm.county);
  const [acres, setAcres] = useState<number>(farm.acres ?? 1);
  const [q, setQ] = useState("");
  const searchRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) { setCounty(farm.county); setAcres(farm.acres ?? 1); setQ(""); }
  }, [visible]);

  const list = useMemo(() => searchCounties(q), [q]);
  const save = () => { farmActions.setProfile(county, acres); onClose(); };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={tt("farm.sheet")}
      testID="sheet-farm"
      footer={<Btn label={tt("edit.save")} onPress={save} disabled={!county} style={{ flex: 1 }} testID="farm-save" />}
    >
      <Group label={tt("farm.size")}>
        <Stepper value={acres} onChange={setAcres} step={0.25} min={0.25} max={500} format={acresFmt} label={tt("farm.size")} />
      </Group>
      <View style={{ gap: 4 }}>
        <Field
          label={tt("farm.county")}
          glyph={<LensGlyph size={18} color={t.dim} />}
          value={q}
          onChangeText={setQ}
          inputRef={searchRef}
          height={52}
          inputStyle={{ fontSize: 16 }}
          status={null}
          statusMinHeight={0}
          inputProps={{ placeholder: tt("farm.search"), autoCorrect: false, autoCapitalize: "words", testID: "county-search" }}
        />
        <View accessibilityRole="radiogroup" accessibilityLabel={tt("farm.county")} style={{ marginTop: 6 }}>
          {list.length === 0 ? (
            <Text style={{ color: t.dim, ...T.body, paddingVertical: 12 }}>{tt("farm.noMatch")}</Text>
          ) : (
            list.map((c) => {
              const sel = c === county;
              return (
                <Pressable
                  key={c}
                  onPress={() => setCounty(c)}
                  accessibilityRole="radio"
                  accessibilityLabel={c}
                  accessibilityState={{ checked: sel, selected: sel }}
                  aria-checked={sel}
                  style={({ pressed, hovered, focused }: PressState) => [
                    { minHeight: 48, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, borderRadius: 12, gap: 12 },
                    (sel || hovered) && { backgroundColor: t.raised },
                    pressed && { opacity: 0.75 },
                    webCursor, focusRing(focused, t.accent),
                  ]}
                >
                  <Text style={{ flex: 1, color: t.ink, fontSize: 16, lineHeight: 22, fontWeight: sel ? "800" : "500" }}>{c}</Text>
                  {sel && <CheckGlyph size={16} color={t.accent} />}
                </Pressable>
              );
            })
          )}
        </View>
      </View>
    </Sheet>
  );
}

/* ── Add a crop ── */
const WHEN: { key: Key; off: number }[] = [
  { key: "add.wp14", off: 14 }, { key: "add.wp7", off: 7 }, { key: "add.w0", off: 0 },
  { key: "add.wm7", off: -7 }, { key: "add.wm14", off: -14 }, { key: "add.wm30", off: -30 }, { key: "add.wm60", off: -60 },
];

export function AddCropSheet({ visible, onClose, initialCrop }: { visible: boolean; onClose: () => void; initialCrop?: CropKey }) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const { farm } = useFarm();
  const [crop, setCrop] = useState<CropKey>(initialCrop ?? "maize");
  const [acres, setAcres] = useState(1);
  const [date, setDate] = useState(todayKey());

  useEffect(() => {
    if (!visible) return;
    setCrop(initialCrop ?? "maize");
    setAcres(Math.min(farm.acres ?? 1, 50));
    setDate(todayKey());
  }, [visible, initialCrop]);

  const plan = CROPS[crop];
  const transplant = plan.seed.unit === "seedlings";
  const needs = inputsFor(crop, acres, lang);
  const today = todayKey();

  const save = () => {
    farmActions.addPlanting({ crop, acres, plantedOn: date });
    announce(tt("add.added", { crop: cropName(lang, crop) }));
    onClose();
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={tt("add.title")}
      testID="sheet-add-crop"
      footer={<Btn label={tt("add.save")} onPress={save} style={{ flex: 1 }} testID="add-crop-save" />}
    >
      <Group label={tt("add.crop")}>
        <ChipRow role="radiogroup" label={tt("add.crop")}>
          {CROP_KEYS.map((k) => (
            <Chip
              key={k}
              role="radio"
              selected={k === crop}
              onPress={() => setCrop(k)}
              label={cropName(lang, k)}
              leading={<CropCoin cropKey={k} size={26} />}
              testID={`crop-${k}`}
            />
          ))}
        </ChipRow>
        <Text style={{ color: t.dim, ...T.meta }}>
          {tt("plant.spacing", { s: plan.spacing })} · {pick(lang, plan.maturity)}
        </Text>
      </Group>

      <Group label={tt("add.acres")}>
        <Stepper value={acres} onChange={setAcres} step={0.25} min={0.25} max={100} format={acresFmt} label={tt("add.acres")} />
      </Group>

      <Group label={tt(transplant ? "add.whenTransplant" : "add.when")}>
        <ChipRow role="radiogroup" label={tt(transplant ? "add.whenTransplant" : "add.when")}>
          {WHEN.map((w) => {
            const k = addDays(today, w.off);
            return <Chip key={w.key} role="radio" selected={date === k} onPress={() => setDate(k)} label={tt(w.key)} />;
          })}
        </ChipRow>
        <DateNudge value={date} onChange={setDate} label={tt(transplant ? "add.whenTransplant" : "add.when")} />
      </Group>

      <View style={{ backgroundColor: t.raised, borderRadius: 14, padding: 14, gap: 8 }}>
        <Text style={{ color: t.ink, fontSize: 16, lineHeight: 22, fontWeight: "800" }}>{tt("plant.inputs")}</Text>
        {needs.map((n) => (
          <View key={n.label} style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
            <Text style={{ width: 84, color: t.dim, fontSize: 14, lineHeight: 20, fontWeight: "700" }}>{n.label}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.ink, fontSize: 15, lineHeight: 20, fontWeight: "700" }}>{n.amount}</Text>
              {n.when || n.note ? (
                <Text style={{ color: t.dim, ...T.meta }}>{pick(lang, (n.when ?? n.note)!)}</Text>
              ) : null}
            </View>
          </View>
        ))}
        <Text style={{ color: t.dim, fontSize: 12.5, lineHeight: 17 }}>{tt("plant.inputsNote")}</Text>
      </View>
    </Sheet>
  );
}

/* ── Money record ── */
const EXPENSE: ExpenseCat[] = ["seed", "fertilizer", "chemicals", "labour", "transport", "other"];
const INCOME: IncomeCat[] = ["sale", "other"];

export function RecordSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const { farm } = useFarm();
  const [kind, setKind] = useState<Entry["kind"]>("expense");
  const [cat, setCat] = useState<Entry["category"]>("seed");
  const [amount, setAmount] = useState("");
  const [crop, setCrop] = useState<CropKey | undefined>(undefined);
  const [note, setNote] = useState("");
  const [kgSold, setKgSold] = useState("");
  const [date, setDate] = useState(todayKey());
  const [tried, setTried] = useState(false);
  const amountRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!visible) return;
    setKind("expense"); setCat("seed"); setAmount(""); setNote(""); setKgSold(""); setDate(todayKey()); setTried(false);
    setCrop(farm.plantings[0]?.crop);
  }, [visible]);

  const value = Number(amount.replace(/[^\d.]/g, ""));
  const valid = isFinite(value) && value > 0;
  const isSale = kind === "income" && cat === "sale";
  const kg = isSale ? Number(kgSold) || 0 : 0;
  const crops = Array.from(new Set([...farm.plantings.map((p) => p.crop), ...CROP_KEYS]));

  const save = () => {
    if (!valid) { setTried(true); amountRef.current?.focus(); return; }
    farmActions.addEntry({ kind, category: cat, amount: Math.round(value), crop, kg: kg > 0 ? kg : undefined, note: note.trim() || undefined, date });
    announce(tt("rec.saved"));
    onClose();
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={tt("rec.add")}
      testID="sheet-record"
      footer={<Btn label={tt("rec.save")} onPress={save} style={{ flex: 1 }} testID="record-save" />}
    >
      <Segmented
        accessibilityLabel={tt("rec.kind")}
        options={[{ value: "expense", label: tt("rec.expense") }, { value: "income", label: tt("rec.income") }]}
        value={kind}
        onChange={(k) => { setKind(k); setCat(k === "income" ? "sale" : "seed"); }}
      />

      <Field
        label={tt("rec.amount")}
        glyph={null}
        value={amount}
        onChangeText={setAmount}
        inputRef={amountRef}
        height={56}
        inputStyle={{ fontSize: 20, fontWeight: "700" }}
        error={tried && !valid}
        status={tried && !valid ? { kind: "error", text: tt("rec.amountErr") } : null}
        statusMinHeight={0}
        inputProps={{ keyboardType: "numeric", placeholder: "0", testID: "record-amount", inputMode: "numeric" } as any}
      />

      <Group label={tt("rec.cat")}>
        <ChipRow role="radiogroup" label={tt("rec.cat")}>
          {(kind === "income" ? INCOME : EXPENSE).map((c) => (
            <Chip key={c} role="radio" selected={cat === c} onPress={() => setCat(c)} label={tt(`rec.cat.${c}` as Key)} />
          ))}
        </ChipRow>
      </Group>

      {isSale && (
        <Field
          label={tt("rec.kg")}
          glyph={null}
          value={kgSold}
          onChangeText={(v) => setKgSold(v.replace(/[^\d]/g, "").slice(0, 6))}
          height={52}
          inputStyle={{ fontSize: 17, fontWeight: "700" }}
          status={kg > 0 && valid ? { kind: "note", text: tt("rec.perKg", { p: Math.round(value / kg) }) } : null}
          statusMinHeight={0}
          inputProps={{ keyboardType: "numeric", inputMode: "numeric", testID: "record-kg" } as any}
        />
      )}

      <Group label={tt("rec.crop")}>
        <ChipRow role="radiogroup" label={tt("rec.crop")}>
          <Chip role="radio" selected={!crop} onPress={() => setCrop(undefined)} label={tt("rec.none")} />
          {crops.map((k) => (
            <Chip key={k} role="radio" selected={crop === k} onPress={() => setCrop(k)} label={cropName(lang, k)} leading={<CropCoin cropKey={k} size={24} />} />
          ))}
        </ChipRow>
      </Group>

      <Group label={tt("rec.date")}>
        <ChipRow role="radiogroup" label={tt("rec.date")}>
          <Chip role="radio" selected={date === todayKey()} onPress={() => setDate(todayKey())} label={tt("common.today")} />
          <Chip role="radio" selected={date === addDays(todayKey(), -1)} onPress={() => setDate(addDays(todayKey(), -1))} label={tt("common.yesterday")} />
        </ChipRow>
        <DateNudge value={date} onChange={setDate} label={tt("rec.date")} />
      </Group>

      <Field
        label={tt("rec.note")}
        glyph={null}
        value={note}
        onChangeText={setNote}
        height={52}
        inputStyle={{ fontSize: 16 }}
        status={null}
        statusMinHeight={0}
        inputProps={{ placeholder: tt("rec.notePh"), maxLength: 80 }}
      />
    </Sheet>
  );
}

