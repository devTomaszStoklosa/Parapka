import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AppState, View } from "react-native";
import type { Sodium } from "@parapka/crypto";
import type { Clock } from "@parapka/domain";

import type { LocalDatabase } from "../data/local-database";
import { t } from "../i18n";
import type { KeyStore } from "../platform/key-store";
import { AppText } from "../ui/AppText";
import { colors, spacing } from "../ui/theme";
import {
  initialLockState,
  onBackground,
  onForeground,
  unlock,
  type LockState,
} from "./lock-state";
import { PinScreen } from "./PinScreen";
import { createPinStore, type PinStore } from "./pin-store";
import { resetApp } from "./reset";
import { ResetScreen } from "./ResetScreen";

export interface LockGateProps {
  database: LocalDatabase;
  keyStore: KeyStore;
  sodium: Sodium;
  clock: Clock;
  children: ReactNode;
}

/** Covers content that is not shown: the app is in the background (FR-SEC-02). */
function Veil() {
  return (
    <View
      testID="lock-veil"
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        backgroundColor: colors.background,
        alignItems: "center",
        justifyContent: "center",
        padding: spacing.lg,
      }}
    >
      <AppText variant="title">{t("home.title")}</AppText>
    </View>
  );
}

function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      setActive(state === "active");
    });
    return () => {
      subscription.remove();
    };
  }, []);
  return active;
}

function useLock(props: LockGateProps, store: PinStore, active: boolean) {
  const { clock } = props;
  const [lock, setLock] = useState<LockState | null>(null);
  const [hasPin, setHasPin] = useState(true);

  useEffect(() => {
    void Promise.all([store.hasPin(), store.loadSettings()]).then(
      ([pinSet, settings]) => {
        setHasPin(pinSet);
        setLock(initialLockState(settings.timeout));
      },
    );
  }, [store]);

  useEffect(() => {
    setLock((current) => {
      if (current === null) return current;
      return active
        ? onForeground(current, clock)
        : onBackground(current, clock);
    });
  }, [active, clock]);

  return { lock, setLock, hasPin, setHasPin };
}

/**
 * Shows the content only after the PIN was given. When the app is not active a
 * veil covers it; after the time set for the lock the PIN screen replaces it
 * before any content is rendered (FR-SEC-01, FR-SEC-02).
 */
export function LockGate(props: LockGateProps) {
  const { database, keyStore, sodium, clock, children } = props;
  const store = useMemo(
    () => createPinStore({ database, sodium, clock }),
    [database, sodium, clock],
  );
  const active = useAppActive();
  const { lock, setLock, hasPin, setHasPin } = useLock(props, store, active);
  const [resetting, setResetting] = useState(false);

  if (lock === null) return <Veil />;
  if (!hasPin) return <>{children}</>;
  if (!lock.locked) {
    return (
      <>
        {children}
        {active ? null : <Veil />}
      </>
    );
  }
  if (resetting) {
    return (
      <ResetScreen
        onReset={() => resetApp({ database, keyStore })}
        onCancel={() => {
          setResetting(false);
        }}
        onDone={() => {
          setResetting(false);
          setHasPin(false);
        }}
      />
    );
  }
  return (
    <>
      <PinScreen
        mode="unlock"
        clock={clock}
        onAttempt={(pin) => store.attempt(pin)}
        onDone={() => {
          setLock(unlock(lock));
        }}
        onForgot={() => {
          setResetting(true);
        }}
      />
      {active ? null : <Veil />}
    </>
  );
}
