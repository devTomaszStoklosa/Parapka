import { useState } from "react";
import { Pressable, View } from "react-native";
import { CHECKIN_NEED_MAX_LENGTH, type CheckinAnswers } from "@parapka/domain";

import { t, type TranslationKey } from "../i18n";
import { Button, Field } from "../onboarding/controls";
import { AppText } from "../ui/AppText";
import { colors, MIN_TOUCH_TARGET, spacing } from "../ui/theme";
import type { CheckinInput } from "./checkin-service";

const RATINGS = [1, 2, 3, 4, 5] as const;
const QUESTIONS = ["mood", "energy", "closeness"] as const;
const HINTS = ["self", "help", "together"] as const;

type Question = (typeof QUESTIONS)[number];
type Ratings = Record<Question, number | null>;

/** One scale of 1–5: five radio buttons labelled with the question and value. */
function Scale(props: {
  question: Question;
  selected: number | null;
  onPick: (value: number) => void;
}) {
  const { question, selected, onPick } = props;
  const text = t(`checkin.form.${question}`);
  return (
    <View style={{ gap: spacing.xs }}>
      <AppText>{text}</AppText>
      <View
        role="radiogroup"
        accessibilityLabel={text}
        style={{ flexDirection: "row", gap: spacing.sm }}
      >
        {RATINGS.map((value) => (
          <Pressable
            key={value}
            role="radio"
            aria-checked={selected === value}
            accessibilityLabel={t("checkin.form.rating", {
              question: text,
              value,
            })}
            onPress={() => {
              onPick(value);
            }}
            style={{
              minHeight: MIN_TOUCH_TARGET,
              minWidth: MIN_TOUCH_TARGET,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: selected === value ? colors.accent : colors.border,
              backgroundColor:
                selected === value ? colors.surface : colors.background,
            }}
          >
            <AppText>{String(value)}</AppText>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** The optional need: the field, the counter and the hints that fill it. */
function NeedFields(props: { need: string; onChange: (text: string) => void }) {
  const { need, onChange } = props;
  return (
    <View style={{ gap: spacing.sm }}>
      <Field label={t("checkin.form.need")} value={need} onChange={onChange} />
      <AppText>
        {t("checkin.form.counter", {
          count: need.length,
          max: CHECKIN_NEED_MAX_LENGTH,
        })}
      </AppText>
      <View
        role="group"
        accessibilityLabel={t("checkin.form.hintGroup")}
        style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}
      >
        {HINTS.map((hint) => {
          const key: TranslationKey = `checkin.form.hints.${hint}`;
          return (
            <Button
              key={hint}
              label={t(key)}
              onPress={() => {
                onChange(need === "" ? t(key) : `${need} ${t(key)}`);
              }}
            />
          );
        })}
      </View>
    </View>
  );
}

/** The answers once all three ratings are chosen; null before. */
function inputOf(
  { mood, energy, closeness }: Ratings,
  need: string,
): CheckinInput | null {
  if (mood === null || energy === null || closeness === null) return null;
  const trimmed = need.trim();
  return {
    mood,
    energy,
    closeness,
    ...(trimmed === "" ? {} : { need: trimmed }),
  };
}

/** The three ratings and the optional need; "Save" waits for the ratings. */
export function CheckinForm(props: {
  initial: CheckinAnswers | null;
  onSubmit: (input: CheckinInput) => void;
}) {
  const { initial, onSubmit } = props;
  const [ratings, setRatings] = useState<Ratings>({
    mood: initial?.mood ?? null,
    energy: initial?.energy ?? null,
    closeness: initial?.closeness ?? null,
  });
  const [need, setNeed] = useState(initial?.need ?? "");
  const input = inputOf(ratings, need);
  return (
    <View style={{ gap: spacing.md }}>
      {QUESTIONS.map((question) => (
        <Scale
          key={question}
          question={question}
          selected={ratings[question]}
          onPick={(value) => {
            setRatings({ ...ratings, [question]: value });
          }}
        />
      ))}
      <NeedFields
        need={need}
        onChange={(text) => {
          setNeed(text.slice(0, CHECKIN_NEED_MAX_LENGTH));
        }}
      />
      <Button
        primary
        label={t("checkin.form.save")}
        disabled={input === null}
        onPress={() => {
          if (input !== null) onSubmit(input);
        }}
      />
    </View>
  );
}
