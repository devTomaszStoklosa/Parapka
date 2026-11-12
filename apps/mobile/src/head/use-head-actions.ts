import { useMemo, useState } from "react";

import type { Platform } from "../platform/context";
import { wireHead } from "./wiring";

/** What the buttons of a row do; each one gets the id of the item. */
export interface HeadActions {
  readonly onTakeOver: (itemId: string) => void;
  readonly onDone: (itemId: string) => void;
}

/** The row buttons call the services; a rejection only sets `failed`. */
export function useHeadActions(platform: Platform) {
  const { head, items } = useMemo(() => wireHead(platform), [platform]);
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
  const actions: HeadActions = {
    onTakeOver: (itemId) => {
      attempt(head.takeOver(itemId));
    },
    onDone: (itemId) => {
      attempt(items.complete(itemId));
    },
  };
  return { actions, failed };
}
