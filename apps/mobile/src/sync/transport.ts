import type { Envelope, FetchEnvelopesResponse } from "@parapka/protocol";

/** Link of one device with the relay mailbox of the pair (spec 7.4). */
export interface SyncTransport {
  send(envelope: Envelope): Promise<void>;
  /** Envelopes of the partner after the cursor; all of them when it is null. */
  fetch(after: string | null): Promise<FetchEnvelopesResponse>;
  /** Tells the relay that the envelopes were received, so it can delete them. */
  ack(envelopeIds: readonly string[]): Promise<void>;
  /** Listens to news in the mailbox; returns the function that stops it. */
  onNotify(listener: () => void): () => void;
}

export interface MemoryRelay {
  /** The transport of one device; it never gets the envelopes it sent. */
  connect(deviceId: string): SyncTransport;
}

interface Stored {
  readonly cursor: number;
  readonly envelope: Envelope;
}

class Mailbox {
  private readonly stored: Stored[] = [];
  private readonly listeners = new Map<string, Set<() => void>>();
  private counter = 0;

  send(deviceId: string, envelope: Envelope): void {
    if (
      this.stored.some((s) => s.envelope.envelopeId === envelope.envelopeId)
    ) {
      return;
    }
    this.counter += 1;
    this.stored.push({ cursor: this.counter, envelope });
    for (const [id, set] of this.listeners) {
      if (id !== deviceId) for (const listener of [...set]) listener();
    }
  }

  fetch(deviceId: string, after: string | null): FetchEnvelopesResponse {
    const from = after === null ? 0 : Number(after);
    const found = this.stored.filter(
      (s) => s.cursor > from && s.envelope.senderDeviceId !== deviceId,
    );
    return {
      envelopes: found.map((s) => ({
        cursor: String(s.cursor),
        envelope: s.envelope,
      })),
      nextCursor: found.length > 0 ? String(this.counter) : after,
    };
  }

  ack(deviceId: string, envelopeIds: readonly string[]): void {
    for (const id of envelopeIds) {
      const index = this.stored.findIndex(
        (s) =>
          s.envelope.envelopeId === id &&
          s.envelope.senderDeviceId !== deviceId,
      );
      if (index >= 0) this.stored.splice(index, 1);
    }
  }

  listen(deviceId: string, listener: () => void): () => void {
    const set = this.listeners.get(deviceId) ?? new Set<() => void>();
    set.add(listener);
    this.listeners.set(deviceId, set);
    return () => {
      set.delete(listener);
    };
  }
}

/** A relay mailbox held in memory, for tests. */
export function createMemoryRelay(): MemoryRelay {
  const mailbox = new Mailbox();
  return {
    connect: (deviceId) => ({
      send: (envelope) => {
        mailbox.send(deviceId, envelope);
        return Promise.resolve();
      },
      fetch: (after) => Promise.resolve(mailbox.fetch(deviceId, after)),
      ack: (envelopeIds) => {
        mailbox.ack(deviceId, envelopeIds);
        return Promise.resolve();
      },
      onNotify: (listener) => mailbox.listen(deviceId, listener),
    }),
  };
}
