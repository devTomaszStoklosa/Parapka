import { useState } from "react";
import { View } from "react-native";

import { t, type TranslationKey } from "../i18n";
import { Button, Field, Option } from "../onboarding/controls";
import { AppText } from "../ui/AppText";
import { colors, spacing } from "../ui/theme";
import {
  defaultFormState,
  formStateOf,
  toChoreInput,
  type FormState,
  type Visibility,
  type Who,
} from "./chore-form-model";
import type { ChoreInput, StoredChore } from "./chore-repository";
import { ChoreNoteFields } from "./ChoreNoteFields";
import { ChoreRuleFields } from "./ChoreRuleFields";

const WHO: readonly Who[] = ["me", "partner", "both", "alternating", "anyone"];
const VISIBILITY: readonly Visibility[] = ["shared", "private"];

export interface ChoreFormProps {
  /** The chore to edit; without it the form adds a new one. */
  readonly chore: StoredChore | null;
  readonly paired: boolean;
  readonly partnerName: string | null;
  readonly today: string;
  /** `isPrivate`: the new chore stays on this device even in a pair. */
  readonly onSave: (input: ChoreInput, isPrivate: boolean) => Promise<void>;
  readonly onDelete: (chore: StoredChore) => Promise<void>;
  readonly onCancel: () => void;
}

function Choices<T extends string>(props: {
  label: string;
  options: readonly T[];
  selected: T;
  text: (option: T) => string;
  onSelect: (option: T) => void;
}) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={props.label}
      style={{ gap: spacing.sm }}
    >
      <AppText>{props.label}</AppText>
      {props.options.map((option) => (
        <Option
          key={option}
          label={props.text(option)}
          selected={option === props.selected}
          onPress={() => {
            props.onSelect(option);
          }}
        />
      ))}
    </View>
  );
}

function useChoreForm(props: ChoreFormProps) {
  const { chore, paired } = props;
  const [state, setState] = useState<FormState>(() =>
    chore === null
      ? defaultFormState(props.today)
      : formStateOf(chore, props.today),
  );
  const [error, setError] = useState<TranslationKey | null>(null);
  const run = (action: () => Promise<void>, failure: TranslationKey) => {
    action().catch(() => {
      setError(failure);
    });
  };
  const save = () => {
    const result = toChoreInput(state);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    // Without a pair a chore is private, and nobody is asked about it.
    const isPrivate = !paired || state.visibility === "private";
    run(
      () => props.onSave(result.input, isPrivate),
      "planner.form.errors.save",
    );
  };
  return {
    state,
    error,
    save,
    change: (changes: Partial<FormState>) => {
      setState((current) => ({ ...current, ...changes }));
    },
    remove: (target: StoredChore) => {
      run(() => props.onDelete(target), "planner.form.errors.delete");
    },
  };
}

interface PairFieldsProps {
  readonly state: FormState;
  readonly chore: StoredChore | null;
  readonly partnerName: string | null;
  readonly change: (changes: Partial<FormState>) => void;
}

/** Who is responsible and how visible the chore is; only a pair has a choice. */
function PairFields({ state, chore, partnerName, change }: PairFieldsProps) {
  const whoText = (who: Who) =>
    who === "partner" && partnerName !== null
      ? partnerName
      : t(`planner.form.whoOptions.${who}`);
  return (
    <>
      <Choices
        label={t("planner.form.who")}
        options={WHO}
        selected={state.who}
        text={whoText}
        onSelect={(who) => {
          change({ who });
        }}
      />
      {chore === null ? (
        <Choices
          label={t("planner.form.visibility")}
          options={VISIBILITY}
          selected={state.visibility}
          text={(option) => t(`planner.form.visibilityOptions.${option}`)}
          onSelect={(visibility) => {
            change({ visibility });
          }}
        />
      ) : (
        <AppText>{t(`planner.form.visibilityNow.${state.visibility}`)}</AppText>
      )}
    </>
  );
}

/** The form of a chore: adds a new one, or edits `chore` (FR-CHR-01). */
export function ChoreForm(props: ChoreFormProps) {
  const { chore, paired, partnerName } = props;
  const { state, error, save, change, remove } = useChoreForm(props);
  return (
    <View style={{ gap: spacing.md, marginTop: spacing.md }}>
      <AppText variant="title" accessibilityRole="header">
        {t(chore === null ? "planner.form.addTitle" : "planner.form.editTitle")}
      </AppText>
      <Field
        label={t("planner.form.title")}
        value={state.title}
        onChange={(title) => {
          change({ title });
        }}
      />
      <AppText>{t("planner.form.kind")}</AppText>
      <ChoreRuleFields state={state} onChange={change} />
      <ChoreNoteFields state={state} onChange={change} />
      {paired ? (
        <PairFields
          state={state}
          chore={chore}
          partnerName={partnerName}
          change={change}
        />
      ) : null}
      {error === null ? null : (
        <AppText accessibilityRole="alert" style={{ color: colors.text }}>
          {t(error)}
        </AppText>
      )}
      <Button primary label={t("planner.form.save")} onPress={save} />
      <Button label={t("planner.form.cancel")} onPress={props.onCancel} />
      {chore === null ? null : (
        <Button
          label={t("planner.form.delete")}
          onPress={() => {
            remove(chore);
          }}
        />
      )}
    </View>
  );
}
