import { View } from "react-native";
import type { IsoWeekday } from "@parapka/domain";

import { wireChores } from "../chores/wiring";
import { t, type TranslationKey } from "../i18n";
import { Option } from "../onboarding/controls";
import { usePlatform } from "../platform/context";
import { AppText } from "../ui/AppText";
import { spacing } from "../ui/theme";
import {
  useCheckinSchedule,
  type ScheduleSource,
} from "./use-checkin-schedule";
import { wireCheckin } from "./wiring";

const DAYS: Record<IsoWeekday, TranslationKey> = {
  1: "checkin.days.monday",
  2: "checkin.days.tuesday",
  3: "checkin.days.wednesday",
  4: "checkin.days.thursday",
  5: "checkin.days.friday",
  6: "checkin.days.saturday",
  7: "checkin.days.sunday",
};
const WEEKDAYS: readonly IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7];
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const MINUTES = [0, 15, 30, 45];

const pad = (value: number) => String(value).padStart(2, "0");

/** One radio group: the values to pick from, the selected one, one tap saves. */
function Choices(props: {
  label: string;
  values: readonly number[];
  labelOf: (value: number) => string;
  selected: number;
  onPick: (value: number) => void;
}) {
  const { label, values, labelOf, selected, onPick } = props;
  return (
    <View
      role="radiogroup"
      accessibilityLabel={label}
      style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}
    >
      {values.map((value) => (
        <Option
          key={value}
          label={labelOf(value)}
          selected={selected === value}
          onPress={() => {
            onPick(value);
          }}
        />
      ))}
    </View>
  );
}

/** The check-in day and time of the pair; nothing without a pair. */
export function CheckinScheduleSettings(props: ScheduleSource) {
  const { current, failed, change } = useCheckinSchedule(props);
  if (!current) return null;
  const day = t(DAYS[current.weekday]).toLocaleLowerCase("pl");
  return (
    <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
      <AppText style={{ fontWeight: "bold" }}>{t("checkin.title")}</AppText>
      <AppText>
        {t("checkin.current", {
          day,
          time: `${pad(current.hour)}:${pad(current.minute)}`,
        })}
      </AppText>
      <Choices
        label={t("checkin.dayGroup")}
        values={WEEKDAYS}
        labelOf={(value) => t(DAYS[value as IsoWeekday])}
        selected={current.weekday}
        onPick={(weekday) => {
          change({ weekday: weekday as IsoWeekday });
        }}
      />
      <Choices
        label={t("checkin.hourGroup")}
        values={HOURS}
        labelOf={(hour) => t("checkin.hour", { hour: pad(hour) })}
        selected={current.hour}
        onPick={(hour) => {
          change({ hour });
        }}
      />
      <Choices
        label={t("checkin.minuteGroup")}
        values={MINUTES}
        labelOf={(minute) => t("checkin.minute", { minute: pad(minute) })}
        selected={current.minute}
        onPick={(minute) => {
          change({ minute });
        }}
      />
      <AppText>{t("checkin.description")}</AppText>
      {failed ? (
        <AppText accessibilityRole="alert">{t("checkin.failed")}</AppText>
      ) : null}
    </View>
  );
}

/** The section with the repositories of the platform. */
export function CheckinScheduleEntry() {
  const platform = usePlatform();
  const { schedule } = wireCheckin(platform);
  const { pairs } = wireChores(platform);
  return <CheckinScheduleSettings schedule={schedule} pairs={pairs} />;
}
