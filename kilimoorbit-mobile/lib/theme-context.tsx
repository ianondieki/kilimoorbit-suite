import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { THEMES, Theme } from "./themes";

type Ctx = { theme: Theme; setThemeKey: (k: string) => void };
const ThemeCtx = createContext<Ctx>({ theme: THEMES[0], setThemeKey: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(THEMES[0]);
  useEffect(() => {
    AsyncStorage.getItem("ko-theme").then((k) => {
      const t = THEMES.find((t) => t.key === k);
      if (t) setTheme(t);
    });
  }, []);
  const setThemeKey = (k: string) => {
    const t = THEMES.find((t) => t.key === k);
    if (t) { setTheme(t); AsyncStorage.setItem("ko-theme", k).catch(() => {}); }
  };
  return <ThemeCtx.Provider value={{ theme, setThemeKey }}>{children}</ThemeCtx.Provider>;
}
export const useTheme = () => useContext(ThemeCtx).theme;
export const useThemeControls = () => useContext(ThemeCtx);
