import type { ContentLibrary } from "@parapka/content";
import { generateHints, HINT_HISTORY_DAYS } from "@parapka/domain";

import type { ProfileRepository } from "../data/profile-repository";
import type { CycleService } from "./cycle-service";
import { buildHintInput, type HintInputDeps } from "./hint-input";
import { addDays, type HintRepository } from "./hint-repository";

export interface HintGenerator {
  /**
   * Computes and saves the hints of today and the next two days. Calls during
   * a run do not run in parallel: one more run follows the current one.
   */
  refresh(): Promise<void>;
  /** Refreshes after every change of the sources; returns the unsubscribe. */
  start(
    sources: {
      subscribe: (listener: () => void) => () => void;
    }[],
  ): () => void;
}

export interface HintGeneratorDeps extends HintInputDeps {
  profiles: Pick<ProfileRepository, "get">;
  hints: HintRepository;
  cycle: HintInputDeps["cycle"] & Pick<CycleService, "periods" | "today">;
  library: () => ContentLibrary | null;
}

/** Runs the task one at a time; calls during a run ask for one more run. */
function serialized(task: () => Promise<void>): () => Promise<void> {
  let running: Promise<void> | null = null;
  let again = false;
  const isAsked = () => again;
  return () => {
    if (running !== null) {
      again = true;
      return running;
    }
    running = (async () => {
      try {
        do {
          again = false;
          await task();
        } while (isAsked());
      } finally {
        running = null;
      }
    })();
    return running;
  };
}

export function createHintGenerator(deps: HintGeneratorDeps): HintGenerator {
  const { cycle, hints } = deps;
  const generate = async () => {
    const profile = await deps.profiles.get();
    if (profile?.cycle !== "yes") return;
    const library = deps.library();
    if (library === null || (await cycle.periods()).length === 0) return;
    const today = cycle.today();
    await hints.pruneBefore(addDays(today, -HINT_HISTORY_DAYS));
    const input = await buildHintInput(deps, {
      today,
      form: profile.form,
      library,
    });
    if (input === null) return;
    for (const hint of generateHints(input)) await hints.put(hint);
  };
  const refresh = serialized(generate);
  return {
    refresh,
    start: (sources) => {
      const run = () => {
        refresh().catch(() => undefined);
      };
      const stops = sources.map((source) => source.subscribe(run));
      run();
      return () => {
        for (const stop of stops) stop();
      };
    },
  };
}
