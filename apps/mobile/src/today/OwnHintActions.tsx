import { useState } from "react";
import { View } from "react-native";
import type { GeneratedHint } from "@parapka/domain";

import { wireCycleHints } from "../cycle/wiring";
import { pl } from "../i18n/pl";
import { Button, Option } from "../onboarding/controls";
import { usePlatform } from "../platform/context";
import { AppText } from "../ui/AppText";
import { spacing } from "../ui/theme";

const c = pl.cycle.ownHint;

function CandidateList(props: {
  candidates: readonly GeneratedHint[];
  onSend: (templateId: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <View
      role="radiogroup"
      aria-label={c.candidates}
      style={{ gap: spacing.sm }}
    >
      {props.candidates.map(({ templateId, text }) => (
        <Option
          key={templateId}
          label={text}
          selected={selected === templateId}
          onPress={() => {
            setSelected(templateId);
          }}
        />
      ))}
      <Button
        primary
        label={c.send}
        disabled={selected === null}
        onPress={() => {
          if (selected !== null) props.onSend(selected);
        }}
      />
    </View>
  );
}

type Run = (task: () => Promise<boolean>) => void;

function ActionButtons(props: {
  skipped: boolean;
  run: Run;
  onCandidates: (candidates: GeneratedHint[]) => void;
}) {
  const { choice, today } = wireCycleHints(usePlatform());
  const { run } = props;
  return props.skipped ? (
    <>
      <AppText>{c.skipped}</AppText>
      <Button
        label={c.restore}
        onPress={() => {
          run(() => choice.restore(today()));
        }}
      />
    </>
  ) : (
    <>
      <Button
        label={c.skip}
        onPress={() => {
          run(() => choice.skip(today()));
        }}
      />
      <Button
        label={c.chooseOther}
        onPress={() => {
          run(async () => {
            props.onCandidates(await choice.candidates(today()));
            return true;
          });
        }}
      />
    </>
  );
}

/**
 * The actions on the hint of today (FR-CYC-07): skip it, bring it back, or
 * choose one of up to 3 candidates. A failed write shows a message.
 */
export function OwnHintActions(props: { hasHint: boolean; skipped: boolean }) {
  const { choice, today } = wireCycleHints(usePlatform());
  const [candidates, setCandidates] = useState<GeneratedHint[] | null>(null);
  const [failed, setFailed] = useState(false);
  const run: Run = (task) => {
    setFailed(false);
    setCandidates(null);
    task()
      .then((done) => {
        setFailed(!done);
      })
      .catch(() => {
        setFailed(true);
      });
  };
  if (!props.hasHint && !props.skipped) return null;
  return (
    <View style={{ gap: spacing.sm }}>
      <ActionButtons
        skipped={props.skipped}
        run={run}
        onCandidates={setCandidates}
      />
      {candidates === null ? null : (
        <CandidateList
          candidates={candidates}
          onSend={(templateId) => {
            run(() => choice.choose(today(), templateId));
          }}
        />
      )}
      {failed ? (
        <AppText accessibilityRole="alert">{c.actionFailed}</AppText>
      ) : null}
    </View>
  );
}
