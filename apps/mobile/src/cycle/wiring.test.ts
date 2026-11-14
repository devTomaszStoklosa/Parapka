import { expect, it } from "vitest";

import { setup } from "../sync/wiring-test-support";
import { wireCycle } from "./wiring";

it("shares one cycle facade per platform", async () => {
  const { platform } = await setup();
  const other = await setup();
  expect(wireCycle(platform)).toBe(wireCycle(platform));
  expect(wireCycle(platform)).not.toBe(wireCycle(other.platform));
});
