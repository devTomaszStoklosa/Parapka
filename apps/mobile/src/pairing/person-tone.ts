/** The colour of a person in the pair: the tokens `personA` and `personB` of the theme. */
export type PersonTone = "personA" | "personB";

export interface PersonTones {
  readonly own: PersonTone;
  readonly partner: PersonTone;
}

/** Before the keys are read and without a pair. */
export const DEFAULT_PERSON_TONES: PersonTones = {
  own: "personA",
  partner: "personB",
};

/**
 * The person with the lexicographically smaller signing key (base64url) gets `personA`. Both
 * phones know both keys, so they agree on the colours without any data of their own.
 */
export function personTones(
  ownSigningKey: string,
  partnerSigningKey: string,
): PersonTones {
  return ownSigningKey < partnerSigningKey
    ? { own: "personA", partner: "personB" }
    : { own: "personB", partner: "personA" };
}
