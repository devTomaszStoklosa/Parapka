import { ScrollView, View } from "react-native";

import { t } from "../i18n";
import { usePlatform } from "../platform/context";
import { AppText } from "../ui/AppText";
import { spacing } from "../ui/theme";
import { openItems } from "./head-model";
import { HeadRow } from "./HeadRow";
import { QuickAdd } from "./QuickAdd";
import { useHead } from "./use-head";

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: spacing.md }}
    >
      <AppText variant="title" accessibilityRole="header">
        {t("screens.head.title")}
      </AppText>
      {children}
    </ScrollView>
  );
}

export function HeadScreen() {
  const state = useHead(usePlatform());
  if (state === null) return <Screen>{null}</Screen>;
  if (state === "failed") {
    return (
      <Screen>
        <AppText>{t("head.failed")}</AppText>
      </Screen>
    );
  }
  const items = openItems(state.items);
  return (
    <Screen>
      <QuickAdd paired={state.paired} partnerName={state.partnerName} />
      {items.length === 0 ? (
        <AppText style={{ marginTop: spacing.md }}>{t("head.empty")}</AppText>
      ) : (
        <View>
          {items.map((item) => (
            <HeadRow
              key={item.id}
              item={item}
              partnerName={state.partnerName}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}
