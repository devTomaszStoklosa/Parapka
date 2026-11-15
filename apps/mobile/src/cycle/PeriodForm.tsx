import { MAX_PERIOD_LENGTH, type CalendarDate } from "@parapka/domain";
import { useState } from "react";
import { View } from "react-native";

import { t } from "../i18n";
import { Button } from "../onboarding/controls";
import { usePlatform } from "../platform/context";
import { AlertText } from "../ui/AlertText";
import { AppText } from "../ui/AppText";
import { spacing } from "../ui/theme";
import { dateText } from "./cycle-text";
import { periodDays, type PeriodLog } from "./period-validation";
import { useCycleActions } from "./use-cycle-actions";

type Actions = ReturnType<typeof useCycleActions>;

interface Props {
  periods: readonly PeriodLog[];
  periodLength: number;
  today: CalendarDate;
  /** The day touched in the calendar, or null. */
  selected: CalendarDate | null;
  /** Called after a save or a delete, to close the panel of the day. */
  onDone: () => void;
}

const covers = (period: PeriodLog, periodLength: number, day: CalendarDate) =>
  periodDays([period], periodLength).includes(day);

/** The ongoing entry that started on or before the day. */
const ongoingBefore = (periods: readonly PeriodLog[], day: CalendarDate) =>
  periods.filter((p) => p.endDate === null && p.startDate <= day).at(-1);

/** Closes the panel when the action succeeded; the error stays on screen. */
const closeAfter = (done: Promise<boolean>, onDone: () => void) => {
  void done.then((ok) => {
    if (ok) onDone();
  });
};

function Confirmation(props: { onYes: () => void; onNo: () => void }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <AppText accessibilityRole="header">
        {t("cycle.period.confirm.title")}
      </AppText>
      <AppText>{t("cycle.period.confirm.text")}</AppText>
      <Button
        primary
        label={t("cycle.period.confirm.yes")}
        onPress={props.onYes}
      />
      <Button label={t("cycle.period.confirm.no")} onPress={props.onNo} />
    </View>
  );
}

type DayProps = Props & { day: CalendarDate; actions: Actions };
type PeriodMaker = () => PeriodLog;

function SaveButton(props: DayProps & { label: string; make: PeriodMaker }) {
  const { actions, onDone, label, make } = props;
  return (
    <Button
      label={label}
      onPress={() => {
        closeAfter(actions.savePeriod(make()), onDone);
      }}
    />
  );
}

function DayActions(props: DayProps & { onDelete: () => void }) {
  const { periods, periodLength, day, actions, onDelete } = props;
  const entry = periods.find((p) => covers(p, periodLength, day));
  const ongoing = ongoingBefore(periods, day);
  const save = (label: string, make: PeriodMaker) => (
    <SaveButton {...props} label={label} make={make} />
  );
  if (entry) {
    return (
      <>
        {save(t("cycle.period.setStart"), () => ({ ...entry, startDate: day }))}
        {save(t("cycle.period.setEnd"), () => ({ ...entry, endDate: day }))}
        <Button label={t("cycle.period.delete")} onPress={onDelete} />
      </>
    );
  }
  return (
    <>
      {save(t("cycle.period.startOnDay"), () => ({
        id: actions.newId(),
        startDate: day,
        endDate: null,
      }))}
      {ongoing
        ? save(t("cycle.period.endOnDay"), () => ({
            ...ongoing,
            endDate: day,
          }))
        : null}
    </>
  );
}

function DayPanel(props: DayProps) {
  const { periods, periodLength, day, actions, onDone } = props;
  const [confirming, setConfirming] = useState(false);
  const entry = periods.find((p) => covers(p, periodLength, day));
  if (confirming && entry) {
    return (
      <Confirmation
        onYes={() => {
          closeAfter(actions.deletePeriod(entry.id), onDone);
        }}
        onNo={() => {
          setConfirming(false);
        }}
      />
    );
  }
  return (
    <View style={{ gap: spacing.sm }}>
      <AppText accessibilityRole="header">
        {t("cycle.period.dayTitle", { date: dateText(day) })}
      </AppText>
      <DayActions
        {...props}
        onDelete={() => {
          setConfirming(true);
        }}
      />
      <Button label={t("cycle.period.close")} onPress={onDone} />
    </View>
  );
}

/** Records the periods: today's buttons, and the panel of the touched day. */
export function PeriodForm(props: Props) {
  const { periods, today, selected, onDone } = props;
  const actions = useCycleActions(usePlatform());
  const last = ongoingBefore(periods, today);
  // An entry that lasts longer than the average is still ongoing; only one
  // too old to end today does not hide the button of the start.
  const ongoing =
    last && covers(last, MAX_PERIOD_LENGTH + 1, today) ? last : undefined;
  const label = ongoing
    ? t("cycle.period.endToday")
    : t("cycle.period.startToday");
  return (
    <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
      {actions.error ? <AlertText>{actions.error}</AlertText> : null}
      <Button
        primary
        label={label}
        onPress={() => {
          closeAfter(
            actions.savePeriod(
              ongoing
                ? { ...ongoing, endDate: today }
                : { id: actions.newId(), startDate: today, endDate: null },
            ),
            onDone,
          );
        }}
      />
      {selected ? (
        <DayPanel {...props} day={selected} actions={actions} />
      ) : null}
    </View>
  );
}
