/**
 * Livestock (mifugo) UI: the Livestock section of Shamba (milk card, one card
 * per animal or flock), the three sheets (add an animal, record an event,
 * record milk) and Today's reminder rows. Logic lives in lib/livestock.ts,
 * storage in lib/herd.ts.
 */
import React, { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { View, Text, Pressable } from "react-native";
import { useTheme } from "../lib/theme-context";
import { useLang } from "../lib/session";
import { announce, focusRing, webCursor, type PressState } from "../lib/ui";
import { pick } from "../lib/agronomy";
import { addDays, dayMonth, daysBetween, todayKey } from "../lib/dates";
import {
  SPEC, SPECIES, eventsFor, fill, groupReminders, milkSeries, milkWeek, openReminders, remindersOf, statusOf,
  type Animal, type EventKind, type OpenReminder, type ReminderGroup, type Species,
} from "../lib/livestock";
import { herdActions, useHerd } from "../lib/herd";
import type { Key } from "../lib/i18n";
import { Btn, Card, CheckRow, Chip, ChipRow, Empty, Eyebrow, Group, Sheet, Stepper, T, Tag, tint } from "./Kit";
import { LevelBar } from "./Motion";
import { DateNudge } from "./FarmSheets";
import { dueText } from "./TaskRows";
import TrendTile from "./TrendTile";
import Field from "./Field";
import { ChevronGlyph, CrossGlyph, PlusGlyph } from "./Glyphs";

/* ── coin ── */
export function AnimalCoin({ species, size }: { species: Species; size: number }) {
  const t = useTheme();
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      aria-hidden
      style={{ width: size, height: size, borderRadius: 999, backgroundColor: t.raised, alignItems: "center", justifyContent: "center" }}
    >
      <Text maxFontSizeMultiplier={1} style={{ fontSize: Math.round(size * 0.55), lineHeight: Math.round(size * 0.75) }}>{SPEC[species].emoji}</Text>
    </View>
  );
}

const spName = (tt: (k: Key) => string, s: Species) => tt(`sp.${s}` as Key);
const isMilker = (a: Animal) => a.female && !!SPEC[a.species].milk;

/* ── Add an animal ── */
const AGO = [0, 7, 30, 60, 180];
const SERVED_AGO = [0, 30, 90, 180];

