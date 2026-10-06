/**
 * "Test your knowledge": five farm questions a day on a slider, each with a
 * one-line explanation that points back at the app's own advice. Progress
 * (score, streak) lives on the phone (lib/quiz.ts); the maths is lib/trivia.ts.
 * Answering is felt as well as seen: the chosen option springs, the right one
 * pops and the wrong one shakes, with a success or error tap; the slider's
 * dots turn green or red as the day's questions get answered.
 */
import React, { useEffect, useRef, useState } from "react";
import { View, Pressable } from "react-native";
import Text from "./Text";
import Animated, {
  FadeInDown, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming,
} from "react-native-reanimated";
import { useTheme } from "../lib/theme-context";
import { useLang } from "../lib/session";
import { announce, focusRing, webCursor, type PressState } from "../lib/ui";
import { haptic } from "../lib/haptics";
import { pick } from "../lib/agronomy";
import { todayKey } from "../lib/dates";
import { byId, liveStreak, todayScore, type Trivia } from "../lib/trivia";
import { quizActions, useQuiz } from "../lib/quiz";
import type { Key } from "../lib/i18n";
import { Btn, Card, Eyebrow, T, Tag, tint } from "./Kit";
import { CheckGlyph, CrossGlyph, BulbGlyph, ArrowGlyph } from "./Glyphs";
import Pager, { type PagerHandle } from "./Pager";

const LETTERS = ["A", "B", "C", "D"];
const spring = { damping: 14, stiffness: 260, reduceMotion: ReduceMotion.System };

export function TriviaCard() {
  const t = useTheme();
  const { t: tt } = useLang();
  const { quiz, ready } = useQuiz();
  const today = todayKey();
  const items = (quiz.day?.ids ?? []).map((id) => byId(id)).filter((x): x is Trivia => !!x);
  const score = todayScore(quiz, today);
  const streak = liveStreak(quiz, today);
  const pager = useRef<PagerHandle | null>(null);

  // The score tag bumps each time a question is answered.
  const bump = useSharedValue(1);
  const lastDone = useRef(score.done);
  useEffect(() => {
    if (score.done === lastDone.current) return;
    lastDone.current = score.done;
    bump.value = withSequence(withTiming(1.18, { duration: 110 }), withSpring(1, { damping: 11, stiffness: 240, reduceMotion: ReduceMotion.System }));
  }, [score.done]);
  const bumpStyle = useAnimatedStyle(() => ({ transform: [{ scale: bump.value }] }));

  if (!ready || !items.length) return null;
  const pages: (Trivia | "summary")[] = [...items, "summary"];
  const result = (p: Trivia | "summary") => {
    if (p === "summary") return null;
    const a = quiz.answered[p.id];
    return a?.date === today ? (a.ok ? "ok" : "bad") : null;
  };

  return (
    <Card>
      <Eyebrow domain="quiz" icon={(c) => <BulbGlyph size={15} color={c} />}
        text={tt("quiz.eyebrow")}
        right={<Animated.View style={bumpStyle}><Tag tone={score.done === score.of ? "ok" : "dim"} label={tt("quiz.score", { done: score.done, of: score.of })} /></Animated.View>}
      />
      <View testID="trivia-card">
        <Pager
          items={pages}
          keyOf={(p) => (p === "summary" ? "summary" : p.id)}
          label={tt("quiz.eyebrow")}
          controller={pager}
          testID="trivia"
          dotTone={(i) => result(pages[i])}
          render={(p, i) =>
            p === "summary" ? (
              <Summary score={score} streak={streak} right={quiz.right} total={quiz.total} />
            ) : (
              <Question
                item={p}
                n={i + 1}
                of={items.length}
                stored={quiz.answered[p.id]?.date === today ? quiz.answered[p.id].ok : null}
                onAnswer={(ok) => quizActions.answer(p.id, ok)}
                onNext={() => pager.current?.go(i + 1)}
                last={i === items.length - 1}
              />
            )
          }
        />
      </View>
      {streak > 1 && <Text style={{ color: t.dim, ...T.meta, marginTop: 8 }} testID="trivia-streak">{tt("quiz.streak", { n: streak })}</Text>}
    </Card>
  );
}

