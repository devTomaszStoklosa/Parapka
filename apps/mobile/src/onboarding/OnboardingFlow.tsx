import { useMemo, useReducer, useState, type ReactNode } from "react";

import { createCycleSettingsRepository } from "../data/cycle-settings";
import type { Profile } from "../data/profile";
import { createProfileRepository } from "../data/profile-repository";
import { t, type TranslationKey } from "../i18n";
import { PinScreen } from "../lock/PinScreen";
import { createPinStore } from "../lock/pin-store";
import { usePlatform } from "../platform/context";
import { StepFrame } from "./controls";
import {
  buildResult,
  canContinue,
  initialOnboardingState,
  isLastStep,
  onboardingReducer,
  stepsFor,
  type Draft,
  type OnboardingAction,
  type OnboardingState,
  type Step,
} from "./onboarding-state";
import {
  AdultStep,
  ChildrenStep,
  CycleSetupStep,
  CycleStep,
  DeviceStep,
  DisclaimerStep,
  FormStep,
  GoalsStep,
  NameStep,
  PinStep,
  TenureStep,
  type StepProps,
} from "./steps";

const TITLES: Record<Step, TranslationKey> = {
  name: "onboarding.name.title",
  form: "onboarding.form.title",
  adult: "onboarding.adult.title",
  tenure: "onboarding.tenure.title",
  children: "onboarding.children.title",
  goals: "onboarding.goals.title",
  cycle: "onboarding.cycle.title",
  disclaimer: "onboarding.disclaimer.title",
  cycleSetup: "onboarding.cycleSetup.title",
  pin: "onboarding.pin.title",
  device: "onboarding.device.title",
};

const HINTS: Partial<Record<Step, TranslationKey>> = {
  name: "onboarding.name.hint",
  form: "onboarding.form.hint",
  adult: "onboarding.adult.hint",
  tenure: "onboarding.tenure.hint",
  goals: "onboarding.goals.hint",
  cycle: "onboarding.cycle.hint",
};

type BodyProps = StepProps & { onSetPin: () => void; cycleValid: boolean };

const BODIES: Record<Step, (props: BodyProps) => ReactNode> = {
  name: (p) => <NameStep {...p} />,
  form: (p) => <FormStep {...p} />,
  adult: (p) => <AdultStep {...p} />,
  tenure: (p) => <TenureStep {...p} />,
  children: (p) => <ChildrenStep {...p} />,
  goals: (p) => <GoalsStep {...p} />,
  cycle: (p) => <CycleStep {...p} />,
  disclaimer: (p) => <DisclaimerStep {...p} />,
  cycleSetup: (p) => <CycleSetupStep {...p} valid={p.cycleValid} />,
  pin: (p) => <PinStep {...p} />,
  device: () => <DeviceStep />,
};

function useFinish(onDone: (profile: Profile) => void) {
  const { database } = usePlatform();
  const [saving, setSaving] = useState(false);
  const finish = async (draft: Draft) => {
    const result = buildResult(draft);
    if (!result || saving) return;
    setSaving(true);
    if (result.cycleSettings) {
      await createCycleSettingsRepository(database).save(result.cycleSettings);
    }
    // The profile goes last: when it exists, onboarding is complete.
    await createProfileRepository(database).save(result.profile);
    onDone(result.profile);
  };
  return { saving, finish };
}

function PinSetup({ onDone }: { onDone: () => void }) {
  const { database, sodium, clock } = usePlatform();
  const store = useMemo(
    () => createPinStore({ database, sodium, clock }),
    [database, sodium, clock],
  );
  return (
    <PinScreen
      mode="set"
      clock={clock}
      onSetPin={(pin) => store.setPin(pin)}
      onDone={onDone}
    />
  );
}

function FlowStep(props: {
  state: OnboardingState;
  dispatch: (action: OnboardingAction) => void;
  saving: boolean;
  onFinish: () => void;
  onSetPin: () => void;
}) {
  const { state, dispatch, saving, onFinish, onSetPin } = props;
  const { draft, step } = state;
  const steps = stepsFor(draft);
  const hint = HINTS[step];
  return (
    <StepFrame
      title={t(TITLES[step])}
      hint={hint ? t(hint) : undefined}
      position={t("onboarding.stepOf", {
        current: steps.indexOf(step) + 1,
        total: steps.length,
      })}
      onBack={() => {
        dispatch({ type: "back" });
      }}
      nextLabel={t(isLastStep(state) ? "onboarding.finish" : "onboarding.next")}
      canContinue={canContinue(state) && !saving}
      onNext={() => {
        if (isLastStep(state)) onFinish();
        else dispatch({ type: "next" });
      }}
    >
      {BODIES[step]({
        draft,
        patch: (patch) => {
          dispatch({ type: "patch", patch });
        },
        onSetPin,
        cycleValid: canContinue({ step: "cycleSetup", draft }),
      })}
    </StepFrame>
  );
}

/**
 * Onboarding of one person on their own device (FR-ONB-01 to FR-ONB-06).
 * `onDone` gets the profile after it and the cycle settings are saved.
 */
export function OnboardingFlow({
  onDone,
}: {
  onDone: (profile: Profile) => void;
}) {
  const [state, dispatch] = useReducer(
    onboardingReducer,
    initialOnboardingState,
  );
  const [settingPin, setSettingPin] = useState(false);
  const { saving, finish } = useFinish(onDone);

  if (settingPin) {
    return (
      <PinSetup
        onDone={() => {
          setSettingPin(false);
          dispatch({ type: "patch", patch: { pinDecision: "set" } });
        }}
      />
    );
  }
  return (
    <FlowStep
      state={state}
      dispatch={dispatch}
      saving={saving}
      onFinish={() => void finish(state.draft)}
      onSetPin={() => {
        setSettingPin(true);
      }}
    />
  );
}