export function AddAnimalSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useTheme();
  const { t: tt } = useLang();
  const { herd } = useHerd();
  const [species, setSpecies] = useState<Species>("cow");
  const [name, setName] = useState("");
  const [female, setFemale] = useState(true);
  const [count, setCount] = useState("50");
  const [hatched, setHatched] = useState(todayKey());
  const [served, setServed] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setSpecies("cow"); setName(""); setFemale(true); setCount("50"); setHatched(addDays(todayKey(), -7)); setServed(null);
  }, [visible]);

  const today = todayKey();
  const flock = species === "chicken";
  const birds = Math.min(100000, Math.max(1, Number(count) || 0));
  const save = () => {
    const n = herd.animals.filter((a) => a.species === species).length + 1;
    const finalName = name.trim() || `${spName(tt, species)} ${n}`;
    herdActions.addAnimal(
      flock
        ? { species, name: finalName, female: true, born: hatched, count: birds }
        : { species, name: finalName, female, ...(female && served ? { served } : null) },
    );
    announce(tt("herd.added", { name: finalName }));
    onClose();
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={tt("herd.addTitle")}
      testID="sheet-add-animal"
      footer={<Btn label={tt("herd.add")} onPress={save} style={{ flex: 1 }} testID="animal-save" />}
    >
      <Group label={tt("herd.which")}>
        <ChipRow role="radiogroup" label={tt("herd.which")}>
          {SPECIES.map((s) => (
            <Chip key={s} role="radio" selected={s === species} onPress={() => setSpecies(s)} label={spName(tt, s)} leading={<AnimalCoin species={s} size={26} />} testID={`sp-${s}`} />
          ))}
        </ChipRow>
      </Group>

      <Field
        label={tt("herd.name")}
        glyph={null}
        value={name}
        onChangeText={(v) => setName(v.slice(0, 40))}
        height={52}
        inputStyle={{ fontSize: 16 }}
        status={null}
        statusMinHeight={0}
        inputProps={{ placeholder: tt("herd.namePh"), autoCapitalize: "words", testID: "animal-name" } as any}
      />

      {flock ? (
        <>
          <Field
            label={tt("herd.count")}
            glyph={null}
            value={count}
            onChangeText={(v) => setCount(v.replace(/[^\d]/g, "").slice(0, 6))}
            height={52}
            inputStyle={{ fontSize: 18, fontWeight: "700" }}
            status={null}
            statusMinHeight={0}
            inputProps={{ keyboardType: "numeric", inputMode: "numeric", testID: "animal-count" } as any}
          />
          <Group label={tt("herd.hatched")}>
            <ChipRow role="radiogroup" label={tt("herd.hatched")}>
              {AGO.map((d) => {
                const k = addDays(today, -d);
                return <Chip key={d} role="radio" selected={hatched === k} onPress={() => setHatched(k)} label={tt(`herd.ago.${d}` as Key)} />;
              })}
            </ChipRow>
            <DateNudge value={hatched} onChange={(k) => setHatched(k > today ? today : k)} label={tt("herd.hatched")} />
          </Group>
        </>
      ) : (
        <>
          <Group label={tt("herd.sex")}>
            <ChipRow role="radiogroup" label={tt("herd.sex")}>
              <Chip role="radio" selected={female} onPress={() => setFemale(true)} label={tt("herd.female")} testID="sex-f" />
              <Chip role="radio" selected={!female} onPress={() => setFemale(false)} label={tt("herd.male")} testID="sex-m" />
            </ChipRow>
          </Group>
          {female && (
            <Group label={tt("herd.served")}>
              <ChipRow role="radiogroup" label={tt("herd.served")}>
                <Chip role="radio" selected={!served} onPress={() => setServed(null)} label={tt("herd.notServed")} />
                {SERVED_AGO.map((d) => {
                  const k = addDays(today, -d);
                  return <Chip key={d} role="radio" selected={served === k} onPress={() => setServed(k)} label={tt(`herd.ago.${d}` as Key)} testID={`served-${d}`} />;
                })}
              </ChipRow>
              {served ? <DateNudge value={served} onChange={(k) => setServed(k > today ? today : k)} label={tt("herd.served")} /> : null}
            </Group>
          )}
        </>
      )}
      <Text style={{ color: t.dim, fontSize: 12.5, lineHeight: 17 }}>{tt("herd.vetNote")}</Text>
    </Sheet>
  );
}

/* ── Record an event ── */
export function EventSheet({
  visible, onClose, animals, kind,
}: { visible: boolean; onClose: () => void; animals: Animal[]; kind: EventKind | null }) {
  const { t: tt } = useLang();
  const [date, setDate] = useState(todayKey());
  const [note, setNote] = useState("");
  useEffect(() => { if (visible) { setDate(todayKey()); setNote(""); } }, [visible]);
  if (!kind || !animals.length) return null;
  const names = animals.map((a) => a.name).join(", ");
  const save = () => {
    herdActions.addEvent(animals.map((a) => a.id), kind, date > todayKey() ? todayKey() : date, note);
    announce(tt("ev.saved"));
    onClose();
  };
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={tt("ev.title", { event: tt(`ev.${kind}` as Key), name: names })}
      testID="sheet-event"
      footer={<Btn label={tt("rec.save")} onPress={save} style={{ flex: 1 }} testID="event-save" />}
    >
      <Group label={tt("ev.date")}>
        <ChipRow role="radiogroup" label={tt("ev.date")}>
          <Chip role="radio" selected={date === todayKey()} onPress={() => setDate(todayKey())} label={tt("common.today")} />
          <Chip role="radio" selected={date === addDays(todayKey(), -1)} onPress={() => setDate(addDays(todayKey(), -1))} label={tt("common.yesterday")} />
        </ChipRow>
        <DateNudge value={date} onChange={(k) => setDate(k > todayKey() ? todayKey() : k)} label={tt("ev.date")} />
      </Group>
      <Field
        label={tt("ev.note")}
        glyph={null}
        value={note}
        onChangeText={(v) => setNote(v.slice(0, 80))}
        height={52}
        inputStyle={{ fontSize: 16 }}
        status={null}
        statusMinHeight={0}
        inputProps={{ placeholder: tt(kind === "served" ? "ev.notePh" : "rec.notePh") }}
      />
    </Sheet>
  );
}

