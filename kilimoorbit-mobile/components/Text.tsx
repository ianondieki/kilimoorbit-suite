/**
 * Every piece of text goes through here so the bundled fonts apply everywhere
 * (lib/typography.ts): fontWeight picks the Nunito Sans file, `display` (or a
 * serif preset) picks Fraunces, "monospace" becomes the sans so numbers look
 * like the rest, and a nested <Text> without a weight of its own keeps
 * inheriting from its parent. Android's extra font padding is off so line
 * heights mean what they say.
 */
import React, { createContext, forwardRef, useContext } from "react";
import { Platform, StyleSheet, Text as RNText, type TextProps, type TextStyle } from "react-native";
import { SANS, SERIF, isBundled, weightKey } from "../lib/typography";

export type Props = TextProps & {
  /** Fraunces: titles, greetings, headlines, questions. */
  display?: boolean;
};

const Nested = createContext(false);
const android = Platform.OS === "android";

const Text = forwardRef<RNText, Props>(function Text({ style, display, ...rest }, ref) {
  const nested = useContext(Nested);
  const flat: TextStyle = { ...(StyleSheet.flatten(style) || {}) };
  const { fontWeight, fontFamily } = flat;
  const inherit = nested && !display && fontWeight == null && fontFamily == null;
  if (!inherit) {
    if (!isBundled(fontFamily)) {
      const w = weightKey(fontWeight);
      flat.fontFamily = display ? SERIF[w === "700" || w === "800" ? "700" : "600"] : SANS[w];
    }
    delete flat.fontWeight;
    if (android && flat.includeFontPadding == null) flat.includeFontPadding = false;
  }
  return (
    <Nested.Provider value={true}>
      <RNText ref={ref} {...rest} style={flat} />
    </Nested.Provider>
  );
});

export default Text;
