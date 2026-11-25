// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { AppText } from "./AppText";
import { fonts } from "./theme";

afterEach(cleanup);

it("uses the heading font for the title variant", () => {
  const { getByText } = render(<AppText variant="title">Hello</AppText>);
  expect(getByText("Hello").style.fontFamily).toContain(fonts.heading);
});

it("uses the body font for the body variant", () => {
  const { getByText } = render(<AppText>Hello</AppText>);
  expect(getByText("Hello").style.fontFamily).toContain(fonts.body);
});
