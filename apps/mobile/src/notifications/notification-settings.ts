import { isValidReminder } from "../chores/chore-extras";
import { changeChannel } from "../data/change-listeners";
import { createCycleSettingsRepository } from "../data/cycle-settings";
import type { JsonValue, LocalDatabase } from "../data/local-database";
import {
  NOTIFICATION_TYPES,
  type NotificationTypeId,
} from "./notification-types";
import { DEFAULT_QUIET_HOURS, type QuietHours } from "./quiet-hours";

const COLLECTION = "notification-settings";
const ID = "me";

/** Local settings of the notifications; never synchronized (no handler). */
export interface NotificationSettings {
  readonly enabled: Readonly<Record<NotificationTypeId, boolean>>;
  /** Discreet mode, on by default (FR-NOT-04). */
  readonly discreet: boolean;
  readonly quietHours: QuietHours;
  readonly partnerHintTime: string;
  readonly wellbeingTime: string;
}

export interface NotificationSettingsChange {
  readonly enabled?: Partial<Record<NotificationTypeId, boolean>>;
  readonly discreet?: boolean;
  readonly quietHours?: QuietHours;
  readonly partnerHintTime?: string;
  readonly wellbeingTime?: string;
}

/** What the record keeps: the state of `wellbeing` lives in the cycle settings. */
type Stored = Omit<NotificationSettings, "enabled"> & {
  readonly enabled: Partial<Record<NotificationTypeId, boolean>>;
};

export interface NotificationSettingsRepository {
  get(): Promise<NotificationSettings>;
  /** Throws on a time that is not `HH:MM`, and then saves nothing. */
  set(change: NotificationSettingsChange): Promise<void>;
  subscribe(listener: () => void): () => void;
}

const DEFAULTS: Stored = {
  enabled: {},
  discreet: true,
  quietHours: DEFAULT_QUIET_HOURS,
  partnerHintTime: "08:00",
  wellbeingTime: "20:00",
};

const isTime = (value: unknown): boolean =>
  value !== null && isValidReminder(value);

function validate(change: NotificationSettingsChange): void {
  const times = [
    change.quietHours?.from,
    change.quietHours?.to,
    change.partnerHintTime,
    change.wellbeingTime,
  ];
  if (times.some((time) => time !== undefined && !isTime(time))) {
    throw new Error("invalid time");
  }
}

export function createNotificationSettingsRepository(
  db: LocalDatabase,
): NotificationSettingsRepository {
  const channel = changeChannel(db, COLLECTION);
  const cycle = createCycleSettingsRepository(db);
  const read = async (): Promise<Stored> => {
    const value = await db.get(COLLECTION, ID);
    return { ...DEFAULTS, ...(value as unknown as Partial<Stored> | null) };
  };
  return {
    get: async () => {
      const stored = await read();
      const wellbeing = (await cycle.get())?.wellbeingReminder === true;
      const enabled = Object.fromEntries(
        NOTIFICATION_TYPES.map((type) => [
          type.id,
          type.id === "wellbeing"
            ? wellbeing
            : (stored.enabled[type.id] ?? type.defaultEnabled),
        ]),
      ) as Record<NotificationTypeId, boolean>;
      return { ...stored, enabled };
    },
    set: async (change) => {
      validate(change);
      const { wellbeing, ...own } = change.enabled ?? {};
      const stored = await read();
      const next: Stored = {
        ...stored,
        ...change,
        enabled: { ...stored.enabled, ...own },
      };
      await db.put(COLLECTION, ID, next as unknown as JsonValue);
      const settings = await cycle.get();
      if (wellbeing !== undefined && settings) {
        await cycle.save({ ...settings, wellbeingReminder: wellbeing });
      }
      channel.notify();
    },
    subscribe: channel.subscribe,
  };
}
