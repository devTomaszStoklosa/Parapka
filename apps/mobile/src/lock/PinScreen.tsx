import { useEffect, useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import type { Clock } from "@parapka/domain";

import { t, type TranslationKey } from "../i18n";
import { AppText } from "../ui/AppText";
import { colors, fontSizes, MIN_TOUCH_TARGET, spacing } from "../ui/theme";
import type { AttemptResult } from "./pin-store";

const PIN_LENGTH = 6;

type AttemptFn = (pin: string) => Promise<AttemptResult>;

type Step = "current" | "new" | "confirm";

export type PinScreenProps = {
  clock: Clock;
  onDone: () => void;
  onForgot?: () => void;
} & (
  | { mode: "unlock"; onAttempt: (pin: string) => Promise<AttemptResult> }
  | {
      mode: "set";
      onSetPin: (pin: string) => Promise<void>;
    }
  | {
      mode: "change";
      onAttempt: (pin: string) => Promise<AttemptResult>;
      onSetPin: (pin: string) => Promise<void>;
    }
);

const TITLES: Record<
  "unlock" | "set" | "change",
  Record<Step, TranslationKey>
> = {
  unlock: {
    current: "lock.pin.unlockTitle",
    new: "lock.pin.unlockTitle",
    confirm: "lock.pin.unlockTitle",
  },
  set: {
    current: "lock.pin.setTitle",
    new: "lock.pin.setTitle",
    confirm: "lock.pin.confirmTitle",
  },
  change: {
    current: "lock.pin.currentTitle",
    new: "lock.pin.newTitle",
    confirm: "lock.pin.confirmTitle",
  },
};

/** Six single-digit fields; calls `onComplete` when the last digit is typed. */
function PinFields({
  disabled,
  onComplete,
}: {
  disabled: boolean;
  onComplete: (pin: string) => void;
}) {
  const [digits, setDigits] = useState<string[]>(
    Array.from({ length: PIN_LENGTH }, () => ""),
  );
  const inputs = useRef<({ focus: () => void } | null)[]>([]);

  const change = (index: number, text: string) => {
    const digit = text.replace(/\D/g, "").slice(-1);
    const next = digits.map((d, i) => (i === index ? digit : d));
    setDigits(next);
    if (digit && index < PIN_LENGTH - 1) inputs.current[index + 1]?.focus();
    if (next.every((d) => d !== "")) onComplete(next.join(""));
  };

  return (
    <View style={{ flexDirection: "row", gap: spacing.sm }}>
      {digits.map((digit, index) => (
        <TextInput
          key={index}
          ref={(node) => {
            inputs.current[index] = node;
          }}
          accessibilityLabel={t("lock.pin.digit", { position: index + 1 })}
          value={digit}
          editable={!disabled}
          secureTextEntry
          keyboardType="number-pad"
          maxLength={1}
          onChangeText={(text) => {
            change(index, text);
          }}
          style={{
            width: MIN_TOUCH_TARGET,
            height: MIN_TOUCH_TARGET,
            borderWidth: 1,
            borderColor: colors.border,
            textAlign: "center",
            fontSize: fontSizes.title,
            color: colors.text,
          }}
        />
      ))}
    </View>
  );
}

function useSecondsLeft(clock: Clock, untilMs: number): number {
  const [now, setNow] = useState(clock.nowMs());
  useEffect(() => {
    if (untilMs <= clock.nowMs()) return undefined;
    setNow(clock.nowMs());
    const timer = setInterval(() => {
      setNow(clock.nowMs());
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [clock, untilMs]);
  return Math.max(0, Math.ceil((untilMs - now) / 1000));
}

function usePinFlow(props: PinScreenProps) {
  const { mode, clock, onDone } = props;
  const [step, setStep] = useState<Step>(mode === "set" ? "new" : "current");
  const [first, setFirst] = useState("");
  const [round, setRound] = useState(0);
  const [message, setMessage] = useState<TranslationKey | null>(null);
  const [blockedUntilMs, setBlockedUntilMs] = useState(0);

  const retry = (key: TranslationKey | null) => {
    setMessage(key);
    setRound((r) => r + 1);
  };

  const checkCurrent = async (pin: string, attempt: AttemptFn) => {
    const result = await attempt(pin);
    if (result.status === "ok") {
      if (mode === "unlock") onDone();
      else setStep("new");
      retry(null);
      return;
    }
    setBlockedUntilMs(clock.nowMs() + result.delayMs);
    retry(result.status === "wrong" ? "lock.pin.wrong" : null);
  };

  const submit = async (pin: string) => {
    if (step === "current" && "onAttempt" in props) {
      await checkCurrent(pin, props.onAttempt);
    } else if (step === "new") {
      setFirst(pin);
      setStep("confirm");
      retry(null);
    } else if ("onSetPin" in props && pin === first) {
      await props.onSetPin(pin);
      onDone();
    } else {
      setStep("new");
      retry("lock.pin.mismatch");
    }
  };

  return { step, round, message, blockedUntilMs, submit };
}

/** PIN entry; setting and changing a PIN ask for it twice. */
export function PinScreen(props: PinScreenProps) {
  const { mode, clock, onForgot } = props;
  const { step, round, message, blockedUntilMs, submit } = usePinFlow(props);
  const seconds = useSecondsLeft(clock, blockedUntilMs);

  return (
    <View
      style={{ padding: spacing.lg, gap: spacing.md, alignItems: "center" }}
    >
      <AppText variant="title" accessibilityRole="header">
        {t(TITLES[mode][step])}
      </AppText>
      <PinFields
        key={round}
        disabled={seconds > 0}
        onComplete={(pin) => void submit(pin)}
      />
      {message ? (
        <AppText accessibilityRole="alert">{t(message)}</AppText>
      ) : null}
      {seconds > 0 ? (
        <AppText accessibilityRole="alert">
          {t("lock.pin.delay", { seconds })}
        </AppText>
      ) : null}
      {mode === "unlock" && onForgot ? (
        <Pressable
          accessibilityRole="button"
          onPress={onForgot}
          style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: "center" }}
        >
          <AppText style={{ color: colors.accent }}>
            {t("lock.pin.forgot")}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}
