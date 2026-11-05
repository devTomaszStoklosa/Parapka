import type { PushToken } from "./store/store.js";

/**
 * The only content of a push and of a WebSocket notification: "there are new
 * envelopes". It holds no identifiers, event type or user data (spec 7.4).
 */
export const SYNC_MARKER = "sync";

/** Sends a push without content to a device; APNs and FCM implement it. */
export interface PushSender {
  send(token: PushToken, payload: string): Promise<void>;
}

/** Test implementation: records the calls and sends nothing. */
export class RecordingPushSender implements PushSender {
  readonly sent: { readonly token: PushToken; readonly payload: string }[] = [];

  send(token: PushToken, payload: string): Promise<void> {
    this.sent.push({ token, payload });
    return Promise.resolve();
  }
}
