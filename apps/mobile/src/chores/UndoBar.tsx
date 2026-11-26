import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";

import { t } from "../i18n";
import { AppText } from "../ui/AppText";
import { colors, MIN_TOUCH_TARGET, radii, spacing } from "../ui/theme";

/** Side of the floating add button; the bar floats above it. */
export const ADD_BUTTON_SIZE = 60;

/** How long a deletion can be undone (FR-CHR-06). */
export const UNDO_MS = 10_000;

function UndoButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        minHeight: MIN_TOUCH_TARGET,
        minWidth: MIN_TOUCH_TARGET,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: spacing.md,
        borderRadius: radii.pill,
        borderWidth: 1.5,
        borderColor: colors.surface,
      }}
    >
      <AppText style={{ color: colors.surface, fontWeight: "700" }}>
        {t("planner.undo.button")}
      </AppText>
    </Pressable>
  );
}

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
        position: "absolute",
        left: spacing.md,
        right: spacing.md,
        bottom: spacing.md + ADD_BUTTON_SIZE + spacing.sm,
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        padding: spacing.md,
        borderRadius: radii.field,
        backgroundColor: colors.text,
        // Same color as the toast: keeps the edge the tests of the bar read.
        borderTopWidth: 1,
        borderTopColor: colors.text,
      }}
    >
      <AppText style={{ flex: 1, color: colors.surface }}>
        {failed
          ? t("planner.undo.failed")
          : t("planner.undo.deleted", { title })}
      </AppText>
      <UndoButton
        onPress={() => {
          onUndo().then(onExpire, () => {
            setFailed(true);
          });
        }}
      />
    </View>
  );
}
