import { Pressable, View } from "react-native";

import { t, type TranslationKey } from "../i18n";
import { AppText } from "../ui/AppText";
import { colors, MIN_TOUCH_TARGET, spacing } from "../ui/theme";
import type { PlannerFilter, PlannerView } from "./planner-model";

const VIEWS: readonly PlannerView[] = ["today", "week", "all"];
const FILTERS: readonly PlannerFilter[] = ["all", "mine", "partner", "shared"];

interface ChoiceProps<T extends string> {
  label: TranslationKey;
  options: readonly T[];
  selected: T;
  text: (option: T) => string;
  onSelect: (option: T) => void;
}

function Choice<T extends string>(props: ChoiceProps<T>) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={t(props.label)}
      style={{ flexDirection: "row", marginTop: spacing.sm }}
    >
      {props.options.map((option) => {
        const checked = option === props.selected;
        return (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityState={{ checked }}
            onPress={() => {
              props.onSelect(option);
            }}
            style={{
              flex: 1,
              minHeight: MIN_TOUCH_TARGET,
              minWidth: MIN_TOUCH_TARGET,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: checked ? colors.accent : colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <AppText style={{ color: checked ? colors.onAccent : colors.text }}>
              {props.text(option)}
            </AppText>
          </Pressable>
        );
      })}
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
        text={(view) => t(`planner.views.${view}`)}
        onSelect={props.onView}
      />
      {props.showFilter ? (
        <Choice
          label="planner.filters.label"
          options={FILTERS}
          selected={props.filter}
          text={(filter) => t(`planner.filters.${filter}`)}
          onSelect={props.onFilter}
        />
      ) : null}
    </View>
  );
}
