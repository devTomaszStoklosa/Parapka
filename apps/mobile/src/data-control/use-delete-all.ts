import { useState } from "react";

import { usePlatform } from "../platform/context";
import { deleteAllData } from "./delete-all";
import { useRestart } from "./restart";
import { wireDeleteAll } from "./wiring";

export type DeleteStep = "closed" | "effects" | "confirm";

/** The steps and the state of "delete all my data" (FR-SEC-04). */
export function useDeleteAll() {
  const platform = usePlatform();
  const restart = useRestart();
  const [step, setStep] = useState<DeleteStep>("closed");
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [failed, setFailed] = useState(false);

  const cancel = () => {
    setStep("closed");
    setOffline(false);
    setFailed(false);
  };
  const run = (localOnly: boolean) => {
    setBusy(true);
    setOffline(false);
    setFailed(false);
    deleteAllData(wireDeleteAll(platform, { localOnly })).then(
      (result) => {
        if (result === "done") {
          restart();
          return;
        }
        setOffline(true);
        setBusy(false);
      },
      () => {
        setFailed(true);
        setBusy(false);
      },
    );
  };
  return { step, setStep, busy, offline, failed, cancel, run };
}
