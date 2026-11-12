import { render } from "@testing-library/react";

import { PlatformProvider, type Platform } from "../platform/context";
import { HeadScreen } from "./HeadScreen";
import { wireHead } from "./wiring";

export {
  NOW,
  press,
  receiveProfile,
  setup,
  typeInto,
  useSodium,
} from "../chores/planner-test-support";

export const show = (platform: Platform) =>
  render(
    <PlatformProvider platform={platform}>
      <HeadScreen />
    </PlatformProvider>,
  );

/** The head set of the platform; `add` moves the clock, as ids rise with time. */
export function headOf(platform: Platform, time: { now: number }) {
  const { head, items, carriers } = wireHead(platform);
  return {
    items,
    carriers,
    head,
    add: (...args: Parameters<typeof head.add>) => {
      time.now += 1000;
      return head.add(...args);
    },
  };
}