/* ── Record milk ── */
export function MilkSheet({ visible, onClose, animalId }: { visible: boolean; onClose: () => void; animalId?: string }) {
  const { t: tt } = useLang();
  const { herd } = useHerd();
  const milkers = herd.animals.filter(isMilker);
  const [who, setWho] = useState<string | undefined>(undefined);
  const [date, setDate] = useState(todayKey());
  const [litres, setLitres] = useState(0);
  const [price, setPrice] = useState("");

  const existing = (id: string | undefined, d: string) => herd.milk.find((m) => m.animalId === id && m.date === d)?.litres;
  const lastFor = (id: string | undefined) => [...herd.milk].reverse().find((m) => m.animalId === id)?.litres ?? 0;

  useEffect(() => {
    if (!visible) return;
    const id = animalId ?? milkers[0]?.id;
    setWho(id);
    setDate(todayKey());
    setLitres(existing(id, todayKey()) ?? lastFor(id));
    setPrice(herd.milkPrice ? String(herd.milkPrice) : "");
  }, [visible]);

  const pickWho = (id: string) => { setWho(id); setLitres(existing(id, date) ?? lastFor(id)); };
  const pickDate = (d: string) => { const k = d > todayKey() ? todayKey() : d; setDate(k); setLitres(existing(who, k) ?? litres); };
  const save = () => {
    if (!who) return;
    herdActions.setMilk(who, date, litres);
    const p = Number(price);
    herdActions.setMilkPrice(price.trim() && p > 0 ? p : null);
    announce(tt("milk.saved"));
    onClose();
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={tt("milk.title")}
      testID="sheet-milk"
      footer={<Btn label={tt("rec.save")} onPress={save} disabled={!who} style={{ flex: 1 }} testID="milk-save" />}
    >
      {milkers.length > 1 && (
        <Group label={tt("milk.who")}>
          <ChipRow role="radiogroup" label={tt("milk.who")}>
            {milkers.map((a) => (
              <Chip key={a.id} role="radio" selected={who === a.id} onPress={() => pickWho(a.id)} label={a.name} leading={<AnimalCoin species={a.species} size={24} />} />
            ))}
          </ChipRow>
        </Group>
      )}
      <Group label={tt(date === todayKey() ? "milk.litres" : "milk.litresOn")}>
        <Stepper value={litres} onChange={setLitres} step={0.5} min={0} max={60} format={(v) => `${v} L`} label={tt("milk.litresOn")} />
      </Group>
      <Group label={tt("ev.date")}>
        <ChipRow role="radiogroup" label={tt("ev.date")}>
          <Chip role="radio" selected={date === todayKey()} onPress={() => pickDate(todayKey())} label={tt("common.today")} />
          <Chip role="radio" selected={date === addDays(todayKey(), -1)} onPress={() => pickDate(addDays(todayKey(), -1))} label={tt("common.yesterday")} />
        </ChipRow>
        <DateNudge value={date} onChange={pickDate} label={tt("ev.date")} />
      </Group>
      <Field
        label={tt("milk.price")}
        glyph={null}
        value={price}
        onChangeText={(v) => setPrice(v.replace(/[^\d]/g, "").slice(0, 4))}
        height={52}
        inputStyle={{ fontSize: 17, fontWeight: "700" }}
        status={null}
        statusMinHeight={0}
        inputProps={{ keyboardType: "numeric", inputMode: "numeric", testID: "milk-price" } as any}
      />
    </Sheet>
  );
}

/* ── status line ── */
function StatusBlock({ a }: { a: Animal }) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const s = statusOf(a, todayKey());
  if (s.kind === "pregnant") {
    const over = s.day - s.of;
    return (
      <View style={{ marginTop: 12, gap: 8 }}>
        <Tag label={over > 0 ? tt("herd.overdue", { n: over }) : tt("herd.pregnant", { date: dayMonth(lang, s.due) })} tone={over > 0 ? "bad" : "ok"} />
        <LevelBar pct={Math.min(100, (s.day / s.of) * 100)} color={over > 0 ? t.alert : t.ok} track={t.raised} height={8} />
        <Text style={{ color: t.dim, fontSize: 12, lineHeight: 16 }}>{tt("herd.dayOf", { n: s.day, total: s.of })}</Text>
      </View>
    );
  }
  const label =
    s.kind === "milking" ? tt("herd.milking", { date: dayMonth(lang, s.since) })
    : s.kind === "open" ? tt("herd.open")
    : s.kind === "male" ? tt("herd.isMale")
    : s.ageDays != null ? tt("herd.flock", { count: s.count.toLocaleString("en-KE"), weeks: Math.floor(s.ageDays / 7) })
    : tt("herd.flockNoAge", { count: s.count.toLocaleString("en-KE") });
  return <View style={{ marginTop: 12 }}><Tag label={label} tone={s.kind === "milking" ? "water" : s.kind === "flock" ? "ok" : "dim"} /></View>;
}

