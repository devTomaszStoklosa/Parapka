import { View } from "react-native";

const MODULE_SIZE = 4;
const QUIET_ZONE = 4;

interface Run {
  readonly dark: boolean;
  readonly length: number;
}

/** Neighbouring modules of one colour become one `View`. */
export function runsOfRow(row: readonly boolean[]): Run[] {
  const runs: { dark: boolean; length: number }[] = [];
  for (const dark of row) {
    const last = runs[runs.length - 1];
    if (last?.dark === dark) last.length += 1;
    else runs.push({ dark, length: 1 });
  }
  return runs;
}

/** Draws a QR matrix with squares, without SVG. Dark on white, with a quiet zone. */
export function QrView({
  matrix,
  accessibilityLabel,
}: {
  matrix: readonly (readonly boolean[])[];
  accessibilityLabel: string;
}) {
  const quiet = Array<boolean>(matrix.length + 2 * QUIET_ZONE).fill(false);
  const padded = [
    ...Array<readonly boolean[]>(QUIET_ZONE).fill(quiet),
    ...matrix.map((row) => [
      ...Array<boolean>(QUIET_ZONE).fill(false),
      ...row,
      ...Array<boolean>(QUIET_ZONE).fill(false),
    ]),
    ...Array<readonly boolean[]>(QUIET_ZONE).fill(quiet),
  ];
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={{ backgroundColor: "#FFFFFF", alignSelf: "center" }}
    >
      {padded.map((row, y) => (
        <View key={y} style={{ flexDirection: "row", height: MODULE_SIZE }}>
          {runsOfRow(row).map((run, x) => (
            <View
              key={x}
              style={{
                width: run.length * MODULE_SIZE,
                height: MODULE_SIZE,
                backgroundColor: run.dark ? "#000000" : "#FFFFFF",
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}
