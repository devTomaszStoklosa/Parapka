import type { Envelope } from "@parapka/protocol";
import { describe, expect, it } from "vitest";

import { createMemoryRelay } from "./transport";

function envelope(envelopeId: string, senderDeviceId: string): Envelope {
  return {
    envelopeId,
    pairMailboxId: "mailbox",
    senderDeviceId,
    protocolVersion: 1,
    nonce: "AA==",
    ciphertext: "AA==",
  };
}

describe("memory transport", () => {
  it("delivers an envelope to the partner and not to the sender", async () => {
    const relay = createMemoryRelay();
    const a = relay.connect("a");
    const b = relay.connect("b");
    await a.send(envelope("e1", "a"));
    expect((await a.fetch(null)).envelopes).toEqual([]);
    const fetched = await b.fetch(null);
    expect(fetched.envelopes.map((e) => e.envelope.envelopeId)).toEqual(["e1"]);
    expect(fetched.nextCursor).toBe("1");
  });

  it("returns only envelopes after the cursor and keeps the cursor when there are none", async () => {
    const relay = createMemoryRelay();
    const a = relay.connect("a");
    const b = relay.connect("b");
    await a.send(envelope("e1", "a"));
    const first = await b.fetch(null);
    await a.send(envelope("e2", "a"));
    const second = await b.fetch(first.nextCursor);
    expect(second.envelopes.map((e) => e.envelope.envelopeId)).toEqual(["e2"]);
    const third = await b.fetch(second.nextCursor);
    expect(third.envelopes).toEqual([]);
    expect(third.nextCursor).toBe(second.nextCursor);
  });

  it("stores an envelope id once", async () => {
    const relay = createMemoryRelay();
    const a = relay.connect("a");
    await a.send(envelope("e1", "a"));
    await a.send(envelope("e1", "a"));
    expect((await relay.connect("b").fetch(null)).envelopes).toHaveLength(1);
  });

  it("deletes acked envelopes of the partner only", async () => {
    const relay = createMemoryRelay();
    const a = relay.connect("a");
    const b = relay.connect("b");
    await a.send(envelope("e1", "a"));
    await a.ack(["e1", "unknown"]);
    expect((await b.fetch(null)).envelopes).toHaveLength(1);
    await b.ack(["e1"]);
    expect((await b.fetch(null)).envelopes).toEqual([]);
  });

  it("notifies the partner until the listener is stopped", async () => {
    const relay = createMemoryRelay();
    const a = relay.connect("a");
    const b = relay.connect("b");
    let own = 0;
    let partner = 0;
    a.onNotify(() => {
      own += 1;
    });
    const stop = b.onNotify(() => {
      partner += 1;
    });
    await a.send(envelope("e1", "a"));
    stop();
    await a.send(envelope("e2", "a"));
    expect([own, partner]).toEqual([0, 1]);
  });
});
