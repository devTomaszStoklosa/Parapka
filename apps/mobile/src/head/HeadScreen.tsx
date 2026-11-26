import { ScrollView, View } from "react-native";

import { t } from "../i18n";
import { usePlatform } from "../platform/context";
import { AppText } from "../ui/AppText";
import type { PersonTones } from "../pairing/person-tone";
import { usePersonTones } from "../pairing/use-person-tones";
import { colors, spacing } from "../ui/theme";
import { archivedItems, openItems } from "./head-model";
import { HandoverRequests } from "./HandoverRequests";
import { HeadArchive } from "./HeadArchive";
import { HeadRow } from "./HeadRow";
import { SplitCard } from "./SplitCard";
import { TrendChart } from "./TrendChart";
import { HeadCapture } from "./HeadCapture";
import { useHandover, type HandoverData } from "./use-handover";
import type { HeadItem } from "./head-service";
import { useHead, type HeadData } from "./use-head";
import { useHeadActions, type HeadActions } from "./use-head-actions";

const PAGE_MARGIN = 20;

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: PAGE_MARGIN, gap: spacing.md }}
    >
      <AppText variant="title" accessibilityRole="header">
        {t("screens.head.title")}
      </AppText>
      {children}
    </ScrollView>
  );
}

const requestOf = (itemId: string, { incoming, outgoing }: HandoverData) => {
  if (incoming.some((v) => v.item.id === itemId)) return "incoming";
  return outgoing.some((v) => v.item.id === itemId) ? "outgoing" : null;
};

function ItemList(props: {
  items: HeadItem[];
  state: HeadData;
  requests: HandoverData;
  actions: HeadActions;
}) {
  const { items, state, requests, actions } = props;
  if (items.length === 0) {
    return (
      <AppText style={{ marginTop: spacing.md }}>{t("head.empty")}</AppText>
    );
  }
  return (
    <View>
      {items.map((item) => (
        <HeadRow
          key={item.id}
          item={item}
          partnerName={state.partnerName}
          paired={state.paired}
          request={requestOf(item.id, requests)}
          actions={actions}
        />
      ))}
    </View>
  );
}

/** The split and the trend; the middle of the ring counts the open shared things. */
function PairedCards(props: { state: HeadData; tones: PersonTones }) {
  const { state, tones } = props;
  const openShared = openItems(state.items).filter((item) => item.shared);
  return (
    <>
      <SplitCard
        split={state.split}
        partnerName={state.partnerName}
        tones={tones}
        openCount={openShared.length}
      />
      <TrendChart
        trend={state.trend}
        partnerName={state.partnerName}
        tones={tones}
      />
    </>
  );
}

export function HeadScreen() {
  const platform = usePlatform();
  const state = useHead(platform);
  const tones = usePersonTones(platform);
  const requests = useHandover(platform);
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
      <HeadCapture paired={state.paired} partnerName={state.partnerName} />
      {failed ? (
        <AppText accessibilityRole="alert">{t("head.actions.failed")}</AppText>
      ) : null}
      <HandoverRequests
        requests={requests.incoming}
        partnerName={state.partnerName}
        actions={actions}
      />
      <ItemList
        items={items}
        state={state}
        requests={requests}
        actions={actions}
      />
      {state.paired ? <PairedCards state={state} tones={tones} /> : null}
      {archive.length === 0 ? null : <HeadArchive items={archive} />}
    </Screen>
  );
}
