import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState, View } from "react-native";
import type { Sodium } from "@parapka/crypto";
import type { Clock } from "@parapka/domain";

import { changeChannel } from "../data/change-listeners";
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
  /** Starts unlocked, e.g. right after the PIN was set in onboarding. */
  startUnlocked?: boolean;
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
        const initial = initialLockState(settings.timeout);
        setLock(props.startUnlocked ? unlock(initial) : initial);
      },
    );
  }, [store]);

  const hadPin = useRef(hasPin);
  useEffect(() => {
    hadPin.current = hasPin;
  }, [hasPin]);

  // A PIN or timeout set during the session applies at once. A PIN that
  // appears now was just given by the person, so the screen stays unlocked
  // until the next trip to the background.
  useEffect(() => {
    let current = true;
    const refresh = () => {
      void Promise.all([store.hasPin(), store.loadSettings()]).then(
        ([pinSet, settings]) => {
          if (!current) return;
          const appeared = pinSet && !hadPin.current;
          setHasPin(pinSet);
          setLock((state) => {
            if (state === null) return state;
            const next = { ...state, timeout: settings.timeout };
            return appeared ? unlock(next) : next;
          });
        },
      );
    };
    const stop = changeChannel(props.database, "lock").subscribe(refresh);
    return () => {
      current = false;
      stop();
    };
  }, [store, props.database]);

  useEffect(() => {
    setLock((current) => {
      if (current === null) return current;
      return active
        ? onForeground(current, clock)
        : onBackground(current, clock);
    });
  }, [active, clock]);

  // Derived in the render, so that coming back after the time set for the lock
  // never renders the content once before the effect above locks it.
  const effective = lock !== null && active ? onForeground(lock, clock) : lock;

  return { lock: effective, setLock, hasPin, setHasPin };
}


interface OverlayProps {
  lock: LockState | null;
  hasPin: boolean;
  active: boolean;
  resetting: boolean;
  store: PinStore;
  database: LocalDatabase;
  keyStore: KeyStore;
  clock: Clock;
  setLock: (lock: LockState) => void;
  setHasPin: (hasPin: boolean) => void;
  setResetting: (resetting: boolean) => void;
}

/** What covers the content: the veil, the PIN screen or the reset screen. */
function Overlay(props: OverlayProps) {
  const { lock, hasPin, active, store } = props;
  if (lock === null) return <Veil />;
  if (!hasPin) return null;
  if (!lock.locked) return active ? null : <Veil />;
  if (props.resetting) {
    return (
      <ResetScreen
        onReset={() =>
          resetApp({ database: props.database, keyStore: props.keyStore })
        }
        onCancel={() => {
          props.setResetting(false);
        }}
        onDone={() => {
          props.setResetting(false);
          props.setHasPin(false);
        }}
      />
    );
  }
  return (
    <>
      <PinScreen
        mode="unlock"
        clock={props.clock}
        onAttempt={(pin) => store.attempt(pin)}
        onDone={() => {
          props.setLock(unlock(lock));
        }}
        onForgot={() => {
          props.setResetting(true);
        }}
      />
      {active ? null : <Veil />}
    </>
  );
}

/**
 * Shows the content only after the PIN was given. When the app is not active a
 * veil covers it; after the time set for the lock the PIN screen replaces it
 * before any content is rendered (FR-SEC-01, FR-SEC-02). Once shown, the
 * content stays mounted under the lock, hidden, so that it keeps its state.
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

  const shown = useRef(false);
  const locked = lock !== null && hasPin && lock.locked;
  if (lock !== null && !locked) shown.current = true;

  return (
    <>
      {shown.current ? (
        <View
          testID="lock-content"
          style={locked ? { display: "none" } : { flex: 1 }}
          aria-hidden={locked}
          importantForAccessibility={locked ? "no-hide-descendants" : "auto"}
        >
          {children}
        </View>
      ) : null}
      <Overlay
        {...{ lock, hasPin, active, resetting, store, setLock, setHasPin }}
        {...{ database, keyStore, clock, setResetting }}
      />
    </>
  );
}
