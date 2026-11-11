import { useEffect, useState } from "react";
import { Switch, View } from "react-native";

import { t } from "../i18n";
import { AppText } from "../ui/AppText";
import { spacing } from "../ui/theme";
import type { PauseRepository } from "./pause-repository";

/** The stored state of the pause, kept current while the component is shown. */
function usePaused(pause: Pick<PauseRepository, "isPaused" | "subscribe">) {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void pause
        .isPaused()
        .then((value) => {
          if (active) setPaused(value);
        })
        .catch(() => undefined);
    };
    refresh();
    const unsubscribe = pause.subscribe(refresh);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [pause]);
  return paused;
}

/** The switch of the pause of sending (FR-PAIR-06); Settings and Today use it. */
export function PauseToggle({
  pause,
}: {
  pause: Pick<PauseRepository, "isPaused" | "setPaused" | "subscribe">;
}) {
  const paused = usePaused(pause);
  const [failed, setFailed] = useState(false);

  const change = (value: boolean) => {
    setFailed(false);
    pause.setPaused(value).catch(() => {
      setFailed(true);
    });
  };

  return (
    <View style={{ gap: spacing.sm }}>
      <View
        style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}
      >
        <Switch
          accessibilityLabel={t("pause.label")}
          value={paused}
          onValueChange={change}
        />
        <View style={{ flex: 1 }}>
          <AppText>{t("pause.label")}</AppText>
          <AppText>{t("pause.hint")}</AppText>
        </View>
      </View>
      {failed && (
        <AppText accessibilityRole="alert">{t("pause.failed")}</AppText>
      )}
    </View>
  );
}