/* ── reminder rows ── */
function useReminderTick() {
  const { t: tt } = useLang();
  return (r: OpenReminder) => {
    if (r.records) {
      herdActions.addEvent([r.animalId], r.records, todayKey());
      announce(tt("ev.saved"));
    } else {
      herdActions.toggleDone(r.animalId, r.id);
    }
  };
}

function ReminderRows({ a, rs, dates }: { a: Animal; rs: OpenReminder[]; dates?: boolean }) {
  const { lang, t: tt } = useLang();
  const { herd } = useHerd();
  const tick = useReminderTick();
  return (
    <View>
      {rs.map((r) => {
        const done = !!herd.done[`${a.id}:${r.id}`];
        const when = dates && r.inDays > 7 ? dayMonth(lang, r.due) : dueText(tt, r.inDays);
        return (
          <CheckRow
            key={r.id}
            testID={`rem-${a.id}-${r.id.split("@")[0]}`}
            checked={done}
            onToggle={() => (done ? herdActions.toggleDone(a.id, r.id) : tick(r))}
            title={fill(pick(lang, r.title), a.name)}
            meta={when}
            metaTone={r.inDays < 0 ? "late" : r.inDays <= 1 ? "soon" : undefined}
          />
        );
      })}
    </View>
  );
}

/* ── one animal ── */
function AnimalCard({ a, onRecord, onMilk }: { a: Animal; onRecord: (k: EventKind) => void; onMilk: () => void }) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const { herd } = useHerd();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const today = todayKey();
  const next = openReminders([a], herd.done, today, 7).slice(0, 2);
  const upcoming = remindersOf(a, today)
    .map((r) => ({ ...r, inDays: daysBetween(today, r.due) }))
    .filter((r) => !herd.done[`${a.id}:${r.id}`] && r.inDays >= -14 && r.inDays <= 120)
    .sort((x, y) => x.inDays - y.inDays);
  const history = [...a.events].sort((x, y) => (x.date < y.date ? 1 : -1)).slice(0, 6);
  const sub = a.species === "chicken" ? spName(tt, a.species) : `${spName(tt, a.species)} · ${tt(a.female ? "herd.female" : "herd.male")}`;

  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <AnimalCoin species={a.species} size={44} />
        <View style={{ flex: 1 }}>
          <Text accessibilityRole="header" aria-level={2} style={{ color: t.ink, fontSize: 19, lineHeight: 24, fontWeight: "800" }}>{a.name}</Text>
          <Text style={{ color: t.dim, ...T.meta }}>{sub}</Text>
        </View>
        {isMilker(a) && (
          <Btn kind="secondary" small label={tt("milk.add")} onPress={onMilk} testID={`milk-${a.id}`} />
        )}
      </View>
      <StatusBlock a={a} />

      {!open && (
        <View style={{ marginTop: 12 }}>
          <Text style={{ color: t.dim, ...T.meta, fontWeight: "700", marginBottom: 2 }}>{tt("herd.next")}</Text>
          {next.length ? <ReminderRows a={a} rs={next} /> : <Text style={{ color: t.dim, ...T.body, paddingVertical: 8 }}>{tt("herd.none")}</Text>}
        </View>
      )}

      {open && (
        <View style={{ marginTop: 12, gap: 14 }}>
          {upcoming.length ? <ReminderRows a={a} rs={upcoming} dates /> : <Text style={{ color: t.dim, ...T.body }}>{tt("herd.none")}</Text>}

          <View style={{ gap: 8 }}>
            <Text style={{ color: t.dim, ...T.meta, fontWeight: "700" }}>{tt("herd.record")}</Text>
            <ChipRow>
              {eventsFor(a).map((k) => (
                <Chip key={k} label={tt(`ev.${k}` as Key)} onPress={() => onRecord(k)} leading={<PlusGlyph size={11} color={t.accent} />} testID={`record-${k}`} />
              ))}
            </ChipRow>
          </View>

          <View style={{ gap: 4 }}>
            <Text style={{ color: t.dim, ...T.meta, fontWeight: "700" }}>{tt("herd.history")}</Text>
            {history.length === 0 ? (
              <Text style={{ color: t.dim, ...T.meta }}>{tt("herd.noHistory")}</Text>
            ) : (
              history.map((e) => (
                <View key={e.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 40 }}>
                  <Text style={{ width: 52, color: t.dim, fontSize: 12.5, fontWeight: "700" }}>{dayMonth(lang, e.date)}</Text>
                  <Text style={{ flex: 1, color: t.ink, ...T.meta }}>{tt(`ev.${e.kind}` as Key)}{e.note ? ` · ${e.note}` : ""}</Text>
                  <Pressable
                    onPress={() => herdActions.removeEvent(a.id, e.id)}
                    accessibilityRole="button"
                    accessibilityLabel={tt("ev.undo", { what: `${tt(`ev.${e.kind}` as Key)}, ${dayMonth(lang, e.date)}` })}
                    style={({ pressed, hovered, focused }: PressState) => [
                      { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
                      (hovered || pressed) && { backgroundColor: t.raised },
                      webCursor, focusRing(focused, t.accent),
                    ]}
                  >
                    <CrossGlyph size={11} color={t.dim} />
                  </Pressable>
                </View>
              ))
            )}
          </View>

          <Text style={{ color: t.dim, fontSize: 12.5, lineHeight: 17 }}>{tt("herd.vetNote")}</Text>

          {confirm ? (
            <View style={{ gap: 10 }}>
              <Text style={{ color: t.ink, ...T.body, fontWeight: "700" }}>{tt("herd.removeAsk", { name: a.name })}</Text>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Btn kind="secondary" label={tt("common.cancel")} onPress={() => setConfirm(false)} style={{ flex: 1 }} />
                <Btn kind="danger" label={tt("herd.removeYes")} onPress={() => herdActions.removeAnimal(a.id)} style={{ flex: 1 }} testID="animal-remove-yes" />
              </View>
            </View>
          ) : (
            <Btn kind="ghost" small label={tt("herd.remove")} onPress={() => setConfirm(true)} icon={(c) => <CrossGlyph size={12} color={c} />} style={{ alignSelf: "flex-start" }} />
          )}
        </View>
      )}

      <Pressable
        onPress={() => { setOpen((o) => !o); setConfirm(false); }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        testID={`animal-toggle-${a.id}`}
        style={({ pressed, hovered, focused }: PressState) => [
          { minHeight: 48, marginTop: 6, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12 },
          (hovered || pressed) && { backgroundColor: t.raised },
          webCursor, focusRing(focused, t.accent),
        ]}
      >
        <Text style={{ color: t.accent, fontSize: 15, lineHeight: 20, fontWeight: "700" }}>
          {open ? tt("common.close") : upcoming.length ? tt("herd.more", { n: upcoming.length }) : tt("common.more")}
        </Text>
        <ChevronGlyph size={12} color={t.accent} dir={open ? "up" : "down"} />
      </Pressable>
    </Card>
  );
}

