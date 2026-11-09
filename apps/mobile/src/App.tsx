import { useEffect, useState } from "react";
import { View } from "react-native";

import { createProfileRepository } from "./data/profile-repository";
import type { Profile } from "./data/profile";
import { t, type TranslationKey } from "./i18n";
import { LockGate } from "./lock/LockGate";
import { TabNavigator } from "./navigation/TabNavigator";
import { OnboardingFlow } from "./onboarding/OnboardingFlow";
import { PlatformProvider, type Platform } from "./platform/context";
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

type ProfileState = Profile | null | undefined | "failed";

/**
 * Onboarding until a profile is saved, then the tabs (FR-ONB-06: no pair
 * needed). The lock gate is mounted anew when the PIN decision changes, to load
 * the new PIN state; a PIN set in onboarding does not lock the app at once, it
 * locks after the app goes to the background and on the next start (FR-SEC-01).
 */
function Session({ platform }: { platform: Platform }) {
  const { database } = platform;
  const [profile, setProfile] = useState<ProfileState>();
  const [onboarded, setOnboarded] = useState(false);

  useEffect(() => {
    // The database opens lazily: a failed key or migration shows up here.
    createProfileRepository(database)
      .get()
      .then(setProfile, () => {
        setProfile("failed");
      });
  }, [database]);

  if (profile === undefined) return <Message text="app.loading" />;
  if (profile === "failed") return <Message text="app.error" />;
  return (
    <LockGate
      key={profile?.pinDecision ?? "none"}
      database={database}
      keyStore={platform.keyStore}
      sodium={platform.sodium}
      clock={platform.clock}
      startUnlocked={onboarded}
    >
      {profile === null ? (
        <OnboardingFlow
          onDone={(saved) => {
            setOnboarded(true);
            setProfile(saved);
          }}
        />
      ) : (
        <TabNavigator cycleEnabled={profile.cycle === "yes"} />
      )}
    </LockGate>
  );
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
      <Session platform={platform} />
    </PlatformProvider>
  );
}
