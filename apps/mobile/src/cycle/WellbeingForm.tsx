import type { CalendarDate } from "@parapka/domain";
import { useState } from "react";
import { View } from "react-native";

import { RatingButton } from "../checkin/CheckinForm";
import { t, type TranslationKey } from "../i18n";
import { Button, Field, Option } from "../onboarding/controls";
import { usePlatform } from "../platform/context";
import { AppText } from "../ui/AppText";
import { spacing } from "../ui/theme";
import { useCycleActions } from "./use-cycle-actions";
import {
  MAX_NOTE_LENGTH,
  WELLBEING_TAGS,
  type WellbeingEntry,
  type WellbeingTag,
} from "./wellbeing-validation";

const RATINGS = [1, 2, 3, 4, 5] as const;

/** One scale of 1–5; the chosen value can be touched again to clear it. */
function Scale(props: {
  title: string;
  name: string;
  selected: number | null;
  onPick: (value: number | null) => void;
}) {
  const { title, name, selected, onPick } = props;
  return (
    <View style={{ gap: spacing.xs }}>
      <AppText>{title}</AppText>
      <View
        role="radiogroup"
        accessibilityLabel={name}
        style={{ flexDirection: "row", gap: spacing.sm }}
      >
        {RATINGS.map((value) => (
          <RatingButton
            key={value}
            label={t("cycle.wellbeing.rating", { question: name, value })}
            value={value}
            checked={selected === value}
            onPick={() => {
              onPick(selected === value ? null : value);
            }}
          />
        ))}
      </View>
    </View>
  );
}

function Tags(props: {
  tags: readonly WellbeingTag[];
  onToggle: (tag: WellbeingTag) => void;
}) {
  return (
    <View role="group" accessibilityLabel={t("cycle.wellbeing.tags")}>
      <AppText>{t("cycle.wellbeing.tags")}</AppText>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {WELLBEING_TAGS.map((tag) => (
          <Option
            key={tag}
            multiple
            label={t(`cycle.wellbeing.tag.${tag}` as TranslationKey)}
            selected={props.tags.includes(tag)}
            onPress={() => {
              props.onToggle(tag);
            }}
          />
        ))}
      </View>
    </View>
  );
}

interface Draft {
  energy: number | null;
  mood: number | null;
  tension: number | null;
  desire: number | null;
  tags: readonly WellbeingTag[];
  note: string;
}

const EMPTY: Draft = {
  energy: null,
  mood: null,
  tension: null,
  desire: null,
  tags: [],
  note: "",
};

const draftOf = (initial: WellbeingEntry | null): Draft =>
  initial ? { ...EMPTY, ...initial } : EMPTY;

/** The optional parts of the entry: only the filled ones. */
function optionalOf({ desire, note }: Draft) {
  return {
    ...(desire === null ? {} : { desire }),
    ...(note.trim() === "" ? {} : { note }),
  };
}

/** The entry once the three required ratings are chosen; null before. */
function entryOf(date: CalendarDate, draft: Draft): WellbeingEntry | null {
  const { energy, mood, tension, tags } = draft;
  if (energy === null || mood === null || tension === null) return null;
  return { date, energy, mood, tension, tags, ...optionalOf(draft) };
}

function Scales(props: {
  draft: Draft;
  change: (patch: Partial<Draft>) => void;
}) {
  const { draft, change } = props;
  return (
    <>
      {(["energy", "mood", "tension"] as const).map((key) => (
        <Scale
          key={key}
          title={t(`cycle.wellbeing.${key}`)}
          name={t(`cycle.wellbeing.${key}`)}
          selected={draft[key]}
          onPick={(value) => {
            change({ [key]: value });
          }}
        />
      ))}
      <Scale
        title={t("cycle.wellbeing.desire")}
        name={t("cycle.wellbeing.desireName")}
        selected={draft.desire}
        onPick={(desire) => {
          change({ desire });
        }}
      />
    </>
  );
}

function Note(props: { note: string; onChange: (note: string) => void }) {
  const { note, onChange } = props;
  return (
    <>
      <Field
        label={t("cycle.wellbeing.note")}
        value={note}
        onChange={(text) => {
          onChange(text.slice(0, MAX_NOTE_LENGTH));
        }}
      />
      <AppText>
        {t("cycle.wellbeing.counter", {
          count: note.length,
          max: MAX_NOTE_LENGTH,
        })}
      </AppText>
    </>
  );
}

/** Today's wellbeing: three required scales, then the optional fields. */
export function WellbeingForm(props: {
  today: CalendarDate;
  initial: WellbeingEntry | null;
}) {
  const actions = useCycleActions(usePlatform());
  const [draft, setDraft] = useState(() => draftOf(props.initial));
  const change = (patch: Partial<Draft>) => {
    setDraft({ ...draft, ...patch });
  };
  const entry = entryOf(props.today, draft);
  return (
    <View style={{ marginTop: spacing.md, gap: spacing.md }}>
      <AppText accessibilityRole="header">{t("cycle.wellbeing.title")}</AppText>
      <Scales draft={draft} change={change} />
      <Tags
        tags={draft.tags}
        onToggle={(tag) => {
          change({
            tags: draft.tags.includes(tag)
              ? draft.tags.filter((x) => x !== tag)
              : [...draft.tags, tag],
          });
        }}
      />
      <Note
        note={draft.note}
        onChange={(note) => {
          change({ note });
        }}
      />
      <Button
        primary
        label={t("cycle.wellbeing.save")}
        disabled={entry === null}
        onPress={() => {
          if (entry !== null) void actions.saveWellbeing(entry);
        }}
      />
      <AppText>{t("cycle.wellbeing.privacy")}</AppText>
      {actions.error ? (
        <AppText accessibilityRole="alert">{actions.error}</AppText>
      ) : null}
    </View>
  );
}
