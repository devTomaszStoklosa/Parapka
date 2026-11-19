import { useState } from "react";
import { View } from "react-native";

import { isValidReminder } from "../chores/chore-extras";
import { t, type TranslationKey } from "../i18n";
import { Button, Field } from "../onboarding/controls";
import { AlertText } from "../ui/AlertText";
import { AppText } from "../ui/AppText";
import { spacing } from "../ui/theme";
import type { NotificationSettingsChange } from "./notification-settings";

const isTime = (text: string) => text !== "" && isValidReminder(text);

interface Times {
  readonly from: string;
  readonly to: string;
  readonly hint: string;
}

/** The change to save, or null when a shown time is not `HH:MM`. */
function changeOf(
  draft: Times,
  paired: boolean,
): NotificationSettingsChange | null {
  const typed = paired
    ? [draft.from, draft.to, draft.hint]
    : [draft.from, draft.to];
  if (!typed.every((time) => isTime(time.trim()))) return null;
  return {
    quietHours: { from: draft.from.trim(), to: draft.to.trim() },
    ...(paired ? { partnerHintTime: draft.hint.trim() } : {}),
  };
}

/** The typed times; a change from elsewhere replaces them, an unrelated reload does not. */
function useDraft(times: Times) {
  const [draft, setDraft] = useState(times);
  const [seen, setSeen] = useState(times);
  if (
    seen.from !== times.from ||
    seen.to !== times.to ||
    seen.hint !== times.hint
  ) {
    setSeen(times);
    setDraft({ from: times.from, to: times.to, hint: times.hint });
  }
  return {
    draft,
    patch: (change: Partial<Times>) => {
      setDraft({ ...draft, ...change });
    },
  };
}

/** The quiet hours and, with a pair, the hour of the hint; saved on "Zapisz godziny". */
export function NotificationTimeFields(props: {
  times: Times;
  paired: boolean;
  onSave: (change: NotificationSettingsChange) => Promise<void>;
}) {
  const { times, paired, onSave } = props;
  const { draft, patch } = useDraft(times);
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    const change = changeOf(draft, paired);
    setError(change ? null : t("notifications.settings.times.invalid"));
    if (!change) return;
    onSave(change).catch(() => {
      setError(t("notifications.settings.times.failed"));
    });
  };
  const fields: [keyof Times, TranslationKey][] = [
    ["from", "notifications.settings.times.quietFrom"],
    ["to", "notifications.settings.times.quietTo"],
    ...(paired
      ? [
          ["hint", "notifications.settings.times.hintTime"] as [
            keyof Times,
            TranslationKey,
          ],
        ]
      : []),
  ];
  return (
    <View style={{ gap: spacing.sm }}>
      <AppText style={{ fontWeight: "bold" }}>
        {t("notifications.settings.times.title")}
      </AppText>
      {fields.map(([key, label]) => (
        <Field
          key={key}
          label={t(label)}
          value={draft[key]}
          onChange={(text) => {
            patch({ [key]: text });
          }}
        />
      ))}
      <AppText>{t("notifications.settings.times.hint")}</AppText>
      {error ? <AlertText>{error}</AlertText> : null}
      <Button label={t("notifications.settings.times.save")} onPress={save} />
    </View>
  );
}
