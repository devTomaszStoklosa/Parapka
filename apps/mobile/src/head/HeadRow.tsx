import { View } from "react-native";

import { t } from "../i18n";
import { Button } from "../onboarding/controls";
import { AppText } from "../ui/AppText";
import { colors, spacing } from "../ui/theme";
import { canTakeOver, detailLines } from "./head-model";
import type { HeadItem } from "./head-service";
import type { HeadActions } from "./use-head-actions";

/** One open thing: the title, then category, weight, carrier and due date. */
export function HeadRow(props: {
  item: HeadItem;
  partnerName: string | null;
  paired: boolean;
  actions: HeadActions;
}) {
  const { item, partnerName, paired, actions } = props;
  const labelFor = (action: string) =>
    t("head.actions.label", { action, title: item.title });
  const details = detailLines(item, partnerName);
  return (
    <View
      accessible
      accessibilityLabel={[item.title, ...details].join(", ")}
      style={{
        padding: spacing.md,
        marginTop: spacing.sm,
        backgroundColor: colors.surface,
      }}
    >
      <AppText style={{ fontWeight: "bold" }}>{item.title}</AppText>
      <AppText style={{ color: colors.textMuted }}>
        {details.join(" · ")}
      </AppText>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        {canTakeOver(item, paired) ? (
          <Button
            label={t("head.actions.takeOver")}
            accessibilityLabel={labelFor(t("head.actions.takeOver"))}
            onPress={() => {
              actions.onTakeOver(item.id);
            }}
          />
        ) : null}
        <Button
          label={t("head.actions.done")}
          accessibilityLabel={labelFor(t("head.actions.done"))}
          onPress={() => {
            actions.onDone(item.id);
          }}
        />
      </View>
    </View>
  );
}
