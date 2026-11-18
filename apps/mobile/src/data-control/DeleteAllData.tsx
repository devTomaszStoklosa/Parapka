import { View } from "react-native";

import { t } from "../i18n";
import { Button } from "../onboarding/controls";
import { AlertText } from "../ui/AlertText";
import { AppText } from "../ui/AppText";
import { spacing } from "../ui/theme";
import { useExportData } from "./ExportData";
import { useDeleteAll } from "./use-delete-all";

function Effects({
  onNext,
  onCancel,
}: {
  onNext: () => void;
  onCancel: () => void;
}) {
  const exporter = useExportData();
  return (
    <>
      <AppText>{t("data.deleteAll.lead")}</AppText>
      <AppText>{t("data.deleteAll.pair")}</AppText>
      <AppText>{t("data.deleteAll.relay")}</AppText>
      <AppText>{t("data.deleteAll.device")}</AppText>
      <AppText>{t("data.deleteAll.partner")}</AppText>
      {exporter ? (
        <>
          <AppText>{t("data.deleteAll.exportHint")}</AppText>
          <Button
            label={t("data.deleteAll.exportFirst")}
            onPress={exporter.run}
            disabled={exporter.busy}
          />
          {exporter.failed ? <AlertText>{t("data.failed")}</AlertText> : null}
        </>
      ) : null}
      <Button primary label={t("data.deleteAll.next")} onPress={onNext} />
      <Button label={t("data.deleteAll.cancel")} onPress={onCancel} />
    </>
  );
}

type DeleteState = ReturnType<typeof useDeleteAll>;

function Confirm({ state }: { state: DeleteState }) {
  const { busy, offline, failed, cancel, run } = state;
  return (
    <>
      <AppText>{t("data.deleteAll.confirmText")}</AppText>
      {offline ? (
        <>
          <AlertText>{t("data.deleteAll.offline")}</AlertText>
          <AppText>{t("data.deleteAll.localOnlyHint")}</AppText>
        </>
      ) : null}
      {failed ? <AlertText>{t("data.failed")}</AlertText> : null}
      {busy ? (
        <AppText accessibilityRole="alert">
          {t("data.deleteAll.deleting")}
        </AppText>
      ) : null}
      <Button
        primary
        label={
          offline ? t("data.deleteAll.retry") : t("data.deleteAll.confirm")
        }
        onPress={() => {
          run(false);
        }}
        disabled={busy}
      />
      {offline ? (
        <Button
          label={t("data.deleteAll.localOnly")}
          onPress={() => {
            run(true);
          }}
          disabled={busy}
        />
      ) : null}
      <Button
        label={t("data.deleteAll.cancel")}
        onPress={cancel}
        disabled={busy}
      />
    </>
  );
}

/** Settings: "Usuń wszystkie moje dane" with two confirmations (FR-SEC-04). */
export function DeleteAllData() {
  const state = useDeleteAll();
  const { step, setStep, cancel } = state;
  if (step === "closed") {
    return (
      <View style={{ marginTop: spacing.md }}>
        <Button
          label={t("data.deleteAll.open")}
          onPress={() => {
            setStep("effects");
          }}
        />
      </View>
    );
  }
  return (
    <View style={{ gap: spacing.md, marginTop: spacing.md }}>
      <AppText style={{ fontWeight: "bold" }} accessibilityRole="header">
        {step === "effects"
          ? t("data.deleteAll.title")
          : t("data.deleteAll.confirmTitle")}
      </AppText>
      {step === "effects" ? (
        <Effects
          onNext={() => {
            setStep("confirm");
          }}
          onCancel={cancel}
        />
      ) : (
        <Confirm state={state} />
      )}
    </View>
  );
}
