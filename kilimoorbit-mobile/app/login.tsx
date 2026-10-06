/**
 * Login ("Msimu Orbit"): phone-first device sign-in for smallholder farmers.
 * Variants: form, returning user, result panel, and edit (?mode=edit).
 * Layouts: phone (< 600, fixed action bar), medium (600–899), wide (>= 900, two panes).
 * No password and no OTP: a lightweight profile saved on this phone.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View, ScrollView, Pressable, KeyboardAvoidingView, Platform, TextInput,
  useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent,
  type StyleProp, type ViewStyle,
} from "react-native";
import Text from "../components/Text";
import { haptic } from "../lib/haptics";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  FadeIn, FadeInDown, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue,
  withDelay, withSequence, withSpring, withTiming,
} from "react-native-reanimated";
import { Redirect, router, useLocalSearchParams, useNavigation } from "expo-router";
import * as Speech from "expo-speech";
import { useTheme, useThemeControls } from "../lib/theme-context";
import { useLang, useSession, type Profile } from "../lib/session";
import { ApiError, TimeoutError, signIn } from "../lib/api";
import type { Key } from "../lib/i18n";
import { seasonFor } from "../lib/season";
import { usePriceBoard, cropName } from "../lib/prices";
import {
  displayE164, firstName, formatKePhoneInput, initials, isValidEmail, isValidName, maskEmail, maskPhone,
  normalizeEmail, normalizeKePhone, normalizeName, PHONE_INPUT_MAX,
} from "../lib/phone";
import { announce, breakpointFor, focusElement, focusRing, webCursor, type PressState } from "../lib/ui";
import { Enter } from "../components/Motion";
import Field, { type FieldStatus } from "../components/Field";
import ShambaPanel from "../components/ShambaPanel";
import {
  BackButton, Banner, Cta, LangPill, LinkButton, ListenPill, OutlineButton, SunToggle, Wordmark, type CtaState,
} from "../components/auth/Controls";
import { CheckGlyph, CrossGlyph, PersonGlyph, PhoneGlyph, PlusGlyph, SignalOffGlyph } from "../components/Glyphs";

type FieldKey = "phone" | "name" | "email";
type ResultVariant = "emailSent" | "emailSimulated" | "offline" | "serverBusy";
type Values = { name: string; phone?: string; email?: string };
/** Text typed into the phone box: an email ("@"), a name (letters and no
 *  digits), or a number. Anything with a digit in it is never called a name. */
const phoneTextKind = (v: string): "email" | "letters" | "digits" =>
  v.includes("@") ? "email" : !/\d/.test(v) && /\p{L}/u.test(v) ? "letters" : "digits";

/** A number typed on a hardware keyboard with the letter O for zero or l/I for
 *  one ("O712 345 678"): when the only letters are those look-alikes and there
 *  is at least one digit, read them as the digits the farmer meant. */
const fixDigitLookalikes = (v: string) =>
  v.includes("@") || !/\d/.test(v) || /[^\dOoIl\s+\-().]/.test(v)
    ? v
    : v.replace(/[Oo]/g, "0").replace(/[Il]/g, "1");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Go to the dashboard: back to it when it is already under /login (guest opened
 *  login from the menu), otherwise replace /login so Back cannot return here. */
const goHome = () => (router.canGoBack() ? router.dismissTo("/") : router.replace("/"));

export default function LoginRoute() {
  const t = useTheme();
  const { ready } = useThemeControls();
  const session = useSession();
  const params = useLocalSearchParams<{ mode?: string }>();
  // Set just before we navigate away ourselves, so the signed-in redirect
  // below does not race our own router.replace.
  const leaving = useRef(false);

  if (session.status === "loading" || !ready) return <View style={{ flex: 1, backgroundColor: t.bg }} />;
  const edit = params.mode === "edit" && session.status === "signedIn";
  if (session.status === "signedIn" && params.mode !== "edit" && !leaving.current) return <Redirect href="/" />;
  return <LoginScreen edit={edit} leaving={leaving} />;
}

