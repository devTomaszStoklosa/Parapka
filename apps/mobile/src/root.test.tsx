// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

afterEach(cleanup);

vi.mock("expo", () => ({ registerRootComponent: vi.fn() }));
vi.mock("expo-font", () => ({ useFonts: vi.fn(() => [false, null]) }));
vi.mock("@expo-google-fonts/bricolage-grotesque/700Bold", () => ({
  BricolageGrotesque_700Bold: 1,
}));
vi.mock("@expo-google-fonts/plus-jakarta-sans/400Regular", () => ({
  PlusJakartaSans_400Regular: 2,
}));
vi.mock("./App", () => ({ App: () => <p>app content</p> }));

import { Root } from "../index";

it("shows the app while the fonts have not loaded yet", () => {
  render(<Root />);
  expect(screen.getByText("app content")).toBeTruthy();
});
