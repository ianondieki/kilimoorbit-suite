import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { THEMES, Theme } from "./themes";

type Ctx = { theme: Theme; setThemeKey: (k: string) => void; cycle: () => void };
const ThemeCtx = createContext<Ctx>({ theme: THEMES[0], setThemeKey: () => {}, cycle: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(THEMES[0]);
  useEffect(() => {
    AsyncStorage.getItem("soko-theme").then((k) => {
      const t = THEMES.find((t) => t.key === k);
      if (t) setTheme(t);
    });
  }, []);
  const apply = (t: Theme) => {
    setTheme(t);
    AsyncStorage.setItem("soko-theme", t.key).catch(() => {});
  };
  const setThemeKey = (k: string) => {
    const t = THEMES.find((t) => t.key === k);
    if (t) apply(t);
  };
  const cycle = () => {
    const i = THEMES.findIndex((t) => t.key === theme.key);
    apply(THEMES[(i + 1) % THEMES.length]);
  };
  return <ThemeCtx.Provider value={{ theme, setThemeKey, cycle }}>{children}</ThemeCtx.Provider>;
}
export const useTheme = () => useContext(ThemeCtx).theme;
export const useThemeControls = () => useContext(ThemeCtx);
