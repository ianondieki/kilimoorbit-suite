/**
 * Holds the navigation drawer's open state for the tab screens. At >= 900px the
 * sidebar is docked (always visible) and the menu buttons are not rendered.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Platform, useWindowDimensions } from "react-native";

export type CloseOpts = {
  /**
   * Where keyboard focus goes once the drawer has closed (web only):
   * - "opener" (default): back to the button that opened it.
   * - "screen": the drawer navigated to another tab; focus that screen's menu
   *   button, never the old screen's (still mounted, under aria-hidden).
   * - "none": the drawer opened another route (login); focus is left to it.
   */
  focus?: "opener" | "screen" | "none";
};
type Ctx = {
  open: boolean; openMenu: () => void; closeMenu: (opts?: CloseOpts) => void; isDocked: boolean;
  /** Called by the drawer once its Modal has unmounted after closing. */
  drawerUnmounted: () => void;
};
const MenuCtx = createContext<Ctx>({ open: false, openMenu: () => {}, closeMenu: () => {}, isDocked: false, drawerUnmounted: () => {} });

/** Data attribute carried by every MenuButton (see Header.tsx). */
export const MENU_BUTTON_ATTR = "data-ko-menu-button";

const isWebDom = Platform.OS === "web" && typeof document !== "undefined";

/** On the page, not under an aria-hidden (inactive) screen, laid out, and not covered. */
function usable(el: any): boolean {
  try {
    if (!el?.isConnected || el.closest?.('[aria-hidden="true"]')) return false;
    const r = el.getBoundingClientRect?.();
    if (!r || r.width === 0 || r.height === 0) return false;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && (hit === el || el.contains(hit));
  } catch {
    return false;
  }
}

export function MenuProvider({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const isDocked = width >= 900;
  const [open, setOpen] = useState(false);
  const opener = useRef<any>(null);
  const pending = useRef<null | { mode: NonNullable<CloseOpts["focus"]>; el: any }>(null);

  // Docking (rotation or resize to >= 900px) closes the drawer for real, so it
  // never reopens by itself when the window becomes narrow again.
  useEffect(() => {
    if (isDocked) {
      setOpen(false);
      opener.current = null;
    }
  }, [isDocked]);

  const openMenu = useCallback(() => {
    // Remember the element that opened the drawer so focus can return to it.
    if (isWebDom) opener.current = document.activeElement;
    setOpen(true);
  }, []);

  const closeMenu = useCallback((opts?: CloseOpts) => {
    setOpen(false);
    const el = opener.current;
    opener.current = null;
    if (isWebDom) pending.current = { mode: opts?.focus ?? "opener", el };
  }, []);

  // Runs after the drawer's Modal has unmounted, i.e. after react-native-web's
  // focus trap has refocused whatever was focused when the drawer opened, so the
  // choice made here is the last word.
  const drawerUnmounted = useCallback(() => {
    const p = pending.current;
    pending.current = null;
    if (!isWebDom || !p) return;
    setTimeout(() => {
      try {
        if (p.mode === "opener" && usable(p.el)) { p.el.focus(); return; }
        if (p.mode === "screen") {
          const target = Array.from(document.querySelectorAll(`[${MENU_BUTTON_ATTR}]`)).find(usable) as any;
          if (target) { target.focus(); return; }
        }
        // Never leave focus on an element of a screen that is no longer shown.
        const active = document.activeElement as any;
        if (active && active !== document.body && !usable(active)) active.blur?.();
      } catch {}
    }, 0);
  }, []);

  const value = useMemo(
    () => ({ open: open && !isDocked, openMenu, closeMenu, isDocked, drawerUnmounted }),
    [open, isDocked, openMenu, closeMenu, drawerUnmounted]
  );
  return <MenuCtx.Provider value={value}>{children}</MenuCtx.Provider>;
}

export const useMenu = () => useContext(MenuCtx);
