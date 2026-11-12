import { View } from "react-native";

import { t } from "../i18n";
import { Button } from "../onboarding/controls";
import { AppText } from "../ui/AppText";
import { colors, spacing } from "../ui/theme";
import type { HandoverView } from "./handover-service";
import type { HeadActions } from "./use-head-actions";

function RequestCard(props: {
  request: HandoverView;
  name: string;
  actions: HeadActions;
}) {
  const { request, name, actions } = props;
  const { requestId, item } = request;
  return (
    <View
      style={{
        padding: spacing.md,
        marginTop: spacing.sm,
        backgroundColor: colors.surface,
      }}
    >
      <AppText style={{ fontWeight: "bold" }}>{item.title}</AppText>
      <AppText style={{ color: colors.textMuted }}>
        {t("head.handover.asks", { name })}
      </AppText>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Button
          label={t("head.actions.takeOver")}
          accessibilityLabel={t("head.handover.acceptLabel", {
            title: item.title,
          })}
          onPress={() => {
            actions.onAccept(requestId);
          }}
        />
        <Button
          label={t("head.handover.decline")}
          accessibilityLabel={t("head.handover.declineLabel", {
            title: item.title,
          })}
          onPress={() => {
            actions.onDecline(requestId);
          }}
        />
      </View>
    </View>
  );
}

/** The requests of the partner to me, each to accept or to decline. */
export function HandoverRequests(props: {
  requests: readonly HandoverView[];
  partnerName: string | null;
  actions: HeadActions;
}) {
  const { requests, partnerName, actions } = props;
  if (requests.length === 0) return null;
  const name = partnerName ?? t("head.carriers.partner");
  return (
    <View style={{ marginTop: spacing.md }}>
      <AppText variant="title" accessibilityRole="header">
        {t("head.handover.title")}
      </AppText>
      {requests.map((request) => (
        <RequestCard
          key={request.requestId}
          request={request}
          name={name}
          actions={actions}
        />
      ))}
    </View>
  );
}
