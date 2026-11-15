import type { ContentChange } from "@parapka/protocol";
import { applyChange, type Change, type EntityState } from "@parapka/sync";

import type { NextHlc } from "../sync/handler-registry";

interface SyncRecord<P> {
  shared: boolean;
  state: EntityState;
  pending: P;
}

/** What differs between the records that are synced the same way. */
export interface RecordSyncParts<P, R extends SyncRecord<P>> {
  records: () => Promise<{ id: string; record: R }[]>;
  read: (id: string) => Promise<R | null>;
  write: (id: string, record: R) => Promise<void>;
  stampPending: (id: string, pending: P, nextHlc: NextHlc) => ContentChange[];
  settle: (pending: P, change: ContentChange) => void;
  /** The change of the partner without invalid fields, or null. */
  sanitize: (change: ContentChange) => Change | null;
  /** A sent change as the state merge takes it. */
  toMerge: (change: ContentChange) => Change;
  emptyRecord: (id: string, shared: boolean) => R;
}

/** The `collect`/`commit`/`merge`/`makePrivate` of a synced record. */
export function createRecordSync<P, R extends SyncRecord<P>>(
  parts: RecordSyncParts<P, R>,
) {
  const { records, read, write } = parts;
  return {
    collect: async (nextHlc: NextHlc) => {
      const result: ContentChange[] = [];
      for (const { id, record } of await records()) {
        if (record.shared) {
          result.push(...parts.stampPending(id, record.pending, nextHlc));
        }
      }
      return result;
    },
    commit: async (sent: readonly ContentChange[]) => {
      for (const change of sent) {
        const record = (await read(change.id)) as R;
        record.state = applyChange(record.state, parts.toMerge(change));
        parts.settle(record.pending, change);
        await write(change.id, record);
      }
    },
    merge: async (change: ContentChange) => {
      const known = await read(change.id);
      // A record that is private here is not overwritten.
      if (known?.shared === false) return;
      const incoming = parts.sanitize(change);
      if (incoming === null) return;
      const record = known ?? parts.emptyRecord(change.id, true);
      record.state = applyChange(record.state, incoming);
      await write(change.id, record);
    },
    makePrivate: async () => {
      for (const { id, record } of await records()) {
        if (!record.shared) continue;
        record.shared = false;
        await write(id, record);
      }
    },
  };
}

/** A record that can be handed to the partner after it was private. */
export interface ShareableRecordSyncParts<P, R extends SyncRecord<P>>
  extends RecordSyncParts<P, R> {
  /** Puts the whole current state of the record into pending, to be sent anew. */
  reseed: (record: R) => void;
}

/**
 * `createRecordSync` plus `share`: makes the private records picked by
 * `belongs` shared and queues their whole state, so the partner gets them
 * complete. Records that are shared already are left alone.
 */
export function createShareableRecordSync<P, R extends SyncRecord<P>>(
  parts: ShareableRecordSyncParts<P, R>,
) {
  return {
    ...createRecordSync(parts),
    share: async (belongs: (id: string) => boolean) => {
      for (const { id, record } of await parts.records()) {
        if (record.shared || !belongs(id)) continue;
        record.shared = true;
        parts.reseed(record);
        await parts.write(id, record);
      }
    },
  };
}
