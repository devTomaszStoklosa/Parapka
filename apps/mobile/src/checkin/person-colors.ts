import type { PersonTone } from "../pairing/person-tone";
import type { ChipTone } from "../ui/Chip";
import { colors } from "../ui/theme";

/** The colors of one person; they depend on the person only, never on a value. */
export interface PersonColors {
  readonly dot: string;
  readonly text: string;
  readonly tint: string;
  readonly chip: ChipTone;
}

const byTone = {
  personA: {
    dot: colors.personA,
    text: colors.personAText,
    tint: colors.personATint,
    chip: "personA",
  },
  personB: {
    dot: colors.personB,
    text: colors.personBText,
    tint: colors.personBTint,
    chip: "personB",
  },
} as const satisfies Record<PersonTone, PersonColors>;

export function personColors(tone: PersonTone): PersonColors {
  return byTone[tone];
}
