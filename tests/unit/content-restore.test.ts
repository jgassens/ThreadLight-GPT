import { afterEach, describe, expect, it, vi } from "vitest";
import {
  THREADLIGHT_NAVIGATION_EVENT,
  THREADLIGHT_STATUS_EVENT
} from "../../extension/src/shared/constants";
import { DEFAULT_SETTINGS } from "../../extension/src/shared/settings";
import type { ThreadLightSettingsV1 } from "../../extension/src/shared/types";

type Listener = (event: Event) => void;
type StorageListener = (settings: ThreadLightSettingsV1) => void;

class TestCustomEvent extends Event {
  detail: unknown;

  constructor(type: string, init?: { detail?: unknown }) {
    super(type);
    this.detail = init?.detail;
  }
}

function installDomGlobals(): Map<string, Listener[]> {
  const listeners = new Map<string, Listener[]>();
  const classList = {
    toggle: vi.fn(),
    add: vi.fn(),
    remove: vi.fn(),
    contains: vi.fn(() => false)
  };

  vi.stubGlobal("CustomEvent", TestCustomEvent);
  vi.stubGlobal("document", {
    createElement: vi.fn(() => ({ id: "", textContent: "" })),
    documentElement: {
      append: vi.fn(),
      classList,
      dataset: {}
    },
    getElementById: vi.fn(() => null)
  });
  vi.stubGlobal("window", {
    addEventListener: vi.fn((type: string, listener: Listener) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    }),
    dispatchEvent: vi.fn((event: Event) => {
      listeners.get(event.type)?.forEach((listener) => listener(event));
      return true;
    }),
    location: { origin: "https://chatgpt.com" },
    localStorage: {
      getItem: vi.fn(() => null),
      setItem: vi.fn()
    }
  });

  return listeners;
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("content restore flow", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("keeps DOM pruning suspended for the restored document after the one-shot flag is cleared", async () => {
    installDomGlobals();

    const restoreSettings: ThreadLightSettingsV1 = {
      ...DEFAULT_SETTINGS,
      suspendOnceForFullReload: true
    };
    const normalSettings: ThreadLightSettingsV1 = {
      ...restoreSettings,
      suspendOnceForFullReload: false
    };
    let storageListener: StorageListener | undefined;
    const setDomPruning = vi.fn();
    const updateSettings = vi.fn(async () => normalSettings);

    vi.doMock("../../extension/src/shared/storage", () => ({
      getSettings: vi.fn(async () => restoreSettings),
      subscribeSettingsChanges: vi.fn((listener: StorageListener) => {
        storageListener = listener;
        return vi.fn();
      }),
      updateSettings,
      getExtensionVersion: vi.fn(() => "0.1.13"),
      addRuntimeMessageListener: vi.fn(),
      isDiagnosticsTabMessage: vi.fn(() => false)
    }));
    vi.doMock("../../extension/src/content/dom-pruner", () => ({ setDomPruning }));
    vi.doMock("../../extension/src/content/status-pill", () => ({ updateStatusPill: vi.fn() }));
    vi.doMock("../../extension/src/content/user-collapse", () => ({
      setUserCollapseEnabled: vi.fn()
    }));

    await import("../../extension/src/content/content");
    await flushPromises();

    expect(setDomPruning).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: false }),
      expect.any(Function),
      expect.any(Function)
    );

    window.dispatchEvent(
      new CustomEvent(THREADLIGHT_STATUS_EVENT, {
        detail: {
          source: "threadlight",
          version: 1,
          enabled: true,
          recognized: true,
          state: "paused",
          keepLastTurns: restoreSettings.keepLastTurns,
          lastUpdatedAt: Date.now(),
          reason: "suspended-once"
        }
      })
    );
    expect(updateSettings).toHaveBeenCalledWith({ suspendOnceForFullReload: false });

    storageListener?.(normalSettings);
    expect(setDomPruning).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: false }),
      expect.any(Function),
      expect.any(Function)
    );

    window.dispatchEvent(
      new CustomEvent(THREADLIGHT_NAVIGATION_EVENT, {
        detail: { source: "threadlight", version: 1 }
      })
    );
    expect(setDomPruning).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: true }),
      expect.any(Function),
      expect.any(Function)
    );
  });
});
