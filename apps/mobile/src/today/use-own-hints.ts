import { useEffect, useMemo, useState } from "react";
import { HINT_HISTORY_DAYS } from "@parapka/domain";

import { wireConsent } from "../consent/wiring";
import { addDays, type StoredHint } from "../cycle/hint-repository";
import { wireCycle, wireCycleHints } from "../cycle/wiring";
import type { Platform } from "../platform/context";
import { createPauseRepository } from "../sync/pause-repository";
import { wireChores } from "../sync/wiring";

/** Whether the partner gets the hints (FR-ONB-06, FR-PAIR-06). */
export type Sharing = "noPair" | "noConsent" | "paused" | "shared";

export interface OwnHintsData {
  readonly sharing: Sharing;
  /** The hint for today; null when there is none (a skipped one counts as none). */
  readonly today: StoredHint | null;
  readonly tomorrow: StoredHint | null;
  readonly dayAfter: StoredHint | null;
  /** The hints of the last 14 days before today, the newest first. */
  readonly history: readonly StoredHint[];
  /** Whether a start of a period is saved; without it there are no hints. */
  readonly hasPeriod: boolean;
}

/** The data of the card: null while loading, "failed" when it did not load. */
export type OwnHintsState = OwnHintsData | "failed" | null;

type Sources = {
  hints: ReturnType<typeof wireCycleHints>["hints"];
  cycle: ReturnType<typeof wireCycle>;
  pairs: ReturnType<typeof wireChores>["pairs"];
  consent: ReturnType<typeof wireConsent>["consent"];
  pause: ReturnType<typeof createPauseRepository>;
};

const scheduled = (hints: readonly StoredHint[]) =>
  hints.filter((hint) => hint.status === "scheduled");

async function sharingOf({ pairs, consent, pause }: Sources) {
  const [pair, shared, paused] = await Promise.all([
    pairs.activePair(),
    consent.isShared("CYCLE_HINTS"),
    pause.isPaused(),
  ]);
  const sharing: Sharing =
    pair === null
      ? "noPair"
      : !shared
        ? "noConsent"
        : paused
          ? "paused"
          : "shared";
  return sharing;
}

async function read(sources: Sources): Promise<OwnHintsData> {
  const { hints, cycle } = sources;
  const day = cycle.today();
  const [sharing, all, forecast] = await Promise.all([
    sharingOf(sources),
    hints.range(addDays(day, -HINT_HISTORY_DAYS), addDays(day, 2)),
    cycle.forecast(day),
  ]);
  const shown = scheduled(all);
  return {
    sharing,
    today: shown.find((hint) => hint.forDate === day) ?? null,
    tomorrow: shown.find((hint) => hint.forDate === addDays(day, 1)) ?? null,
    dayAfter: shown.find((hint) => hint.forDate === addDays(day, 2)) ?? null,
    history: shown.filter((hint) => hint.forDate < day).reverse(),
    hasPeriod: forecast !== null,
  };
}

/**
 * The own hints as the partner gets them (FR-CYC-06), loaded again after
 * every change of the hints, the pair, the consent, the pause and the cycle.
 */
export function useOwnHints(platform: Platform): OwnHintsState {
  const sources = useMemo<Sources>(
    () => ({
      hints: wireCycleHints(platform).hints,
      cycle: wireCycle(platform),
      pairs: wireChores(platform).pairs,
      consent: wireConsent(platform).consent,
      pause: createPauseRepository(platform.database),
    }),
    [platform],
  );
  const [state, setState] = useState<OwnHintsState>(null);
  useEffect(() => {
    let active = true;
    let latest = 0;
    const load = () => {
      latest += 1;
      const issued = latest;
      const settle = (next: OwnHintsState) => {
        if (active && issued === latest) setState(next);
      };
      read(sources)
        .then(settle)
        .catch(() => {
          settle("failed");
        });
    };
    load();
    const stops = [
      sources.hints.subscribe(load),
      sources.cycle.subscribe(load),
      sources.pairs.subscribe(load),
      sources.consent.onChange(load),
      sources.pause.subscribe(load),
    ];
    return () => {
      active = false;
      for (const stop of stops) stop();
    };
  }, [sources]);
  return state;
}
