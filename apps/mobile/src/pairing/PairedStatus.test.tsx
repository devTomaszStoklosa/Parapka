// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { formatHlc } from "@parapka/sync";
import { afterEach, expect, it } from "vitest";

import { createConsentRepository } from "../consent/consent-repository";
import { createProfileRepository } from "../data/profile-repository";
import { createMemoryDatabase } from "../data/memory-database";
import { createHandlerRegistry } from "../sync/handler-registry";
import { createPartnerProfileRepository } from "../sync/partner-profile-repository";
import { createProfileHandler } from "../sync/profile-handler";
import { PairingScreen } from "./PairingScreen";

afterEach(cleanup);

it("shows the name of the partner without remounting once the handler stores it", async () => {
  const database = createMemoryDatabase();
  const profiles = createProfileRepository(database);
  const consent = createConsentRepository({
    database,
    clock: { nowMs: () => 1 },
    profiles,
  });
  const partner = createPartnerProfileRepository(database);
  const handler = createProfileHandler({
    database,
    profiles,
    partner,
    consent,
  });
  createHandlerRegistry().register(handler);
  const unused = {} as never;
  const { unmount } = render(
    <PairingScreen
      inviter={unused}
      acceptor={unused}
      pairs={{
        current: () => Promise.resolve({ state: "confirmed" } as never),
      }}
      consent={{ canSync: () => Promise.resolve(true), save: () => unused }}
      profiles={{ get: () => Promise.resolve(null) }}
      partner={partner}
      loadSafetyCode={() => Promise.resolve("")}
    />,
  );
  await screen.findByText("Jesteście w parze.");
  const hlc = formatHlc({
    physical: 1_800_000_000_000,
    counter: 0,
    deviceId: "device-a",
  });
  await act(async () => {
    await handler.apply({
      entity: "profile",
      id: "current",
      op: "upsert",
      fields: {
        name: { value: "Ola", hlc },
        form: { value: "feminine", hlc },
      },
    } as never);
  });
  expect(await screen.findByText("Jesteście w parze z Ola.")).toBeTruthy();
  unmount();
  await partner.merge({}); // no listener left to update the unmounted screen
});
