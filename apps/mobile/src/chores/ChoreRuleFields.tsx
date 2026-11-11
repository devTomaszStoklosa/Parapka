import type { IsoWeekday } from "@parapka/domain";
import { View } from "react-native";

import { t } from "../i18n";
import { Field, Option } from "../onboarding/controls";
import { spacing } from "../ui/theme";
import type { FormState, RuleKind } from "./chore-form-model";

const KINDS: readonly RuleKind[] = [
  "daily",
  "everyNDays",
  "weekdays",
  "monthly",
  "occasional",
];
const WEEKDAYS: readonly IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7];

interface Props {
  readonly state: FormState;
  readonly onChange: (changes: Partial<FormState>) => void;
}

function Interval({ state, onChange }: Props) {
  return (
    <>
      <Field
        label={t("planner.form.interval")}
        value={state.interval}
        numeric
        onChange={(interval) => {
          onChange({ interval });
        }}
      />
      <Field
        label={t("planner.form.startDate")}
        value={state.startDate}
        onChange={(startDate) => {
          onChange({ startDate });
        }}
      />
    </>
  );
}

function Weekdays({ state, onChange }: Props) {
  const toggle = (day: IsoWeekday) =>
    state.weekdays.includes(day)
      ? state.weekdays.filter((other) => other !== day)
      : [...state.weekdays, day].sort();
  return (
    <View style={{ gap: spacing.sm }}>
      {WEEKDAYS.map((day) => (
        <Option
          key={day}
          multiple
          label={t(
            `planner.form.weekdays.${String(day)}` as "planner.form.weekdays.1",
          )}
          selected={state.weekdays.includes(day)}
          onPress={() => {
            onChange({ weekdays: toggle(day) });
          }}
        />
      ))}
    </View>
  );
}

function Details(props: Props) {
  const { state, onChange } = props;
  switch (state.kind) {
    case "daily":
      return null;
    case "everyNDays":
      return <Interval {...props} />;
    case "weekdays":
      return <Weekdays {...props} />;
    case "monthly":
      return (
        <Field
          label={t("planner.form.dayOfMonth")}
          value={state.dayOfMonth}
          numeric
          onChange={(dayOfMonth) => {
            onChange({ dayOfMonth });
          }}
        />
      );
    case "occasional":
      return (
        <Field
          label={t("planner.form.dueDate")}
          value={state.dueDate}
          onChange={(dueDate) => {
            onChange({ dueDate });
          }}
        />
      );
  }
}

/** The kind of the chore and the fields its rule needs. */
export function ChoreRuleFields(props: Props) {
  return (
    <View style={{ gap: spacing.sm }}>
      <View accessibilityRole="radiogroup" style={{ gap: spacing.sm }}>
        {KINDS.map((kind) => (
          <Option
            key={kind}
            label={t(`planner.form.kinds.${kind}`)}
            selected={props.state.kind === kind}
            onPress={() => {
              props.onChange({ kind });
            }}
          />
        ))}
      </View>
      <Details {...props} />
    </View>
  );
}
