import { View } from "react-native";

import { PlannerRow } from "../chores/PlannerRow";
import { buildPlanner, localDate } from "../chores/planner-model";
import { usePlanner, type PlannerData } from "../chores/use-planner";
import { useRowActions } from "../chores/use-row-actions";
import { t } from "../i18n";
import { Button } from "../onboarding/controls";
import { usePlatform } from "../platform/context";
import { AppText } from "../ui/AppText";
import { colors, spacing } from "../ui/theme";

/** The same rows as the planner's "Today" view with the filter "all". */
function Rows(props: { data: PlannerData; onOpenPlanner: () => void }) {
  const { data, onOpenPlanner } = props;
  const { actions, failed } = useRowActions();
  const { clock } = usePlatform();
  const { todo, rows } = buildPlanner({
    ...data,
    today: localDate(clock.nowMs()),
    view: "today",
    filter: "all",
  });
  const { partnerName, deviceId, paired } = data;
  const open = {
    partnerName,
    deviceId,
    paired,
    actions,
    onOpen: onOpenPlanner,
  };
  const renderRows = (list: typeof rows) =>
    list.map((row) => <PlannerRow key={row.key} row={row} {...open} />);
  return (
    <>
      {failed ? (
        <AppText accessibilityRole="alert">
          {t("planner.actions.failed")}
        </AppText>
      ) : null}
      {todo.length > 0 ? (
        <View>
          <AppText style={{ fontWeight: "bold" }} accessibilityRole="header">
            {t("planner.todo")}
          </AppText>
          {renderRows(todo)}
        </View>
      ) : null}
      {renderRows(rows)}
      {todo.length === 0 && rows.length === 0 ? (
        <AppText>{t("todayChores.none")}</AppText>
      ) : null}
    </>
  );
}

/** The chores of today (FR-CHR-03, FR-CHR-04, FR-CHR-07); a touch opens the planner. */
export function TodayChores({ onOpenPlanner }: { onOpenPlanner: () => void }) {
  const state = usePlanner(usePlatform());
  if (state === null) return null;
  return (
    <View
      style={{
        gap: spacing.md,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
      }}
    >
      <AppText accessibilityRole="header">{t("todayChores.title")}</AppText>
      {state === "failed" ? (
        <AppText accessibilityRole="alert">{t("planner.failed")}</AppText>
      ) : (
        <Rows data={state} onOpenPlanner={onOpenPlanner} />
      )}
      <Button label={t("todayChores.openPlanner")} onPress={onOpenPlanner} />
    </View>
  );
}
