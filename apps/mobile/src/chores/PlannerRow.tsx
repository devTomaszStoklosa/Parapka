import { Pressable, View } from "react-native";

import { t } from "../i18n";
import { AppText } from "../ui/AppText";
import { colors, spacing } from "../ui/theme";
import { PlannerActions, type RowActions } from "./PlannerActions";
import {
  formatDate,
  formatMoment,
  type PlannerRow as Row,
} from "./planner-model";

/** Who is responsible, by the name of the partner when it is known. */
const whoText = (row: Row, partnerName: string | null) =>
  row.responsible === "partner" && partnerName !== null
    ? partnerName
    : t(`planner.responsible.${row.responsible}`);

/** The reminder and the note of the row, as lines of the muted text. */
const extraLines = (row: Row) => [
  ...(row.reminder === null
    ? []
    : [t("planner.actions.reminder", { time: row.reminder })]),
  ...(row.note === null ? [] : [row.note]),
];

function ExtraLines({ row }: { row: Row }) {
  return extraLines(row).map((line) => (
    <AppText key={line} style={{ color: colors.textMuted }}>
      {line}
    </AppText>
  ));
}

/** Who ticked the occurrence off and when, or null while it is open. */
function doneText(
  row: Row,
  deviceId: string | null,
  partnerName: string | null,
) {
  const { completion } = row;
  if (completion === null) return null;
  const own = completion.by === deviceId;
  return t("planner.actions.doneBy", {
    who: own
      ? t("planner.actions.you")
      : (partnerName ?? t("planner.actions.partner")),
    when: formatMoment(completion.at),
  });
}

/**
 * One occurrence. Every row looks the same, whoever is responsible and however
 * late it is (FR-CHR-07); the buttons sit next to the area that opens the chore to edit.
 */
export function PlannerRow(props: {
  row: Row;
  partnerName: string | null;
  deviceId: string | null;
  paired: boolean;
  actions: RowActions;
  onOpen: (choreId: string) => void;
}) {
  const { row, partnerName, deviceId, paired, actions } = props;
  const who = whoText(row, partnerName);
  const doneBy = doneText(row, deviceId, partnerName);
  return (
    <View
      style={{
        padding: spacing.md,
        marginTop: spacing.sm,
        backgroundColor: colors.surface,
      }}
    >
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          props.onOpen(row.choreId);
        }}
        accessibilityLabel={[
          row.title,
          who,
          formatDate(row.date),
          ...extraLines(row),
          ...(doneBy === null ? [] : [doneBy]),
        ].join(", ")}
      >
        <AppText style={{ fontWeight: "bold" }}>{row.title}</AppText>
        <AppText style={{ color: colors.textMuted }}>
          {`${who} · ${formatDate(row.date)}`}
        </AppText>
        <ExtraLines row={row} />
        {doneBy === null ? null : (
          <AppText style={{ color: colors.textMuted }}>{doneBy}</AppText>
        )}
      </Pressable>
      <PlannerActions
        row={row}
        deviceId={deviceId}
        paired={paired}
        actions={actions}
      />
    </View>
  );
}
