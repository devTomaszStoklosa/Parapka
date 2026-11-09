import type { Sodium } from "@parapka/crypto";
import type { Clock } from "@parapka/domain";
import { createContext, useContext, type ReactNode } from "react";
import type { KeyStore } from "./key-store";

/** Platform dependencies that screens receive through context (spec 7.2). */
export interface Platform {
  sodium: Sodium;
  keyStore: KeyStore;
  clock: Clock;
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
