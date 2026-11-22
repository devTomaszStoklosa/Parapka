import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import type { Clock } from "@parapka/domain";

import { changeChannel } from "../data/change-listeners";
import { t, type TranslationKey } from "../i18n";
import { Button, Option } from "../onboarding/controls";
import { usePlatform } from "../platform/context";
import { AppText } from "../ui/AppText";
import { spacing } from "../ui/theme";
import type { LockTimeout } from "./lock-state";
import { PinScreen } from "./PinScreen";
import { createPinStore, type PinStore } from "./pin-store";

const TIMEOUTS: readonly {
  value: LockTimeout;
  label: TranslationKey;
}[] = [
  {
    value: "immediately",
    label: "lock.settings.immediately",
  },
  {
    value: "oneMinute",
    label: "lock.settings.oneMinute",
  },
  {
    value: "fiveMinutes",
    label: "lock.settings.fiveMinutes",
  },
];

interface Loaded {
  readonly hasPin: boolean;
  readonly timeout: LockTimeout;
}

/** The PIN and the timeout, reloaded after every change of them. */
function useLoaded() {
  const { database, sodium, clock } = usePlatform();
  const store = useMemo(
    () => createPinStore({ database, sodium, clock }),
    [database, sodium, clock],
  );
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  useEffect(() => {
    let active = true;
    const load = () => {
      void Promise.all([store.hasPin(), store.loadSettings()]).then(
        ([hasPin, settings]) => {
          if (active) setLoaded({ hasPin, timeout: settings.timeout });
        },
      );
    };
    load();
    const stop = changeChannel(database, "lock").subscribe(load);
    return () => {
      active = false;
      stop();
    };
  }, [store, database]);
  return { store, clock, loaded };
}

function PinEditor(props: {
  store: PinStore;
  clock: Clock;
  hasPin: boolean;
  onDone: () => void;
}) {
  const { store, clock, hasPin, onDone } = props;
  const onSetPin = (pin: string) => store.setPin(pin);
  return (
    <View style={{ gap: spacing.sm }}>
      {hasPin ? (
        <PinScreen
          mode="change"
          clock={clock}
          onAttempt={(pin) => store.attempt(pin)}
          onSetPin={onSetPin}
          onDone={onDone}
        />
      ) : (
        <PinScreen
          mode="set"
          clock={clock}
          onSetPin={onSetPin}
          onDone={onDone}
        />
      )}
      <Button label={t("lock.settings.cancel")} onPress={onDone} />
    </View>
  );
}

/** Sets or changes the PIN and picks when the app locks (FR-SEC-01, FR-ONB-04). */
export function LockSettings() {
  const { store, clock, loaded } = useLoaded();
  const [editing, setEditing] = useState(false);
  if (!loaded) return null;
  const finish = () => {
    setEditing(false);
  };
  return (
    <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
      <AppText style={{ fontWeight: "bold" }}>
        {t("lock.settings.title")}
      </AppText>
      {editing ? (
        <PinEditor
          store={store}
          clock={clock}
          hasPin={loaded.hasPin}
          onDone={finish}
        />
      ) : (
        <Button
          label={t(
            loaded.hasPin ? "lock.settings.change" : "lock.settings.set",
          )}
          onPress={() => {
            setEditing(true);
          }}
        />
      )}
      {loaded.hasPin ? (
        <View
          role="radiogroup"
          accessibilityLabel={t("lock.settings.timeoutGroup")}
          style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}
        >
          {TIMEOUTS.map((option) => (
            <Option
              key={option.value}
              label={t(option.label)}
              selected={loaded.timeout === option.value}
              onPress={() => {
                void store.setTimeout(option.value);
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
