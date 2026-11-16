import { View } from "react-native";

import { t } from "../i18n";
import { Button } from "../onboarding/controls";
import { AppText } from "../ui/AppText";
import { colors, spacing } from "../ui/theme";

/** The notification inside the app, when the browser gives no permission for its own. */
export function NotificationBanner(props: {
  title: string;
  body: string;
  onClose: () => void;
}) {
  return (
    <View
      accessibilityRole="alert"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10,
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        padding: spacing.md,
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <View style={{ flex: 1 }}>
        <AppText>{props.title}</AppText>
        <AppText>{props.body}</AppText>
      </View>
      <Button label={t("notifications.banner.close")} onPress={props.onClose} />
    </View>
  );
}
