import { useEffect, useState } from "react";
import { View } from "react-native";

import { t } from "../i18n";
import { AppText } from "../ui/AppText";
import { LabelledSwitch } from "../ui/LabelledSwitch";
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
      <LabelledSwitch
        label={t("pause.label")}
        hint={t("pause.hint")}
        value={paused}
        onChange={change}
      />
      {failed && (
        <AppText accessibilityRole="alert">{t("pause.failed")}</AppText>
      )}
    </View>
  );
}
