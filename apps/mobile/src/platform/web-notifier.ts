import type { Notifier, NotifierPermission } from "./notifier";

interface NotificationApi {
  new (title: string, options?: { body?: string; tag?: string }): unknown;
  permission: "granted" | "denied" | "default";
  requestPermission(): Promise<"granted" | "denied" | "default">;
}

interface ServiceWorkerApi {
  getRegistration(): Promise<
    | {
        showNotification(
          title: string,
          options?: { body?: string; tag?: string },
        ): Promise<void>;
      }
    | undefined
  >;
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
    show: async ({ title, body, tag }) => {
      const Current = api();
      if (!Current || permission() !== "granted") return false;
      try {
        new Current(title, { body, tag });
        return true;
      } catch {
        // Chrome on Android: the constructor is illegal, only a service worker shows it.
      }
      try {
        const worker = (
          globalThis.navigator as { serviceWorker?: ServiceWorkerApi } | undefined
        )?.serviceWorker;
        const registration = await worker?.getRegistration();
        if (!registration) return false;
        await registration.showNotification(title, { body, tag });
        return true;
      } catch {
        return false;
      }
    },
  };
}
