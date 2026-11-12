import { View } from "react-native";

import { t } from "../i18n";
import { Button } from "../onboarding/controls";
import { AppText } from "../ui/AppText";
import { colors, spacing } from "../ui/theme";
import { canRequestHandover, canTakeOver, detailLines } from "./head-model";
import type { HeadItem } from "./head-service";
import type { HeadActions } from "./use-head-actions";

/** The wait for the answer to a handover request, above the buttons. */
function WaitingNote({ request }: { request: "incoming" | "outgoing" | null }) {
  if (request !== "outgoing") return null;
  return (
    <AppText style={{ color: colors.textMuted }}>
      {t("head.handover.waiting")}
    </AppText>
  );
}

/** The "please take it over" button; the wait is shown above the buttons. */
function AskForHandover(props: {
  item: HeadItem;
  paired: boolean;
  request: "incoming" | "outgoing" | null;
  actions: HeadActions;
}) {
  const { item, paired, request, actions } = props;
  if (request !== null || !canRequestHandover(item, paired)) return null;
  return (
    <Button
      label={t("head.handover.request")}
      accessibilityLabel={t("head.actions.label", {
        action: t("head.handover.request"),
        title: item.title,
      })}
      onPress={() => {
        actions.onRequest(item.id);
      }}
    />
  );
}

/** One open thing: the title, then category, weight, carrier and due date. */
export function HeadRow(props: {
  item: HeadItem;
  partnerName: string | null;
  paired: boolean;
  /** Which pending request the item has, if any. */
  request: "incoming" | "outgoing" | null;
  actions: HeadActions;
}) {
  const { item, partnerName, paired, request, actions } = props;
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
      <WaitingNote request={request} />
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        {request !== "incoming" && canTakeOver(item, paired) ? (
          <Button
            label={t("head.actions.takeOver")}
            accessibilityLabel={labelFor(t("head.actions.takeOver"))}
            onPress={() => {
              actions.onTakeOver(item.id);
            }}
          />
        ) : null}
        <AskForHandover {...props} />
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