function LoginScreen({ edit, leaving }: { edit: boolean; leaving: React.MutableRefObject<boolean> }) {
  const t = useTheme();
  const session = useSession();
  const { lang, t: tt } = useLang();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const bp = breakpointFor(width);
  const phoneBp = bp === "phone";
  const wide = bp === "wide";
  const compact = phoneBp && height < 700;
  const gutter = width < 360 ? 16 : width >= 420 ? 24 : 20;

  const season = useMemo(() => seasonFor(new Date()), []);
  const board = usePriceBoard();

  /* ── form state ── */
  const p0 = edit ? session.profile : null;
  const [phone, setPhone] = useState(p0?.phone ? formatKePhoneInput("0" + p0.phone.slice(4)) : "");
  const [name, setName] = useState(p0?.name ?? "");
  const [email, setEmail] = useState(p0?.email ?? "");
  const [emailOpen, setEmailOpen] = useState(!!p0?.email);
  const [errs, setErrs] = useState<Partial<Record<FieldKey, Key>>>({});
  const [shake, setShake] = useState<Record<FieldKey, number>>({ phone: 0, name: 0, email: 0 });
  const [movedNote, setMovedNote] = useState<null | "email" | "name">(null);
  const [banner, setBanner] = useState<null | "rejected">(null);
  const [cta, setCta] = useState<CtaState>("idle");
  const [successLabel, setSuccessLabel] = useState("");
  // timedOut: the request left the phone but no answer came in time, so the
  // server may still have sent the welcome email (the copy is hedged).
  const [result, setResult] = useState<null | { variant: ResultVariant; profile: Profile; timedOut?: boolean }>(null);
  const [notMe, setNotMe] = useState(false);
  // Snapshot of the returning profile while "Endelea kama…" runs, so the
  // returning card stays on screen until navigation (no flash of the form).
  const [restoring, setRestoring] = useState<Profile | null>(null);
  const [stripOpen, setStripOpen] = useState(false);
  const [trustOpen, setTrustOpen] = useState(false);
  const busy = useRef(false);
  const alive = useRef(true);
  const lastValues = useRef<Values | null>(null);
  useEffect(() => () => { alive.current = false; }, []);
  // Set when this screen is being left by any route (Back button, hardware
  // back, our own navigation), so a pending success hold never navigates twice.
  const gone = useRef(false);
  const navigation = useNavigation();
  useEffect(() => navigation.addListener("beforeRemove", () => { gone.current = true; }), [navigation]);

  const phoneRef = useRef<TextInput>(null);
  const nameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const ctaRef = useRef<View>(null);
  const scrollRef = useRef<ScrollView>(null);
  // The visible scroll area (excludes the phone action bar and the wide controls row).
  const viewportRef = useRef<View>(null);
  const scrollY = useRef(0);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => { scrollY.current = e.nativeEvent.contentOffset.y; };
  const phoneWrap = useRef<View>(null);
  const nameWrap = useRef<View>(null);
  const emailWrap = useRef<View>(null);
  const wraps: Record<FieldKey, React.RefObject<View | null>> = { phone: phoneWrap, name: nameWrap, email: emailWrap };
  const refs: Record<FieldKey, React.RefObject<TextInput | null>> = { phone: phoneRef, name: nameRef, email: emailRef };
  // Wide, short windows (most laptops): tighter vertical rhythm and the trust
  // details behind a disclosure, so the whole column fits without a sentence
  // being cut at the fold.
  const wideShort = wide && height < 980;

  const returnProfile = restoring ?? session.lastProfile;
  const returning = !edit && !result && !notMe && (!!restoring || (session.status !== "signedIn" && !!session.lastProfile));
  const offline = board.offline;

  /* ── validation ── */
  const emailValidNow = emailOpen && isValidEmail(email);
  const phoneErrKey = (v: string, emailOk: boolean): Key | undefined => {
    const r = normalizeKePhone(v);
    if (r.ok) return undefined;
    if (r.reason === "empty") return emailOk ? undefined : "phone.err.empty";
    if (r.reason === "notPhone") return "phone.err.digits";
    return `phone.err.${r.reason}` as Key;
  };
  const nameErrKey = (v: string): Key | undefined => (isValidName(v) ? undefined : "name.err");
  const emailErrKey = (v: string, open: boolean): Key | undefined =>
    !open || !v.trim() ? undefined : isValidEmail(v) ? undefined : "email.err";

  const phoneCheck = normalizeKePhone(phone);

  /* ── language switch acknowledgement: a quick opacity dip ── */
  const dip = useSharedValue(1);
  const firstLang = useRef(true);
  useEffect(() => {
    if (firstLang.current) { firstLang.current = false; return; }
    if (reduce) return;
    dip.value = withSequence(withTiming(0.6, { duration: 75 }), withTiming(1, { duration: 75 }));
  }, [lang]);
  const dipStyle = useAnimatedStyle(() => ({ opacity: dip.value }));

  /* ── phone action bar entrance ── */
  const bar = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) { bar.value = 1; return; }
    bar.value = withDelay(270, withSpring(1, { damping: 18, stiffness: 160, reduceMotion: ReduceMotion.System }));
  }, []);
  const barStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, bar.value), transform: [{ translateY: 24 * (1 - bar.value) }] }));

  /* ── handlers ── */
  const onPhoneChange = (raw: string) => {
    const v = formatKePhoneInput(fixDigitLookalikes(raw));
    setPhone(v);
    setMovedNote(null);
    if (errs.phone) setErrs((e) => ({ ...e, phone: phoneErrKey(v, emailValidNow) }));
  };
  const onPhoneBlur = () => {
    if (!phone.trim()) return;
    const kind = phoneTextKind(phone);
    if (kind === "email") {
      // An email typed into the phone box: move it where it belongs.
      const moved = phone.trim();
      setEmail(moved);
      setEmailOpen(true);
      setPhone("");
      setMovedNote("email");
      setErrs((e) => ({ ...e, phone: undefined, email: e.email ? emailErrKey(moved, true) : undefined }));
      return;
    }
    if (kind === "letters" && !name.trim()) {
      // A name typed into the phone box (a common first-box mistake): move it
      // into the empty name field instead of calling it an email.
      const moved = normalizeName(phone);
      setName(moved);
      setPhone("");
      setMovedNote("name");
      setErrs((e) => ({ ...e, phone: undefined, name: e.name ? nameErrKey(moved) : undefined }));
      return;
    }
    const k = phoneErrKey(phone, emailValidNow);
    if (k) setErrs((e) => ({ ...e, phone: k }));
  };
  const onNameChange = (v: string) => {
    setName(v);
    if (errs.name) setErrs((e) => ({ ...e, name: nameErrKey(v) }));
  };
  const onNameBlur = () => {
    if (!name.trim()) return;
    const k = nameErrKey(name);
    if (k) setErrs((e) => ({ ...e, name: k }));
  };
  const onEmailChange = (v: string) => {
    setEmail(v);
    const ok = isValidEmail(v);
    setErrs((e) => ({
      ...e,
      email: e.email ? emailErrKey(v, true) : undefined,
      phone: e.phone === "phone.err.empty" && ok ? undefined : e.phone,
    }));
  };
  const onEmailBlur = () => {
    if (!email.trim()) return;
    const k = emailErrKey(email, true);
    if (k) setErrs((e) => ({ ...e, email: k }));
  };
  const removeEmail = () => {
    setEmail("");
    setEmailOpen(false);
    setErrs((e) => ({ ...e, email: undefined }));
  };

  /** Scrolls the field group (label, input, status line) fully into the visible
   *  scroll area. Measured in window coordinates against the viewport, so it is
   *  correct whatever wraps the field; a no-op when it is already fully visible. */
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollToField = (k: FieldKey, delay = 0) => {
    // One pending measurement at a time: overlapping calls (focus + submit)
    // would otherwise measure mid-scroll against a stale offset.
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    const run = () => {
      scrollTimer.current = null;
      const vp = viewportRef.current;
      const el = wraps[k].current;
      if (!vp || !el || !alive.current) return;
      vp.measureInWindow((_vx, vy, _vw, vh) => {
        el.measureInWindow((_fx, fy, _fw, fh) => {
          const top = fy - vy;
          const bottom = top + fh;
          const margin = 12;
          if (top >= margin && bottom <= vh - margin) return;
          // Above the viewport (or taller than it): align its top 16px down.
          // Below: scroll just enough to show its bottom, never past its top.
          const delta = top < margin || fh > vh - 2 * margin ? top - 16 : Math.min(bottom - vh + 16, top - 16);
          scrollRef.current?.scrollTo({ y: Math.max(0, scrollY.current + delta), animated: !reduce });
        });
      });
    };
    scrollTimer.current = setTimeout(run, delay);
  };
  const onFieldFocus = (k: FieldKey) => {
    if (!phoneBp) return;
    const wasOpen = stripOpen;
    setStripOpen(false);
    // Wait for the strip to collapse, or for a just-opened email field to settle.
    scrollToField(k, wasOpen ? 260 : k === "email" ? 200 : 60);
  };

  const failFields = (next: Partial<Record<FieldKey, Key>>) => {
    const order = (["phone", "name", "email"] as FieldKey[]).filter((k) => next[k]);
    if (!order.length) return;
    const first = order[0];
    setShake((s) => ({ ...s, [first]: s[first] + 1 }));
    refs[first].current?.focus();
    scrollToField(first, phoneBp ? 220 : 80);
    announce(tt(next[first]!));
    if (order.length > 1) setTimeout(() => announce(tt("a11y.fixFields", { n: order.length })), 700);
  };

  const navigateOut = () => {
    if (gone.current) return;
    gone.current = true;
    if (edit) {
      if (router.canGoBack()) router.back();
      else router.replace("/");
    } else goHome();
  };

  const finish = async (profile: Profile) => {
    leaving.current = true;
    await session.activate(profile);
    navigateOut();
  };

  /** Result panel: the profile is saved as soon as the panel says "you're signed
   *  in", so leaving the app here does not lose the sign-in. Endelea only navigates. */
  const showResult = async (variant: ResultVariant, profile: Profile, timedOut = false) => {
    leaving.current = true; // keep this screen while the signed-in panel is shown
    await session.activate(profile);
    if (!alive.current) return;
    setCta("idle");
    busy.current = false;
    setResult({ variant, profile, timedOut });
  };

  /** retry: started from the result panel's "Jaribu tena". The panel stays on
   *  screen while the request runs (its primary button shows the loading
   *  state), and is replaced only once there is an outcome. */
  const run = async (values: Values, retry = false) => {
    lastValues.current = values;
    setCta("loading");
    const started = Date.now();
    const base: Profile = {
      v: 2,
      name: values.name,
      method: values.phone ? "phone" : "email",
      ...(values.phone ? { phone: values.phone } : {}),
      ...(values.email ? { email: values.email } : {}),
      lang,
      signedInAt: new Date().toISOString(),
      serverAck: false,
    };
    // Edit mode: an email that did not change is not sent again, so saving a
    // new phone number never re-sends the welcome email (or spends one of the
    // email limiter's slots). With no phone either, there is nothing to send:
    // the edit is saved on this phone only, keeping the earlier server status.
    const prev = edit ? session.profile : null;
    const emailUnchanged = !!prev?.email && !!values.email && normalizeEmail(prev.email) === values.email;
    const req: Values = emailUnchanged ? { name: values.name, ...(values.phone ? { phone: values.phone } : {}) } : values;
    const localOnly = edit && !req.phone && !req.email;

    let res: Awaited<ReturnType<typeof signIn>> | null = null;
    let err: unknown = null;
    if (!localOnly) {
      try { res = await signIn(req); } catch (e) { err = e; }
    }
    const wait = 350 - (Date.now() - started);
    if (wait > 0) await sleep(wait);
    if (!alive.current) return;

    if (localOnly && prev) {
      res = { status: prev.delivery ?? "SIMULATED", channel: "phone", message: "" };
      base.serverAck = prev.serverAck;
    }

    if (res) {
      const profile: Profile = localOnly && prev
        ? { ...base, ...(prev.delivery ? { delivery: prev.delivery } : {}) }
        : { ...base, serverAck: true, delivery: res.status };
      if (res.channel === "phone" || (!res.channel && !req.email)) {
        setSuccessLabel(edit ? tt("edit.saved") : tt("cta.success", { name: firstName(values.name) }));
        haptic.success();
        setCta("success");
        await sleep(reduce ? 400 : 700);
        // Left during the hold (e.g. Back in edit mode): keep the saved details,
        // but do not navigate a second time.
        if (!alive.current || gone.current) { await session.activate(profile); return; }
        await finish(profile);
        return;
      }
      await showResult(res.status === "SENT" ? "emailSent" : "emailSimulated", profile);
      return;
    }

    setCta("idle");
    busy.current = false;
    if (err instanceof ApiError && err.status === 400) {
      // A retry the server rejects goes back to the form to show the error.
      if (retry) setResult(null);
      // Nothing is saved; map the server's verdict onto a field.
      const map: Record<string, [FieldKey, Key]> = {
        INVALID_PHONE: ["phone", "phone.err.prefix"],
        INVALID_NAME: ["name", "name.err"],
        INVALID_EMAIL: ["email", "email.err"],
        MISSING_CONTACT: ["phone", "phone.err.empty"],
      };
      const hit = err.errorType ? map[err.errorType] : undefined;
      if (hit) {
        const next = { [hit[0]]: hit[1] } as Partial<Record<FieldKey, Key>>;
        if (hit[0] === "email") setEmailOpen(true);
        setErrs(next);
        failFields(next);
      } else {
        setBanner("rejected");
        announce(tt("form.rejected"));
      }
      return;
    }
    const variant: ResultVariant = err instanceof ApiError ? "serverBusy" : "offline";
    // Edit mode keeps the earlier delivery status; the edit itself is local.
    await showResult(variant, prev ? { ...base, ...(prev.delivery ? { delivery: prev.delivery } : {}) } : base, err instanceof TimeoutError);
  };

  const submit = () => {
    if (busy.current) return;
    Speech.stop();
    let ph = phone, em = email, open = emailOpen, nm = name;
    const kind = phoneTextKind(ph);
    if (kind === "email") {
      em = ph.trim(); open = true; ph = "";
      setEmail(em); setEmailOpen(true); setPhone(""); setMovedNote("email");
    } else if (kind === "letters" && !nm.trim()) {
      nm = normalizeName(ph); ph = "";
      setName(nm); setPhone(""); setMovedNote("name");
    }
    // Letters with a name already typed stay put: the phone error says "digits only".
    const emailOk = open && isValidEmail(em);
    const next: Partial<Record<FieldKey, Key>> = {
      phone: phoneErrKey(ph, emailOk),
      name: nameErrKey(nm),
      email: emailErrKey(em, open),
    };
    setErrs(next);
    setBanner(null);
    if (next.phone || next.name || next.email) { failFields(next); return; }
    busy.current = true;
    const norm = normalizeKePhone(ph);
    run({
      name: normalizeName(nm),
      phone: norm.ok ? norm.e164 : undefined,
      email: emailOk ? normalizeEmail(em) : undefined,
    });
  };

  const retry = () => {
    if (busy.current || !lastValues.current) return;
    busy.current = true;
    Speech.stop();
    run(lastValues.current, true);
  };

  const continueResult = () => {
    if (busy.current || !result) return;
    busy.current = true;
    navigateOut();
  };

  const continueReturning = async () => {
    if (busy.current || !session.lastProfile) return;
    busy.current = true;
    leaving.current = true;
    setRestoring(session.lastProfile);
    setCta("loading");
    await session.restoreLast();
    await sleep(reduce ? 0 : 350);
    navigateOut();
  };

  const asGuest = async () => {
    if (busy.current) return;
    busy.current = true;
    Speech.stop();
    await session.continueAsGuest();
    navigateOut();
  };

  // Result panel: move focus to its primary button and read it out.
  useEffect(() => {
    if (!result) return;
    const copy = resultCopy(result.variant, result.profile, result.timedOut);
    const id = setTimeout(() => focusElement(ctaRef), 120);
    announce(`${copy.title}. ${copy.body}`);
    return () => clearTimeout(id);
  }, [result]);

  // Wide: put the cursor in the phone field once the entrance has settled
  // (autoFocus on a mounting, animating input is dropped on web).
  useEffect(() => {
    if (!wide || edit || returning || result) return;
    const id = setTimeout(() => phoneRef.current?.focus(), 350);
    return () => clearTimeout(id);
  }, [wide, returning]);

  const resultCopy = (v: ResultVariant, p: Profile, timedOut = false) => {
    const signal = v === "offline" || v === "serverBusy";
    // Outside edit mode the profile holds an email only when one was sent with
    // the sign-in, i.e. when a welcome email was expected.
    const emailed = !!p.email;
    return {
      title: signal
        ? tt(timedOut ? "result.slow.title" : v === "offline" ? "result.offline.title" : "result.busy.title")
        : edit ? tt("edit.saved") : tt(v === "emailSent" ? "result.emailSent.title" : "result.emailSim.title"),
      body: v === "emailSent"
        ? tt("result.emailSent.body", { maskedEmail: p.email ? maskEmail(p.email) : "" })
        : v === "emailSimulated"
          ? tt("result.emailSim.body")
          : edit
            ? tt("result.editBody")
            : emailed
              // A timeout may still deliver the email: never say it won't be sent.
              ? tt(timedOut ? "result.slow.body" : v === "offline" ? "result.offline.body" : "result.busy.body")
              : tt("result.offline.bodyPhone"),
    };
  };

  /* ── listen script ── */
  const lead = board.rows[0];
  const seasonWord = lang === "sw" ? tt(`season.${season.key}.name` as Key) : tt(`season.${season.key}.desc` as Key).toLowerCase();
  const script = [
    tt("listen.intro", { season: seasonWord }),
    lead ? tt("listen.price", { crop: cropName(lang, lead.key), p: lead.best.price, market: lead.best.market }) : "",
    tt("listen.howto"),
  ].filter(Boolean).join(" ");

  /* ── render pieces ── */
  const headlineSize = wide ? { fontSize: 44, lineHeight: 50 } : compact ? { fontSize: 30, lineHeight: 36 } : width >= 420 ? { fontSize: 36, lineHeight: 42 } : { fontSize: 34, lineHeight: 40 };

  const primaryLabel = returning && returnProfile
    ? tt("returning.cta", { name: firstName(returnProfile.name) })
    : cta === "success"
      ? successLabel
      : result ? tt("result.continue") : edit ? tt("edit.save") : tt("cta.signin");
  const primaryPress = returning ? continueReturning : result ? continueResult : submit;
  const primaryCta = (outer?: StyleProp<ViewStyle>) => (
    <Cta
      label={primaryLabel}
      state={cta}
      loadingLabel={tt("cta.loading")}
      onPress={primaryPress}
      pressRef={ctaRef}
      outerStyle={outer}
    />
  );

  const greeting = (
    <View>
      {wide && edit && <BackButton style={{ alignSelf: "flex-start" }} onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />}
      {/* While the result panel is shown its title is the only heading, and the
          Listen script (which explains the form) is not offered. */}
      {!result && (
        <>
          {/* minHeight 48 on phone and medium: the Listen pill mounts only once
              voices load (late on web), and must not push the form down. */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: wide && edit ? 16 : 0, minHeight: wide ? undefined : 48 }}>
            <Text
              accessibilityRole="header"
              accessibilityLanguage={lang}
              display style={[{ color: t.ink, fontWeight: "700", flexShrink: 1 }, headlineSize]}
            >
              {edit ? tt("edit.headline") : tt("form.headline")}
            </Text>
            {!edit && <ListenPill script={script} />}
          </View>
          {!edit && <Text style={[{ marginTop: wide ? 8 : 6, color: t.dim, fontSize: wide ? 18 : 17, lineHeight: wide ? 26 : 24, fontWeight: "500" }, wide && { maxWidth: 420 }]}>
            {tt("form.sub")}
          </Text>}
          {offline && <Banner kind="offline" text={tt("form.offlineBanner")} style={{ marginTop: wide ? 16 : 14 }} />}
          {banner === "rejected" && <Banner kind="rejected" text={tt("form.rejected")} style={{ marginTop: wide ? 16 : 14 }} />}
        </>
      )}
    </View>
  );

  const phoneStatus: FieldStatus = errs.phone
    ? { kind: "error", text: tt(errs.phone) }
    : movedNote
      ? { kind: "note", text: tt(movedNote === "name" ? "phone.movedName" : "phone.movedEmail") }
      : phoneCheck.ok
        ? { kind: "valid", text: tt("phone.echo", { e164: displayE164(phoneCheck.e164) }) }
        : { kind: "rest", text: tt("phone.helper") };

  const inputH = compact ? 56 : 64;
  const statusMin = compact ? 20 : 24;

  const phoneField = (
    <Field
      label={tt("phone.label")}
      glyph={<PhoneGlyph size={20} color={t.ink} />}
      value={phone}
      onChangeText={onPhoneChange}
      onBlur={onPhoneBlur}
      onFocus={() => onFieldFocus("phone")}
      inputRef={phoneRef}
      height={inputH}
      // Empty: the placeholder draws lighter (500, no tracking) so "07XX XXX XXX"
      // never reads as a number that is already filled in.
      inputStyle={phone ? { fontSize: 22, fontWeight: "700", letterSpacing: 0.5 } : { fontSize: 22, fontWeight: "500", letterSpacing: 0 }}
      status={phoneStatus}
      valid={phoneCheck.ok}
      error={!!errs.phone}
      shakeKey={shake.phone}
      statusMinHeight={statusMin}
      inputProps={{
        placeholder: tt("phone.placeholder"),
        keyboardType: "phone-pad",
        inputMode: "tel",
        autoComplete: "tel",
        textContentType: "telephoneNumber",
        returnKeyType: "next",
        submitBehavior: "submit",
        onSubmitEditing: () => nameRef.current?.focus(),
        // One constant cap, wide enough for a pasted email or name to arrive
        // whole so the blur handler can move it. formatKePhoneInput already
        // limits digits to 13 and other text to 64, so the display stays bounded.
        maxLength: PHONE_INPUT_MAX,
      }}
    />
  );

  const nameField = (
    <Field
      label={tt("name.label")}
      glyph={<PersonGlyph size={20} color={t.ink} />}
      value={name}
      onChangeText={onNameChange}
      onBlur={onNameBlur}
      onFocus={() => onFieldFocus("name")}
      inputRef={nameRef}
      height={inputH}
      inputStyle={{ fontSize: 20, fontWeight: "600" }}
      status={errs.name ? { kind: "error", text: tt(errs.name) } : null}
      // Same right slot as the phone field (check coin); no echo line.
      valid={isValidName(name)}
      error={!!errs.name}
      shakeKey={shake.name}
      statusMinHeight={statusMin}
      inputProps={{
        placeholder: tt("name.placeholder"),
        autoCapitalize: "words",
        autoComplete: "name",
        textContentType: "name",
        returnKeyType: "go",
        onSubmitEditing: submit,
        maxLength: 80,
      }}
    />
  );

  const emailAddon = emailOpen ? (
    <Animated.View entering={reduce ? undefined : FadeInDown.duration(160)}>
      <Field
        label={tt("email.label")}
        glyph={<Text style={{ color: t.ink, fontSize: 18, fontFamily: "monospace", fontWeight: "800", width: 20, textAlign: "center" }}>@</Text>}
        labelRight={
          <Pressable
            onPress={removeEmail}
            accessibilityRole="button"
            accessibilityLabel={tt("email.removeA11y")}
            style={({ pressed, hovered, focused }: PressState) => [
              { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", marginVertical: -12 },
              (hovered || pressed) && { backgroundColor: t.raised },
              webCursor, focusRing(focused, t.accent),
            ]}
          >
            <CrossGlyph size={16} color={t.ink} />
          </Pressable>
        }
        value={email}
        onChangeText={onEmailChange}
        onBlur={onEmailBlur}
        onFocus={() => onFieldFocus("email")}
        inputRef={emailRef}
        height={56}
        inputStyle={{ fontSize: 18, fontWeight: "500" }}
        status={errs.email ? { kind: "error", text: tt(errs.email) } : { kind: "rest", text: tt("email.helper") }}
        valid={isValidEmail(email)}
        error={!!errs.email}
        shakeKey={shake.email}
        statusMinHeight={statusMin}
        inputProps={{
          keyboardType: "email-address",
          autoCapitalize: "none",
          autoCorrect: false,
          autoComplete: "email",
          textContentType: "emailAddress",
          returnKeyType: "go",
          onSubmitEditing: submit,
          maxLength: 254,
        }}
      />
    </Animated.View>
  ) : (
    <Pressable
      onPress={() => { setEmailOpen(true); setTimeout(() => emailRef.current?.focus(), 60); }}
      accessibilityRole="button"
      accessibilityLabel={tt("email.add")}
      accessibilityState={{ expanded: false }}
      style={({ pressed, hovered, focused }: PressState) => [
        { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10, alignSelf: "flex-start", borderRadius: 12, paddingRight: 8 },
        (pressed || hovered) && { opacity: 0.8 },
        webCursor, focusRing(focused, t.accent),
      ]}
    >
      <View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: t.dim, alignItems: "center", justifyContent: "center" }}>
        <PlusGlyph size={14} color={t.ink} />
      </View>
      <Text style={{ color: t.ink, fontSize: 15, lineHeight: 22, fontWeight: "600" }}>{tt("email.add")}</Text>
    </Pressable>
  );

  const trustBullets = (
    <>
      {(["trust.b1", "trust.b4", "trust.b2", "trust.b3"] as const).map((k) => (
        <View key={k} style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ width: 6, height: 6, borderRadius: 1, backgroundColor: t.ok, marginTop: 7 }} />
          <Text style={{ flex: 1, color: t.ink, fontSize: 14, lineHeight: 20, fontWeight: "500" }}>{tt(k)}</Text>
        </View>
      ))}
      <Text style={{ color: t.dim, fontSize: 13, lineHeight: 19 }}>{tt("trust.foot")}</Text>
    </>
  );

  const trustDisclosure = (
    <View style={{ marginTop: phoneBp ? 16 : wide ? 16 : 28 }}>
      <TrustToggle open={trustOpen} onPress={() => setTrustOpen((o) => !o)} label={tt("trust.toggle")} />
      {trustOpen && (
        <Animated.View
          entering={reduce ? undefined : FadeIn.duration(160)}
          style={{ marginTop: 4, backgroundColor: t.panel, borderWidth: 1, borderColor: t.line, borderRadius: 12, padding: 14, gap: 10 }}
        >
          {trustBullets}
        </Animated.View>
      )}
    </View>
  );

  const trustAlways = (
    <View style={{ marginTop: 40, borderTopWidth: 1, borderTopColor: t.line, paddingTop: 20, gap: 10 }}>
      <Text style={{ color: t.dim, fontSize: 11, lineHeight: 14, fontFamily: "monospace", fontWeight: "700", letterSpacing: 2 }}>
        {tt("trust.eyebrow")}
      </Text>
      {trustBullets}
    </View>
  );

  const guestLink = !edit ? <LinkButton label={tt("guest")} onPress={asGuest} chevron style={{ marginTop: wide ? 12 : 8 }} /> : null;

  /* ── returning user ── */
  // "Si mimi" and "Ondoa" unmount the pressed button: move keyboard and
  // screen-reader focus to the phone field once the form has mounted. On web a
  // delayed entering animation keeps the field visibility:hidden (unfocusable)
  // until it starts, so wait past its stagger (phone field: index 2, 180ms).
  const focusPhoneSoon = () => setTimeout(() => { if (alive.current) phoneRef.current?.focus(); }, reduce ? 60 : 320);
  const returningBlock = returning && returnProfile ? (
    <ReturningBlock
      profile={returnProfile}
      headlineWide={wide}
      inlineCta={!phoneBp ? primaryCta({ marginTop: 24 }) : null}
      onNotMe={() => { setNotMe(true); focusPhoneSoon(); }}
      onForget={() => { session.forgetLast(); focusPhoneSoon(); }}
      guest={<LinkButton label={tt("guest")} onPress={asGuest} chevron style={{ marginTop: 8 }} />}
    />
  ) : null;

  /* ── result panel ── */
  const resultBlock = result ? (() => {
    const copy = resultCopy(result.variant, result.profile, result.timedOut);
    const good = result.variant === "emailSent";
    const signal = result.variant === "offline" || result.variant === "serverBusy";
    return (
      <Enter index={0} style={{ marginTop: wide ? (edit ? 16 : 0) : compact ? 16 : 28 }}>
        <View
          style={{
            width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center",
            backgroundColor: good ? t.ok : t.raised, borderWidth: good ? 0 : 2, borderColor: t.dim,
          }}
        >
          {signal ? <SignalOffGlyph size={30} color={t.ink} /> : <CheckGlyph size={34} color={good ? t.field : t.ink} />}
        </View>
        <Text accessibilityRole="header" accessibilityLanguage={lang} display style={{ marginTop: 16, color: t.ink, fontSize: 26, lineHeight: 32 }}>{copy.title}</Text>
        <Text style={{ marginTop: 8, color: t.ink, fontSize: 17, lineHeight: 24, fontWeight: "500" }}>{copy.body}</Text>
        {!phoneBp && primaryCta({ marginTop: 24 })}
        {/* Phone: both actions live in the action bar, primary first. */}
        {signal && !phoneBp && <OutlineButton label={tt("result.retry")} onPress={retry} style={{ marginTop: 12 }} />}
      </Enter>
    );
  })() : null;

  /* ── form body (fields, add-on) ── */
  const fieldsBlock = (startIndex: number) => (
    <>
      <View ref={phoneWrap} style={{ marginTop: wide ? 36 : compact ? 16 : 24 }}>
        <Enter index={startIndex}>{phoneField}</Enter>
      </View>
      <View ref={nameWrap} style={{ marginTop: 12 }}>
        <Enter index={startIndex + 1}>{nameField}</Enter>
      </View>
      {/* The name field's reserved status line already leaves room above the
          collapsed add-on, so it needs no extra gap. */}
      <View ref={emailWrap} style={{ marginTop: emailOpen ? 8 : 0 }}>
        <Enter index={startIndex + 2}>{emailAddon}</Enter>
      </View>
    </>
  );

  /* ───────────── WIDE: two panes ───────────── */
  if (wide) {
    const panelW = Math.min(520, Math.max(380, Math.round(width * 0.4)));
    return (
      <SafeAreaView edges={["top", "bottom"]} style={[{ flex: 1, flexDirection: "row", backgroundColor: t.bg }, Platform.OS === "web" && ({ minHeight: "100vh" } as any)]}>
        <View style={{ width: panelW, backgroundColor: t.panel, borderRightWidth: 1, borderRightColor: t.line }}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 40, paddingVertical: 40 }}>
            <ShambaPanel variant="side" board={board} season={season} width={width} height={height} />
          </ScrollView>
        </View>
        <View style={{ flex: 1, backgroundColor: t.bg }}>
          {/* Controls: first in the tree for tab order, and a real row (not
              floating) so scrolled content can never slide underneath them. */}
          {/* Right edge matches the 440 form column below, so the pills line up
              with the Listen pill and the fields instead of the pane edge. */}
          <View style={{ height: wideShort ? 80 : 96, paddingTop: wideShort ? 16 : 24, paddingHorizontal: width >= 1100 ? 64 : 48, backgroundColor: t.bg }}>
            <View style={{ width: "100%", maxWidth: 440, alignSelf: "center", flexDirection: "row", justifyContent: "flex-end", gap: 12 }}>
              <SunToggle variant="pill" />
              <LangPill />
            </View>
          </View>
          <View ref={viewportRef} style={{ flex: 1 }}>
          <ScrollView
            ref={scrollRef}
            onScroll={onScroll}
            scrollEventThrottle={16}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ flexGrow: 1, justifyContent: "center", alignItems: "center", paddingTop: 8, paddingBottom: wideShort ? 40 : height < 1120 ? 64 : 96, paddingHorizontal: width >= 1100 ? 64 : 48 }}
          >
            {/* The result panel and returning card both centre in the pane; the
                swap is covered by their Enter entrance. */}
            <Animated.View style={[{ width: "100%", maxWidth: 440 }, dipStyle]}>
              {returning ? returningBlock : (
                <>
                  {(!result || edit) && <Enter index={0}>{greeting}</Enter>}
                  {result ? resultBlock : (
                    <>
                      {fieldsBlock(1)}
                      <Enter index={3}>
                        {primaryCta({ marginTop: 28 })}
                        {guestLink}
                        {wideShort ? trustDisclosure : trustAlways}
                      </Enter>
                    </>
                  )}
                </>
              )}
            </Animated.View>
          </ScrollView>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  /* ───────────── PHONE and MEDIUM ───────────── */
  const topBar = (
    <Animated.View
      entering={reduce ? undefined : FadeIn.duration(180)}
      style={[
        // Phone: the same edge as the content below (one left edge on screen).
        { height: 56, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: gutter },
        // Medium: the bar is the first row of the centred column, so it centres with it.
        !phoneBp && { paddingHorizontal: 0, marginBottom: 8 },
      ]}
    >
      {edit ? <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} /> : <Wordmark />}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <SunToggle variant="icon" />
        <LangPill />
      </View>
    </Animated.View>
  );

  const body = returning ? (
    <View style={{ marginTop: compact ? 16 : 28, marginBottom: phoneBp ? (compact ? 16 : 28) : 0 }}>{returningBlock}</View>
  ) : (
    <>
      {!result && <Enter index={1} style={{ marginTop: compact ? 16 : 28 }}>{greeting}</Enter>}
      {result ? resultBlock : (
        <>
          {fieldsBlock(2)}
          {/* Everything below the fields enters last (index 4), so nothing
              appears before the headline and fields above it. */}
          <Enter index={4}>
            {!phoneBp && primaryCta({ marginTop: 24 })}
            {trustDisclosure}
            {guestLink}
          </Enter>
        </>
      )}
    </>
  );

  if (!phoneBp) {
    return (
      <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: t.bg }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View ref={viewportRef} style={{ flex: 1 }}>
            <ScrollView
              ref={scrollRef}
              onScroll={onScroll}
              scrollEventThrottle={16}
              keyboardShouldPersistTaps="handled"
              // Short content (tablets) is centred vertically instead of leaving the lower quarter empty.
              contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingBottom: 40 }}
            >
              <View style={{ width: "100%", maxWidth: 480, alignSelf: "center", paddingHorizontal: 24 }}>
              {topBar}
              <Animated.View style={dipStyle}>
                <Enter index={0}>
                  <ShambaPanel variant="tiles" board={board} season={season} width={width} height={height} />
                </Enter>
                {body}
              </Animated.View>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: t.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {topBar}
        <View ref={viewportRef} style={{ flex: 1 }}>
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            onScroll={onScroll}
            scrollEventThrottle={16}
            keyboardShouldPersistTaps="handled"
            // Returning card: centred in the space under the strip, so the
            // short card does not leave the lower half of the screen empty.
            contentContainerStyle={[{ paddingBottom: 24 }, returning && { flexGrow: 1 }]}
          >
            <Animated.View style={[returning && { flexGrow: 1 }, dipStyle]}>
              <Enter index={0}>
                <ShambaPanel
                  variant="strip" board={board} season={season} width={width} height={height} inset={gutter}
                  expanded={stripOpen} onToggle={() => setStripOpen((o) => !o)}
                />
              </Enter>
              <View style={[{ paddingHorizontal: gutter }, returning && { flexGrow: 1, justifyContent: "center" }]}>{body}</View>
            </Animated.View>
          </ScrollView>
        </View>
        <Animated.View
          style={[{
            backgroundColor: t.bg, borderTopWidth: 1, borderTopColor: t.line,
            paddingHorizontal: gutter, paddingTop: 12, paddingBottom: Math.max(12, insets.bottom),
          }, barStyle]}
        >
          {primaryCta()}
          {result && (result.variant === "offline" || result.variant === "serverBusy") && (
            <OutlineButton label={tt("result.retry")} onPress={retry} style={{ marginTop: 8 }} />
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function TrustToggle({ open, onPress, label }: { open: boolean; onPress: () => void; label: string }) {
  const t = useTheme();
  const rot = useSharedValue(open ? 45 : 0);
  useEffect(() => {
    rot.value = withTiming(open ? 45 : 0, { duration: 160, reduceMotion: ReduceMotion.System });
  }, [open]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }));
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ expanded: open }}
      aria-expanded={open}
      style={({ pressed, hovered, focused }: PressState) => [
        { minHeight: 48, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, borderRadius: 8 },
        (pressed || hovered) && { opacity: 0.8 },
        webCursor, focusRing(focused, t.accent),
      ]}
    >
      <Text style={{ flex: 1, color: t.ink, fontSize: 15, lineHeight: 22, fontWeight: "700" }}>{label}</Text>
      <Animated.View style={style}>
        <PlusGlyph size={16} color={t.ink} />
      </Animated.View>
    </Pressable>
  );
}

