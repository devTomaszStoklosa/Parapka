import { createUuid7Generator } from "@parapka/domain";
import { useCallback, useMemo, useState } from "react";

import { t, type TranslationKey } from "../i18n";
import type { Platform } from "../platform/context";
import { PeriodValidationError, type PeriodLog } from "./period-validation";
import type { WellbeingEntry } from "./wellbeing-validation";
import { wireCycle } from "./wiring";

/** What to tell about a failure: the reason of a validation, or a general text. */
function errorText(error: unknown): string {
  const reason =
    error instanceof PeriodValidationError && error.reason !== "date"
      ? error.reason
      : "generic";
  return t(`cycle.period.error.${reason}` as TranslationKey);
}

/**
 * The actions of the cycle screen. The screen refreshes itself, because the
 * service informs `useCycle` about every change.
 */
export function useCycleActions(platform: Platform) {
  const service = useMemo(() => wireCycle(platform), [platform]);
  const newId = useMemo(
    () =>
      createUuid7Generator({
        clock: platform.clock,
        random: { bytes: (length) => platform.sodium.randomBytes(length) },
      }),
    [platform],
  );
  const [error, setError] = useState<string | null>(null);
  /** Runs the action; true when it succeeded, otherwise sets the error. */
  const attempt = useCallback(async (action: () => Promise<void>) => {
    try {
      await action();
      setError(null);
      return true;
    } catch (failure) {
      setError(errorText(failure));
      return false;
    }
  }, []);
  return {
    error,
    newId,
    savePeriod: (period: PeriodLog) =>
      attempt(() => service.savePeriod(period)),
    deletePeriod: (id: string) => attempt(() => service.deletePeriod(id)),
    saveWellbeing: (entry: WellbeingEntry) =>
      attempt(() => service.saveWellbeing(entry)),
    setReminder: (enabled: boolean) =>
      attempt(() => service.setWellbeingReminder(enabled)),
  };
}
