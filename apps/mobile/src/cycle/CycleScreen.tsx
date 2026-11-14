import type { CalendarDate } from "@parapka/domain";
import { useState } from "react";
import { ScrollView } from "react-native";

import { t } from "../i18n";
import { usePlatform } from "../platform/context";
import { AppText } from "../ui/AppText";
import { spacing } from "../ui/theme";
import { CycleCalendar } from "./CycleCalendar";
import { CycleDisclaimer } from "./CycleDisclaimer";
import { forecastText } from "./cycle-text";
import { PeriodForm } from "./PeriodForm";
import { PhaseCard } from "./PhaseCard";
import { WellbeingForm } from "./WellbeingForm";
import { ReminderToggle } from "./ReminderToggle";
import { useCycle, type CycleData } from "./use-cycle";

function Forecast({ data }: { data: CycleData }) {
  const { forecast, phase } = data;
  if (forecast === null) {
    return (
      <AppText style={{ marginTop: spacing.md }}>
        {t("cycle.noForecast")}
      </AppText>
    );
  }
  return (
    <>
      <AppText style={{ marginTop: spacing.md }}>
        {forecastText(forecast)}
      </AppText>
      {phase?.isIrregular ? <AppText>{t("cycle.irregular")}</AppText> : null}
    </>
  );
}

function Content({ data }: { data: CycleData }) {
  const [selected, setSelected] = useState<CalendarDate | null>(null);
  return (
    <>
      <CycleCalendar
        periods={data.periods}
        periodLength={data.periodLength}
        forecast={data.forecast}
        today={data.today}
        selected={selected}
        onSelect={setSelected}
      />
      <PeriodForm
        key={selected ?? "none"}
        periods={data.periods}
        periodLength={data.periodLength}
        today={data.today}
        selected={selected}
        onDone={() => {
          setSelected(null);
        }}
      />
      <Forecast data={data} />
      {data.phase ? (
        <PhaseCard
          phase={data.phase.phase}
          description={data.description}
          form={data.form}
        />
      ) : null}
      <WellbeingForm
        key={data.wellbeing ? "saved" : "new"}
        today={data.today}
        initial={data.wellbeing}
      />
      <ReminderToggle enabled={data.wellbeingReminder} />
    </>
  );
}

/** The cycle tab: the calendar, the estimate, today's phase and the message. */
export function CycleScreen() {
  const state = useCycle(usePlatform());
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: spacing.md }}
    >
      <AppText variant="title" accessibilityRole="header">
        {t("screens.cycle.title")}
      </AppText>
      {state === "failed" ? (
        <AppText style={{ marginTop: spacing.md }}>{t("cycle.failed")}</AppText>
      ) : state === null ? null : (
        <Content data={state} />
      )}
      <CycleDisclaimer />
    </ScrollView>
  );
}
