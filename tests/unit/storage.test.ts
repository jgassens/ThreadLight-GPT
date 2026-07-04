import { afterEach, describe, expect, it, vi } from "vitest";
import {
  THREADLIGHT_GET_SETTINGS_MESSAGE,
  THREADLIGHT_UPDATE_SETTINGS_MESSAGE
} from "../../extension/src/shared/constants";
import { DEFAULT_SETTINGS } from "../../extension/src/shared/settings";
import {
  getActiveChatGptTabId,
  getExtensionVersion,
  getSettings,
  reloadTab,
  updateSettings
} from "../../extension/src/shared/storage";

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

  it("falls back to a non-stale dev version when the manifest is unavailable", () => {
    (globalThis as BrowserGlobal).browser = { runtime: { getURL: vi.fn((path: string) => path) } };

    expect(getExtensionVersion()).toBe("dev");
  });

  it("finds the active ChatGPT tab before restoring a full thread", async () => {
    const query = vi.fn(async () => [{ id: 7, url: "https://chatgpt.com/c/synthetic" }]);
    (globalThis as BrowserGlobal).browser = { tabs: { query } };

    await expect(getActiveChatGptTabId()).resolves.toBe(7);
    expect(query).toHaveBeenCalledWith({ active: true, currentWindow: true });
  });

  it("rejects non-ChatGPT active tabs before restore reloads", async () => {
    const query = vi.fn(async () => [{ id: 9, url: "https://example.com/" }]);
    (globalThis as BrowserGlobal).browser = { tabs: { query } };

    await expect(getActiveChatGptTabId()).resolves.toBeUndefined();
  });

  it("reloads an explicit tab id instead of the frontmost tab", async () => {
    const reload = vi.fn(async () => undefined);
    (globalThis as BrowserGlobal).browser = { tabs: { reload } };

    await expect(reloadTab(7)).resolves.toBe(true);

    expect(reload).toHaveBeenCalledWith(7, { bypassCache: false });
    expect(reload).not.toHaveBeenCalledWith(undefined, expect.anything());
  });

  it("reports explicit tab reload failures", async () => {
    const reload = vi.fn(async () => {
      throw new Error("cannot reload tab");
    });
    (globalThis as BrowserGlobal).browser = {
      tabs: {
        query: vi.fn(),
        reload
      }
    };

    await expect(reloadTab(7)).resolves.toBe(false);
  });
});
