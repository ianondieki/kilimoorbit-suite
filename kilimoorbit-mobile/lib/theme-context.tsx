import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { THEMES, Theme } from "./themes";

type Ctx = { theme: Theme; setThemeKey: (k: string) => void; ready: boolean };
const ThemeCtx = createContext<Ctx>({ theme: THEMES[0], setThemeKey: () => {}, ready: false });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(THEMES[0]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // Safety net, as in SessionProvider: a stalled storage read must never keep
    // the gates on a blank background.
    const timer = setTimeout(() => setReady(true), 1500);
    AsyncStorage.getItem("ko-theme")
      .then((k) => {
        const t = THEMES.find((t) => t.key === k);
        if (t) setTheme(t);
      })
      .catch(() => {})
      // A thrown or empty read still marks the theme ready (default Loam).
      .finally(() => { clearTimeout(timer); setReady(true); });
    return () => clearTimeout(timer);
  }, []);
  const setThemeKey = (k: string) => {
    const t = THEMES.find((t) => t.key === k);
    if (t) { setTheme(t); AsyncStorage.setItem("ko-theme", k).catch(() => {}); }
  };
  return <ThemeCtx.Provider value={{ theme, setThemeKey, ready }}>{children}</ThemeCtx.Provider>;
}
export const useTheme = () => useContext(ThemeCtx).theme;
export const useThemeControls = () => useContext(ThemeCtx);
