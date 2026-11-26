// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ContentChange } from "@parapka/protocol";
import { afterEach, expect, it, vi } from "vitest";

import forbidden from "../../../../content/forbidden-phrases.json";
import {
  findPhrases,
  parseForbiddenLists,
} from "../../../../packages/content/src/forbidden";
import { HINT_CATEGORIES } from "../../../../packages/content/src/types";
import { colors, MIN_TOUCH_TARGET } from "../ui/theme";

import { wireCycleHints } from "../cycle/wiring";
import { pl } from "../i18n/pl";
import { PlatformProvider, type Platform } from "../platform/context";
import {
  press,
  receiveProfile,
  setup,
  useSodium,
} from "../chores/planner-test-support";
import { PartnerHintCard } from "./PartnerHintCard";

useSodium();
afterEach(cleanup);

const c = pl.todayHint;
const TODAY = "2026-11-11";

const hint = (
  id: string,
  forDate: string,
  status = "scheduled",
): ContentChange => {
  const field = (value: string) => ({ value, hlc: "000000000000001-00000-a" });
  return {
    entity: "Hint",
    id,
    op: "upsert",
    fields: {
      forDate: field(forDate),
      text: field(`Tekst ${id}`),
      category: field("space"),
      status: field(status),
    },
  };
};

const showCard = (platform: Platform) =>
  render(
    <PlatformProvider platform={platform}>
      <PartnerHintCard />
    </PlatformProvider>,
  );

/** The rendered card of a phone whose received hints are `changes`. */
async function rendered(changes: ContentChange[], name?: string) {
  const { platform } = await setup(true);
  const { received } = wireCycleHints(platform);
  for (const change of changes) await received.merge(change);
  if (name) await receiveProfile(platform, name);
  const view = showCard(platform);
  await waitFor(() => {
    expect(view.container.innerHTML).not.toBe("");
  });
  return { platform, view };
}

it("shows nothing without any received hint", async () => {
  const { platform } = await setup(true);
  const view = showCard(platform);
  await act(() => Promise.resolve());
  expect(view.container.innerHTML).toBe("");
});

it("shows the hint of today with the name of the partner", async () => {
  await rendered([hint("h1", TODAY)], "Ola");
  expect(await screen.findByText("Wskazówka na dziś · Ola")).toBeTruthy();
  expect(screen.getByText("Tekst h1")).toBeTruthy();
  expect(screen.getAllByRole("radio")).toHaveLength(2);
});

it("says 'from the partner' while the name has not arrived", async () => {
  await rendered([hint("h1", TODAY)]);
  expect(await screen.findByText(c.titleNoName)).toBeTruthy();
});

it("keeps the reaction and lets the person change it", async () => {
  const { platform } = await rendered([hint("h1", TODAY)]);
  await press(c.done, "radio");
  await waitFor(() => {
    expect(
      screen.getByRole("radio", { name: c.done }).getAttribute("aria-checked"),
    ).toBe("true");
  });
  expect(await wireCycleHints(platform).reactions.get("h1")).toBe("done");
  await press(c.notToday, "radio");
  await waitFor(() => {
    expect(
      screen
        .getByRole("radio", { name: c.notToday })
        .getAttribute("aria-checked"),
    ).toBe("true");
  });
  expect(
    screen.getByRole("radio", { name: c.done }).getAttribute("aria-checked"),
  ).toBe("false");
});

it("looks the same without a hint of today, with a skipped one and in a pause", async () => {
  const none = await rendered([hint("old", "2026-11-10")]);
  const noneTree = none.view.container.innerHTML;
  cleanup();

  const skipped = await rendered([
    hint("old", "2026-11-10"),
    hint("h1", TODAY, "skipped"),
  ]);
  const skippedTree = skipped.view.container.innerHTML;
  cleanup();

  // The pause takes the hint of today back (the hint stays only for the days before).
  const paused = await rendered([hint("old", "2026-11-10"), hint("h1", TODAY)]);
  await act(() =>
    wireCycleHints(paused.platform).received.forgetSent(TODAY, "9".repeat(21)),
  );
  await waitFor(() => {
    expect(screen.queryByText("Tekst h1")).toBeNull();
  });
  const pausedTree = paused.view.container.innerHTML;

  expect(noneTree).toContain(c.none);
  expect(skippedTree).toBe(noneTree);
  expect(pausedTree).toBe(noneTree);
  expect(screen.queryByRole("radio")).toBeNull();
});

