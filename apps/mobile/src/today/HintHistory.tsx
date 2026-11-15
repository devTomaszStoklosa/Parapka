import { useState } from "react";
import { View } from "react-native";

import { Button } from "../onboarding/controls";
import { AppText } from "../ui/AppText";
import { spacing } from "../ui/theme";

/** A hint of one day with the label of that day. */
export interface HintEntry {
  readonly key: string;
  readonly label: string;
  readonly text: string;
}

function Entries({ entries }: { entries: readonly HintEntry[] }) {
  return (
    <>
      {entries.map((entry) => (
        <View key={entry.key} style={{ gap: spacing.xs }}>
          <AppText>{entry.label}</AppText>
          <AppText>{entry.text}</AppText>
        </View>
      ))}
    </>
  );
}

/** The hints of the next days, under a title; nothing without any. */
export function HintDays(props: {
  title: string;
  entries: readonly HintEntry[];
}) {
  if (props.entries.length === 0) return null;
  return (
    <View style={{ gap: spacing.sm }}>
      <AppText accessibilityRole="header">{props.title}</AppText>
      <Entries entries={props.entries} />
    </View>
  );
}

/** The hints of the past days behind a button; folded at first. */
export function HintHistory(props: {
  title: string;
  empty: string;
  entries: readonly HintEntry[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: spacing.sm }}>
      <Button
        label={props.title}
        expanded={open}
        onPress={() => {
          setOpen(!open);
        }}
      />
      {open ? (
        props.entries.length === 0 ? (
          <AppText>{props.empty}</AppText>
        ) : (
          <Entries entries={props.entries} />
        )
      ) : null}
    </View>
  );
}
