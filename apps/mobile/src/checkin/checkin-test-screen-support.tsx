import { render } from "@testing-library/react";
import { vi } from "vitest";

import { CONSENT_CATEGORIES } from "../consent/consent-model";
import { wireConsent } from "../consent/wiring";
import { PlatformProvider, type Platform } from "../platform/context";
import { TodayScreen } from "../today/TodayScreen";
import { setup } from "../chores/planner-test-support";
import type { CheckinStatus, CheckinView } from "./checkin-service";
import { CheckinCard } from "./CheckinCard";
import { wireCheckin } from "./wiring";

export { press, typeInto, useSodium } from "../chores/planner-test-support";

export const showCard = (platform: Platform) =>
  render(
    <PlatformProvider platform={platform}>
      <CheckinCard />
    </PlatformProvider>,
  );

export const showToday = (platform: Platform) =>
  render(
    <PlatformProvider platform={platform}>
      <TodayScreen />
    </PlatformProvider>,
  );

/** A platform with or without a pair; the consent of CHECKIN as `shared` says. */
export async function setupCheckin(paired: boolean, shared = true) {
  const { platform } = await setup(paired);
  const { consent } = wireConsent(platform);
  await consent.save(
    Object.fromEntries(
      CONSENT_CATEGORIES.map((category) => [
        category,
        category === "CHECKIN" && shared,
      ]),
    ) as Record<(typeof CONSENT_CATEGORIES)[number], boolean>,
  );
  const { checkin, sealed } = wireCheckin(platform);
  // jsdom's TextEncoder gives bytes that libsodium rejects; sealing has its own tests.
  vi.spyOn(sealed, "submit").mockResolvedValue(undefined);
  return { platform, consent, checkin };
}

/** The view of the service with the status the sync would bring. */
export async function withStatus(
  checkin: ReturnType<typeof wireCheckin>["checkin"],
  status: CheckinStatus,
) {
  const view: CheckinView = {
    ...(await checkin.current()),
    own: { mood: 4, energy: 3, closeness: 5 },
    status,
    partner:
      status === "revealed" ? { mood: 1, energy: 2, closeness: 3 } : null,
  };
  return vi.spyOn(checkin, "current").mockResolvedValue(view);
}
