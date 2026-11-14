// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { pl } from "../i18n/pl";
import { CheckinForm } from "./CheckinForm";

const f = pl.checkin.form;
const rate = (question: string, value: number) => {
  fireEvent.click(
    screen.getByRole("radio", { name: `${question}: ${String(value)} z 5` }),
  );
};
const save = () => screen.getByRole("button", { name: f.save });
const need = () => screen.getByLabelText<HTMLInputElement>(f.need);

afterEach(cleanup);

it("shows three scales of five radio buttons with accessible labels", () => {
  render(<CheckinForm initial={null} onSubmit={vi.fn()} />);
  expect(screen.getAllByRole("radio")).toHaveLength(15);
  for (const question of [f.mood, f.energy, f.closeness]) {
    expect(screen.getByRole("radiogroup", { name: question })).toBeTruthy();
    expect(
      screen.getByRole("radio", { name: `${question}: 4 z 5` }),
    ).toBeTruthy();
  }
  expect(screen.getByText(f.closeness)).toBeTruthy();
});

it("enables Save only after three ratings", () => {
  const onSubmit = vi.fn();
  render(<CheckinForm initial={null} onSubmit={onSubmit} />);
  expect(save().hasAttribute("disabled")).toBe(true);
  fireEvent.click(save());
  rate(f.mood, 4);
  rate(f.energy, 2);
  expect(save().hasAttribute("disabled")).toBe(true);
  rate(f.closeness, 5);
  expect(save().hasAttribute("disabled")).toBe(false);
  expect(
    screen
      .getByRole("radio", { name: `${f.closeness}: 5 z 5` })
      .getAttribute("aria-checked"),
  ).toBe("true");
  fireEvent.click(save());
  expect(onSubmit).toHaveBeenCalledWith({ mood: 4, energy: 2, closeness: 5 });
});

it("sends the need trimmed, and nothing when it is blank", () => {
  const onSubmit = vi.fn();
  render(<CheckinForm initial={null} onSubmit={onSubmit} />);
  rate(f.mood, 1);
  rate(f.energy, 1);
  rate(f.closeness, 1);
  fireEvent.change(need(), { target: { value: "  spokoju " } });
  fireEvent.click(save());
  expect(onSubmit).toHaveBeenLastCalledWith({
    mood: 1,
    energy: 1,
    closeness: 1,
    need: "spokoju",
  });
  fireEvent.change(need(), { target: { value: "   " } });
  fireEvent.click(save());
  expect(onSubmit).toHaveBeenLastCalledWith({
    mood: 1,
    energy: 1,
    closeness: 1,
  });
});

it("limits the need to 140 characters and counts them", () => {
  render(<CheckinForm initial={null} onSubmit={vi.fn()} />);
  expect(screen.getByText("0/140")).toBeTruthy();
  fireEvent.change(need(), { target: { value: "a".repeat(200) } });
  expect(need().value).toHaveLength(140);
  expect(screen.getByText("140/140")).toBeTruthy();
});

it("inserts the hints into the need", () => {
  render(<CheckinForm initial={null} onSubmit={vi.fn()} />);
  expect(screen.getByRole("group", { name: f.hintGroup })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: f.hints.self }));
  expect(need().value).toBe(f.hints.self);
  fireEvent.click(screen.getByRole("button", { name: f.hints.together }));
  expect(need().value).toBe(`${f.hints.self} ${f.hints.together}`);
  expect(screen.getByRole("button", { name: f.hints.help })).toBeTruthy();
});

it("starts from the current answers", () => {
  render(
    <CheckinForm
      initial={{ mood: 2, energy: 3, closeness: 4, need: "ciszy" }}
      onSubmit={vi.fn()}
    />,
  );
  expect(need().value).toBe("ciszy");
  expect(save().hasAttribute("disabled")).toBe(false);
  expect(
    screen
      .getByRole("radio", { name: `${f.energy}: 3 z 5` })
      .getAttribute("aria-checked"),
  ).toBe("true");
});
