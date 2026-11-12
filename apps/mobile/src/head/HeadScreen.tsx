import { ScrollView, View } from "react-native";

import { t } from "../i18n";
import { usePlatform } from "../platform/context";
import { AppText } from "../ui/AppText";
import { spacing } from "../ui/theme";
import { archivedItems, openItems } from "./head-model";
import { HeadArchive } from "./HeadArchive";
import { HeadRow } from "./HeadRow";
import { QuickAdd } from "./QuickAdd";
import { useHead } from "./use-head";
import { useHeadActions } from "./use-head-actions";

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
  const platform = usePlatform();
  const state = useHead(platform);
  const { actions, failed } = useHeadActions(platform);
  if (state === null) return <Screen>{null}</Screen>;
  if (state === "failed") {
    return (
      <Screen>
        <AppText>{t("head.failed")}</AppText>
      </Screen>
    );
  }
  const items = openItems(state.items);
  const archive = archivedItems(state.items);
  return (
    <Screen>
      <QuickAdd paired={state.paired} partnerName={state.partnerName} />
      {failed ? (
        <AppText accessibilityRole="alert">{t("head.actions.failed")}</AppText>
      ) : null}
      {items.length === 0 ? (
        <AppText style={{ marginTop: spacing.md }}>{t("head.empty")}</AppText>
      ) : (
        <View>
          {items.map((item) => (
            <HeadRow
              key={item.id}
              item={item}
              partnerName={state.partnerName}
              paired={state.paired}
              actions={actions}
            />
          ))}
        </View>
      )}
      {archive.length === 0 ? null : <HeadArchive items={archive} />}
    </Screen>
  );
}
