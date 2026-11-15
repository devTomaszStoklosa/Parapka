// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { setup, show, useSodium } from "./planner-test-support";

useSodium();
afterEach(cleanup);

it("marks a chore made from a thing, and only that one", async () => {
  const { platform, chores } = await setup(false);
  const rule = { kind: "occasional", dueDate: "2026-11-11" } as const;
  const assignment = { kind: "person", person: "me" } as const;
  await chores.add({ title: "Z głowy", rule, assignment, linkedItemId: "i-1" });
  await chores.add({ title: "Zwykły", rule, assignment });
  show(platform);
  await screen.findByText("Z głowy");
  expect(screen.getAllByText("Z Głowy")).toHaveLength(1);
  expect(screen.getByLabelText(/^Z głowy, .*Z Głowy/)).toBeTruthy();
  expect(
    screen.getByLabelText(/^Zwykły, /).getAttribute("aria-label"),
  ).not.toContain("Z Głowy");
});
