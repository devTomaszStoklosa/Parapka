import type { ReactNode } from "react";
import { View } from "react-native";

import { PlannerRow } from "../chores/PlannerRow";
import { buildPlanner, localDate } from "../chores/planner-model";
import { usePlanner, type PlannerData } from "../chores/use-planner";
import { useRowActions } from "../chores/use-row-actions";
import { t } from "../i18n";
import { Button } from "../onboarding/controls";
import { usePersonTones } from "../pairing/use-person-tones";
import { usePlatform } from "../platform/context";
import { AppText } from "../ui/AppText";
import { Card } from "../ui/Card";
import { colors, spacing } from "../ui/theme";

function Section(props: { title: string; children: ReactNode }) {
  return (
    <View>
      <AppText
        style={{
          fontSize: 13,
          fontWeight: "bold",
          color: colors.textMuted,
        }}
        accessibilityRole="header"
      >
        {props.title}
      </AppText>
      {props.children}
    </View>
  );
}

/** The same rows as the planner's "Today" view with the filter "all". */
function useRowProps(data: PlannerData, onOpen: () => void) {
  const { actions, failed } = useRowActions();
  const tones = usePersonTones(usePlatform());
  const { partnerName, deviceId, paired } = data;
  return {
    failed,
    open: { partnerName, deviceId, paired, tones, actions, onOpen },
  };
}

function Rows(props: { data: PlannerData; onOpenPlanner: () => void }) {
  const { data, onOpenPlanner } = props;
  const { open, failed } = useRowProps(data, onOpenPlanner);
  const { clock } = usePlatform();
  const { todo, rows } = buildPlanner({
    ...data,
    today: localDate(clock.nowMs()),
    view: "today",
    filter: "all",
  });
  const renderRows = (list: typeof rows) =>
    list.map((row, index) => (
      <PlannerRow
        key={row.key}
        row={row}
        shape="round"
        separated={index > 0}
        {...open}
      />
    ));
  return (
    <>
      {failed ? (
        <AppText accessibilityRole="alert">
          {t("planner.actions.failed")}
        </AppText>
      ) : null}
      {todo.length > 0 ? (
        <Section title={t("planner.todo")}>{renderRows(todo)}</Section>
      ) : null}
      {todo.length > 0 && rows.length > 0 ? (
        <Section title={t("todayChores.today")}>{renderRows(rows)}</Section>
      ) : (
        renderRows(rows)
      )}
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
    <Card>
      <View style={{ gap: spacing.md }}>
        <AppText accessibilityRole="header">{t("todayChores.title")}</AppText>
        {state === "failed" ? (
          <AppText accessibilityRole="alert">{t("planner.failed")}</AppText>
        ) : (
          <Rows data={state} onOpenPlanner={onOpenPlanner} />
        )}
        <Button label={t("todayChores.openPlanner")} onPress={onOpenPlanner} />
      </View>
    </Card>
  );
}
