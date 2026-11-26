import { Pressable, View } from "react-native";

import { t } from "../i18n";
import { Button } from "../onboarding/controls";
import { Icon } from "../ui/Icon";
import { colors, MIN_TOUCH_TARGET, radii, spacing } from "../ui/theme";
import { formatDate, type PlannerRow as Row } from "./planner-model";

/** What the buttons of a row do; each one gets the row it belongs to. */
export interface RowActions {
  readonly onDone: (row: Row) => void;
  readonly onUndo: (row: Row) => void;
  readonly onRelease: (row: Row) => void;
}

/** The mark is a rounded square in the planner and a circle on the Today screen. */
export type MarkShape = "round" | "square";

const MARK_SIZE = 26;

const labelFor = (row: Row, action: string) =>
  t("planner.actions.label", {
    action,
    title: row.title,
    date: formatDate(row.date),
  });

/**
 * The mark of an occurrence: a button "done" while it is open, a decorative
 * checked box once it is ticked off. The touch area is 44 px, the box 26 px.
 */
export function DoneMark(props: {
  row: Row;
  shape: MarkShape;
  actions: RowActions;
}) {
  const { row, shape, actions } = props;
  const done = row.completion !== null;
  const box = (
    <View
      style={{
        width: MARK_SIZE,
        height: MARK_SIZE,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: shape === "round" ? radii.pill : 8,
        borderWidth: 1.5,
        borderColor: done ? colors.text : colors.border,
        backgroundColor: done ? colors.text : "transparent",
      }}
    >
      {done ? <Icon name="check" size={16} color={colors.onAccent} /> : null}
    </View>
  );
  const area = {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  } as const;
  if (done) return <View style={area}>{box}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={labelFor(row, t("planner.actions.done"))}
      onPress={() => {
        actions.onDone(row);
      }}
      style={area}
    >
      {box}
    </Pressable>
  );
}

/**
 * The buttons under an occurrence: "undo" for the check-off of this device,
 * and "can't manage" (FR-CHR-04) for an open occurrence of the user in a pair.
 * Plain buttons, no gesture.
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
  const undo = completion !== null && completion.by === deviceId;
  const release = completion === null && paired && mine;
  if (!undo && !release) return null;
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: spacing.sm,
        marginTop: spacing.xs,
      }}
    >
      {undo ? (
        <Button
          label={t("planner.actions.undo")}
          accessibilityLabel={labelFor(row, t("planner.actions.undo"))}
          onPress={() => {
            actions.onUndo(row);
          }}
        />
      ) : null}
      {release ? (
        <Button
          icon="handOff"
          label={t("planner.actions.release")}
          accessibilityLabel={labelFor(row, t("planner.actions.release"))}
          onPress={() => {
            actions.onRelease(row);
          }}
        />
      ) : null}
    </View>
  );
}
