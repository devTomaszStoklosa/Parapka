import type { ContentChange } from "@parapka/protocol";

import type { ConsentCategory } from "../consent/consent-model";
import type { NextHlc, SyncHandler } from "./handler-registry";

/** What a repository of a synced record gives the handler. */
export interface RecordHandlerSync {
  collect(nextHlc: NextHlc): Promise<ContentChange[]>;
  commit(changes: readonly ContentChange[]): Promise<void>;
  merge(change: ContentChange): Promise<void>;
  makePrivate(): Promise<void>;
}

/**
 * The handler of records synced with `createRecordSync`: pending changes are
 * stamped when the engine collects and move into the merged state once the
 * envelope is saved (`committed`). `forget` removes what the pair ended.
 */
export function createRecordHandler(options: {
  entity: string;
  category: ConsentCategory | null;
  sync: RecordHandlerSync;
  subscribe: SyncHandler["subscribe"];
  receiveCategory?: ConsentCategory | null;
  forget?: () => Promise<void>;
}): SyncHandler {
  const { entity, category, sync, subscribe, forget, receiveCategory } =
    options;
  let collected: readonly ContentChange[] = [];
  return {
    entity,
    category,
    collect: async (nextHlc) => {
      collected = await sync.collect(nextHlc);
      return collected;
    },
    committed: async () => {
      const sent = collected;
      collected = [];
      await sync.commit(sent);
    },
    apply: (change) => sync.merge(change),
    disconnected: () => sync.makePrivate(),
    subscribe,
    ...(receiveCategory === undefined ? {} : { receiveCategory }),
    ...(forget ? { forgetReceived: forget } : {}),
  };
}
