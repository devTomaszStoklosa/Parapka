export type NotifierPermission =
  "granted" | "denied" | "default" | "unsupported";

export interface NotifierMessage {
  readonly title: string;
  readonly body: string;
  /** A message with the same tag replaces the earlier one. */
  readonly tag: string;
}

/**
 * Shows a notification outside the app. The browser implements it with the
 * Notification API; the native app gets its own implementation (M9).
 */
export interface Notifier {
  permission(): NotifierPermission;
  requestPermission(): Promise<NotifierPermission>;
  /**
   * Resolves `true` when the system notification was shown, `false` when it was
   * not (no API, no permission, a failure). It does not reject.
   */
  show(message: NotifierMessage): Promise<boolean>;
}

/** A notifier that keeps the shown messages, for tests. */
export function createMemoryNotifier(
  initial: NotifierPermission = "granted",
  answer: NotifierPermission = initial,
  result = true,
): Notifier & { readonly shown: NotifierMessage[] } {
  let permission = initial;
  const shown: NotifierMessage[] = [];
  return {
    shown,
    permission: () => permission,
    requestPermission: () => {
      permission = answer;
      return Promise.resolve(permission);
    },
    show: (message) => {
      shown.push(message);
      return Promise.resolve(result);
    },
  };
}
