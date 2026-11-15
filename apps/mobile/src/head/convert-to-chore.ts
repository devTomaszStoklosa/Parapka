import {
  ChoreValidationError,
  type Assignment,
  type Clock,
  type MentalLoadCarrier,
} from "@parapka/domain";

import type { ChoreRepository, StoredChore } from "../chores/chore-repository";
import { localDate } from "../chores/planner-model";
import type { HeadService } from "./head-service";
import type { ItemRepository } from "./item-repository";

interface Deps {
  head: Pick<HeadService, "list">;
  items: Pick<ItemRepository, "edit">;
  chores: Pick<ChoreRepository, "add" | "remove">;
  clock: Clock;
}

/** The one who carries the thing is responsible; nobody known yet means me. */
function assignmentOf(carrier: MentalLoadCarrier | null): Assignment {
  if (carrier === "partner") return { kind: "person", person: "partner" };
  if (carrier === "both") return { kind: "both" };
  return { kind: "person", person: "me" };
}

/**
 * "Turn into a chore" (FR-MNT-08, FR-CHR-08): an open thing with no chore yet
 * gets an occasional chore with the same title and due date (today when it has
 * none), as private as the thing; each points to the other. The thing stays
 * open. When the link cannot be saved on the thing, the new chore is removed.
 */
export async function convertToChore(
  deps: Deps,
  itemId: string,
): Promise<StoredChore> {
  const item = (await deps.head.list()).find(({ id }) => id === itemId);
  if (item === undefined) throw new ChoreValidationError("unknown item");
  if (item.status !== "open" || item.linkedChoreId !== null) {
    throw new ChoreValidationError("this item cannot be turned into a chore");
  }
  const chore = await deps.chores.add(
    {
      title: item.title,
      rule: {
        kind: "occasional",
        dueDate: item.dueDate ?? localDate(deps.clock.nowMs()),
      },
      assignment: assignmentOf(item.carrier),
      linkedItemId: item.id,
    },
    { private: !item.shared },
  );
  try {
    await deps.items.edit(item.id, { linkedChoreId: chore.id });
  } catch (error) {
    await deps.chores.remove(chore.id);
    throw error;
  }
  return chore;
}