/* ── milk card ── */
function MilkCard({ onAdd }: { onAdd: () => void }) {
  const t = useTheme();
  const { t: tt } = useLang();
  const { herd } = useHerd();
  const today = todayKey();
  const { dates, litres } = milkSeries(herd.milk, today, 14);
  const week = milkWeek(herd.milk, today);
  // A trend needs a few recorded days; one entry would draw a misleading flat zero line.
  const any = litres.filter((x) => x > 0).length >= 3;
  return (
    <Card>
      <Eyebrow text={tt("milk.eyebrow")} />
      {any ? (
        <TrendTile
          testID="milk-trend"
          label={tt("milk.trend")}
          prices={litres}
          dates={dates}
          changePct={week.changePct}
          a11yName=""
          fmt={(v) => `${v} L`}
          summary={tt("milk.a11y", { first: litres[0], last: litres[13], lo: Math.min(...litres), hi: Math.max(...litres) })}
        />
      ) : null}
      <Text style={{ color: t.ink, ...T.body, fontWeight: "700", marginTop: any ? 12 : 0 }} testID="milk-week">
        {herd.milkPrice
          ? tt("milk.weekValue", { n: week.thisWeek, v: Math.round(week.thisWeek * herd.milkPrice).toLocaleString("en-KE") })
          : tt("milk.week", { n: week.thisWeek })}
      </Text>
      <Btn label={tt("milk.add")} onPress={onAdd} icon={(c) => <PlusGlyph size={14} color={c} />} style={{ marginTop: 12 }} testID="milk-add" />
    </Card>
  );
}

