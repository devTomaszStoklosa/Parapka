import { useEffect } from "react";
import { AppState } from "react-native";

import { usePlatform } from "../platform/context";
import { createActivityLog } from "./activity-log";

/**
 * No UI: writes the day of the opening to the local activity log when it is
 * mounted, that is after the unlock, and when the app comes back to the front.
 * A failed write is dropped: the log only feeds the research report.
 */
export function ActivityRecorder() {
  const { database, clock } = usePlatform();
  useEffect(() => {
    const log = createActivityLog(database);
    const record = () => {
      log.recordOpen(clock.nowMs()).catch(() => undefined);
    };
    record();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") record();
    });
    return () => {
      subscription.remove();
    };
  }, [database, clock]);
  return null;
}
