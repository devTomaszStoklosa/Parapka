// @vitest-environment jsdom
import type { Clock } from "@parapka/domain";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { t } from "../i18n";
import { PinScreen } from "./PinScreen";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

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
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  const onAttempt = vi
    .fn()
    .mockResolvedValue({ status: "wrong", delayMs: 30_000 });
  const { unmount } = render(
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
  act(() => {
    vi.advanceTimersByTime(1000);
  });
  unmount();
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

it("keeps the fields active after a wrong PIN before the 5th mistake", async () => {
  // The screen was mounted at 0, the attempt happens at 5 000 (the old bug).
  let now = 0;
  const testClock: Clock = { nowMs: () => now };
  const onAttempt = vi
    .fn()
    .mockImplementationOnce(() => {
      now = 5_000;
      return Promise.resolve({ status: "wrong", delayMs: 0 });
    })
    .mockResolvedValue({ status: "ok" });
  const onDone = vi.fn();
  render(
    <PinScreen
      mode="unlock"
      clock={testClock}
      onAttempt={onAttempt}
      onDone={onDone}
    />,
  );
  typePin("111111");
  expect(await screen.findByText(t("lock.pin.wrong"))).toBeTruthy();
  expect(screen.queryByText(/Kolejna próba/)).toBeNull();
  expect(screen.getByLabelText<HTMLInputElement>("Cyfra 1 z 6").readOnly).toBe(
    false,
  );
  typePin("123456");
  await vi.waitFor(() => {
    expect(onDone).toHaveBeenCalled();
  });
});

it("counts the delay down every second to zero, then enables the fields", async () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  let now = 0;
  const testClock: Clock = { nowMs: () => now };
  render(
    <PinScreen
      mode="unlock"
      clock={testClock}
      onAttempt={vi.fn().mockResolvedValue({ status: "wrong", delayMs: 3_000 })}
      onDone={vi.fn()}
    />,
  );
  typePin("111111");
  expect(
    await screen.findByText(t("lock.pin.delay", { seconds: 3 })),
  ).toBeTruthy();
  // Let the effect with setInterval run before the clock is advanced.
  await act(() => Promise.resolve());
  for (const seconds of [2, 1]) {
    now += 1_000;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(
      await screen.findByText(t("lock.pin.delay", { seconds })),
    ).toBeTruthy();
  }
  now += 1_000;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  await vi.waitFor(() => {
    expect(screen.queryByText(/Kolejna próba/)).toBeNull();
  });
  expect(screen.getByLabelText<HTMLInputElement>("Cyfra 1 z 6").readOnly).toBe(
    false,
  );
});
