import { useState } from "react";
import { View } from "react-native";

import { t } from "../i18n";
import { Button } from "../onboarding/controls";
import { usePlatform } from "../platform/context";
import { spacing } from "../ui/theme";
import { BrainDump } from "./BrainDump";
import { DumpOfferCard } from "./DumpOfferCard";
import { QuickAdd } from "./QuickAdd";
import { useDumpOffer } from "./use-dump-offer";

interface Props {
  readonly paired: boolean;
  readonly partnerName: string | null;
}

/** The quick add, or the brain dump in its place, and the invitation to it. */
export function HeadCapture(props: Props) {
  const offer = useDumpOffer(usePlatform());
  const [dumping, setDumping] = useState(false);
  if (dumping) {
    return (
      <BrainDump
        onClose={() => {
          setDumping(false);
        }}
      />
    );
  }
  return (
    <View style={{ gap: spacing.sm }}>
      {offer.due ? (
        <DumpOfferCard
          onStart={() => {
            setDumping(true);
          }}
          onDismiss={offer.dismiss}
        />
      ) : null}
      <QuickAdd {...props} />
      <Button
        label={t("head.dump.open")}
        onPress={() => {
          setDumping(true);
        }}
      />
    </View>
  );
}
