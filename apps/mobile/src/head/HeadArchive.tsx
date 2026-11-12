import { useState } from "react";
import { View } from "react-native";

import { t } from "../i18n";
import { Button } from "../onboarding/controls";
import { AppText } from "../ui/AppText";
import { colors, spacing } from "../ui/theme";
import { archiveLines } from "./head-model";
import type { HeadItem } from "./head-service";

/** The collapsed archive of done things: the latest closed first, no buttons. */
export function HeadArchive({ items }: { items: readonly HeadItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ marginTop: spacing.md }}>
      <Button
        label={t("head.archive.title", { count: items.length })}
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
                  padding: spacing.md,
                  marginTop: spacing.sm,
                  backgroundColor: colors.surface,
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
    </View>
  );
}
