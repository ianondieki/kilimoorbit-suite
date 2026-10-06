/**
 * Haptic feedback, kept to moments that mean something: a primary action,
 * a task ticked, a trivia answer, a booking confirmed, a connection test.
 * No-op on the web and whenever the device cannot vibrate; never throws.
 */
import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

const native = Platform.OS !== "web";
const fire = (go: () => Promise<void>) => {
  if (!native) return;
  try { go().catch(() => {}); } catch {}
};

export const haptic = {
  /** A light tap: pressing a primary button, choosing an answer. */
  tap: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** A tick: a chip, a segment, a slider page, a stepper step. */
  select: () => fire(() => Haptics.selectionAsync()),
  /** Something went right: correct answer, task done, booking made. */
  success: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** Worth noticing: a warning the farmer should read. */
  warn: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  /** Something went wrong: wrong answer, failed test, failed booking. */
  error: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
