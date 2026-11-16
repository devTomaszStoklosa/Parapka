import type { JsonValue, LocalDatabase } from "../data/local-database";
import { t, type TranslationKey } from "../i18n";
import type { NotifierMessage } from "../platform/notifier";
import type { NotificationText, PlannedNotification } from "./planned";

const DELIVERED = "notifications-delivered";
const QUEUE = "notifications-queue";

const HOUR_MS = 60 * 60 * 1000;
/** Overdue notifications up to this age are shown once; older ones are skipped. */
export const OVERDUE_MS = 24 * HOUR_MS;
/** How long the delivered and the queued entries are kept. */
export const RETENTION_MS = 14 * 24 * HOUR_MS;

/** Queues a notification caused by an event; the runner delivers it with the schedule. */
export async function enqueueNotification(
  db: LocalDatabase,
  planned: PlannedNotification,
): Promise<void> {
  await db.put(QUEUE, planned.id, planned as unknown as JsonValue);
}

export async function listQueued(
  db: LocalDatabase,
): Promise<PlannedNotification[]> {
  return (await db.list(QUEUE)).map(
    ({ value }) => value as unknown as PlannedNotification,
  );
}

async function prune(db: LocalDatabase, collection: string, nowMs: number) {
  for (const { id, value } of await db.list(collection)) {
    if ((value as { atMs: number }).atMs < nowMs - RETENTION_MS) {
      await db.delete(collection, id);
    }
  }
}

export interface DueNotifications {
  /** Everything due and not delivered yet; `markDelivered` remembers it. */
  due: PlannedNotification[];
  /** The part of `due` not older than 24 hours: the one to show. Older ones are skipped. */
  show: PlannedNotification[];
}

/** The notifications that are due (`atMs <= nowMs`) and not delivered yet. Writes nothing but the pruning. */
export async function takeDue(
  db: LocalDatabase,
  planned: readonly PlannedNotification[],
  nowMs: number,
): Promise<DueNotifications> {
  await prune(db, DELIVERED, nowMs);
  await prune(db, QUEUE, nowMs);
  const delivered = new Set((await db.list(DELIVERED)).map(({ id }) => id));
  const due = planned.filter(
    (item) => item.atMs <= nowMs && !delivered.has(item.id),
  );
  return { due, show: due.filter((item) => item.atMs >= nowMs - OVERDUE_MS) };
}

/** Remembers the notifications as delivered, so no later check returns them again. */
export async function markDelivered(
  db: LocalDatabase,
  items: readonly PlannedNotification[],
): Promise<void> {
  for (const item of items) {
    await db.put(DELIVERED, item.id, { atMs: item.atMs });
  }
}

const translate = (text: NotificationText) =>
  t(text.key as TranslationKey, text.params);

/**
 * What to show for the due notifications: the discreet mode gives the same
 * text for every type and for the digest (FR-NOT-04); the full mode gives the
 * texts of the notification or, for several, a digest with their number.
 */
export function messageFor(
  items: readonly [PlannedNotification, ...PlannedNotification[]],
  discreet: boolean,
): NotifierMessage {
  const [first] = items;
  const many = items.length > 1;
  const tag = many ? `digest:${first.id}` : first.id;
  if (discreet) {
    return {
      title: t("notifications.discreet.title"),
      body: t("notifications.discreet.body"),
      tag,
    };
  }
  if (many) {
    return {
      title: t("notifications.digest.title"),
      body: t("notifications.digest.body", { count: items.length }),
      tag,
    };
  }
  return { title: translate(first.title), body: translate(first.body), tag };
}
