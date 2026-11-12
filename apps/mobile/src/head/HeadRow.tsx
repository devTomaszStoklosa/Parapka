import { View } from "react-native";

import { AppText } from "../ui/AppText";
import { colors, spacing } from "../ui/theme";
import { detailLines } from "./head-model";
import type { HeadItem } from "./head-service";

/** One open thing: the title, then category, weight, carrier and due date. */
export function HeadRow(props: { item: HeadItem; partnerName: string | null }) {
  const { item, partnerName } = props;
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
    </View>
  );
}