/* ── the Livestock section of Shamba ── */
export function HerdSection() {
  const t = useTheme();
  const { t: tt } = useLang();
  const { herd } = useHerd();
  const [adding, setAdding] = useState(false);
  const [event, setEvent] = useState<{ animal: Animal; kind: EventKind } | null>(null);
  const [milkFor, setMilkFor] = useState<string | undefined | null>(null);
  const hasMilkers = herd.animals.some(isMilker);

  return (
    <View style={{ gap: 14 }}>
      {herd.animals.length === 0 ? (
        <Card>
          <Empty
            glyph={<View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: tint(t.ok, 0.18), alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 28 }}>🐄</Text></View>}
            title={tt("herd.empty.title")}
            body={tt("herd.empty.body")}
            action={<Btn label={tt("herd.add")} onPress={() => setAdding(true)} icon={(c) => <PlusGlyph size={14} color={c} />} testID="herd-add" />}
          />
        </Card>
      ) : (
        <>
          {hasMilkers && <MilkCard onAdd={() => setMilkFor(undefined)} />}
          {herd.animals.map((a) => (
            <AnimalCard key={a.id} a={a} onRecord={(kind) => setEvent({ animal: a, kind })} onMilk={() => setMilkFor(a.id)} />
          ))}
          <Btn kind="secondary" label={tt("herd.add")} onPress={() => setAdding(true)} icon={(c) => <PlusGlyph size={14} color={c} />} testID="herd-add" />
        </>
      )}
      <AddAnimalSheet visible={adding} onClose={() => setAdding(false)} />
      <EventSheet visible={!!event} onClose={() => setEvent(null)} animals={event ? [event.animal] : []} kind={event?.kind ?? null} />
      <MilkSheet visible={milkFor !== null} onClose={() => setMilkFor(null)} animalId={milkFor ?? undefined} />
    </View>
  );
}

/* ── Today: livestock reminders, grouped ── */
export function HerdRows({ max = 3 }: { max?: number }) {
  const { lang, t: tt } = useLang();
  const { herd } = useHerd();
  const today = todayKey();
  // Ticked on this visit: kept, struck through, with their event ids for undo.
  const [ticked, setTicked] = useState<{ g: ReminderGroup; made: { animalId: string; eventId: string }[] }[]>([]);
  useFocusEffect(useCallback(() => () => setTicked([]), []));
  const byId = new Map(herd.animals.map((a) => [a.id, a]));
  const open = groupReminders(openReminders(herd.animals, herd.done, today, 7), (id) => byId.get(id)?.species);
  const shown = [...ticked.map((x) => x.g), ...open.filter((g) => !ticked.some((x) => x.g.key === g.key))]
    .sort((a, b) => a.inDays - b.inDays)
    .slice(0, max + ticked.length);
  if (!shown.length) return null;

  return (
    <View>
      {shown.map((g) => {
        const first = g.items[0];
        const animal = byId.get(first.animalId);
        if (!animal) return null;
        const names = g.items.map((r) => byId.get(r.animalId)?.name).filter(Boolean).join(", ");
        const title = g.items.length > 1 && first.short ? `${pick(lang, first.short)}: ${names}` : fill(pick(lang, first.title), animal.name);
        const done = ticked.some((x) => x.g.key === g.key);
        const toggle = () => {
          if (done) {
            const x = ticked.find((y) => y.g.key === g.key)!;
            if (x.made.length) x.made.forEach((m) => herdActions.removeEvent(m.animalId, m.eventId));
            else g.items.forEach((r) => herdActions.toggleDone(r.animalId, r.id));
            setTicked((s) => s.filter((y) => y.g.key !== g.key));
            return;
          }
          const made = g.records ? herdActions.addEvent(g.items.map((r) => r.animalId), g.records, today) : [];
          if (!g.records) g.items.forEach((r) => herdActions.toggleDone(r.animalId, r.id));
          setTicked((s) => [...s, { g, made }]);
          announce(tt("ev.saved"));
        };
        return (
          <CheckRow
            key={g.key}
            testID={`herd-task-${first.id.split("@")[0]}`}
            checked={done}
            onToggle={toggle}
            title={title}
            meta={`${dueText(tt, g.inDays)} · ${spName(tt, animal.species)}`}
            metaTone={g.inDays < 0 ? "late" : g.inDays <= 1 ? "soon" : undefined}
            leading={<AnimalCoin species={animal.species} size={30} />}
          />
        );
      })}
    </View>
  );
}

export const herdHasMilkers = (animals: Animal[]) => animals.some(isMilker);
