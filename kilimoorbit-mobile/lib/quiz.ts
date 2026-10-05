/**
 * The farmer's trivia progress, kept on this phone ("ko-quiz"): which
 * questions were answered (and when), today's five, the streak and the
 * all-time score. Same module-store pattern as lib/farm.ts. The maths is in
 * lib/trivia.ts.
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { EMPTY_QUIZ, answer, byId, withDay, type Answered, type QuizState } from "./trivia";
import { todayKey } from "./dates";

export const QUIZ_KEY = "ko-quiz";
const DAY = /^\d{4}-\d{2}-\d{2}$/;

let state: QuizState = EMPTY_QUIZ;
let hydrated = false;
let hydrating: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function sanitizeQuiz(raw: any): QuizState {
  if (!raw || typeof raw !== "object") return EMPTY_QUIZ;
  const answered: Answered = {};
  if (raw.answered && typeof raw.answered === "object" && !Array.isArray(raw.answered))
    for (const [id, a] of Object.entries<any>(raw.answered))
      if (byId(id) && a && typeof a.ok === "boolean" && typeof a.date === "string" && DAY.test(a.date)) answered[id] = { ok: a.ok, date: a.date };
  const dayOk = raw.day && typeof raw.day === "object" && typeof raw.day.date === "string" && DAY.test(raw.day.date) && Array.isArray(raw.day.ids);
  const n = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 1e6 ? v : 0);
  return {
    v: 1,
    answered,
    day: dayOk ? { date: raw.day.date, ids: raw.day.ids.filter((id: unknown) => typeof id === "string" && byId(id)).slice(0, 10) } : null,
    streak: n(raw.streak),
    lastDay: typeof raw.lastDay === "string" && DAY.test(raw.lastDay) ? raw.lastDay : null,
    right: n(raw.right),
    total: Math.max(n(raw.total), n(raw.right)),
  };
}

function hydrate() {
  if (hydrating) return hydrating;
  hydrating = AsyncStorage.getItem(QUIZ_KEY)
    .then((raw) => { if (raw && !hydrated) state = sanitizeQuiz(JSON.parse(raw)); })
    .catch(() => {})
    .finally(() => { hydrated = true; emit(); });
  return hydrating;
}

function write(next: QuizState) {
  state = next;
  hydrated = true;
  emit();
  AsyncStorage.setItem(QUIZ_KEY, JSON.stringify(next)).catch(() => {});
}

function mutate(fn: (s: QuizState) => QuizState) {
  if (hydrated) write(fn(state));
  else hydrate().then(() => write(fn(state)));
}

export function clearQuizMemory() { state = EMPTY_QUIZ; hydrated = true; emit(); }

export const quizActions = {
  answer(id: string, ok: boolean) {
    if (!byId(id)) return;
    mutate((s) => answer(s, id, ok, todayKey()));
  },
};

/** The quiz with today's draw in place. */
export function useQuiz(): { quiz: QuizState; ready: boolean } {
  const subscribe = useCallback((l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; }, []);
  const s = useSyncExternalStore(subscribe, () => state, () => state);
  const ready = useSyncExternalStore(subscribe, () => hydrated, () => hydrated);
  useEffect(() => { hydrate(); }, []);
  return { quiz: withDay(s, todayKey()), ready };
}
