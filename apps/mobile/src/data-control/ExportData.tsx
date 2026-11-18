import { useState } from "react";
import { View } from "react-native";

import { t } from "../i18n";
import { Button } from "../onboarding/controls";
import { usePlatform } from "../platform/context";
import { AlertText } from "../ui/AlertText";
import { AppText } from "../ui/AppText";
import { spacing } from "../ui/theme";
import { buildExport } from "./export-data";

const pad = (n: number) => String(n).padStart(2, "0");

/** `parapka-eksport-RRRR-MM-DD.json`, with the local date. */
function fileName(nowMs: number): string {
  const day = new Date(nowMs);
  const date = `${String(day.getFullYear())}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
  return `parapka-eksport-${date}.json`;
}

/** Builds the export file and hands it to the file share; null without a file share. */
export function useExportData() {
  const { database, clock, fileShare } = usePlatform();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!fileShare) return null;
  const run = () => {
    setBusy(true);
    setFailed(false);
    buildExport({ database, clock })
      .then((document) =>
        fileShare.shareFile({
          name: fileName(clock.nowMs()),
          mimeType: "application/json",
          text: JSON.stringify(document, null, 2),
        }),
      )
      .catch(() => {
        setFailed(true);
      })
      .finally(() => {
        setBusy(false);
      });
  };
  return { run, busy, failed };
}

/** Settings section "Twoje dane": exports the own data to a JSON file (FR-SEC-05). */
export function ExportData() {
  const exporter = useExportData();
  if (!exporter) return null;
  const { run, busy, failed } = exporter;
  return (
    <View style={{ gap: spacing.md, marginTop: spacing.md }}>
      <AppText style={{ fontWeight: "bold" }}>{t("data.title")}</AppText>
      <AppText>{t("data.contains")}</AppText>
      <AppText>{t("data.excludes")}</AppText>
      <AppText>{t("data.warning")}</AppText>
      <Button label={t("data.export")} onPress={run} disabled={busy} />
      {failed ? <AlertText>{t("data.failed")}</AlertText> : null}
    </View>
  );
}
