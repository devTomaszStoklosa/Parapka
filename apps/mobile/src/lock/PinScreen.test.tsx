// @vitest-environment jsdom
import type { Clock } from "@parapka/domain";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { t } from "../i18n";
import { PinScreen } from "./PinScreen";

afterEach(cleanup);

const clock: Clock = { nowMs: () => 0 };

function typePin(pin: string) {
  pin.split("").forEach((digit, index) => {
    fireEvent.change(
      screen.getByLabelText(t("lock.pin.digit", { position: index + 1 })),
      { target: { value: digit } },
    );
  });
}

it("shows six labelled digit fields", () => {
  render(
    <PinScreen
      mode="unlock"
      clock={clock}
      onAttempt={vi.fn()}
      onDone={vi.fn()}
    />,
  );
  for (let i = 1; i <= 6; i++) {
    expect(screen.getByLabelText(`Cyfra ${String(i)} z 6`)).toBeTruthy();
  }
});

it("unlocks with the right PIN", async () => {
  const onAttempt = vi.fn().mockResolvedValue({ status: "ok" });
  const onDone = vi.fn();
  render(
    <PinScreen
      mode="unlock"
      clock={clock}
      onAttempt={onAttempt}
      onDone={onDone}
    />,
  );
  typePin("123456");
  await vi.waitFor(() => {
    expect(onDone).toHaveBeenCalled();
  });
  expect(onAttempt).toHaveBeenCalledWith("123456");
});

it("tells about the delay in neutral words", async () => {
  const onAttempt = vi
    .fn()
    .mockResolvedValue({ status: "wrong", delayMs: 30_000 });
  render(
    <PinScreen
      mode="unlock"
      clock={clock}
      onAttempt={onAttempt}
      onDone={vi.fn()}
    />,
  );
  typePin("111111");
  expect(
    await screen.findByText(t("lock.pin.delay", { seconds: 30 })),
  ).toBeTruthy();
  expect(screen.getByText(t("lock.pin.wrong"))).toBeTruthy();
  const field = screen.getByLabelText<HTMLInputElement>("Cyfra 1 z 6");
  expect(field.readOnly).toBe(true);
});

it("calls onForgot from the link", () => {
  const onForgot = vi.fn();
  render(
    <PinScreen
      mode="unlock"
      clock={clock}
      onAttempt={vi.fn()}
      onDone={vi.fn()}
      onForgot={onForgot}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: t("lock.pin.forgot") }));
  expect(onForgot).toHaveBeenCalled();
});

it("sets a PIN only after it was typed twice", async () => {
  const onSetPin = vi.fn().mockResolvedValue(undefined);
  const onDone = vi.fn();
  render(
    <PinScreen mode="set" clock={clock} onSetPin={onSetPin} onDone={onDone} />,
  );
  expect(screen.getByText(t("lock.pin.setTitle"))).toBeTruthy();
  typePin("123456");
  expect(await screen.findByText(t("lock.pin.confirmTitle"))).toBeTruthy();
  typePin("123456");
  await vi.waitFor(() => {
    expect(onDone).toHaveBeenCalled();
  });
  expect(onSetPin).toHaveBeenCalledWith("123456");
});

it("starts again when the two entries differ", async () => {
  const onSetPin = vi.fn();
  render(
    <PinScreen mode="set" clock={clock} onSetPin={onSetPin} onDone={vi.fn()} />,
  );
  typePin("123456");
  await screen.findByText(t("lock.pin.confirmTitle"));
  typePin("654321");
  expect(await screen.findByText(t("lock.pin.mismatch"))).toBeTruthy();
  expect(screen.getByText(t("lock.pin.setTitle"))).toBeTruthy();
  expect(onSetPin).not.toHaveBeenCalled();
});

it("asks for the current PIN before a change", async () => {
  const onAttempt = vi.fn().mockResolvedValue({ status: "ok" });
  const onSetPin = vi.fn().mockResolvedValue(undefined);
  const onDone = vi.fn();
  render(
    <PinScreen
      mode="change"
      clock={clock}
      onAttempt={onAttempt}
      onSetPin={onSetPin}
      onDone={onDone}
    />,
  );
  expect(screen.getByText(t("lock.pin.currentTitle"))).toBeTruthy();
  typePin("111111");
  await screen.findByText(t("lock.pin.newTitle"));
  typePin("222222");
  await screen.findByText(t("lock.pin.confirmTitle"));
  typePin("222222");
  await vi.waitFor(() => {
    expect(onDone).toHaveBeenCalled();
  });
  expect(onSetPin).toHaveBeenCalledWith("222222");
});
