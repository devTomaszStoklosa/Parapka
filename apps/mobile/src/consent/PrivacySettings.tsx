import { useEffect, useState } from "react";
import { View } from "react-native";

import type { ProfileRepository } from "../data/profile-repository";
import { t } from "../i18n";
import { AppText } from "../ui/AppText";
import { spacing } from "../ui/theme";
import {
  NO_PROFILE,
  visibleCategories,
  type ConsentCategory,
  type ConsentProfile,
  type ConsentStates,
} from "./consent-model";
import type { ConsentRepository } from "./consent-repository";
import { ConsentToggles } from "./ConsentToggles";

type Loaded =
  | { kind: "loading" }
  | { kind: "none" }
  | { kind: "failed" }
  | { kind: "ready"; profile: ConsentProfile; states: ConsentStates };

async function load(
  consent: Pick<ConsentRepository, "current">,
  profiles: Pick<ProfileRepository, "get">,
): Promise<Loaded> {
  try {
    const [record, profile] = await Promise.all([
      consent.current(),
      profiles.get(),
    ]);
    if (!record) return { kind: "none" };
    return {
      kind: "ready",
      states: record.states,
      profile: profile ?? NO_PROFILE,
    };
  } catch {
    return { kind: "failed" };
  }
}

function usePrivacy(
  consent: Pick<ConsentRepository, "current" | "setCategory">,
  profiles: Pick<ProfileRepository, "get">,
) {
  const [view, setView] = useState<Loaded>({ kind: "loading" });
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    const show = (next: Loaded) => {
      if (active) setView(next);
    };
    void load(consent, profiles).then(show);
    return () => {
      active = false;
    };
  }, [consent, profiles]);

  const change = (category: ConsentCategory, enabled: boolean) => {
    setFailed(false);
    consent.setCategory(category, enabled).then(
      () => {
        setView((previous) =>
          previous.kind === "ready"
            ? {
                ...previous,
                states: { ...previous.states, [category]: enabled },
              }
            : previous,
        );
      },
      () => {
        setFailed(true);
      },
    );
  };
  return { view, failed, change };
}

/** Settings → Privacy: the same switches as the consent screen, changeable at any time (FR-PAIR-05). */
export function PrivacySettings({
  consent,
  profiles,
}: {
  consent: Pick<ConsentRepository, "current" | "setCategory">;
  profiles: Pick<ProfileRepository, "get">;
}) {
  const { view, failed, change } = usePrivacy(consent, profiles);

  return (
    <View style={{ gap: spacing.sm }}>
      <AppText style={{ fontWeight: "bold", marginTop: spacing.md }}>
        {t("consent.settings.title")}
      </AppText>
      {view.kind === "none" && <AppText>{t("consent.settings.none")}</AppText>}
      {view.kind === "ready" && (
        <>
          <AppText>{t("consent.always")}</AppText>
          <ConsentToggles
            categories={visibleCategories(view.profile)}
            states={view.states}
            onChange={change}
          />
          <AppText>{t("consent.deletion")}</AppText>
        </>
      )}
      {(failed || view.kind === "failed") && (
        <AppText accessibilityRole="alert">{t("consent.saveFailed")}</AppText>
      )}
    </View>
  );
}
