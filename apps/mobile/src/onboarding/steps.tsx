import { Switch, View } from "react-native";

import {
  GOAL_IDS,
  RELATIONSHIP_TENURES,
  type CycleAnswer,
  type GoalId,
  type GrammaticalForm,
} from "../data/profile";
import { t } from "../i18n";
import { AppText } from "../ui/AppText";
import { spacing } from "../ui/theme";
import { Button, Field, Option } from "./controls";
import type { Draft } from "./onboarding-state";

export interface StepProps {
  draft: Draft;
  patch: (patch: Partial<Draft>) => void;
}

const FORMS: readonly GrammaticalForm[] = ["feminine", "masculine", "neutral"];
const FORM_LABELS = {
  feminine: "onboarding.formFeminine",
  masculine: "onboarding.formMasculine",
  neutral: "onboarding.formNeutral",
} as const;
const CYCLE_ANSWERS: readonly CycleAnswer[] = ["yes", "no", "not-now"];

function Group({ children }: { children: React.ReactNode }) {
  return <View style={{ gap: spacing.sm }}>{children}</View>;
}

export function NameStep({ draft, patch }: StepProps) {
  return (
    <Field
      label={t("onboarding.name.label")}
      value={draft.name}
      onChange={(name) => {
        patch({ name });
      }}
    />
  );
}

export function FormStep({ draft, patch }: StepProps) {
  return (
    <Group>
      {FORMS.map((form) => (
        <Option
          key={form}
          label={t(FORM_LABELS[form])}
          selected={draft.form === form}
          onPress={() => {
            patch({ form });
          }}
        />
      ))}
    </Group>
  );
}

export function AdultStep({ draft, patch }: StepProps) {
  const form = draft.form ?? "neutral";
  return (
    <Group>
      <Option
        multiple
        label={t("onboarding.adult.confirm", {}, form)}
        selected={draft.adultConfirmed}
        onPress={() => {
          patch({ adultConfirmed: !draft.adultConfirmed });
        }}
      />
      {draft.adultConfirmed ? null : (
        <AppText accessibilityRole="alert">
          {t("onboarding.adult.required")}
        </AppText>
      )}
    </Group>
  );
}

export function TenureStep({ draft, patch }: StepProps) {
  return (
    <Group>
      {RELATIONSHIP_TENURES.map((tenure) => (
        <Option
          key={tenure}
          label={t(`onboarding.tenure.${tenure}`)}
          selected={draft.tenure === tenure}
          onPress={() => {
            patch({ tenure });
          }}
        />
      ))}
    </Group>
  );
}

export function ChildrenStep({ draft, patch }: StepProps) {
  return (
    <Group>
      <Option
        label={t("onboarding.children.yes")}
        selected={draft.hasChildren === true}
        onPress={() => {
          patch({ hasChildren: true });
        }}
      />
      <Option
        label={t("onboarding.children.no")}
        selected={draft.hasChildren === false}
        onPress={() => {
          patch({ hasChildren: false, childrenCount: "" });
        }}
      />
      {draft.hasChildren ? (
        <Field
          numeric
          label={t("onboarding.children.count")}
          value={draft.childrenCount}
          onChange={(childrenCount) => {
            patch({ childrenCount });
          }}
        />
      ) : null}
    </Group>
  );
}

function toggle(goals: readonly GoalId[], goal: GoalId): GoalId[] {
  return goals.includes(goal)
    ? goals.filter((g) => g !== goal)
    : [...goals, goal];
}

