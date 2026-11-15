import { useState } from "react";
import { TextInput, View } from "react-native";

import { t, type TranslationKey } from "../i18n";
import { Button } from "../onboarding/controls";
import { usePlatform } from "../platform/context";
import { AppText } from "../ui/AppText";
import { colors, MIN_TOUCH_TARGET, spacing } from "../ui/theme";
import { formError } from "./head-model";
import { wireHead } from "./wiring";

/** The field, the titles added so far and the saving with the defaults. */
function useDump() {
  const { head } = wireHead(usePlatform());
  const [title, setTitle] = useState("");
  const [added, setAdded] = useState<readonly string[]>([]);
  const [error, setError] = useState<TranslationKey | null>(null);
  const submit = () => {
    const invalid = formError({ title, dueDate: "" });
    setError(invalid);
    if (invalid !== null) return;
    const clean = title.trim();
    head
      .add({
        title: clean,
        category: "other",
        weight: 2,
        carrier: "me",
        dueDate: null,
      })
      .then(
        () => {
          setAdded((list) => [...list, clean]);
          setTitle("");
        },
        () => {
          setError("head.add.errors.failed");
        },
      );
  };
  return { title, setTitle, added, error, submit };
}

/**
 * Brain dump (FR-MNT-07): one title after another, each saved with the
 * defaults, the field cleared and kept for the next one.
 */
export function BrainDump({ onClose }: { onClose: () => void }) {
  const { title, setTitle, added, error, submit } = useDump();
  return (
    <View style={{ gap: spacing.sm }}>
      <AppText>{t("head.dump.title")}</AppText>
      <TextInput
        accessibilityLabel={t("head.dump.title")}
        value={title}
        onChangeText={setTitle}
        onSubmitEditing={submit}
        returnKeyType="done"
        style={{
          minHeight: MIN_TOUCH_TARGET,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: spacing.sm,
          color: colors.text,
        }}
      />
      {error === null ? null : (
        <AppText accessibilityRole="alert">{t(error)}</AppText>
      )}
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <Button primary label={t("head.add.submit")} onPress={submit} />
        <Button label={t("head.dump.done")} onPress={onClose} />
      </View>
      {added.map((text, index) => (
        <AppText key={`${String(index)}-${text}`}>{text}</AppText>
      ))}
    </View>
  );
}
