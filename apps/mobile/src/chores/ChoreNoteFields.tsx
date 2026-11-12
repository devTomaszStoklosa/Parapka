import { t } from "../i18n";
import { Field } from "../onboarding/controls";
import type { FormState } from "./chore-form-model";

/** The note and the time of the reminder of a chore (FR-CHR-01). */
export function ChoreNoteFields(props: {
  readonly state: FormState;
  readonly onChange: (changes: Partial<FormState>) => void;
}) {
  const { state, onChange } = props;
  return (
    <>
      <Field
        label={t("planner.form.note")}
        value={state.note}
        onChange={(note) => {
          onChange({ note });
        }}
      />
      <Field
        label={t("planner.form.reminder")}
        value={state.reminder}
        onChange={(reminder) => {
          onChange({ reminder });
        }}
      />
    </>
  );
}
