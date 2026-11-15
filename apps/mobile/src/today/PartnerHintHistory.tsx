import { useState } from "react";
import { View } from "react-native";

import { dateText } from "../cycle/cycle-text";
import { t, type TranslationKey } from "../i18n";
import { Button } from "../onboarding/controls";
import { AppText } from "../ui/AppText";
import { spacing } from "../ui/theme";
import type { PastHint } from "./use-partner-hint";

/** "wt., 10 listopada": the weekday and the day of an ISO date. */
function dayLabel(date: string): string {
  const weekday = new Date(
    Date.UTC(
      Number(date.slice(0, 4)),
      Number(date.slice(5, 7)) - 1,
      Number(date.slice(8, 10)),
    ),
  ).getUTCDay();
  return t("todayHint.dayLabel", {
    weekday: t(`todayHint.weekdays.${String(weekday)}` as TranslationKey),
    date: dateText(date),
  });
}

/** The hints of the past days behind a button; folded at first, absent when empty. */
export function PartnerHintHistory({
  entries,
}: {
  entries: readonly PastHint[];
}) {
  const [open, setOpen] = useState(false);
  if (entries.length === 0) return null;
  return (
    <View style={{ gap: spacing.sm }}>
      <Button
        label={t("todayHint.history")}
        expanded={open}
        onPress={() => {
          setOpen(!open);
        }}
      />
      {open
        ? entries.map(({ hint, reaction }) => (
            <View key={hint.id} style={{ gap: spacing.xs }}>
              <AppText>{dayLabel(hint.forDate)}</AppText>
              <AppText>{hint.text}</AppText>
              {reaction === null ? null : (
                <AppText>
                  {t(
                    reaction === "done"
                      ? "todayHint.done"
                      : "todayHint.notToday",
                  )}
                </AppText>
              )}
            </View>
          ))
        : null}
    </View>
  );
}
