import { useEffect } from "react";
import { AppState } from "react-native";

import { usePlatform } from "../platform/context";
import { wireSync } from "./wiring";

/**
 * No UI: keeps the synchronization of the platform running while it is
 * mounted, that is while the screen is unlocked, and the app is active.
 */
export function SyncRunner() {
  const platform = usePlatform();
  useEffect(() => {
    const controller = wireSync(platform);
    controller.setActive(AppState.currentState === "active");
    controller.mount();
    const subscription = AppState.addEventListener("change", (state) => {
      controller.setActive(state === "active");
    });
    return () => {
      subscription.remove();
      controller.unmount();
    };
  }, [platform]);
  return null;
}
