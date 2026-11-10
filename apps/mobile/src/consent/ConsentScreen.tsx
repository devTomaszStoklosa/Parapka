import { useEffect, useState } from "react";
import { ScrollView } from "react-native";

import type { ProfileRepository } from "../data/profile-repository";
import { t } from "../i18n";
import { Button } from "../onboarding/controls";
import { AppText } from "../ui/AppText";
import { colors, spacing } from "../ui/theme";
import {
  defaultConsent,
  NO_PROFILE,
  visibleCategories,
  type ConsentProfile,
} from "./consent-model";
import type { ConsentRepository } from "./consent-repository";
import { ConsentToggles } from "./ConsentToggles";

function ConsentForm({
  profile,
  consent,
  onSaved,
}: {
  profile: ConsentProfile;
  consent: Pick<ConsentRepository, "save">;
  onSaved: () => void;
}) {
  const [states, setStates] = useState(() => defaultConsent(profile));
  const [failed, setFailed] = useState(false);
  const save = () => {
    setFailed(false);
    consent.save(states).then(onSaved, () => {
      setFailed(true);
    });
  };
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
    >
      <AppText variant="title" accessibilityRole="header">
        {t("consent.title")}
      </AppText>
      <AppText>{t("consent.intro")}</AppText>
      <AppText>{t("consent.always")}</AppText>
      <ConsentToggles
        categories={visibleCategories(profile)}
        states={states}
        onChange={(category, enabled) => {
          setStates((previous) => ({ ...previous, [category]: enabled }));
        }}
      />
      <AppText>{t("consent.deletion")}</AppText>
      <AppText>{t("consent.changeLater")}</AppText>
      {failed && (
        <AppText accessibilityRole="alert">{t("consent.saveFailed")}</AppText>
      )}
      <Button primary label={t("consent.save")} onPress={save} />
    </ScrollView>
  );
}

/** Shown to each person after the pair is confirmed, before the first synchronization. */
export function ConsentScreen({
  consent,
  profiles,
  onSaved,
}: {
  consent: Pick<ConsentRepository, "save">;
  profiles: Pick<ProfileRepository, "get">;
  onSaved: () => void;
}) {
  const [profile, setProfile] = useState<ConsentProfile | "loading" | "failed">(
    "loading",
  );
  useEffect(() => {
    let active = true;
    profiles.get().then(
      (saved) => {
        if (active) setProfile(saved ?? NO_PROFILE);
      },
      () => {
        if (active) setProfile("failed");
      },
    );
    return () => {
      active = false;
    };
  }, [profiles]);

  if (profile === "loading") return null;
  if (profile === "failed") {
    return (
      <AppText accessibilityRole="alert">{t("consent.saveFailed")}</AppText>
    );
  }
  return <ConsentForm profile={profile} consent={consent} onSaved={onSaved} />;
}
