import { createContext, useContext } from "react";

const RestartContext = createContext<() => void>(() => undefined);

/** Provided by `App`: starts the app anew, with a fresh platform (after "delete all data"). */
export const RestartProvider = RestartContext.Provider;

export function useRestart(): () => void {
  return useContext(RestartContext);
}
