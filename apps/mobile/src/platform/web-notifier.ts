import type { Notifier, NotifierPermission } from "./notifier";

interface NotificationApi {
  new (title: string, options?: { body?: string; tag?: string }): unknown;
  permission: "granted" | "denied" | "default";
  requestPermission(): Promise<"granted" | "denied" | "default">;
}

const api = (): NotificationApi | undefined =>
  (globalThis as { Notification?: NotificationApi }).Notification;

const permission = (): NotifierPermission => api()?.permission ?? "unsupported";

/** The notifier on `globalThis.Notification`; without the API it is `unsupported`. */
export function createWebNotifier(): Notifier {
  return {
    permission,
    requestPermission: async () => {
      const current = api();
      return current ? await current.requestPermission() : "unsupported";
    },
    show: ({ title, body, tag }) => {
      const Current = api();
      if (Current && permission() === "granted") {
        new Current(title, { body, tag });
      }
    },
  };
}
