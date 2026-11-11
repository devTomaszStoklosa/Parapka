import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { t } from "../i18n";
import { usePlatform } from "../platform/context";
import { AppText } from "../ui/AppText";
import { colors, MIN_TOUCH_TARGET, spacing } from "../ui/theme";
import {
  buildPlanner,
  localDate,
  type PlannerFilter,
  type PlannerRow as Row,
  type PlannerView,
} from "./planner-model";
import { PlannerControls } from "./PlannerControls";
import { PlannerRow } from "./PlannerRow";
import { usePlanner, type PlannerData } from "./use-planner";

function Section({ title, rows }: { title: string; rows: readonly Row[] }) {
  return (
    <View style={{ marginTop: spacing.md }}>
      <AppText style={{ fontWeight: "bold" }} accessibilityRole="header">
        {title}
      </AppText>
      {rows.map((row) => (
        <PlannerRow key={row.key} row={row} />
      ))}
    </View>
  );
}

/** The first chore is added in the form of #166; until then the button is off. */
function EmptyState() {
  return (
    <View style={{ marginTop: spacing.lg }}>
      <AppText>{t("planner.empty.text")}</AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: true }}
        disabled
        style={{
          minHeight: MIN_TOUCH_TARGET,
          marginTop: spacing.md,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.surface,
        }}
      >
        <AppText style={{ color: colors.textMuted }}>
          {t("planner.empty.add")}
        </AppText>
      </Pressable>
    </View>
  );
}

function Lists({ data }: { data: PlannerData }) {
  const { clock } = usePlatform();
  const [view, setView] = useState<PlannerView>("today");
  const [chosen, setChosen] = useState<PlannerFilter>("all");
  // Without a pair there is nobody to filter by.
  const filter = data.paired ? chosen : "all";
  const { todo, rows } = buildPlanner({
    ...data,
    today: localDate(clock.nowMs()),
    view,
    filter,
  });
  return (
    <>
      <PlannerControls
        view={view}
        filter={filter}
        showFilter={data.paired}
        onView={setView}
        onFilter={setChosen}
      />
      {todo.length > 0 ? (
        <Section title={t("planner.todo")} rows={todo} />
      ) : null}
      {rows.length > 0 ? (
        <Section title={t("planner.upcoming")} rows={rows} />
      ) : null}
      {todo.length === 0 && rows.length === 0 ? (
        <AppText style={{ marginTop: spacing.md }}>
          {t("planner.emptyViewText")}
        </AppText>
      ) : null}
    </>
  );
}

function Content({ state }: { state: ReturnType<typeof usePlanner> }) {
  if (state === null) return null;
  if (state === "failed") return <AppText>{t("planner.failed")}</AppText>;
  if (state.chores.length === 0) return <EmptyState />;
  return <Lists data={state} />;
}

export function PlannerScreen() {
  const state = usePlanner(usePlatform());
  return (
    <ScrollView contentContainerStyle={{ padding: spacing.md }}>
      <AppText variant="title" accessibilityRole="header">
        {t("screens.planner.title")}
      </AppText>
      <Content state={state} />
    </ScrollView>
  );
}