function Question({
  item, n, of, stored, onAnswer, onNext, last,
}: { item: Trivia; n: number; of: number; stored: boolean | null; onAnswer: (ok: boolean) => void; onNext: () => void; last: boolean }) {
  const t = useTheme();
  const { lang, t: tt } = useLang();
  const reduce = useReducedMotion();
  // Which option was tapped this visit; a question answered earlier today shows only right/wrong.
  const [picked, setPicked] = useState<number | null>(null);
  const answered = picked != null || stored != null;
  const choose = (i: number) => {
    if (answered) return;
    setPicked(i);
    const ok = i === item.answer;
    onAnswer(ok);
    if (ok) haptic.success(); else haptic.error();
    announce(`${tt(ok ? "quiz.right" : "quiz.wrong")}. ${pick(lang, item.why)}`);
  };
  const ok = picked != null ? picked === item.answer : stored;

  return (
    <View style={{ gap: 10, paddingRight: 2 }}>
      <Text style={{ color: t.dim, ...T.meta, fontWeight: "700" }}>{tt("quiz.n", { n, of })} · {tt(`quiz.topic.${item.topic}` as Key)}</Text>
      <Text style={{ color: t.ink, ...T.headline }}>{pick(lang, item.q)}</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={pick(lang, item.q)} style={{ gap: 8 }}>
        {item.options.map((o, i) => (
          <Option
            key={i}
            label={pick(lang, o)}
            letter={LETTERS[i]}
            right={i === item.answer}
            mine={i === picked}
            answered={answered}
            reduce={reduce}
            onPress={() => choose(i)}
            a11yLabel={`${LETTERS[i]}. ${pick(lang, o)}${answered && i === item.answer ? `, ${tt("quiz.correctA11y")}` : ""}`}
            testID={`trivia-option-${n}-${i}`}
          />
        ))}
      </View>
      {answered && (
        <Animated.View entering={reduce ? undefined : FadeInDown.duration(220)} style={{ gap: 8 }} testID="trivia-why">
          <Tag block tone={ok ? "ok" : "warn"} label={`${tt(ok ? "quiz.right" : "quiz.wrong")} ${pick(lang, item.why)}`} />
          <Btn kind="secondary" small label={tt(last ? "quiz.finish" : "quiz.next")} onPress={onNext} style={{ alignSelf: "flex-start" }} icon={(c) => <ArrowGlyph size={15} color={c} />} testID="trivia-next" />
        </Animated.View>
      )}
    </View>
  );
}

/** One answer: springs under the finger, pops when it is the right one, shakes when it was the wrong pick. */
function Option({
  label, letter, right, mine, answered, reduce, onPress, a11yLabel, testID,
}: { label: string; letter: string; right: boolean; mine: boolean; answered: boolean; reduce: boolean; onPress: () => void; a11yLabel: string; testID: string }) {
  const t = useTheme();
  const scale = useSharedValue(1);
  const shake = useSharedValue(0);
  useEffect(() => {
    if (!answered || reduce) return;
    if (right) scale.value = withSequence(withSpring(1.05, { damping: 9, stiffness: 340 }), withSpring(1, spring));
    else if (mine) {
      const d = { duration: 45 };
      shake.value = withSequence(withTiming(-7, d), withTiming(7, d), withTiming(-5, d), withTiming(5, d), withTiming(0, d));
    }
  }, [answered]);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }, { translateX: shake.value }] }));
  const tone = !answered ? null : right ? t.ok : mine ? t.alert : null;
  return (
    <Animated.View style={anim}>
      <Pressable
        onPress={onPress}
        onPressIn={() => { if (!answered) { haptic.tap(); scale.value = withSpring(0.97, { damping: 20, stiffness: 420, reduceMotion: ReduceMotion.System }); } }}
        onPressOut={() => { if (!answered) scale.value = withSpring(1, spring); }}
        disabled={answered}
        accessibilityRole="radio"
        accessibilityLabel={a11yLabel}
        accessibilityState={answered ? { disabled: true, checked: right } : { checked: false }}
        aria-checked={answered && right}
        {...(answered ? ({ "aria-disabled": true } as any) : null)}
        testID={testID}
        style={({ pressed, hovered, focused }: PressState) => [
          { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 2, borderColor: tone ?? t.line, backgroundColor: tone ? tint(tone, 0.16) : t.panel, opacity: answered && !tone ? 0.55 : pressed ? 0.9 : 1 },
          hovered && !answered && { backgroundColor: t.raised },
          webCursor, focusRing(focused, t.accent),
        ]}
      >
        <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: tone ?? t.raised, alignItems: "center", justifyContent: "center" }}>
          {answered && right ? <CheckGlyph size={13} color={t.field} /> : answered && mine ? <CrossGlyph size={11} color={t.field} /> : <Text style={{ color: t.accent, fontSize: 12, fontWeight: "800" }}>{letter}</Text>}
        </View>
        <Text style={{ flex: 1, color: t.ink, fontSize: 15.5, lineHeight: 21, fontWeight: answered && right ? "800" : "600" }}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

function Summary({ score, streak, right, total }: { score: { done: number; right: number; of: number }; streak: number; right: number; total: number }) {
  const t = useTheme();
  const { t: tt } = useLang();
  const done = score.done === score.of;
  return (
    <View style={{ gap: 8 }} testID="trivia-summary">
      <Text style={{ color: t.ink, ...T.display }}>
        {done ? tt("quiz.doneTitle", { right: score.right, of: score.of }) : tt("quiz.soFar", { right: score.right, done: score.done })}
      </Text>
      <Text style={{ color: t.ink, ...T.body }}>
        {done ? tt(score.right === score.of ? "quiz.perfect" : score.right >= 3 ? "quiz.good" : "quiz.keepGoing") : tt("quiz.unfinished", { n: score.of - score.done })}
      </Text>
      {streak > 1 && <Tag tone="ok" label={tt("quiz.streak", { n: streak })} />}
      {total > 0 && <Text style={{ color: t.dim, ...T.meta }}>{tt("quiz.allTime", { right, total })}</Text>}
      <Text style={{ color: t.dim, ...T.meta }}>{tt("quiz.tomorrow")}</Text>
    </View>
  );
}
