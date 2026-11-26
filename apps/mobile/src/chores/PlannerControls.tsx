import { Pressable, View } from "react-native";

import { t, type TranslationKey } from "../i18n";
import { AppText } from "../ui/AppText";
import { colors, MIN_TOUCH_TARGET, radii, spacing } from "../ui/theme";
import type { PlannerFilter, PlannerView } from "./planner-model";

const VIEWS: readonly PlannerView[] = ["today", "week", "all"];
const FILTERS: readonly PlannerFilter[] = ["all", "mine", "partner", "shared"];

interface ChoiceProps<T extends string> {
  label: TranslationKey;
  options: readonly T[];
  selected: T;
  /** A segmented control on a track, or separate chips. */
  look: "segmented" | "chips";
  text: (option: T) => string;
  onSelect: (option: T) => void;
}

function ChoiceOption(props: {
  text: string;
  checked: boolean;
  segmented: boolean;
  onPress: () => void;
}) {
  const { checked, segmented } = props;
  const dark = checked && !segmented;
  const filled = checked ? colors.surface : "transparent";
  return (
    <Pressable
      accessibilityRole="radio"
      aria-checked={checked}
      accessibilityState={{ checked }}
      onPress={props.onPress}
      style={{
        flex: segmented ? 1 : undefined,
        minHeight: MIN_TOUCH_TARGET,
        minWidth: MIN_TOUCH_TARGET,
        paddingHorizontal: spacing.md,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: radii.pill,
        borderWidth: segmented ? 0 : 1,
        borderColor: dark ? colors.text : colors.border,
        backgroundColor: dark ? colors.text : filled,
      }}
    >
      <AppText
        style={{
          fontWeight: checked ? "700" : "400",
          color: dark ? colors.onAccent : colors.text,
        }}
      >
        {props.text}
      </AppText>
    </Pressable>
  );
}

function Choice<T extends string>(props: ChoiceProps<T>) {
  const segmented = props.look === "segmented";
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={t(props.label)}
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: segmented ? 0 : spacing.sm,
        marginTop: spacing.sm,
        padding: segmented ? spacing.xs : 0,
        borderRadius: radii.pill,
        backgroundColor: segmented ? colors.track : "transparent",
      }}
    >
      {props.options.map((option) => (
        <ChoiceOption
          key={option}
          text={props.text(option)}
          checked={option === props.selected}
          segmented={segmented}
          onPress={() => {
            props.onSelect(option);
          }}
        />
      ))}
    </View>
  );
}

export function PlannerControls(props: {
  view: PlannerView;
  filter: PlannerFilter;
  /** The filter by person needs a pair. */
  showFilter: boolean;
  onView: (view: PlannerView) => void;
  onFilter: (filter: PlannerFilter) => void;
}) {
  return (
    <View>
      <Choice
        label="planner.views.label"
        options={VIEWS}
        selected={props.view}
        look="segmented"
        text={(view) => t(`planner.views.${view}`)}
        onSelect={props.onView}
      />
      {props.showFilter ? (
        <Choice
          label="planner.filters.label"
          options={FILTERS}
          selected={props.filter}
          look="chips"
          text={(filter) => t(`planner.filters.${filter}`)}
          onSelect={props.onFilter}
        />
      ) : null}
    </View>
  );
}
