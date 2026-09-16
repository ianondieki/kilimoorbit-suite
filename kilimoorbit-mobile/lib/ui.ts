/** Shared interaction helpers for Pressables (web focus, hover, cursor). */
import { Platform, AccessibilityInfo, findNodeHandle, type ViewStyle } from "react-native";

// RN core types only expose `pressed`; react-native-web also provides `hovered` and `focused`.
export type PressState = { pressed: boolean; hovered?: boolean; focused?: boolean };

export const isWeb = Platform.OS === "web";

export const webCursor: ViewStyle | null = isWeb ? ({ cursor: "pointer" } as any) : null;

// react-native-web reports `focused` for mouse and touch focus too. Track the
// last input modality so the outline behaves like :focus-visible (keyboard only).
let keyboardModality = false;
if (isWeb && typeof window !== "undefined") {
  const pointer = () => { keyboardModality = false; };
  window.addEventListener("keydown", (e: KeyboardEvent) => {
    if (!e.metaKey && !e.altKey && !e.ctrlKey) keyboardModality = true;
  }, true);
  window.addEventListener("mousedown", pointer, true);
  window.addEventListener("pointerdown", pointer, true);
  window.addEventListener("touchstart", pointer, true);
}

/** Web keyboard-focus indicator: 3px solid accent outline, offset 2. */
export const focusRing = (focused: boolean | undefined, color: string): ViewStyle | null =>
  isWeb && focused && keyboardModality
    ? ({ outlineWidth: 3, outlineStyle: "solid", outlineColor: color, outlineOffset: 2 } as any)
    : null;

/** Removes the browser's own focus outline (inputs draw their own ring). */
export const noOutline: any = isWeb ? { outlineStyle: "none" } : null;

/** Moves keyboard/screen-reader focus to an element, where the platform supports it. */
export function focusElement(ref: { current: any } | null | undefined) {
  const node = ref?.current;
  if (!node) return;
  if (isWeb) {
    try { node.focus?.(); } catch {}
    return;
  }
  try {
    const handle = findNodeHandle(node);
    if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
  } catch {}
}

/**
 * Screen-reader announcement. react-native-web's announceForAccessibility is a
 * no-op, so on web we write into one visually hidden aria-live region instead.
 */
export const announce = (msg: string) => {
  if (isWeb && typeof document !== "undefined") {
    try {
      let el = document.getElementById("ko-live");
      if (!el) {
        el = document.createElement("div");
        el.id = "ko-live";
        el.setAttribute("aria-live", "polite");
        el.setAttribute("role", "status");
        Object.assign(el.style, {
          position: "absolute", width: "1px", height: "1px", margin: "-1px", padding: "0",
          overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: "0",
        });
        document.body.appendChild(el);
      }
      const node = el;
      // Clear first so repeating the same message is announced again.
      node.textContent = "";
      setTimeout(() => { node.textContent = msg; }, 60);
    } catch {}
    return;
  }
  try { AccessibilityInfo.announceForAccessibility(msg); } catch {}
};

export type Breakpoint = "phone" | "medium" | "wide";
export const breakpointFor = (width: number): Breakpoint =>
  width < 600 ? "phone" : width < 900 ? "medium" : "wide";

/**
 * Web: react-native-web only turns Space into a press for button-like roles.
 * Switches, radios and checkboxes must also toggle on Space (the key screen
 * readers announce for them), so spread this into those Pressables.
 */
export const spaceActivates = (onPress: () => void): Record<string, unknown> =>
  isWeb
    ? {
        onKeyDown: (e: any) => {
          if (e?.key === " " || e?.key === "Spacebar") {
            e.preventDefault?.();
            onPress();
          }
        },
      }
    : {};

/**
 * Web radio group keyboard behaviour: Space selects the focused radio, the
 * arrow keys move selection (and focus) to the previous/next option, and only
 * the checked radio sits in the tab order (roving tabindex).
 */
export function radioKeys(opts: {
  index: number;
  count: number;
  selected: boolean;
  onSelect: (i: number) => void;
  focusAt: (i: number) => void;
}): Record<string, unknown> {
  if (!isWeb) return {};
  const { index, count, selected, onSelect, focusAt } = opts;
  return {
    tabIndex: selected ? 0 : -1,
    onKeyDown: (e: any) => {
      const k = e?.key;
      if (k === " " || k === "Spacebar") {
        e.preventDefault?.();
        onSelect(index);
        return;
      }
      const step = k === "ArrowRight" || k === "ArrowDown" ? 1 : k === "ArrowLeft" || k === "ArrowUp" ? -1 : 0;
      if (!step) return;
      e.preventDefault?.();
      const next = (index + step + count) % count;
      onSelect(next);
      focusAt(next);
    },
  };
}

/**
 * Web `lang` attribute for a subtree. The document language follows the
 * farmer's choice, but dashboard, chat and autopilot content is English-only
 * in v1, so those screens mark themselves "en" (and localized chrome inside
 * them marks itself back) for screen readers that switch voice by language.
 */
export const webLang = (lang: string): Record<string, unknown> => (isWeb ? { lang } : {});