it("shows no card without a shown history, whatever the reason of the missing hint", async () => {
  const trees: string[] = [];
  const empty = async (changes: ContentChange[], pause = false) => {
    const { platform } = await setup(true);
    const { received } = wireCycleHints(platform);
    for (const change of changes) await received.merge(change);
    if (pause) await received.forgetSent(TODAY, "9".repeat(21));
    const view = showCard(platform);
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    trees.push(view.container.innerHTML);
    cleanup();
  };
  await empty([]);
  await empty([hint("h1", TODAY, "skipped")]);
  await empty([
    hint("h1", TODAY, "skipped"),
    hint("p1", "2026-11-10", "skipped"),
  ]);
  await empty([hint("h1", TODAY)], true);
  expect(trees).toEqual(["", "", "", ""]);
});

it("shows the card regardless of an own hint (FR-CYC-14)", async () => {
  const { platform } = await setup(true);
  const { received, hints } = wireCycleHints(platform);
  await hints.put({
    templateId: "t",
    contentVersion: 1,
    category: "space",
    date: TODAY,
    text: "Własna wskazówka",
  });
  await received.merge(hint("h1", TODAY));
  showCard(platform);
  expect(await screen.findByText("Tekst h1")).toBeTruthy();
  expect(screen.queryByText("Własna wskazówka")).toBeNull();
});

it("loads the card again after a change from the synchronization", async () => {
  const { platform } = await rendered([hint("old", "2026-11-10")]);
  expect(screen.getByText(c.none)).toBeTruthy();
  await act(() => wireCycleHints(platform).received.merge(hint("h1", TODAY)));
  expect(await screen.findByText("Tekst h1")).toBeTruthy();
  await act(() => wireCycleHints(platform).received.forgetReceived());
  await waitFor(() => {
    expect(screen.queryByText("Tekst h1")).toBeNull();
  });
  expect(screen.queryByText(c.none)).toBeNull();
});

it("says so when the hint did not load and does not crash", async () => {
  const { platform } = await setup(true);
  const { received } = wireCycleHints(platform);
  vi.spyOn(received, "today").mockRejectedValue(new Error("broken"));
  showCard(platform);
  expect((await screen.findByRole("alert")).textContent).toBe(c.failed);
});

