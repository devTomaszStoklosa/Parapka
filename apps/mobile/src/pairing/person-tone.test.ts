import { expect, it } from "vitest";

import { personTones } from "./person-tone";

const KEYS = ["AAAA", "BBBB", "aaaa", "A-_x", "zzzz"];

it("gives the smaller key personA", () => {
  expect(personTones("AAAA", "BBBB")).toEqual({
    own: "personA",
    partner: "personB",
  });
  expect(personTones("BBBB", "AAAA")).toEqual({
    own: "personB",
    partner: "personA",
  });
});

it("gives the two phones opposite assignments for any pair of keys", () => {
  for (const x of KEYS) {
    for (const y of KEYS.filter((key) => key !== x)) {
      const one = personTones(x, y);
      const other = personTones(y, x);
      expect(one.own).toBe(other.partner);
      expect(one.partner).toBe(other.own);
      expect(one.own).not.toBe(one.partner);
    }
  }
});
