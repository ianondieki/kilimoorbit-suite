/**
 * Icons from Material Design Icons (the community set), through
 * @expo/vector-icons: crisp at any size, tinted like text, the same on every
 * phone. Decorative: the label next to an icon carries the meaning.
 */
import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { StyleProp, TextStyle } from "react-native";

export type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

export default function Icon({ name, size = 22, color, style }: { name: IconName; size?: number; color: string; style?: StyleProp<TextStyle> }) {
  return (
    <MaterialCommunityIcons
      name={name}
      size={size}
      color={color}
      style={style}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      aria-hidden
    />
  );
}
