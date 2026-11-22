import { MAX_ENVELOPE_BYTES, type Envelope } from "@parapka/protocol";
import { expect, it } from "vitest";

import { createPairedDevices } from "./sync-test-support";
import type { SyncTransport } from "./transport";

it("sends many local changes in envelopes within the limit", async () => {
  const { a, b } = await createPairedDevices();
  const sizes: number[] = [];
  const measuring: SyncTransport = {
    ...a.transport,
    send: (envelope: Envelope) => {
      sizes.push(Buffer.byteLength(JSON.stringify(envelope)));
      return a.transport.send(envelope);
    },
  };
  a.restart({ transport: measuring });
  for (let i = 0; i < 400; i += 1)
    a.handler.edit(`c${String(i)}`, "text", "y".repeat(300));
  await a.engine.push();
  await b.engine.pull();
  expect(sizes.length).toBeGreaterThanOrEqual(2);
  expect(Math.max(...sizes)).toBeLessThanOrEqual(MAX_ENVELOPE_BYTES);
  expect(Object.keys(b.handler.snapshot())).toHaveLength(400);
});
