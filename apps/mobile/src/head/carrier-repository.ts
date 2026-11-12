import {
  createAppendEntryRepository,
  type AppendEntryDeps,
  type AppendEntryRepository,
} from "./append-entry-repository";

/** One change of the carrier of an item; entries are only ever added. */
export interface StoredCarrierChange {
  readonly itemId: string;
  /** The `deviceId` of the person who carries the item, or `both`. */
  readonly carrier: string;
  /** The `deviceId` of the person who made the change. */
  readonly changedBy: string;
  /** The HLC (text form) of the moment of the change. */
  readonly changedAt: string;
}

export interface CarrierRepository extends Omit<
  AppendEntryRepository,
  "append" | "list"
> {
  /** Every entry, ordered by key and moment. */
  list: () => Promise<StoredCarrierChange[]>;
  /**
   * Adds an entry made by this device now. It is shared or private as the item
   * is; `shared` tells which. Throws on invalid input.
   */
  append: (change: {
    itemId: string;
    carrier: string;
    shared: boolean;
    /** An HLC (text form) that the entry must be later than. */
    after?: string;
  }) => Promise<void>;
}

export function createCarrierRepository(
  deps: AppendEntryDeps,
): CarrierRepository {
  const { append, ...rest } = createAppendEntryRepository(
    {
      collection: "carrier-changes",
      entity: "CarrierChange",
      fields: ["itemId", "carrier", "changedBy"],
      keyField: "itemId",
      deviceField: "changedBy",
      isValidField: () => true,
      invalidMessage: "invalid carrier change",
    },
    deps,
  );
  return {
    ...rest,
    list: () => rest.list() as unknown as Promise<StoredCarrierChange[]>,
    append: ({ itemId, carrier, shared, after }) =>
      append({ itemId, carrier }, shared, after),
  };
}
