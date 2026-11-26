import { Pressable, View } from "react-native";

import { t } from "../i18n";
import type { PersonTones } from "../pairing/person-tone";
import { personColors } from "../checkin/person-colors";
import { AppText } from "../ui/AppText";
import { Chip, type ChipTone } from "../ui/Chip";
import { Icon } from "../ui/Icon";
import { colors, MIN_TOUCH_TARGET, spacing } from "../ui/theme";
import {
  DoneMark,
  PlannerActions,
  type MarkShape,
  type RowActions,
} from "./PlannerActions";
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

/** The origin, the reminder and the note of the row, as lines of the muted text. */
const extraLines = (row: Row) => [
  ...(row.fromHead ? [t("planner.actions.fromHead")] : []),
  ...(row.reminder === null
    ? []
    : [t("planner.actions.reminder", { time: row.reminder })]),
  ...(row.note === null ? [] : [row.note]),
];

function ExtraLines({ row }: { row: Row }) {
  return extraLines(row).map((line) => (
    <AppText key={line} style={{ fontSize: 13, color: colors.textMuted }}>
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

/** The title; a ticked off one is struck through and muted, so color is not the only sign. */
function RowTitle(props: { row: Row; struck: boolean }) {
  return (
    <AppText
      style={{
        fontSize: 15,
        fontWeight: "bold",
        ...(props.struck
          ? { color: colors.textMuted, textDecorationLine: "line-through" }
          : {}),
      }}
    >
      {props.row.title}
    </AppText>
  );
}

/** The area that opens the chore to edit: title, who and when, the notes. */
function RowBody(props: {
  row: Row;
  who: string;
  doneBy: string | null;
  onOpen: (choreId: string) => void;
}) {
  const { row, who, doneBy, onOpen } = props;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        onOpen(row.choreId);
      }}
      accessibilityLabel={[
        row.title,
        who,
        formatDate(row.date),
        ...extraLines(row),
        ...(doneBy === null ? [] : [doneBy]),
      ].join(", ")}
      style={{ flex: 1, minWidth: 0 }}
    >
      <RowTitle row={row} struck={doneBy !== null} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        {row.recurring ? (
          <Icon name="repeat" size={13} color={colors.textMuted} />
        ) : null}
        <AppText
          style={{ flexShrink: 1, fontSize: 13, color: colors.textMuted }}
        >
          {`${who} · ${formatDate(row.date)}`}
        </AppText>
      </View>
      <ExtraLines row={row} />
      {doneBy === null ? null : (
        <AppText style={{ fontSize: 13, color: colors.textMuted }}>
          {doneBy}
        </AppText>
      )}
    </Pressable>
  );
}

/** The chip of the responsible person: in the color of that person, neutral for the rest. */
function chipTone(row: Row, tones: PersonTones): ChipTone {
  if (row.responsible === "me") return personColors(tones.own).chip;
  if (row.responsible === "partner") return personColors(tones.partner).chip;
  return "neutral";
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
  tones: PersonTones;
  actions: RowActions;
  onOpen: (choreId: string) => void;
  /** A divider line above the row, between the rows of a card. */
  separated?: boolean;
  shape?: MarkShape;
}) {
  const { row, partnerName, deviceId, paired, actions } = props;
  const who = whoText(row, partnerName);
  const doneBy = doneText(row, deviceId, partnerName);
  const tone = chipTone(row, props.tones);
  return (
    <View
      style={{
        paddingVertical: spacing.sm,
        borderTopWidth: props.separated ? 1 : 0,
        borderTopColor: colors.divider,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.sm,
        }}
      >
        <DoneMark row={row} shape={props.shape ?? "square"} actions={actions} />
        <RowBody row={row} who={who} doneBy={doneBy} onOpen={props.onOpen} />
        <View aria-hidden style={{ flexShrink: 0, maxWidth: "35%" }}>
          <Chip label={who} tone={tone} />
        </View>
      </View>
      <View style={{ paddingLeft: MIN_TOUCH_TARGET + spacing.sm }}>
        <PlannerActions
          row={row}
          deviceId={deviceId}
          paired={paired}
          actions={actions}
        />
      </View>
    </View>
  );
}
