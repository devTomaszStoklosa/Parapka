// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { t } from "../i18n";
import { ResetScreen } from "./ResetScreen";

afterEach(cleanup);

it("resets only after two confirmations and describes what is lost", async () => {
  const onReset = vi.fn().mockResolvedValue(undefined);
  const onDone = vi.fn();
  render(<ResetScreen onReset={onReset} onCancel={vi.fn()} onDone={onDone} />);
  expect(screen.getByText(t("lock.reset.description"))).toBeTruthy();
  expect(onReset).not.toHaveBeenCalled();

  fireEvent.click(
    screen.getByRole("button", { name: t("lock.reset.continue") }),
  );
  expect(onReset).not.toHaveBeenCalled();
  expect(screen.getByText(t("lock.reset.confirmDescription"))).toBeTruthy();

  fireEvent.click(
    screen.getByRole("button", { name: t("lock.reset.confirm") }),
  );
  await vi.waitFor(() => {
    expect(onDone).toHaveBeenCalled();
  });
  expect(onReset).toHaveBeenCalledTimes(1);
});

it("cancels without a reset", () => {
  const onReset = vi.fn();
  const onCancel = vi.fn();
  render(
    <ResetScreen onReset={onReset} onCancel={onCancel} onDone={vi.fn()} />,
  );
  fireEvent.click(screen.getByRole("button", { name: t("lock.reset.cancel") }));
  expect(onCancel).toHaveBeenCalled();
  expect(onReset).not.toHaveBeenCalled();
});
