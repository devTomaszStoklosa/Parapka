import { useEffect, useState } from "react";
import { View } from "react-native";

import { createProfileRepository } from "./data/profile-repository";
import type { Profile } from "./data/profile";
import { t, type TranslationKey } from "./i18n";
import { LockGate } from "./lock/LockGate";
import { TabNavigator } from "./navigation/TabNavigator";
import { OnboardingFlow } from "./onboarding/OnboardingFlow";
import {
  PlatformProvider,
  usePlatform,
  type Platform,
} from "./platform/context";
import { createWebPlatform } from "./platform/web";
import { AppText } from "./ui/AppText";
import { colors, spacing } from "./ui/theme";

function Message({ text }: { text: TranslationKey }) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: spacing.lg,
        backgroundColor: colors.background,
      }}
    >
      <AppText accessibilityRole="alert">{t(text)}</AppText>
    </View>
  );
}

/** Onboarding until a profile is saved, then the tabs (FR-ONB-06: no pair needed). */
function Root() {
  const { database } = usePlatform();
  const [profile, setProfile] = useState<Profile | null | undefined>();

  useEffect(() => {
    void createProfileRepository(database).get().then(setProfile);
  }, [database]);

  if (profile === undefined) return <Message text="app.loading" />;
  if (profile === null) return <OnboardingFlow onDone={setProfile} />;
  return <TabNavigator cycleEnabled={profile.cycle === "yes"} />;
}

function usePlatformLoader(create: () => Promise<Platform>) {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    create().then(setPlatform, () => {
      setFailed(true);
    });
  }, [create]);
  return { platform, failed };
}

/**
 * The root: creates the platform and opens the database, then shows the lock
 * (when a PIN is set) around onboarding or the tabs. `createPlatform` is
 * replaced in tests.
 */
export function App({
  createPlatform = createWebPlatform,
}: {
  createPlatform?: () => Promise<Platform>;
}) {
  const { platform, failed } = usePlatformLoader(createPlatform);
  if (failed) return <Message text="app.error" />;
  if (!platform) return <Message text="app.loading" />;
  return (
    <PlatformProvider platform={platform}>
      <LockGate
        database={platform.database}
        keyStore={platform.keyStore}
        sodium={platform.sodium}
        clock={platform.clock}
      >
        <Root />
      </LockGate>
    </PlatformProvider>
  );
}
