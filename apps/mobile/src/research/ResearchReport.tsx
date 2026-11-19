import { useEffect, useState } from "react";
import { View } from "react-native";

import { wireChores } from "../chores/wiring";
import { createProfileRepository } from "../data/profile-repository";
import { wireHead } from "../head/wiring";
import { t } from "../i18n";
import { Button } from "../onboarding/controls";
import { usePlatform } from "../platform/context";
import { AlertText } from "../ui/AlertText";
import { AppText } from "../ui/AppText";
import { spacing } from "../ui/theme";
import { createActivityLog } from "./activity-log";
import { collectReportInput } from "./report-data";
import { buildReportText, reportRows } from "./report-text";
import {
  computeReport,
  type ResearchReport as Report,
} from "./research-report";

/** Reads the report from the local data once the section is open; nothing leaves the phone. */
function useReport(open: boolean) {
  const platform = usePlatform();
  const [result, setResult] = useState<{
    report: Report;
    paired: boolean;
  } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setFailed(false);
    setResult(null);
    const { database, clock } = platform;
    const { pairs } = wireChores(platform);
    let paired = false;
    collectReportInput({
      database,
      pairs: {
        current: async () => {
          const pair = await pairs.current();
          paired = pair?.state === "confirmed";
          return pair;
        },
      },
      activity: createActivityLog(database),
      profile: createProfileRepository(database),
      head: wireHead(platform).head,
      nowMs: clock.nowMs(),
    })
      .then((input) => {
        if (!cancelled) setResult({ report: computeReport(input), paired });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, platform]);
  return { result, failed };
}

function ReportBody({ report, paired }: { report: Report; paired: boolean }) {
  const { fileShare } = usePlatform();
  const [shareFailed, setShareFailed] = useState(false);
  if (!paired) {
    return <AppText>{t("research.noPair")}</AppText>;
  }
  const share = fileShare
    ? () => {
        setShareFailed(false);
        fileShare.shareText(buildReportText(report)).catch(() => {
          setShareFailed(true);
        });
      }
    : null;
  return (
    <>
      {report.weeksSincePairing === null ? (
        <AppText>{t("research.pairDateUnknown")}</AppText>
      ) : null}
      {reportRows(report).map(({ label, value }) => (
        <AppText key={label}>{`${label}: ${value}`}</AppText>
      ))}
      {share ? (
        <Button label={t("research.share")} primary onPress={share} />
      ) : null}
      {shareFailed ? <AlertText>{t("research.failed")}</AlertText> : null}
    </>
  );
}

/** Settings section "Raport do badania": a preview of the numbers and a conscious share (spec 10). */
export function ResearchReport() {
  const [open, setOpen] = useState(false);
  const { result, failed } = useReport(open);
  return (
    <View style={{ gap: spacing.md, marginTop: spacing.md }}>
      <AppText style={{ fontWeight: "bold" }} accessibilityRole="header">
        {t("research.title")}
      </AppText>
      <Button
        label={t(open ? "research.hide" : "research.show")}
        expanded={open}
        onPress={() => {
          setOpen(!open);
        }}
      />
      {open ? (
        <>
          <AppText>{t("research.contains")}</AppText>
          <AppText>{t("research.excludes")}</AppText>
          <AppText>{t("research.manual")}</AppText>
          {failed ? <AlertText>{t("research.failed")}</AlertText> : null}
          {!failed && result === null ? (
            <AppText>{t("research.loading")}</AppText>
          ) : null}
          {result ? (
            <ReportBody report={result.report} paired={result.paired} />
          ) : null}
        </>
      ) : null}
    </View>
  );
}
