import React from "react";
import { View, StyleSheet, type ViewStyle, type StyleProp } from "react-native";

/**
 * Centers and caps content width so screens read well on wide viewports (web,
 * tablets) instead of stretching cards edge-to-edge. On a phone the screen is
 * narrower than CONTENT_MAX_W, so this is a transparent full-width pass-through.
 */
export const CONTENT_MAX_W = 760;

export function Bounded({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[s.bounded, style]}>{children}</View>;
}

const s = StyleSheet.create({
  bounded: { width: "100%", maxWidth: CONTENT_MAX_W, alignSelf: "center" },
});
