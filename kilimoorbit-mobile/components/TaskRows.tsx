/** Calendar tasks as tickable rows: Today's "this week" list and each crop card. */
import React from "react";
import { View } from "react-native";
import { useLang } from "../lib/session";
import { cropName } from "../lib/prices";
import { pick } from "../lib/agronomy";
import { dayMonth } from "../lib/dates";
import { farmActions, type DatedTask } from "../lib/farm";
import type { Key, Vars } from "../lib/i18n";
import { CheckRow } from "./Kit";
import { CropCoin } from "./ShambaPanel";

export function dueText(tt: (k: Key, v?: Vars) => string, inDays: number) {
  if (inDays === 0) return tt("common.today");
  if (inDays === 1) return tt("common.tomorrow");
  if (inDays < 0) return tt("common.late", { n: -inDays });
  return tt("common.inDays", { n: inDays });
}

export default function TaskRows({
  tasks, showCrop = false, dates = false, onToggled,
}: { tasks: DatedTask[]; showCrop?: boolean; dates?: boolean; onToggled?: (key: string) => void }) {
  const { lang, t: tt } = useLang();
  return (
    <View>
      {tasks.map((task) => {
        const when = dates && (task.inDays > 7 || task.inDays < -14) ? dayMonth(lang, task.due) : dueText(tt, task.inDays);
        const meta = showCrop ? `${when} · ${cropName(lang, task.planting.crop)}` : when;
        return (
          <CheckRow
            key={`${task.planting.id}:${task.id}`}
            testID={`task-${task.planting.crop}-${task.id}`}
            checked={task.done}
            onToggle={() => { farmActions.toggleTask(task.planting.id, task.id); onToggled?.(`${task.planting.id}:${task.id}`); }}
            title={pick(lang, task.title)}
            meta={meta}
            metaTone={task.inDays < 0 ? "late" : task.inDays <= 1 ? "soon" : undefined}
            leading={showCrop ? <CropCoin cropKey={task.planting.crop} size={30} /> : undefined}
          />
        );
      })}
    </View>
  );
}
