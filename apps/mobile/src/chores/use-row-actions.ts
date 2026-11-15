import { useMemo, useState } from "react";

import { usePlatform } from "../platform/context";
import { wireChores } from "../sync/wiring";
import type { RowActions } from "./PlannerActions";

/** The row buttons call the repositories; a rejection only sets `failed`. */
export function useRowActions() {
  const platform = usePlatform();
  const { chores, completions } = useMemo(
    () => wireChores(platform),
    [platform],
  );
  const [failed, setFailed] = useState(false);
  // The list reloads by itself through the subscriptions.
  const attempt = (action: Promise<void>) => {
    action.then(
      () => {
        setFailed(false);
      },
      () => {
        setFailed(true);
      },
    );
  };
  const actions: RowActions = {
    onDone: (row) => {
      attempt(completions.complete(row.choreId, row.date));
    },
    onUndo: (row) => {
      attempt(completions.undo(row.choreId, row.date));
    },
    onRelease: (row) => {
      attempt(chores.release(row.choreId));
    },
  };
  return { actions, failed };
}
