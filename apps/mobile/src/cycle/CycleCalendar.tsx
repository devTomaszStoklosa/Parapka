import { toDayNumber } from "@parapka/domain";
import type { CalendarDate, CycleForecast } from "@parapka/domain";
import { useState } from "react";
import { View } from "react-native";

import { t, type TranslationKey } from "../i18n";
import { Button } from "../onboarding/controls";
import { AppText } from "../ui/AppText";
import { colors, spacing } from "../ui/theme";
import { calendarMonth, type CalendarDay } from "./calendar-model";
import { dayLabel } from "./cycle-text";
import type { PeriodLog } from "./period-validation";

const WEEK = ["1", "2", "3", "4", "5", "6", "7"] as const;

/** Next to the colors, so that a state is never told by color alone. */
const MARKS = { today: "•", period: "●", range: "○", next: "◆" } as const;

const stateMark = (day: CalendarDay) =>
  day.isPeriod
    ? MARKS.period
    : day.isNextStart
      ? MARKS.next
      : day.inForecastRange
        ? MARKS.range
        : "";

/** The "today" mark goes beside the state mark, so both are visible. */
const markOf = (day: CalendarDay) =>
  (day.isToday ? MARKS.today : "") + stateMark(day);

/** Weeks of seven cells, the week starting on Monday; null pads the month. */
function weeksOf(days: readonly CalendarDay[]): (CalendarDay | null)[][] {
  const first = days[0] as CalendarDay;
  const cells: (CalendarDay | null)[] = [
    ...Array<null>((toDayNumber(first.date) + 3) % 7).fill(null),
    ...days,
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, i) =>
    cells.slice(i * 7, i * 7 + 7),
  );
}

const CELL = { width: "14.28%", minHeight: 44, alignItems: "center" } as const;

function Cell({ day }: { day: CalendarDay | null }) {
  if (day === null) return <View style={CELL} />;
  return (
    <View
      accessible
      accessibilityLabel={dayLabel(day)}
      style={[
        CELL,
        {
          justifyContent: "center",
          borderWidth: day.isToday ? 2 : 0,
          borderColor: colors.accent,
          backgroundColor:
            day.isPeriod || day.inForecastRange ? colors.surface : undefined,
        },
      ]}
    >
      <AppText style={{ fontWeight: day.isNextStart ? "bold" : "normal" }}>
        {Number(day.date.slice(8, 10))}
      </AppText>
      <AppText style={{ color: colors.textMuted }}>{markOf(day)}</AppText>
    </View>
  );
}

const LEGEND = [
  [MARKS.today, "cycle.calendar.legend.today"],
  [MARKS.period, "cycle.calendar.legend.period"],
  [MARKS.range, "cycle.calendar.legend.range"],
  [MARKS.next, "cycle.calendar.legend.next"],
] as const satisfies readonly (readonly [string, TranslationKey])[];

function Legend() {
  return (
    <View style={{ gap: spacing.xs, marginTop: spacing.sm }}>
      <AppText accessibilityRole="header">
        {t("cycle.calendar.legendTitle")}
      </AppText>
      {LEGEND.map(([mark, key]) => (
        <AppText key={key}>{mark + " " + t(key)}</AppText>
      ))}
    </View>
  );
}

interface Shown {
  readonly year: number;
  /** 1–12. */
  readonly month: number;
}

function MonthHeader(props: { shown: Shown; onMove: (step: number) => void }) {
  const { shown, onMove } = props;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <Button
        label={t("cycle.calendar.previous")}
        onPress={() => {
          onMove(-1);
        }}
      />
      <AppText accessibilityRole="header">
        {t("cycle.calendar.month", {
          month: t(`cycle.months.${String(shown.month)}` as TranslationKey),
          year: shown.year,
        })}
      </AppText>
      <Button
        label={t("cycle.calendar.next")}
        onPress={() => {
          onMove(1);
        }}
      />
    </View>
  );
}

function Weeks({ days }: { days: readonly CalendarDay[] }) {
  return (
    <>
      <View style={{ flexDirection: "row", marginTop: spacing.sm }}>
        {WEEK.map((weekday) => (
          <View key={weekday} style={CELL}>
            <AppText style={{ color: colors.textMuted }}>
              {t(`cycle.calendar.weekdays.${weekday}`)}
            </AppText>
          </View>
        ))}
      </View>
      {weeksOf(days).map((week, i) => (
        <View key={i} style={{ flexDirection: "row" }}>
          {week.map((day, j) => (
            <Cell key={j} day={day} />
          ))}
        </View>
      ))}
    </>
  );
}

/** The month calendar of the cycle data (FR-CYC-03: no fertility days). */
export function CycleCalendar(props: {
  periods: readonly PeriodLog[];
  periodLength: number;
  forecast: CycleForecast | null;
  today: CalendarDate;
}) {
  const { periods, periodLength, forecast, today } = props;
  const [shown, setShown] = useState<Shown>({
    year: Number(today.slice(0, 4)),
    month: Number(today.slice(5, 7)),
  });
  const move = (step: number) => {
    const index = shown.year * 12 + shown.month - 1 + step;
    setShown({ year: Math.floor(index / 12), month: (index % 12) + 1 });
  };
  const days = calendarMonth({
    ...shown,
    periods,
    periodLength,
    forecast,
    today,
  });
  return (
    <View style={{ marginTop: spacing.md }}>
      <MonthHeader shown={shown} onMove={move} />
      <Weeks days={days} />
      <Legend />
    </View>
  );
}
