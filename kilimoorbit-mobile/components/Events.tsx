/**
 * Farm shows near the farmer (ASK calendar + Nairobi expos), one per page,
 * and the booking sheet: confirm, and the server's booking agent puts the
 * show in a calendar entry, emails a confirmation and schedules a reminder.
 * The farmer then taps "Open in Google Calendar" to save it on the phone.
 * Data and the farmer's bookings: lib/events.ts.
 */
import React, { useEffect, useRef, useState } from "react";
import { View, Platform } from "react-native";
import Text from "./Text";
import { haptic } from "../lib/haptics";
import { useTheme } from "../lib/theme-context";
import { useLang, useSession } from "../lib/session";
import { announce, isWeb, webLang } from "../lib/ui";
import { ageText } from "../lib/prices";
import { todayKey } from "../lib/dates";
import { bookShow, cancelBooking, type Booking, type Show } from "../lib/api";
import { bookingActions, googleCalendarUrl, onNow, useBookings, useShows, whenText, type MyBooking } from "../lib/events";
import { openLink } from "../lib/news";
import { useFarm } from "../lib/farm";
import type { Key } from "../lib/i18n";
import { Btn, Card, Chip, ChipRow, Eyebrow, Group, Sheet, T, Tag } from "./Kit";
import { Skeleton } from "./Motion";
import Field from "./Field";
import { ArrowGlyph, CheckCoin, SignalOffGlyph } from "./Glyphs";
import Pager from "./Pager";

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

export function ShowsCard({ county }: { county: string }) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const shows = useShows(county);
  const bookings = useBookings();
  const [open, setOpen] = useState<Show | null>(null);
  const today = todayKey();
  const d = shows.data;
  const list = d?.events.slice(0, 6) ?? [];
  return (
    <Card>
      <Eyebrow text={tt("shows.eyebrow", { county: (d?.county ?? county).toUpperCase() })} />
      {shows.status === "loading" && !d ? (
        <View style={{ gap: 10 }}>
          <Skeleton height={44} color={t.raised} radius={10} />
          <Skeleton height={14} width={"60%"} color={t.raised} />
        </View>
      ) : !d || !list.length ? (
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <SignalOffGlyph size={20} color={t.dim} />
          <Text style={{ flex: 1, color: t.dim, ...T.body }}>{tt(d ? "shows.empty" : "shows.none")}</Text>
        </View>
      ) : (
        <View testID="shows-card">
          {shows.status === "cached" && shows.cachedAgeMin != null && (
            <Text style={{ color: t.dim, ...T.meta, marginTop: -6, marginBottom: 8 }}>{tt("news.cached", { age: ageText(lang, shows.cachedAgeMin) })}</Text>
          )}
          <Pager
            items={list}
            keyOf={(s) => s.id}
            label={tt("shows.eyebrowA11y")}
            testID="shows"
            render={(s) => <ShowPage s={s} today={today} booked={bookings.some((b) => b.event_id === s.id && b.end >= today)} onOpen={() => setOpen(s)} />}
          />
          <Text style={{ color: t.dim, fontSize: 12.5, lineHeight: 17, marginTop: 8 }}>{tt("shows.note")}</Text>
        </View>
      )}
      <ShowSheet show={open} onClose={() => setOpen(null)} />
    </Card>
  );
}

