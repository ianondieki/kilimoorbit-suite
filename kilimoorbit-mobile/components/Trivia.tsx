/**
 * "Test your knowledge": five farm questions a day on a slider, each with a
 * one-line explanation that points back at the app's own advice. Progress
 * (score, streak) lives on the phone (lib/quiz.ts); the maths is lib/trivia.ts.
 */
import React, { useRef, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useTheme } from "../lib/theme-context";
import { useLang } from "../lib/session";
import { announce, focusRing, webCursor, type PressState } from "../lib/ui";
import { pick } from "../lib/agronomy";
import { todayKey } from "../lib/dates";
import { byId, liveStreak, todayScore, type Trivia } from "../lib/trivia";
import { quizActions, useQuiz } from "../lib/quiz";
import type { Key } from "../lib/i18n";
import { Btn, Card, Eyebrow, T, Tag, tint } from "./Kit";
import { CheckGlyph, CrossGlyph } from "./Glyphs";
import Pager, { type PagerHandle } from "./Pager";

const LETTERS = ["A", "B", "C", "D"];

export function TriviaCard() {
  const t = useTheme();
  const { t: tt } = useLang();
  const { quiz, ready } = useQuiz();
  const today = todayKey();
  const items = (quiz.day?.ids ?? []).map((id) => byId(id)).filter((x): x is Trivia => !!x);
  const score = todayScore(quiz, today);
  const streak = liveStreak(quiz, today);
  const pager = useRef<PagerHandle | null>(null);
  if (!ready || !items.length) return null;
  const pages: (Trivia | "summary")[] = [...items, "summary"];

  return (
    <Card>
      <Eyebrow text={tt("quiz.eyebrow")} right={<Tag tone={score.done === score.of ? "ok" : "dim"} label={tt("quiz.score", { done: score.done, of: score.of })} />} />
      <View testID="trivia-card">
        <Pager
          items={pages}
          keyOf={(p) => (p === "summary" ? "summary" : p.id)}
          label={tt("quiz.eyebrow")}
          controller={pager}
          testID="trivia"
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
  // Which option was tapped this visit; a question answered earlier today shows only right/wrong.
  const [picked, setPicked] = useState<number | null>(null);
  const answered = picked != null || stored != null;
  const choose = (i: number) => {
    if (answered) return;
    setPicked(i);
    const ok = i === item.answer;
    onAnswer(ok);
    announce(`${tt(ok ? "quiz.right" : "quiz.wrong")}. ${pick(lang, item.why)}`);
  };
  const ok = picked != null ? picked === item.answer : stored;

  return (
    <View style={{ gap: 10, paddingRight: 2 }}>
      <Text style={{ color: t.dim, ...T.meta, fontWeight: "700" }}>{tt("quiz.n", { n, of })} · {tt(`quiz.topic.${item.topic}` as Key)}</Text>
      <Text style={{ color: t.ink, fontSize: 17, lineHeight: 24, fontWeight: "700" }}>{pick(lang, item.q)}</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={pick(lang, item.q)} style={{ gap: 8 }}>
        {item.options.map((o, i) => {
          const right = i === item.answer;
          const mine = i === picked;
          const tone = !answered ? null : right ? t.ok : mine ? t.alert : null;
          return (
            <Pressable
              key={i}
              onPress={() => choose(i)}
              disabled={answered}
              accessibilityRole="radio"
              accessibilityLabel={`${LETTERS[i]}. ${pick(lang, o)}${answered && right ? `, ${tt("quiz.correctA11y")}` : ""}`}
              accessibilityState={answered ? { disabled: true, checked: right } : { checked: false }}
              aria-checked={answered && right}
              {...(answered ? ({ "aria-disabled": true } as any) : null)}
              testID={`trivia-option-${n}-${i}`}
              style={({ pressed, hovered, focused }: PressState) => [
                { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 2, borderColor: tone ?? t.line, backgroundColor: tone ? tint(tone, 0.16) : t.panel, opacity: answered && !tone ? 0.55 : pressed ? 0.8 : 1 },
                hovered && !answered && { backgroundColor: t.raised },
                webCursor, focusRing(focused, t.accent),
              ]}
            >
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: tone ?? t.raised, alignItems: "center", justifyContent: "center" }}>
                {answered && right ? <CheckGlyph size={13} color={t.field} /> : answered && mine ? <CrossGlyph size={11} color={t.field} /> : <Text style={{ color: t.accent, fontSize: 12, fontWeight: "800" }}>{LETTERS[i]}</Text>}
              </View>
              <Text style={{ flex: 1, color: t.ink, fontSize: 15, lineHeight: 20, fontWeight: answered && right ? "800" : "600" }}>{pick(lang, o)}</Text>
            </Pressable>
          );
        })}
      </View>
      {answered && (
        <View style={{ gap: 8 }} testID="trivia-why">
          <Tag block tone={ok ? "ok" : "warn"} label={`${tt(ok ? "quiz.right" : "quiz.wrong")} ${pick(lang, item.why)}`} />
          <Btn kind="secondary" small label={tt(last ? "quiz.finish" : "quiz.next")} onPress={onNext} style={{ alignSelf: "flex-start" }} testID="trivia-next" />
        </View>
      )}
    </View>
  );
}

function Summary({ score, streak, right, total }: { score: { done: number; right: number; of: number }; streak: number; right: number; total: number }) {
  const t = useTheme();
  const { t: tt } = useLang();
  const done = score.done === score.of;
  return (
    <View style={{ gap: 8 }} testID="trivia-summary">
      <Text style={{ color: t.ink, fontSize: 22, lineHeight: 28, fontWeight: "800" }}>
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
