import type { HandoverStatus } from "@parapka/sync";

import {
  createAppendEntryRepository,
  type AppendEntryDeps,
  type AppendEntryRepository,
} from "./append-entry-repository";

const STATUSES: readonly string[] = ["pending", "accepted", "declined"];

/** One state of a handover request; entries are only ever added. */
export interface StoredHandoverRequest {
  readonly requestId: string;
  readonly itemId: string;
  /** The `deviceId` of the person who asked, kept by every entry. */
  readonly requestedBy: string;
  readonly status: HandoverStatus;
  /** The HLC (text form) of the moment of the change. */
  readonly changedAt: string;
}

export interface HandoverRepository extends Omit<
  AppendEntryRepository,
  "append" | "list"
> {
  /** Every entry, ordered by key and moment. */
  list: () => Promise<StoredHandoverRequest[]>;
  /**
   * Adds an entry made by this device now. It is shared or private as the item
   * is; `shared` tells which. Throws on invalid input.
   */
  append: (change: {
    requestId: string;
    itemId: string;
    requestedBy: string;
    status: HandoverStatus;
    shared: boolean;
    /** An HLC (text form) that the entry must be later than. */
    after?: string;
  }) => Promise<void>;
}

export function createHandoverRepository(
  deps: AppendEntryDeps,
): HandoverRepository {
  const { append, ...rest } = createAppendEntryRepository(
    {
      collection: "handover-requests",
      entity: "HandoverRequest",
      fields: ["requestId", "itemId", "requestedBy", "status"],
      keyField: "requestId",
      isValidField: (name, value) =>
        name !== "status" || STATUSES.includes(value),
      invalidMessage: "invalid handover request",
    },
    deps,
  );
  return {
    ...rest,
    list: () => rest.list() as unknown as Promise<StoredHandoverRequest[]>,
    append: ({ shared, after, ...values }) => append(values, shared, after),
  };
}