export function GoalsStep({ draft, patch }: StepProps) {
  return (
    <Group>
      {GOAL_IDS.map((goal) => (
        <Option
          multiple
          key={goal}
          label={t(`onboarding.goals.${goal}`)}
          selected={draft.goals.includes(goal)}
          onPress={() => {
            patch({ goals: toggle(draft.goals, goal) });
          }}
        />
      ))}
      {draft.goals.includes("other") ? (
        <Field
          label={t("onboarding.goals.otherLabel")}
          value={draft.otherGoalText}
          onChange={(otherGoalText) => {
            patch({ otherGoalText });
          }}
        />
      ) : null}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.md,
        }}
      >
        <Switch
          accessibilityLabel={t("onboarding.goals.share")}
          value={draft.shareGoalsWithPartner}
          onValueChange={(shareGoalsWithPartner) => {
            patch({ shareGoalsWithPartner });
          }}
        />
        <View style={{ flex: 1 }}>
          <AppText>{t("onboarding.goals.share")}</AppText>
          <AppText>{t("onboarding.goals.shareHint")}</AppText>
        </View>
      </View>
    </Group>
  );
}

export function CycleStep({ draft, patch }: StepProps) {
  return (
    <Group>
      {CYCLE_ANSWERS.map((cycle) => (
        <Option
          key={cycle}
          label={t(`onboarding.cycle.${cycle}`)}
          selected={draft.cycle === cycle}
          onPress={() => {
            patch({ cycle });
          }}
        />
      ))}
    </Group>
  );
}

export function DisclaimerStep({ draft, patch }: StepProps) {
  return (
    <Group>
      <AppText>{t("onboarding.disclaimer.text")}</AppText>
      <Option
        multiple
        label={t("onboarding.disclaimer.confirm")}
        selected={draft.disclaimerConfirmed}
        onPress={() => {
          patch({ disclaimerConfirmed: !draft.disclaimerConfirmed });
        }}
      />
    </Group>
  );
}

function CycleValueFields({
  draft,
  patch,
  valid,
}: StepProps & { valid: boolean }) {
  return (
    <>
      <Field
        label={t("onboarding.cycleSetup.lastPeriod")}
        value={draft.lastPeriodStart}
        onChange={(lastPeriodStart) => {
          patch({ lastPeriodStart });
        }}
      />
      <Field
        numeric
        label={t("onboarding.cycleSetup.cycleLength")}
        value={draft.cycleLength}
        onChange={(cycleLength) => {
          patch({ cycleLength });
        }}
      />
      <Field
        numeric
        label={t("onboarding.cycleSetup.periodLength")}
        value={draft.periodLength}
        onChange={(periodLength) => {
          patch({ periodLength });
        }}
      />
      {valid || draft.lastPeriodStart === "" ? null : (
        <AppText accessibilityRole="alert">
          {t("onboarding.cycleSetup.invalid")}
        </AppText>
      )}
    </>
  );
}

export function CycleSetupStep(props: StepProps & { valid: boolean }) {
  const { draft, patch } = props;
  return (
    <Group>
      <Option
        multiple
        label={t("onboarding.cycleSetup.unknown")}
        selected={draft.cycleUnknown}
        onPress={() => {
          patch({ cycleUnknown: !draft.cycleUnknown });
        }}
      />
      {draft.cycleUnknown ? (
        <AppText>{t("onboarding.cycleSetup.unknownHint")}</AppText>
      ) : (
        <CycleValueFields {...props} />
      )}
    </Group>
  );
}

export function PinStep({
  draft,
  patch,
  onSetPin,
}: StepProps & { onSetPin: () => void }) {
  return (
    <Group>
      <AppText>{t("onboarding.pin.text")}</AppText>
      <Button primary label={t("onboarding.pin.set")} onPress={onSetPin} />
      <Button
        label={t("onboarding.pin.skip")}
        onPress={() => {
          patch({ pinDecision: "skipped" });
        }}
      />
      {draft.pinDecision === null ? null : (
        <AppText accessibilityRole="alert">
          {t(
            draft.pinDecision === "set"
              ? "onboarding.pin.isSet"
              : "onboarding.pin.isSkipped",
          )}
        </AppText>
      )}
    </Group>
  );
}

export function DeviceStep() {
  return (
    <Group>
      <AppText>{t("onboarding.device.text")}</AppText>
      <AppText>{t("onboarding.device.partner")}</AppText>
    </Group>
  );
}
