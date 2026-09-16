/** Two-option radio group (e.g. Kiswahili | English). */
import React, { useRef } from "react";
import { View, Text, Pressable } from "react-native";
import { useTheme } from "../lib/theme-context";
import { focusElement, focusRing, radioKeys, webCursor, type PressState } from "../lib/ui";

type Option<V extends string> = { value: V; label: string };

export default function Segmented<V extends string>({
  options, value, onChange, accessibilityLabel,
}: {
  options: [Option<V>, Option<V>];
  value: V;
  onChange: (v: V) => void;
  accessibilityLabel: string;
}) {
  const t = useTheme();
  const refs = useRef<(View | null)[]>([]);
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={{ minHeight: 52, borderRadius: 14, borderWidth: 2, borderColor: t.dim, flexDirection: "row" }}
    >
      {options.map((o, i) => {
        const selected = o.value === value;
        // Each segment's touch box is the full 48px inside the 2px border; the
        // selected fill is drawn 3px in, so the look matches the 52/14 + 11 spec.
        return (
          <Pressable
            key={o.value}
            ref={(el: View | null) => { refs.current[i] = el; }}
            onPress={() => onChange(o.value)}
            {...radioKeys({
              index: i, count: options.length, selected,
              onSelect: (n) => onChange(options[n].value),
              focusAt: (n) => focusElement({ current: refs.current[n] }),
            })}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ checked: selected, selected }}
            aria-checked={selected}
            style={({ pressed, focused }: PressState) => [
              {
                flex: 1, minHeight: 48, borderRadius: 12, alignItems: "center", justifyContent: "center",
                opacity: pressed ? 0.8 : 1,
              },
              webCursor,
              focusRing(focused, t.accent),
            ]}
          >
            {({ hovered }: PressState) => (
              <>
                <View
                  style={{
                    position: "absolute", left: 3, right: 3, top: 3, bottom: 3, borderRadius: 11,
                    backgroundColor: selected ? t.accent : hovered ? t.raised : "transparent",
                  }}
                />
                <Text
                  maxFontSizeMultiplier={1.4}
                  style={{ fontSize: 16, lineHeight: 22, fontWeight: selected ? "800" : "600", color: selected ? t.field : t.ink }}
                >
                  {o.label}
                </Text>
              </>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