it("says so when the reaction did not save and clears it on the next try", async () => {
  const { platform } = await rendered([hint("h1", TODAY)]);
  const { reactions } = wireCycleHints(platform);
  const set = vi.spyOn(reactions, "set").mockRejectedValueOnce(new Error("x"));
  await press(c.done, "radio");
  expect((await screen.findByRole("alert")).textContent).toBe(c.failed);
  set.mockRestore();
  await press(c.done, "radio");
  await waitFor(() => {
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

const openHistory = () => {
  fireEvent.click(screen.getByRole("button", { name: c.history }));
};

it("has no history section without past hints", async () => {
  await rendered([hint("h1", TODAY)]);
  expect(screen.queryByRole("button", { name: c.history })).toBeNull();
});

it("lists the past hints without today and the skipped ones, with the reactions", async () => {
  const { platform } = await rendered([
    hint("h1", TODAY),
    hint("p1", "2026-11-10"),
    hint("p2", "2026-11-09"),
    hint("p3", "2026-11-08", "skipped"),
  ]);
  await wireCycleHints(platform).reactions.set("p1", "done");
  const button = await screen.findByRole("button", { name: c.history });
  expect(button.getAttribute("aria-expanded")).toBe("false");
  openHistory();
  expect(await screen.findByText("Tekst p1")).toBeTruthy();
  expect(screen.getByText("wt., 10 listopada")).toBeTruthy();
  expect(screen.getByText("Tekst p2")).toBeTruthy();
  expect(screen.queryByText("Tekst p3")).toBeNull();
  expect(screen.getAllByText(c.done)).toHaveLength(1);
});

it("refreshes the history after a change of a reaction or of the synchronization", async () => {
  const { platform } = await rendered([
    hint("h1", TODAY),
    hint("p1", "2026-11-10"),
  ]);
  const { received, reactions } = wireCycleHints(platform);
  openHistory();
  expect(screen.queryByText(c.notToday)).toBeNull();
  await act(() => reactions.set("p1", "notToday"));
  await waitFor(() => {
    expect(screen.getAllByText(c.notToday)).toHaveLength(1);
  });
  await act(() => received.merge(hint("p2", "2026-11-09")));
  expect(await screen.findByText("Tekst p2")).toBeTruthy();
  await act(() => received.forgetReceived());
  await waitFor(() => {
    expect(screen.queryByText("Tekst p2")).toBeNull();
  });
});

it("says so when the history did not load and does not crash", async () => {
  const { platform } = await setup(true);
  const { received } = wireCycleHints(platform);
  vi.spyOn(received, "history").mockRejectedValue(new Error("broken"));
  showCard(platform);
  expect((await screen.findByRole("alert")).textContent).toBe(c.failed);
  expect(screen.queryByRole("button", { name: c.history })).toBeNull();
});

it("shows the chips, the privacy line and the reactions as before", async () => {
  const { view } = await rendered([hint("h1", TODAY)], "Ola");
  await screen.findByText(c.chip);
  expect(screen.getByText(c.categories.space)).toBeTruthy();
  expect(
    screen.getByText(
      "Wskazówka powstała na telefonie Ola. Dane, z których powstała, zostają na tamtym telefonie.",
    ),
  ).toBeTruthy();
  expect(screen.getByRole("heading").textContent).toBe(
    "Wskazówka na dziś · Ola",
  );
  const radios = screen.getAllByRole("radio");
  expect(radios.map((radio) => radio.getAttribute("aria-label"))).toEqual([
    c.done,
    c.notToday,
  ]);
  for (const radio of radios) {
    expect(
      Number.parseInt(getComputedStyle(radio).minHeight, 10),
    ).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  }
  // The icons are decorative: hidden from the accessibility tree.
  for (const icon of view.container.querySelectorAll("svg")) {
    expect(icon.getAttribute("aria-hidden")).toBe("true");
  }
});

it("names the partner in the privacy line when the name has not arrived", async () => {
  await rendered([hint("h1", TODAY)]);
  expect(
    await screen.findByText(
      `Wskazówka powstała na telefonie ${c.privacyPartner}. Dane, z których powstała, zostają na tamtym telefonie.`,
    ),
  ).toBeTruthy();
});

it("does not use the danger color: the color of the person is not a rating", async () => {
  const { view } = await rendered([hint("h1", TODAY)], "Ola");
  await screen.findByText(c.chip);
  const hex = colors.danger.replace("#", "");
  const rgb = [0, 2, 4]
    .map((at) => Number.parseInt(hex.slice(at, at + 2), 16))
    .join(", ");
  expect(view.container.innerHTML).not.toContain(`rgb(${rgb})`);
});

it("has the privacy line and the categories free of the forbidden words", () => {
  const lists = parseForbiddenLists(forbidden);
  const stems = [...lists.revealing, ...lists.medical, ...lists.sexual];
  const texts = [
    c.chip,
    c.privacy.replace("{name}", c.privacyPartner),
    ...HINT_CATEGORIES.map((category) => c.categories[category]),
  ];
  for (const text of texts) {
    expect(findPhrases(text, stems)).toEqual([]);
  }
});
