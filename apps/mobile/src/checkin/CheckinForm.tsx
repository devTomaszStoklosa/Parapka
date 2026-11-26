import { useState } from "react";
import { Pressable, View } from "react-native";
import { CHECKIN_NEED_MAX_LENGTH, type CheckinAnswers } from "@parapka/domain";

import { t, type TranslationKey } from "../i18n";
import { Button, Field } from "../onboarding/controls";
import { AppText } from "../ui/AppText";
import { Chip } from "../ui/Chip";
import { Icon } from "../ui/Icon";
import { colors, MIN_TOUCH_TARGET, radii, spacing } from "../ui/theme";
import type { CheckinInput } from "./checkin-service";

const RATINGS = [1, 2, 3, 4, 5] as const;
const QUESTIONS = ["mood", "energy", "closeness"] as const;
const HINTS = ["self", "help", "together"] as const;

type Question = (typeof QUESTIONS)[number];
type Ratings = Record<Question, number | null>;

const SCALE_GAP = 2;
const SHAPE_SIZE = (value: number) => 14 + 4 * (value - 1);

/** The drawing of one energy bar or closeness circle, smaller than its target. */
function Shape(props: { question: Question; value: number; checked: boolean }) {
  const { question, value, checked } = props;
  const size = SHAPE_SIZE(value);
  return (
    <View
      style={{
        ...(question === "energy" ? { width: 12 } : { aspectRatio: 1 }),
        height: question === "energy" ? size + 6 : size,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: question === "energy" ? 4 : radii.pill,
        borderWidth: checked ? 3 : 1.5,
        borderColor: checked ? colors.text : colors.border,
        backgroundColor: checked ? colors.text : colors.surface,
      }}
    >
      {checked && question === "closeness" ? (
        <Icon name="heart" size={size - 8} color={colors.onAccent} />
      ) : null}
    </View>
  );
}

/** The box of an option: the check-in pill, a bare shape, or (no question) the plain button. */
function optionStyle(question: Question | undefined, checked: boolean) {
  if (question === undefined) {
    return {
      borderWidth: checked ? 3 : 1,
      borderColor: checked ? colors.accent : colors.border,
      backgroundColor: checked ? colors.accent : colors.background,
    };
  }
  if (question !== "mood") return { flex: 1 };
  return {
    flex: 1,
    borderRadius: radii.pill,
    borderWidth: checked ? 3 : 1.5,
    borderColor: checked ? colors.text : colors.border,
    backgroundColor: checked ? colors.text : colors.surface,
  };
}

/** One rating: the chosen one differs by fill, border and weight, not by colour alone. */
export function RatingButton(props: {
  label: string;
  value: number;
  checked: boolean;
  onPick: (value: number) => void;
  question?: Question;
}) {
  const { label, value, checked, onPick, question } = props;
  return (
    <Pressable
      role="radio"
      aria-checked={checked}
      accessibilityLabel={label}
      onPress={() => {
        onPick(value);
      }}
      style={{
        minHeight: MIN_TOUCH_TARGET,
        minWidth: MIN_TOUCH_TARGET,
        alignItems: "center",
        justifyContent: "center",
        ...optionStyle(question, checked),
      }}
    >
      {question === "energy" || question === "closeness" ? (
        <Shape question={question} value={value} checked={checked} />
      ) : (
        <AppText
          style={
            checked ? { color: colors.onAccent, fontWeight: "bold" } : undefined
          }
        >
          {String(value)}
        </AppText>
      )}
    </Pressable>
  );
}

/** One scale of 1–5: five radio buttons labelled with the question and value. */
function Scale(props: {
  question: Question;
  selected: number | null;
  onPick: (value: number) => void;
}) {
  const { question, selected, onPick } = props;
  const text = t(`checkin.form.${question}`);
  return (
    <View
      style={{
        gap: spacing.sm,
        paddingTop: spacing.md,
        borderTopWidth: 1,
        borderTopColor: colors.divider,
      }}
    >
      <AppText style={{ fontWeight: "700" }}>{text}</AppText>
      <View
        role="radiogroup"
        accessibilityLabel={text}
        style={{ flexDirection: "row", gap: SCALE_GAP, alignItems: "flex-end" }}
      >
        {RATINGS.map((value) => (
          <RatingButton
            key={value}
            question={question}
            label={t("checkin.form.rating", { question: text, value })}
            value={value}
            checked={selected === value}
            onPick={onPick}
          />
        ))}
      </View>
    </View>
  );
}

/** The optional need: the field, the counter and the hints that fill it. */
function NeedFields(props: { need: string; onChange: (text: string) => void }) {
  const { need, onChange } = props;
  return (
    <View
      style={{
        gap: spacing.sm,
        paddingTop: spacing.md,
        borderTopWidth: 1,
        borderTopColor: colors.divider,
      }}
    >
      <Field label={t("checkin.form.need")} value={need} onChange={onChange} />
      <AppText style={{ color: colors.textMuted, fontSize: 12 }}>
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
            <Chip
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

/** Four segments, one per answered question; hidden from screen readers. */
function Progress(props: { filled: number }) {
  return (
    <View aria-hidden style={{ flexDirection: "row", gap: spacing.xs }}>
      {[0, 1, 2, 3].map((index) => (
        <View
          key={index}
          testID="checkin-progress-segment"
          style={{
            flex: 1,
            height: 6,
            borderRadius: radii.pill,
            backgroundColor:
              index < props.filled ? colors.accent : colors.track,
          }}
        />
      ))}
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
  const filled =
    QUESTIONS.filter((question) => ratings[question] !== null).length +
    (need.trim() === "" ? 0 : 1);
  return (
    <View style={{ gap: spacing.md }}>
      <Progress filled={filled} />
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
        icon="lock"
        label={t("checkin.form.save")}
        disabled={input === null}
        onPress={() => {
          if (input !== null) onSubmit(input);
        }}
      />
    </View>
  );
}