function ShowPage({ s, today, booked, onOpen }: { s: Show; today: string; booked: boolean; onOpen: () => void }) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const live = onNow(s, today);
  const when = live ? tt("shows.onNow") : s.days_until === 0 ? tt("shows.today") : s.days_until === 1 ? tt("common.tomorrow") : tt("shows.inDays", { n: s.days_until });
  return (
    <View style={{ gap: 6, paddingRight: 2 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Text style={{ color: live ? t.ok : t.dim, ...T.meta, fontWeight: "700" }}>{when}</Text>
        {s.estimated && <Tag tone="warn" label={tt("shows.estimated")} />}
        {booked && <Tag tone="ok" label={tt("shows.going")} />}
      </View>
      <Text {...webLang("en")} style={{ color: t.ink, ...T.headline }} numberOfLines={2}>{s.name}</Text>
      <Text style={{ color: t.ink, ...T.meta }}>
        {whenText(lang, s.start, s.end)} · {s.town}{s.distance_km > 0 ? ` · ${tt("shows.km", { n: s.distance_km.toLocaleString("en-KE") })}` : ""}
      </Text>
      <Text {...webLang("en")} style={{ color: t.dim, ...T.meta }} numberOfLines={1}>{s.organiser}</Text>
      <Btn
        kind={booked ? "ghost" : "secondary"}
        small
        label={tt(booked ? "shows.manage" : "shows.book")}
        onPress={onOpen}
        icon={(c) => <ArrowGlyph size={14} color={c} />}
        style={{ flexDirection: "row-reverse", alignSelf: "flex-start", marginTop: 4 }}
        testID={`show-open-${s.id}`}
      />
    </View>
  );
}

/* ── booking ── */
type Phase = "form" | "working" | "done" | "failed";

export function ShowSheet({ show, onClose }: { show: Show | null; onClose: () => void }) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const { profile } = useSession();
  const { farm } = useFarm();
  const bookings = useBookings();
  const today = todayKey();
  const mine = show ? bookings.find((b) => b.event_id === show.id && b.end >= today) : undefined;
  const [email, setEmail] = useState("");
  const [remind, setRemind] = useState<1 | 3 | 7>(3);
  const [phase, setPhase] = useState<Phase>("form");
  const [result, setResult] = useState<Booking | null>(null);
  const [shown, setShown] = useState(0);
  const [tried, setTried] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  useEffect(() => {
    if (!show) return;
    setEmail(profile?.email ?? "");
    setRemind(3);
    setPhase("form");
    setResult(null);
    setShown(0);
    setTried(false);
  }, [show?.id]);

  // The agent's steps appear one at a time, so the farmer can read what was done.
  useEffect(() => {
    if (phase !== "working" || !result) return;
    if (shown >= result.steps.length) { haptic.success(); setPhase("done"); return; }
    const id = setTimeout(() => setShown((n) => n + 1), 420);
    return () => clearTimeout(id);
  }, [phase, result, shown]);

  if (!show) return null;
  const emailOk = !email.trim() || EMAIL_RE.test(email.trim());
  const name = profile?.name?.trim() || tt("shows.farmer");

  const book = async () => {
    if (!emailOk) { setTried(true); return; }
    setPhase("working");
    try {
      const r = await bookShow({ event_id: show.id, name, email: email.trim() || null, county: farm.county, remind_days: remind });
      if (!alive.current) return;
      bookingActions.add({
        id: r.booking_id, token: r.token, event_id: show.id, name: show.name, start: r.event.start, end: r.event.end, town: show.town,
        calendar_url: r.calendar_url, remind_on: r.remind_on, email: r.email, created: new Date().toISOString(),
      });
      setResult(r);
      announce(tt("shows.booked"));
    } catch {
      if (alive.current) { haptic.error(); setPhase("failed"); }
    }
  };
  const cancel = async () => {
    if (!mine) return;
    bookingActions.remove(mine.id);
    cancelBooking(mine.id, mine.token).catch(() => {});
    announce(tt("shows.cancelled"));
    onClose();
  };
  const calendarUrl = result?.calendar_url ?? mine?.calendar_url ?? googleCalendarUrl(show);

  return (
    <Sheet
      visible={!!show}
      onClose={onClose}
      title={show.name}
      testID="sheet-show"
      footer={
        phase === "form" && !mine
          ? <Btn label={tt("shows.confirm")} onPress={book} style={{ flex: 1 }} testID="show-book" />
          : phase === "working"
            ? <Btn label={tt("shows.working")} onPress={() => {}} disabled style={{ flex: 1 }} />
            : <Btn label={tt("shows.openCalendar")} onPress={() => openLink(calendarUrl)} style={{ flex: 1 }} testID="show-calendar" />
      }
    >
      <View style={{ gap: 4 }}>
        <Text style={{ color: t.ink, ...T.body, fontWeight: "700" }}>{whenText(lang, show.start, show.end)} · {show.venue}{show.venue !== show.town ? `, ${show.town}` : ""}</Text>
        <Text {...webLang("en")} style={{ color: t.dim, ...T.meta }}>{show.organiser}{show.distance_km > 0 ? ` · ${tt("shows.km", { n: show.distance_km.toLocaleString("en-KE") })}` : ""}</Text>
        {show.estimated && <Tag block tone="warn" label={tt("shows.estimatedLong")} />}
        {show.url && (
          <Btn kind="ghost" small label={tt("shows.site")} onPress={() => openLink(show.url!)} icon={(c) => <ArrowGlyph size={13} color={c} />} style={{ flexDirection: "row-reverse", alignSelf: "flex-start" }} />
        )}
      </View>

      {mine && phase === "form" ? (
        <View style={{ gap: 10 }} testID="show-mine">
          <Tag tone="ok" label={tt("shows.going")} />
          <Text style={{ color: t.ink, ...T.meta }}>
            {tt(mine.email === "SENT" ? "shows.mine.sent" : mine.email === "SIMULATED" ? "shows.mine.simulated" : "shows.mine.calendar", { date: whenText(lang, mine.remind_on, mine.remind_on) })}
          </Text>
          <Btn kind="ghost" small label={tt("shows.cancel")} onPress={cancel} style={{ alignSelf: "flex-start" }} testID="show-cancel" />
        </View>
      ) : phase === "form" ? (
        <>
          <Text style={{ color: t.ink, ...T.body }}>{tt("shows.how")}</Text>
          <Field
            label={tt("shows.email")}
            glyph={null}
            value={email}
            onChangeText={(v) => setEmail(v.replace(/\s/g, "").slice(0, 254))}
            height={52}
            inputStyle={{ fontSize: 16 }}
            error={tried && !emailOk}
            status={tried && !emailOk ? { kind: "error", text: tt("shows.emailErr") } : { kind: "rest", text: tt("shows.emailHint") }}
            statusMinHeight={0}
            inputProps={{ keyboardType: "email-address", autoCapitalize: "none", autoCorrect: false, placeholder: "jina@mfano.com", testID: "show-email" } as any}
          />
          <Group label={tt("shows.remind")}>
            <ChipRow role="radiogroup" label={tt("shows.remind")}>
              {([7, 3, 1] as const).map((d) => (
                <Chip key={d} role="radio" selected={remind === d} onPress={() => setRemind(d)} label={tt(d === 1 ? "shows.remind1" : "shows.remindN", { n: d })} testID={`show-remind-${d}`} />
              ))}
            </ChipRow>
          </Group>
          <Text style={{ color: t.dim, fontSize: 12.5, lineHeight: 17 }}>{tt("shows.privacy")}</Text>
        </>
      ) : phase === "failed" ? (
        <View style={{ gap: 10 }} testID="show-failed">
          <Tag block tone="bad" label={tt("shows.failed")} />
          <Text style={{ color: t.ink, ...T.meta }}>{tt("shows.failedCalendar")}</Text>
          <Btn kind="secondary" small label={tt("common.retry")} onPress={() => setPhase("form")} style={{ alignSelf: "flex-start" }} testID="show-retry" />
        </View>
      ) : (
        <View style={{ gap: 10 }} testID="show-agent">
          <Text style={{ color: t.dim, ...T.meta, fontWeight: "700" }}>{tt("shows.agent")}</Text>
          {(result?.steps ?? []).slice(0, shown).map((s, i) => (
            <View key={i} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }} testID={`agent-step-${i}`}>
              <CheckCoin size={22} bg={t.ok} fg={t.field} style={{ marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.dim, fontSize: 12, lineHeight: 16, fontFamily: "monospace", fontWeight: "700" }}>{s.agent.toUpperCase()}</Text>
                <Text {...webLang("en")} style={{ color: t.ink, ...T.meta }}>{s.action}</Text>
              </View>
            </View>
          ))}
          {phase === "working" && <Text style={{ color: t.dim, ...T.meta }}>{tt("shows.working")}</Text>}
          {phase === "done" && result && (
            <View style={{ gap: 8, marginTop: 4 }} testID="show-done">
              <Tag block tone={result.email === "FAILED" ? "warn" : "ok"} label={tt(`shows.email.${result.email}` as Key, { date: whenText(lang, result.remind_on, result.remind_on) })} />
              <Text style={{ color: t.ink, ...T.meta }}>{tt("shows.nextStep")}</Text>
              {isWeb && <Btn kind="ghost" small label={tt("shows.ics")} onPress={() => downloadIcs(result.ics)} style={{ alignSelf: "flex-start" }} testID="show-ics" />}
            </View>
          )}
        </View>
      )}
    </Sheet>
  );
}

/** Web only: hands the browser the .ics file (any calendar app opens it). */
function downloadIcs(ics: string) {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  try {
    const blob = new Blob([ics], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "farm-show.ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {}
}

/** Today: the next show the farmer booked, as one line. */
export function nextBookingLine(list: MyBooking[], today: string, lang: "sw" | "en"): { b: MyBooking; when: string } | null {
  const next = list.filter((b) => b.end >= today).sort((a, b) => a.start.localeCompare(b.start))[0];
  return next ? { b: next, when: whenText(lang, next.start, next.end) } : null;
}
