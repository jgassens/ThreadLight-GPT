import { afterEach, describe, expect, it, vi } from "vitest";
import {
  THREADLIGHT_GET_SETTINGS_MESSAGE,
  THREADLIGHT_UPDATE_SETTINGS_MESSAGE
} from "../../extension/src/shared/constants";
import { DEFAULT_SETTINGS } from "../../extension/src/shared/settings";
import { getSettings, updateSettings } from "../../extension/src/shared/storage";

type BrowserGlobal = typeof globalThis & {
  browser?: unknown;
  chrome?: unknown;
};

describe("storage", () => {
  afterEach(() => {
    delete (globalThis as BrowserGlobal).browser;
    delete (globalThis as BrowserGlobal).chrome;
  });

  it("gets settings from the runtime when storage.local is unavailable", async () => {
    const sendMessage = vi.fn(async () => ({
      ok: true,
      settings: {
        ...DEFAULT_SETTINGS,
        keepLastTurns: 5,
        showStatusPill: true
      }
    }));

    (globalThis as BrowserGlobal).browser = { runtime: { sendMessage } };

    await expect(getSettings()).resolves.toEqual({
      ...DEFAULT_SETTINGS,
      keepLastTurns: 5,
      showStatusPill: true
    });
    expect(sendMessage).toHaveBeenCalledWith({ type: THREADLIGHT_GET_SETTINGS_MESSAGE });
  });

  it("updates settings through the runtime when storage.local is unavailable", async () => {
    const patch = { keepLastTurns: 5, showStatusPill: true };
    const sendMessage = vi.fn(async () => ({
      ok: true,
      settings: {
        ...DEFAULT_SETTINGS,
        ...patch
      }
    }));

    (globalThis as BrowserGlobal).browser = { runtime: { sendMessage } };

    await expect(updateSettings(patch)).resolves.toEqual({
      ...DEFAULT_SETTINGS,
      ...patch
    });
    expect(sendMessage).toHaveBeenCalledWith({
      type: THREADLIGHT_UPDATE_SETTINGS_MESSAGE,
      patch
    });
  });

  it("uses storage.local before runtime when both are available", async () => {
    const sendMessage = vi.fn(async () => ({
      ok: true,
      settings: {
        ...DEFAULT_SETTINGS,
        keepLastTurns: 5,
        showStatusPill: true
      }
    }));

    (globalThis as BrowserGlobal).browser = {
      runtime: { sendMessage },
      storage: {
        local: {
          get: vi.fn(() => ({
            threadlight_settings_v1: DEFAULT_SETTINGS
          })),
          set: vi.fn()
        }
      }
    };

    await expect(getSettings()).resolves.toEqual(DEFAULT_SETTINGS);
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
