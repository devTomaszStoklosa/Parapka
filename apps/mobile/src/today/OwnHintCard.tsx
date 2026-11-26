import { View } from "react-native";

import { t } from "../i18n";
import { pl } from "../i18n/pl";
import { Button } from "../onboarding/controls";
import { usePlatform } from "../platform/context";
import { AppText } from "../ui/AppText";
import { Card } from "../ui/Card";
import { spacing } from "../ui/theme";
import type { StoredHint } from "../cycle/hint-repository";
import { OwnHintActions } from "./OwnHintActions";
import {
  CategoryChip,
  HintDays,
  HintHistory,
  type HintEntry,
} from "./HintHistory";
import { useOwnHints, type OwnHintsData } from "./use-own-hints";

const MONTHS = pl.cycle.monthsOf;

const dayOf = (hint: StoredHint) => {
  const [, month = "1", day = "1"] = hint.forDate.split("-");
  return t("cycle.ownHint.day", {
    day: Number(day),
    month: MONTHS[String(Number(month)) as keyof typeof MONTHS],
  });
};

const upcoming = (label: string, hint: StoredHint | null): HintEntry[] =>
  hint === null
    ? []
    : [
        {
          key: hint.forDate,
          label: `${label} (${pl.cycle.ownHint.upcomingNote})`,
          text: hint.text,
          category: hint.category,
        },
      ];

function Body({ data }: { data: OwnHintsData }) {
  const { today, tomorrow, dayAfter, history } = data;
  const c = pl.cycle.ownHint;
  const days = [
    ...upcoming(c.tomorrow, tomorrow),
    ...upcoming(c.dayAfter, dayAfter),
  ];
  return (
    <>
      <AppText>{c[data.sharing]}</AppText>
      {today === null ? null : <CategoryChip category={today.category} />}
      <AppText variant="title">{today === null ? c.none : today.text}</AppText>
      <OwnHintActions hasHint={today !== null} skipped={data.todaySkipped} />
      <HintDays title={c.upcoming} entries={days} />
      <HintHistory
        title={c.history}
        empty={c.historyEmpty}
        entries={history.map((hint) => ({
          key: hint.forDate,
          label: dayOf(hint),
          text: hint.text,
          category: hint.category,
        }))}
      />
    </>
  );
}

/**
 * The preview of the own hint: the very text the partner gets for today, the
 * next days and the history (FR-CYC-06, FR-CYC-14). Without a start of a
 * period the card sends the person to the "Cycle" tab.
 */
export function OwnHintCard({ onOpenCycle }: { onOpenCycle: () => void }) {
  const state = useOwnHints(usePlatform());
  if (state === null) return null;
  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <AppText accessibilityRole="header">{pl.cycle.ownHint.title}</AppText>
        {state === "failed" ? (
          <AppText accessibilityRole="alert">{pl.cycle.ownHint.failed}</AppText>
        ) : (
          <>
            <Body data={state} />
            {state.hasPeriod ? null : (
              <Button
                label={pl.cycle.ownHint.openCycle}
                onPress={onOpenCycle}
              />
            )}
          </>
        )}
      </View>
    </Card>
  );
}
