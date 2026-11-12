import { View } from "react-native";

import { t } from "../i18n";
import { Button } from "../onboarding/controls";
import { spacing } from "../ui/theme";
import type { PlannerRow as Row } from "./planner-model";

/** What the buttons of a row do; each one gets the row it belongs to. */
export interface RowActions {
  readonly onDone: (row: Row) => void;
  readonly onUndo: (row: Row) => void;
  readonly onRelease: (row: Row) => void;
}

/**
 * The buttons of one occurrence: "done" while it is open, "undo" for the
 * check-off of this device, and "can't manage" (FR-CHR-04) for an open
 * occurrence of the user in a pair.
 */
export function PlannerActions(props: {
  row: Row;
  deviceId: string | null;
  paired: boolean;
  actions: RowActions;
}) {
  const { row, deviceId, paired, actions } = props;
  const { completion } = row;
  const mine = row.responsible === "me" || row.responsible === "both";
  return (
    <View style={{ flexDirection: "row", gap: spacing.sm }}>
      {completion === null ? (
        <Button
          label={t("planner.actions.done")}
          onPress={() => {
            actions.onDone(row);
          }}
        />
      ) : completion.by === deviceId ? (
        <Button
          label={t("planner.actions.undo")}
          onPress={() => {
            actions.onUndo(row);
          }}
        />
      ) : null}
      {completion === null && paired && mine ? (
        <Button
          label={t("planner.actions.release")}
          onPress={() => {
            actions.onRelease(row);
          }}
        />
      ) : null}
    </View>
  );
}
