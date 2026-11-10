import { View } from "react-native";

import { t } from "../i18n";
import { Option } from "../onboarding/controls";
import { AppText } from "../ui/AppText";
import { spacing } from "../ui/theme";
import type { ConsentCategory, ConsentStates } from "./consent-model";

/** Every category with what the partner will see, and its switch. */
export function ConsentToggles({
  categories,
  states,
  onChange,
}: {
  categories: readonly ConsentCategory[];
  states: ConsentStates;
  onChange: (category: ConsentCategory, enabled: boolean) => void;
}) {
  return (
    <View style={{ gap: spacing.md }}>
      {categories.map((category) => (
        <View key={category} style={{ gap: spacing.xs }}>
          <Option
            multiple
            label={t(`consent.categories.${category}.title`)}
            selected={states[category]}
            onPress={() => {
              onChange(category, !states[category]);
            }}
          />
          <AppText>{t(`consent.categories.${category}.description`)}</AppText>
        </View>
      ))}
    </View>
  );
}
