// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { AppState } from "react-native";
import { afterEach, expect, it, vi } from "vitest";

import { PlatformProvider, type Platform } from "../platform/context";
import { SyncRunner } from "./SyncRunner";
import * as wiring from "./wiring";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function setup(current: string) {
  const controller = { setActive: vi.fn(), mount: vi.fn(), unmount: vi.fn() };
  vi.spyOn(wiring, "wireSync").mockReturnValue(controller);
  const remove = vi.fn();
  let listener: (state: string) => void = () => undefined;
  vi.spyOn(AppState, "currentState", "get").mockReturnValue(current);
  vi.spyOn(AppState, "addEventListener").mockImplementation(
    (_type, callback) => {
      listener = callback as (state: string) => void;
      return { remove };
    },
  );
  const platform = {} as Platform;
  const view = render(
    <PlatformProvider platform={platform}>
      <SyncRunner />
    </PlatformProvider>,
  );
  return {
    controller,
    remove,
    view,
    emit: (s: string) => {
      listener(s);
    },
  };
}

it("mounts the controller and passes the app state", () => {
  const { controller, emit } = setup("active");
  expect(controller.mount).toHaveBeenCalledTimes(1);
  expect(controller.setActive).toHaveBeenLastCalledWith(true);
  emit("background");
  expect(controller.setActive).toHaveBeenLastCalledWith(false);
  emit("active");
  expect(controller.setActive).toHaveBeenLastCalledWith(true);
});

it("starts inactive when the app is in the background", () => {
  const { controller } = setup("background");
  expect(controller.setActive).toHaveBeenCalledWith(false);
});

it("unmounts the controller and removes the listener", () => {
  const { controller, remove, view } = setup("active");
  view.unmount();
  expect(controller.unmount).toHaveBeenCalledTimes(1);
  expect(remove).toHaveBeenCalledTimes(1);
});