function ReturningBlock({
  profile, headlineWide, inlineCta, onNotMe, onForget, guest,
}: {
  profile: Profile; headlineWide: boolean; inlineCta: React.ReactNode;
  onNotMe: () => void; onForget: () => void; guest: React.ReactNode;
}) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const reduce = useReducedMotion();
  const s = useSharedValue(reduce ? 1 : 0.9);
  useEffect(() => {
    if (!reduce) s.value = withSpring(1, { damping: 14, stiffness: 200, reduceMotion: ReduceMotion.System });
  }, []);
  const avatarStyle = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  const sub = profile.phone ? maskPhone(profile.phone) : profile.email ? maskEmail(profile.email) : "";
  return (
    <Enter index={0}>
      <Animated.View
        style={[{
          width: 72, height: 72, borderRadius: 36, backgroundColor: t.raised, borderWidth: 3, borderColor: t.accent,
          alignItems: "center", justifyContent: "center",
        }, avatarStyle]}
      >
        <Text maxFontSizeMultiplier={1.2} style={{ color: t.ink, fontSize: 28, fontWeight: "800" }}>{initials(profile.name)}</Text>
      </Animated.View>
      <Text
        accessibilityRole="header"
        accessibilityLanguage={lang}
        style={{ marginTop: 16, color: t.ink, fontSize: headlineWide ? 36 : 30, lineHeight: headlineWide ? 42 : 36, fontWeight: "800" }}
      >
        {tt("returning.title", { name: firstName(profile.name) })}
      </Text>
      {!!sub && <Text style={{ marginTop: 6, color: t.dim, fontSize: 16, lineHeight: 22, fontFamily: "monospace" }}>{sub}</Text>}
      {inlineCta}
      <OutlineButton label={tt("returning.notMe")} onPress={onNotMe} style={{ marginTop: inlineCta ? 12 : 28 }} />
      {guest}
      {/* Destructive, so it must not look like the guest link: set apart by a
          hairline, a cross glyph and quieter (dim, not underlined) text. */}
      <View style={{ height: 1, backgroundColor: t.line, marginTop: 16 }} />
      <Pressable
        onPress={onForget}
        accessibilityRole="button"
        accessibilityLabel={tt("returning.forget")}
        style={({ pressed, hovered, focused }: PressState) => [
          { minHeight: 48, marginTop: 8, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 8, paddingRight: 8 },
          (pressed || hovered) && { opacity: 0.75 },
          webCursor, focusRing(focused, t.accent),
        ]}
      >
        <CrossGlyph size={14} color={t.dim} />
        <Text style={{ color: t.dim, fontSize: 15, lineHeight: 22, fontWeight: "600" }}>{tt("returning.forget")}</Text>
      </Pressable>
    </Enter>
  );
}

// A screen that throws shows a "try again" card, never a blank app.
export { ScreenErrorBoundary as ErrorBoundary } from "../components/ScreenError";
