import { useState } from "react";
import { ScrollView, View } from "react-native";

import { t } from "../i18n";
import { Button, Option } from "../onboarding/controls";
import { AppText } from "../ui/AppText";
import { colors, spacing } from "../ui/theme";
import type { PrivateCandidates } from "./share-private";

interface Props {
  candidates: PrivateCandidates;
  onShare: (
    choreIds: readonly string[],
    itemIds: readonly string[],
  ) => Promise<void>;
  onSkip: () => Promise<void>;
}

function Group({
  title,
  rows,
  picked,
  toggle,
}: {
  title: string;
  rows: readonly { id: string; title: string }[];
  picked: ReadonlySet<string>;
  toggle: (id: string) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <View style={{ gap: spacing.sm }}>
      <AppText variant="title" accessibilityRole="header">
        {title}
      </AppText>
      {rows.map((row) => (
        <Option
          key={row.id}
          multiple
          label={row.title}
          selected={picked.has(row.id)}
          onPress={() => {
            toggle(row.id);
          }}
        />
      ))}
    </View>
  );
}

const flip = (ids: ReadonlySet<string>, id: string) => {
  const next = new Set(ids);
  if (!next.delete(id)) next.add(id);
  return next;
};

/** The picked ids of one group; nothing is picked at first. */
function usePicks() {
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  return [
    picked,
    (id: string) => {
      setPicked((previous) => flip(previous, id));
    },
  ] as const;
}

function useRunner() {
  const [failed, setFailed] = useState(false);
  return [
    failed,
    (action: Promise<void>) => {
      setFailed(false);
      action.catch(() => {
        setFailed(true);
      });
    },
  ] as const;
}

/** The one-time question of FR-PAIR-04: nothing is picked until the person picks it. */
export function SharePrivatePrompt({ candidates, onShare, onSkip }: Props) {
  const [chores, toggleChore] = usePicks();
  const [items, toggleItem] = usePicks();
  const [failed, run] = useRunner();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
    >
      <AppText variant="title" accessibilityRole="header">
        {t("share.title")}
      </AppText>
      <AppText>{t("share.intro")}</AppText>
      <Group
        title={t("share.chores")}
        rows={candidates.chores}
        picked={chores}
        toggle={toggleChore}
      />
      <Group
        title={t("share.items")}
        rows={candidates.items}
        picked={items}
        toggle={toggleItem}
      />
      <AppText>{t("share.skipHint")}</AppText>
      {failed && (
        <AppText accessibilityRole="alert">{t("share.failed")}</AppText>
      )}
      <Button
        primary
        label={t("share.move")}
        onPress={() => {
          run(onShare([...chores], [...items]));
        }}
      />
      <Button
        label={t("share.skip")}
        onPress={() => {
          run(onSkip());
        }}
      />
    </ScrollView>
  );
}
