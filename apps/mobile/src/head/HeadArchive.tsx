import { useState } from "react";
import { View } from "react-native";

import { t } from "../i18n";
import { Button } from "../onboarding/controls";
import { AppText } from "../ui/AppText";
import { Card } from "../ui/Card";
import { colors, spacing } from "../ui/theme";
import { archiveLines } from "./head-model";
import type { HeadItem } from "./head-service";

/** The collapsed archive of done things: the latest closed first, no buttons. */
export function HeadArchive({ items }: { items: readonly HeadItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <Button
        label={t("head.archive.title", { count: items.length })}
        expanded={open}
        onPress={() => {
          setOpen(!open);
        }}
      />
      {open
        ? items.map((item) => {
            const lines = archiveLines(item);
            return (
              <View
                key={item.id}
                accessible
                accessibilityLabel={[item.title, ...lines].join(", ")}
                style={{
                  paddingVertical: spacing.sm,
                  marginTop: spacing.xs,
                  borderTopWidth: 1,
                  borderTopColor: colors.divider,
                }}
              >
                <AppText style={{ fontWeight: "bold" }}>{item.title}</AppText>
                <AppText style={{ color: colors.textMuted }}>
                  {lines.join(" · ")}
                </AppText>
              </View>
            );
          })
        : null}
    </Card>
  );
}
