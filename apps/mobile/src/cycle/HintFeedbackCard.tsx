import type { CalendarDate } from "@parapka/domain";
import { useState } from "react";
import { View } from "react-native";

import { RatingButton } from "../checkin/CheckinForm";
import { t } from "../i18n";
import { Button } from "../onboarding/controls";
import { usePlatform } from "../platform/context";
import { AlertText } from "../ui/AlertText";
import { AppText } from "../ui/AppText";
import { spacing } from "../ui/theme";
import { wireHintFeedback } from "./wiring";

const RATINGS = [1, 2, 3, 4, 5] as const;

/** One scale of 1–5 with its question. */
function Scale(props: {
  title: string;
  name: string;
  selected: number | null;
  onPick: (value: number) => void;
}) {
  const { title, name, selected, onPick } = props;
  return (
    <View style={{ gap: spacing.xs }}>
      <AppText>{title}</AppText>
      <View
        role="radiogroup"
        accessibilityLabel={name}
        style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}
      >
        {RATINGS.map((value) => (
          <RatingButton
            key={value}
            label={t("cycle.feedback.rating", { question: name, value })}
            value={value}
            checked={selected === value}
            onPick={onPick}
          />
        ))}
      </View>
    </View>
  );
}

/** "Save" needs both ratings; "Close" leaves without an answer. */
function Actions(props: {
  today: CalendarDate;
  accurate: number | null;
  notPushy: number | null;
}) {
  const { today, accurate, notPushy } = props;
  const feedback = wireHintFeedback(usePlatform());
  const [failed, setFailed] = useState(false);
  // The card disappears by itself, once the survey is saved or closed.
  const run = (action: Promise<void>) => {
    action.then(
      () => {
        setFailed(false);
      },
      () => {
        setFailed(true);
      },
    );
  };
  return (
    <>
      <Button
        primary
        label={t("cycle.feedback.save")}
        disabled={accurate === null || notPushy === null}
        onPress={() => {
          if (accurate === null || notPushy === null) return;
          run(feedback.save(today, accurate, notPushy));
        }}
      />
      <Button
        label={t("cycle.feedback.close")}
        onPress={() => {
          run(feedback.close(today));
        }}
      />
      {failed ? <AlertText>{t("cycle.feedback.error")}</AlertText> : null}
    </>
  );
}

/**
 * The survey on the hints (FR-CYC-12): two ratings, saved on this phone only.
 * It can be closed without an answer.
 */
export function HintFeedbackCard(props: { today: CalendarDate }) {
  const [accurate, setAccurate] = useState<number | null>(null);
  const [notPushy, setNotPushy] = useState<number | null>(null);
  return (
    <View
      role="group"
      accessibilityLabel={t("cycle.feedback.title")}
      style={{ marginTop: spacing.md, gap: spacing.md }}
    >
      <AppText accessibilityRole="header">{t("cycle.feedback.title")}</AppText>
      <AppText>{t("cycle.feedback.scale")}</AppText>
      <Scale
        title={t("cycle.feedback.accurate")}
        name={t("cycle.feedback.accurateName")}
        selected={accurate}
        onPick={setAccurate}
      />
      <Scale
        title={t("cycle.feedback.notPushy")}
        name={t("cycle.feedback.notPushyName")}
        selected={notPushy}
        onPick={setNotPushy}
      />
      <Actions today={props.today} accurate={accurate} notPushy={notPushy} />
      <AppText>{t("cycle.feedback.privacy")}</AppText>
    </View>
  );
}
