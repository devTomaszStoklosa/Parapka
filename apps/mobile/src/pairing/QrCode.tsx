import { useMemo } from "react";
import { View } from "react-native";

import { t } from "../i18n";
import { qrMatrix } from "./invitation-link";

const CELL = 4;
/** Empty modules around the code, so scanners find its edges. */
const QUIET_ZONE = 4;

/** The QR code of `link`, drawn with squares of `View` (no SVG). */
export function QrCode({ link }: { link: string }) {
  const matrix = useMemo(() => qrMatrix(link), [link]);
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={t("pairing.invitation.qrLabel")}
      style={{
        alignSelf: "center",
        padding: QUIET_ZONE * CELL,
        backgroundColor: "#FFFFFF",
      }}
    >
      {matrix.map((row, y) => (
        <View key={y} style={{ flexDirection: "row" }}>
          {row.map((dark, x) => (
            <View
              key={x}
              style={{
                width: CELL,
                height: CELL,
                backgroundColor: dark ? "#000000" : "#FFFFFF",
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}
