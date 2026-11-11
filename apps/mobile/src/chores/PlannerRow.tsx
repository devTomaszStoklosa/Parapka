import { Pressable } from "react-native";

import { t } from "../i18n";
import { AppText } from "../ui/AppText";
import { colors, spacing } from "../ui/theme";
import type { PlannerRow as Row } from "./planner-model";

/** `2026-11-05` as `05.11.2026`. */
const formatDate = (date: string) => date.split("-").reverse().join(".");

/**
 * One occurrence. Every row looks the same, whoever is responsible and however
 * late it is (FR-CHR-07); the check-off comes with #172. A touch opens the chore to edit.
 */
export function PlannerRow(props: {
  row: Row;
  partnerName: string | null;
  onOpen: (choreId: string) => void;
}) {
  const { row, partnerName } = props;
  const who =
    row.responsible === "partner" && partnerName !== null
      ? partnerName
      : t(`planner.responsible.${row.responsible}`);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        props.onOpen(row.choreId);
      }}
      accessibilityLabel={[
        row.title,
        who,
        formatDate(row.date),
        ...(row.done ? [t("planner.done")] : []),
      ].join(", ")}
      style={{
        padding: spacing.md,
        marginTop: spacing.sm,
        backgroundColor: colors.surface,
      }}
    >
      <AppText style={{ fontWeight: "bold" }}>{row.title}</AppText>
      <AppText style={{ color: colors.textMuted }}>
        {`${who} · ${formatDate(row.date)}`}
      </AppText>
      {row.done ? (
        <AppText style={{ color: colors.textMuted }}>
          {t("planner.done")}
        </AppText>
      ) : null}
    </Pressable>
  );
}
