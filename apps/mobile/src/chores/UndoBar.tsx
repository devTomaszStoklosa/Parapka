import { useEffect, useState } from "react";
import { View } from "react-native";

import { t } from "../i18n";
import { Button } from "../onboarding/controls";
import { AppText } from "../ui/AppText";
import { colors, spacing } from "../ui/theme";

/** How long a deletion can be undone (FR-CHR-06). */
export const UNDO_MS = 10_000;

/** "Deleted, Undo": goes away by itself after ten seconds. */
export function UndoBar(props: {
  title: string;
  onUndo: () => Promise<void>;
  onExpire: () => void;
}) {
  const { title, onUndo, onExpire } = props;
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const timer = setTimeout(onExpire, UNDO_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [onExpire]);
  return (
    <View
      accessibilityRole="alert"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        padding: spacing.md,
        backgroundColor: colors.background,
        borderTopWidth: 1,
        borderTopColor: colors.border,
      }}
    >
      <AppText style={{ flex: 1 }}>
        {failed
          ? t("planner.undo.failed")
          : t("planner.undo.deleted", { title })}
      </AppText>
      <Button
        label={t("planner.undo.button")}
        onPress={() => {
          onUndo().then(onExpire, () => {
            setFailed(true);
          });
        }}
      />
    </View>
  );
}
