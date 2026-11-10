import type { Sodium } from "@parapka/crypto";
import type { Clock } from "@parapka/domain";
import type { LocalDatabase } from "../data/local-database";
import { createContext, useContext, type ReactNode } from "react";
import type { SocketLike } from "../net/relay-socket";
import type { KeyStore } from "./key-store";
import type { Sha256 } from "./sha256";

/** Platform dependencies that screens receive through context (spec 7.2). */
export interface Platform {
  sodium: Sodium;
  keyStore: KeyStore;
  clock: Clock;
  /** Encrypted local database, opened and migrated. */
  database: LocalDatabase;
  sha256: Sha256;
  /** Address of the relay, from the configuration. */
  relayUrl: string;
  /** Address the app is served from, the base of invitation links. */
  appUrl: string;
  /** The invitation text the app was opened with (`/pair#<text>`), read once; web only. */
  /** Opens a WebSocket to the relay. */
  createSocket?: (url: string) => SocketLike;
  launchInvitation?: () => string | null;
}

const PlatformContext = createContext<Platform | null>(null);

export function PlatformProvider(props: {
  platform: Platform;
  children: ReactNode;
}) {
  return (
    <PlatformContext.Provider value={props.platform}>
      {props.children}
    </PlatformContext.Provider>
  );
}

export function usePlatform(): Platform {
  const platform = useContext(PlatformContext);
  if (!platform) {
    throw new Error("usePlatform must be used inside a PlatformProvider");
  }
  return platform;
}
