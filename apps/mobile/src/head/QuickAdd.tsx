import {
  MENTAL_LOAD_CATEGORIES,
  type MentalLoadCarrier,
  type MentalLoadCategory,
  type MentalLoadWeight,
} from "@parapka/domain";
import { useState } from "react";
import { TextInput, View } from "react-native";

import { t, type TranslationKey } from "../i18n";
import { Button, Field, Option } from "../onboarding/controls";
import { usePlatform } from "../platform/context";
import { AppText } from "../ui/AppText";
import { colors, MIN_TOUCH_TARGET, spacing } from "../ui/theme";
import { formError, weightText } from "./head-model";
import { wireHead } from "./wiring";

const WEIGHTS: readonly MentalLoadWeight[] = [1, 2, 3];
const CARRIERS: readonly MentalLoadCarrier[] = ["me", "partner", "both"];

function Choices<T extends string | number>(props: {
  label: string;
  options: readonly T[];
  selected: T;
  text: (option: T) => string;
  onSelect: (option: T) => void;
}) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={props.label}
      style={{ gap: spacing.sm }}
    >
      <AppText>{props.label}</AppText>
      {props.options.map((option) => (
        <Option
          key={option}
          label={props.text(option)}
          selected={option === props.selected}
          onPress={() => {
            props.onSelect(option);
          }}
        />
      ))}
    </View>
  );
}

interface Props {
  readonly paired: boolean;
  readonly partnerName: string | null;
}

/** The fields with the defaults of FR-MNT-01 and the adding itself. */
function useForm(paired: boolean) {
  const { head } = wireHead(usePlatform());
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<MentalLoadCategory>("other");
  const [weight, setWeight] = useState<MentalLoadWeight>(2);
  const [chosen, setCarrier] = useState<MentalLoadCarrier>("me");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<TranslationKey | null>(null);
  // The pair may end while "partner" is chosen.
  const carrier = paired ? chosen : "me";
  const submit = () => {
    const invalid = formError({ title, dueDate });
    setError(invalid);
    if (invalid !== null) return;
    const due = dueDate.trim();
    head
      .add({
        title: title.trim(),
        category,
        weight,
        carrier,
        dueDate: due === "" ? null : due,
      })
      .then(
        () => {
          setTitle("");
          setDueDate("");
        },
        () => {
          setError("head.add.errors.failed");
        },
      );
  };
  return {
    title,
    category,
    weight,
    carrier,
    dueDate,
    error,
    submit,
    setTitle,
    setCategory,
    setWeight,
    setCarrier,
    setDueDate,
  };
}

type Form = ReturnType<typeof useForm>;

/** The choices behind "More"; only a pair has a carrier to choose. */
function MoreFields(props: Props & { form: Form }) {
  const { paired, partnerName, form } = props;
  const carrierText = (carrier: MentalLoadCarrier) =>
    carrier === "partner" && partnerName !== null
      ? partnerName
      : t(`head.add.carrierOptions.${carrier}`);
  return (
    <View style={{ gap: spacing.md }}>
      <Choices
        label={t("head.add.category")}
        options={MENTAL_LOAD_CATEGORIES}
        selected={form.category}
        text={(category) => t(`head.categories.${category}`)}
        onSelect={form.setCategory}
      />
      {paired ? (
        <Choices
          label={t("head.add.carrier")}
          options={CARRIERS}
          selected={form.carrier}
          text={carrierText}
          onSelect={form.setCarrier}
        />
      ) : null}
      <Choices
        label={t("head.add.weight")}
        options={WEIGHTS}
        selected={form.weight}
        text={(weight) => weightText(weight)}
        onSelect={form.setWeight}
      />
      <Field
        label={t("head.add.dueDate")}
        value={form.dueDate}
        onChange={form.setDueDate}
      />
    </View>
  );
}

/** Quick add (FR-MNT-01): a title and "Add"; "More" opens the other choices. */
export function QuickAdd(props: Props) {
  const form = useForm(props.paired);
  const [more, setMore] = useState(false);
  return (
    <View style={{ gap: spacing.sm }}>
      <AppText>{t("head.add.title")}</AppText>
      <TextInput
        accessibilityLabel={t("head.add.title")}
        value={form.title}
        onChangeText={form.setTitle}
        onSubmitEditing={form.submit}
        returnKeyType="done"
        style={{
          minHeight: MIN_TOUCH_TARGET,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: spacing.sm,
          color: colors.text,
        }}
      />
      {form.error === null ? null : (
        <AppText accessibilityRole="alert">{t(form.error)}</AppText>
      )}
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <Button primary label={t("head.add.submit")} onPress={form.submit} />
        <Button
          label={more ? t("head.add.less") : t("head.add.more")}
          onPress={() => {
            setMore(!more);
          }}
        />
      </View>
      {more ? <MoreFields {...props} form={form} /> : null}
    </View>
  );
}
