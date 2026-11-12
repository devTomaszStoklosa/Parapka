import { useCallback, useMemo, useState, type ReactNode } from "react";
import { ScrollView, View } from "react-native";

import { t } from "../i18n";
import { usePlatform } from "../platform/context";
import { Button } from "../onboarding/controls";
import { AppText } from "../ui/AppText";
import { wireChores } from "../sync/wiring";
import { spacing } from "../ui/theme";
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
import { UndoBar } from "./UndoBar";
import { usePlanner, type PlannerData } from "./use-planner";

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
      <AppText style={{ fontWeight: "bold" }} accessibilityRole="header">
        {title}
      </AppText>
      {rows.map((row) => (
        <PlannerRow key={row.key} row={row} {...open} />
      ))}
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

/** The row buttons call the repositories; a rejection only sets `failed`. */
function useRowActions() {
  const platform = usePlatform();
  const { chores, completions } = useMemo(
    () => wireChores(platform),
    [platform],
  );
  const [failed, setFailed] = useState(false);
  // The list reloads by itself through the subscriptions.
  const attempt = (action: Promise<void>) => {
    action.then(
      () => {
        setFailed(false);
      },
      () => {
        setFailed(true);
      },
    );
  };
  const actions: RowActions = {
    onDone: (row) => {
      attempt(completions.complete(row.choreId, row.date));
    },
    onUndo: (row) => {
      attempt(completions.undo(row.choreId, row.date));
    },
    onRelease: (row) => {
      attempt(chores.release(row.choreId));
    },
  };
  return { actions, failed };
}

function Lists(props: {
  data: PlannerData;
  onOpen: (choreId: string) => void;
  onAdd: () => void;
}) {
  const { data, onAdd, onOpen } = props;
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
      <Button label={t("planner.add")} onPress={onAdd} />
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

/** The scrolling part with the title; the Undo bar stays below it. */
function Screen({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      testID="planner-scroll"
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: spacing.md }}
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
          <Lists data={data} onOpen={onOpen} onAdd={add} />
        )}
      </Screen>
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
