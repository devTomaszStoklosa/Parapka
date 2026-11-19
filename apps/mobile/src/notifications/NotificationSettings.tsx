import { useCallback, useEffect, useMemo, useState } from "react";
import { View } from "react-native";

import { wireChores } from "../chores/wiring";
import { useConsentWiring } from "../consent/wiring";
import { wireCycle } from "../cycle/wiring";
import { t } from "../i18n";
import { usePlatform } from "../platform/context";
import { AlertText } from "../ui/AlertText";
import { AppText } from "../ui/AppText";
import { LabelledSwitch } from "../ui/LabelledSwitch";
import { spacing } from "../ui/theme";
import {
  createNotificationSettingsRepository,
  type NotificationSettings as Settings,
  type NotificationSettingsChange,
  type NotificationSettingsRepository,
} from "./notification-settings";
import { NotificationPermission } from "./NotificationPermission";
import { NotificationTimeFields } from "./NotificationTimeFields";
import { NotificationTypeToggles } from "./NotificationTypeToggles";

interface Loaded {
  readonly settings: Settings;
  readonly paired: boolean;
  readonly cyclePanel: boolean;
}

/** The settings, the pair and the cycle panel; reloads after any change of them. */
function useLoaded() {
  const platform = usePlatform();
  const repository = useMemo(
    () => createNotificationSettingsRepository(platform.database),
    [platform],
  );
  const { profiles } = useConsentWiring(platform);
  const { pairs } = wireChores(platform);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  useEffect(() => {
    let active = true;
    const load = () => {
      void Promise.all([
        repository.get(),
        pairs.activePair(),
        profiles.get(),
      ]).then(([settings, pair, profile]) => {
        if (active) {
          setLoaded({
            settings,
            paired: pair !== null,
            cyclePanel: profile?.cycle === "yes",
          });
        }
      });
    };
    load();
    const stops = [
      repository.subscribe(load),
      pairs.subscribe(load),
      profiles.subscribe(load),
    ];
    return () => {
      active = false;
      for (const stop of stops) stop();
    };
  }, [repository, pairs, profiles]);
  return { loaded, repository };
}

/** Saves through the repository, so every listener of the settings sees it at once. */
function useSaver(repository: NotificationSettingsRepository) {
  const [failed, setFailed] = useState(false);
  const save = useCallback(
    (change: NotificationSettingsChange) => {
      setFailed(false);
      return repository.set(change);
    },
    [repository],
  );
  const run = (action: () => Promise<void>) => {
    setFailed(false);
    action().catch(() => {
      setFailed(true);
    });
  };
  const apply = (change: NotificationSettingsChange) => {
    run(() => repository.set(change));
  };
  return { failed, save, apply, run };
}

/** Settings section "Powiadomienia": mode, types, hours and the consent of the browser. */
export function NotificationSettings() {
  const { loaded, repository } = useLoaded();
  const platform = usePlatform();
  const { notifier } = platform;
  const { failed, save, apply, run } = useSaver(repository);
  if (!loaded) return null;
  const { settings, paired, cyclePanel } = loaded;
  const times = {
    from: settings.quietHours.from,
    to: settings.quietHours.to,
    hint: settings.partnerHintTime,
  };
  return (
    <View style={{ gap: spacing.md, marginTop: spacing.md }}>
      <AppText style={{ fontWeight: "bold" }}>
        {t("notifications.settings.title")}
      </AppText>
      <LabelledSwitch
        label={t("notifications.settings.discreet.label")}
        hint={t("notifications.settings.discreet.hint")}
        value={settings.discreet}
        onChange={(discreet) => {
          apply({ discreet });
        }}
      />
      <NotificationTypeToggles
        enabled={settings.enabled}
        cyclePanel={cyclePanel}
        paired={paired}
        onChange={(id, value) => {
          // The wellbeing lives in the cycle settings: save it as the cycle panel does.
          if (id === "wellbeing") {
            run(() => wireCycle(platform).setWellbeingReminder(value));
          } else {
            apply({ enabled: { [id]: value } });
          }
        }}
      />
      <NotificationTimeFields times={times} paired={paired} onSave={save} />
      <NotificationPermission notifier={notifier} />
      {failed ? (
        <AlertText>{t("notifications.settings.failed")}</AlertText>
      ) : null}
    </View>
  );
}
