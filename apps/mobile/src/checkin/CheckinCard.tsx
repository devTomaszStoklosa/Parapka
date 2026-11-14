import { useState } from "react";
import { View } from "react-native";
import type { CheckinWindow, IsoWeekday } from "@parapka/domain";

import { t, type TranslationKey } from "../i18n";
import { Button } from "../onboarding/controls";
import { usePlatform } from "../platform/context";
import { AppText } from "../ui/AppText";
import { colors, spacing } from "../ui/theme";
import { CheckinResults } from "./CheckinResults";
import { CheckinForm } from "./CheckinForm";
import type { CheckinInput } from "./checkin-service";
import { useCheckin, type CheckinData } from "./use-checkin";

const DAYS: Record<IsoWeekday, TranslationKey> = {
  1: "checkin.daysUntil.monday",
  2: "checkin.daysUntil.tuesday",
  3: "checkin.daysUntil.wednesday",
  4: "checkin.daysUntil.thursday",
  5: "checkin.daysUntil.friday",
  6: "checkin.daysUntil.saturday",
  7: "checkin.daysUntil.sunday",
};

const pad = (value: number) => String(value).padStart(2, "0");

/** "Check-in do niedzieli, 19:00": the end of the window. */
function periodOf({ end }: CheckinWindow) {
  const weekday = new Date(end.year, end.month - 1, end.day).getDay();
  return t("checkin.card.until", {
    day: t(DAYS[(weekday === 0 ? 7 : weekday) as IsoWeekday]),
    time: `${pad(end.hour)}:${pad(end.minute)}`,
  });
}

/** What the card says. Before the reveal it never depends on the partner (ZP-2). */
function Body(props: {
  data: CheckinData;
  onSubmit: (input: CheckinInput) => Promise<boolean>;
}) {
  const { data, onSubmit } = props;
  const { view, shared } = data;
  const [editing, setEditing] = useState(false);
  if (!view.paired) return <AppText>{t("checkin.card.noPair")}</AppText>;
  if (!shared) return <AppText>{t("checkin.card.disabled")}</AppText>;
  if (view.status === "revealed") {
    return (
      <CheckinResults
        own={view.own}
        partner={view.partner}
        partnerName={data.partnerName}
      />
    );
  }
  const form = view.status === "open" || editing;
  return (
    <View style={{ gap: spacing.md }}>
      <AppText>{periodOf(view.window)}</AppText>
      {form ? (
        <CheckinForm
          initial={view.own}
          onSubmit={(input) => {
            void onSubmit(input).then((saved) => {
              if (saved) setEditing(false);
            });
          }}
        />
      ) : (
        <AppText>{t("checkin.card.waiting")}</AppText>
      )}
      {view.status === "filled" && !editing ? (
        <Button
          label={t("checkin.card.change")}
          onPress={() => {
            setEditing(true);
          }}
        />
      ) : null}
    </View>
  );
}

/** The weekly check-in on the "Today" tab (FR-CHK-02, FR-CHK-04). */
export function CheckinCard() {
  const { state, failed, submit } = useCheckin(usePlatform());
  if (state === null) return null;
  return (
    <View
      style={{
        gap: spacing.md,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
      }}
    >
      {state === "failed" ? (
        <AppText accessibilityRole="alert">{t("checkin.failed")}</AppText>
      ) : (
        <Body data={state} onSubmit={submit} />
      )}
      {failed ? (
        <AppText accessibilityRole="alert">{t("checkin.failed")}</AppText>
      ) : null}
    </View>
  );
}
