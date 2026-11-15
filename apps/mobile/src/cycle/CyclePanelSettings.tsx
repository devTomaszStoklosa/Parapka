import { useEffect, useState } from "react";
import { View } from "react-native";

import { useConsentWiring } from "../consent/wiring";
import type { CycleSettings } from "../data/cycle-settings";
import type { ProfileRepository } from "../data/profile-repository";
import { t } from "../i18n";
import { Button } from "../onboarding/controls";
import {
  cycleSettingsOf,
  initialDraft,
  type Draft,
} from "../onboarding/onboarding-state";
import { CycleSetupStep, DisclaimerStep } from "../onboarding/steps";
import { usePlatform } from "../platform/context";
import { AlertText } from "../ui/AlertText";
import { AppText } from "../ui/AppText";
import { spacing } from "../ui/theme";
import { createCyclePanel, type CyclePanel } from "./cycle-panel";

type Mode = "idle" | "enabling" | "confirming";

/** Whether the panel is on, from the profile; null until it is read. */
function useCycleEnabled(profiles: ProfileRepository) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    const load = () => {
      void profiles.get().then((profile) => {
        setEnabled(profile?.cycle === "yes");
      });
    };
    load();
    return profiles.subscribe(load);
  }, [profiles]);
  return enabled;
}

/** The message and the setup of FR-ONB-03; nothing goes on before "Rozumiem". */
function EnableForm(props: {
  today: string;
  onSave: (settings: CycleSettings) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Draft>({
    ...initialDraft,
    today: props.today,
  });
  const settings = cycleSettingsOf(draft);
  const patch = (change: Partial<Draft>) => {
    setDraft({ ...draft, ...change });
  };
  return (
    <>
      <DisclaimerStep draft={draft} patch={patch} />
      {draft.disclaimerConfirmed ? (
        <CycleSetupStep draft={draft} patch={patch} valid={settings !== null} />
      ) : null}
      <Button
        primary
        label={t("cycle.panel.save")}
        disabled={!draft.disclaimerConfirmed || settings === null}
        onPress={() => {
          if (settings) props.onSave(settings);
        }}
      />
      <Button label={t("cycle.panel.cancel")} onPress={props.onCancel} />
    </>
  );
}

function ConfirmDisable(props: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <AppText>{t("cycle.panel.confirm")}</AppText>
      <Button
        primary
        label={t("cycle.panel.confirmDisable")}
        onPress={props.onConfirm}
      />
      <Button label={t("cycle.panel.cancel")} onPress={props.onCancel} />
    </>
  );
}

/** Runs a panel action; a rejected promise shows the failure, a success goes back to the button. */
function usePanelAction(onDone: () => void) {
  const platform = usePlatform();
  const { consent, profiles } = useConsentWiring(platform);
  const [failed, setFailed] = useState(false);
  const run = (action: (panel: CyclePanel) => Promise<void>) => {
    setFailed(false);
    action(createCyclePanel({ database: platform.database, profiles, consent }))
      .then(onDone)
      .catch(() => {
        setFailed(true);
      });
  };
  return { failed, setFailed, run };
}

/** Settings section "Panel cyklu": turn the panel on later or off (FR-ONB-03, FR-CYC-13). */
export function CyclePanelSettings() {
  const platform = usePlatform();
  const enabled = useCycleEnabled(useConsentWiring(platform).profiles);
  const [mode, setMode] = useState<Mode>("idle");
  const idle = () => {
    setMode("idle");
  };
  const { failed, setFailed, run } = usePanelAction(idle);
  if (enabled === null) return null;
  return (
    <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
      <AppText style={{ fontWeight: "bold" }}>{t("cycle.panel.title")}</AppText>
      {mode === "enabling" ? (
        <EnableForm
          today={new Date(platform.clock.nowMs()).toLocaleDateString("sv-SE")}
          onSave={(settings) => {
            run((panel) => panel.enable(settings));
          }}
          onCancel={idle}
        />
      ) : mode === "confirming" ? (
        <ConfirmDisable
          onConfirm={() => {
            run((panel) => panel.disable());
          }}
          onCancel={idle}
        />
      ) : (
        <Button
          label={t(enabled ? "cycle.panel.disable" : "cycle.panel.enable")}
          onPress={() => {
            setFailed(false);
            setMode(enabled ? "confirming" : "enabling");
          }}
        />
      )}
      {failed ? <AlertText>{t("cycle.panel.failed")}</AlertText> : null}
    </View>
  );
}
