import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { t } from "../i18n";
import { usePlatform } from "../platform/context";
import { Button } from "../onboarding/controls";
import { AppText } from "../ui/AppText";
import { wireChores } from "../sync/wiring";
import { Card } from "../ui/Card";
import { Icon } from "../ui/Icon";
import { colors, radii, spacing } from "../ui/theme";
import {
  buildPlanner,
  localDate,
  type PlannerFilter,
  type PlannerRow as Row,
  type PlannerView,
} from "./planner-model";
import { changedFields } from "./chore-form-model";
import type { StoredChore } from "./chore-repository";
import { ChoreForm } from "./ChoreForm";
import { PlannerControls } from "./PlannerControls";
import type { RowActions } from "./PlannerActions";
import { PlannerRow } from "./PlannerRow";
import { ADD_BUTTON_SIZE, UndoBar } from "./UndoBar";
import { usePlanner, type PlannerData } from "./use-planner";
import { useRowActions } from "./use-row-actions";

interface Open {
  readonly partnerName: string | null;
  readonly deviceId: string | null;
  readonly paired: boolean;
  readonly actions: RowActions;
  readonly onOpen: (choreId: string) => void;
}

function Section(props: Open & { title: string; rows: readonly Row[] }) {
  const { title, rows, ...open } = props;
  return (
    <View style={{ marginTop: spacing.md }}>
      <AppText
        style={{
          fontSize: 13,
          fontWeight: "700",
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: colors.textMuted,
          marginBottom: spacing.sm,
        }}
        accessibilityRole="header"
      >
        {title}
      </AppText>
      <Card>
        {rows.map((row) => (
          <PlannerRow key={row.key} row={row} {...open} />
        ))}
      </Card>
    </View>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <View style={{ marginTop: spacing.lg }}>
      <AppText>{t("planner.empty.text")}</AppText>
      <View style={{ marginTop: spacing.md }}>
        <Button primary label={t("planner.empty.add")} onPress={onAdd} />
      </View>
    </View>
  );
}

function Lists(props: {
  data: PlannerData;
  onOpen: (choreId: string) => void;
}) {
  const { data, onOpen } = props;
  const { actions, failed } = useRowActions();
  const { partnerName, deviceId, paired } = data;
  const open = { partnerName, deviceId, paired, actions, onOpen };
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
      {failed ? (
        <AppText accessibilityRole="alert">
          {t("planner.actions.failed")}
        </AppText>
      ) : null}
      {todo.length > 0 ? (
        <Section title={t("planner.todo")} rows={todo} {...open} />
      ) : null}
      {rows.length > 0 ? (
        <Section title={t("planner.upcoming")} rows={rows} {...open} />
      ) : null}
      {todo.length === 0 && rows.length === 0 ? (
        <AppText style={{ marginTop: spacing.md }}>
          {t("planner.emptyViewText")}
        </AppText>
      ) : null}
    </>
  );
}

/** The form is open for a new chore (`"add"`) or for the chore to edit. */
type Mode = "add" | StoredChore | null;

/** The form with the repository behind it. */
function ChoreEditor(props: {
  data: PlannerData;
  mode: "add" | StoredChore;
  onClose: () => void;
  onDeleted: (chore: StoredChore) => void;
}) {
  const { data, mode, onClose } = props;
  const platform = usePlatform();
  const { chores } = useMemo(() => wireChores(platform), [platform]);
  return (
    <ChoreForm
      chore={mode === "add" ? null : mode}
      paired={data.paired}
      partnerName={data.partnerName}
      today={localDate(platform.clock.nowMs())}
      onCancel={onClose}
      onSave={async (input, isPrivate) => {
        await (mode === "add"
          ? chores.add(input, { private: isPrivate })
          : chores.edit(mode.id, changedFields(mode, input)));
        onClose();
      }}
      onDelete={async (chore) => {
        await chores.remove(chore.id);
        props.onDeleted(chore);
        onClose();
      }}
    />
  );
}

/** Room under the list for the add button, the Undo bar and their gaps. */
const FLOAT_ROOM = ADD_BUTTON_SIZE * 2 + spacing.md * 4;

function AddButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("planner.add")}
      onPress={onPress}
      style={{
        position: "absolute",
        right: spacing.md,
        bottom: spacing.md,
        width: ADD_BUTTON_SIZE,
        height: ADD_BUTTON_SIZE,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: radii.field,
        backgroundColor: colors.accent,
      }}
    >
      <Icon name="plus" size={28} color={colors.onAccent} />
    </Pressable>
  );
}

/** The scrolling part with the title; the Undo bar stays below it. */
function Screen({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      testID="planner-scroll"
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: spacing.md, paddingBottom: FLOAT_ROOM }}
    >
      <AppText variant="title" accessibilityRole="header">
        {t("screens.planner.title")}
      </AppText>
      {children}
    </ScrollView>
  );
}

function Content({ data }: { data: PlannerData }) {
  const platform = usePlatform();
  const { chores } = useMemo(() => wireChores(platform), [platform]);
  const [mode, setMode] = useState<Mode>(null);
  const [deleted, setDeleted] = useState<StoredChore | null>(null);
  const expire = useCallback(() => {
    setDeleted(null);
  }, []);
  const add = () => {
    setMode("add");
  };
  const onOpen = (choreId: string) => {
    setMode(data.chores.find((chore) => chore.id === choreId) ?? null);
  };
  return (
    <View style={{ flex: 1 }}>
      <Screen>
        {mode !== null ? (
          <ChoreEditor
            key={mode === "add" ? "add" : mode.id}
            data={data}
            mode={mode}
            onClose={() => {
              setMode(null);
            }}
            onDeleted={setDeleted}
          />
        ) : data.chores.length === 0 ? (
          <EmptyState onAdd={add} />
        ) : (
          <Lists data={data} onOpen={onOpen} />
        )}
      </Screen>
      {mode === null && data.chores.length > 0 ? (
        <AddButton onPress={add} />
      ) : null}
      {deleted === null ? null : (
        <UndoBar
          key={deleted.id}
          title={deleted.title}
          onExpire={expire}
          onUndo={() => chores.restore(deleted.id)}
        />
      )}
    </View>
  );
}

export function PlannerScreen() {
  const state = usePlanner(usePlatform());
  if (state === null) return <Screen>{null}</Screen>;
  if (state === "failed") {
    return (
      <Screen>
        <AppText>{t("planner.failed")}</AppText>
      </Screen>
    );
  }
  return <Content data={state} />;
}
