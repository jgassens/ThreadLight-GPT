import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { THREADLIGHT_HIDDEN_TURN_CLASS } from "../../extension/src/shared/constants";
import { DEFAULT_SETTINGS } from "../../extension/src/shared/settings";
import type { ThreadLightSettingsV1 } from "../../extension/src/shared/types";

type StorageListener = (settings: ThreadLightSettingsV1) => void;
type ContentDiagnosticsTestHooks = {
  collectEnvironmentSample: () => void;
  flushLongTaskDiagnostics: () => void;
  handleAnimationFrame: (timestamp: number) => void;
  handleVisibilityChange: () => void;
  queueLongTaskDiagnostic: (durationMs: number) => void;
  resetSamplerState: () => void;
  setCurrentSettings: (settings: ThreadLightSettingsV1 | undefined) => void;
};

interface SamplerDomState {
  hidden: boolean;
  totalDomNodes: number;
  totalDomTurns: number;
  hiddenDomTurns: number;
}

function installSamplerGlobals(state: SamplerDomState): void {
  let timerId = 0;
  let frameId = 0;

  vi.stubGlobal("performance", {
    now: vi.fn(() => 0)
  });
  vi.stubGlobal("document", {
    get hidden() {
      return state.hidden;
    },
    addEventListener: vi.fn(),
    createElement: vi.fn(() => ({ id: "", textContent: "" })),
    documentElement: {
      append: vi.fn(),
      classList: {
        toggle: vi.fn(),
        add: vi.fn(),
        remove: vi.fn(),
        contains: vi.fn(() => false)
      },
      dataset: {}
    },
    getElementById: vi.fn(() => null),
    getElementsByTagName: vi.fn(() => ({ length: state.totalDomNodes })),
    querySelectorAll: vi.fn((selector: string) => ({
      length:
        selector === `.${THREADLIGHT_HIDDEN_TURN_CLASS}`
          ? state.hiddenDomTurns
          : state.totalDomTurns
    }))
  });
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    cancelAnimationFrame: vi.fn(),
    clearInterval: vi.fn(),
    clearTimeout: vi.fn(),
    dispatchEvent: vi.fn(() => true),
    location: { origin: "https://chatgpt.com" },
    localStorage: {
      getItem: vi.fn(() => null),
      setItem: vi.fn()
    },
    requestAnimationFrame: vi.fn(() => {
      frameId += 1;
      return frameId;
    }),
    setInterval: vi.fn(() => {
      timerId += 1;
      return timerId;
    }),
    setTimeout: vi.fn(() => {
      timerId += 1;
      return timerId;
    })
  });
}

async function importContentHarness() {
  await import("../../extension/src/content/content");
  const diagnosticsBuffer = await import("../../extension/src/content/diagnostics-buffer");
  await Promise.resolve();
  await Promise.resolve();
  const hooks = (
    globalThis as typeof globalThis & {
      __THREADLIGHT_CONTENT_DIAGNOSTICS_FOR_TESTS__?: ContentDiagnosticsTestHooks;
    }
  ).__THREADLIGHT_CONTENT_DIAGNOSTICS_FOR_TESTS__;
  if (hooks === undefined) {
    throw new Error("Content diagnostics test hooks were not installed.");
  }
  return {
    __contentDiagnosticsForTests: hooks,
    diagnosticsSnapshot: diagnosticsBuffer.diagnosticsSnapshot,
    resetDiagnosticsForTests: diagnosticsBuffer.resetDiagnosticsForTests
  };
}

function mockContentDependencies(initialSettings: ThreadLightSettingsV1): void {
  vi.doMock("../../extension/src/shared/storage", () => ({
    addRuntimeMessageListener: vi.fn(),
    getExtensionVersion: vi.fn(() => "0.1.16"),
    getSettings: vi.fn(async () => initialSettings),
    isDiagnosticsTabMessage: vi.fn(() => false),
    subscribeSettingsChanges: vi.fn((_listener: StorageListener) => vi.fn()),
    updateSettings: vi.fn()
  }));
  vi.doMock("../../extension/src/content/dom-pruner", () => ({
    setDomPruning: vi.fn()
  }));
  vi.doMock("../../extension/src/content/status-pill", () => ({
    updateStatusPill: vi.fn()
  }));
  vi.doMock("../../extension/src/content/user-collapse", () => ({
    setUserCollapseEnabled: vi.fn()
  }));
}

describe("content diagnostics samplers", () => {
  const diagnosticsOn: ThreadLightSettingsV1 = { ...DEFAULT_SETTINGS, debug: true };

  beforeEach(() => {
    vi.spyOn(console, "debug").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    delete (
      globalThis as typeof globalThis & {
        __THREADLIGHT_CONTENT_DIAGNOSTICS_FOR_TESTS__?: ContentDiagnosticsTestHooks;
      }
    ).__THREADLIGHT_CONTENT_DIAGNOSTICS_FOR_TESTS__;
    vi.unstubAllGlobals();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("does not report a main-thread stall for time spent hidden", async () => {
    const state = { hidden: false, totalDomNodes: 100, totalDomTurns: 10, hiddenDomTurns: 0 };
    installSamplerGlobals(state);
    mockContentDependencies({ ...DEFAULT_SETTINGS, debug: false });
    const { __contentDiagnosticsForTests, diagnosticsSnapshot, resetDiagnosticsForTests } =
      await importContentHarness();
    resetDiagnosticsForTests();
    __contentDiagnosticsForTests.resetSamplerState();
    __contentDiagnosticsForTests.setCurrentSettings(diagnosticsOn);

    __contentDiagnosticsForTests.handleAnimationFrame(1000);
    state.hidden = true;
    __contentDiagnosticsForTests.handleVisibilityChange();
    state.hidden = false;
    __contentDiagnosticsForTests.handleVisibilityChange();
    __contentDiagnosticsForTests.handleAnimationFrame(301000);

    expect(diagnosticsSnapshot(diagnosticsOn).entries).toHaveLength(0);

    __contentDiagnosticsForTests.handleAnimationFrame(301400);
    expect(diagnosticsSnapshot(diagnosticsOn).entries.map((entry) => entry.event)).toEqual([
      "main-thread-stall"
    ]);
  });

  it("stores environment samples on meaningful changes or heartbeat only", async () => {
    const state = { hidden: false, totalDomNodes: 100, totalDomTurns: 10, hiddenDomTurns: 0 };
    let now = 0;
    installSamplerGlobals(state);
    vi.stubGlobal("performance", {
      now: vi.fn(() => now)
    });
    mockContentDependencies({ ...DEFAULT_SETTINGS, debug: false });
    const { __contentDiagnosticsForTests, diagnosticsSnapshot, resetDiagnosticsForTests } =
      await importContentHarness();
    resetDiagnosticsForTests();
    __contentDiagnosticsForTests.resetSamplerState();
    __contentDiagnosticsForTests.setCurrentSettings(diagnosticsOn);

    __contentDiagnosticsForTests.collectEnvironmentSample();
    now = 5000;
    __contentDiagnosticsForTests.collectEnvironmentSample();
    state.totalDomNodes = 104;
    now = 10000;
    __contentDiagnosticsForTests.collectEnvironmentSample();
    state.totalDomNodes = 106;
    now = 15000;
    __contentDiagnosticsForTests.collectEnvironmentSample();
    now = 45000;
    __contentDiagnosticsForTests.collectEnvironmentSample();
    state.hiddenDomTurns = 1;
    now = 50000;
    __contentDiagnosticsForTests.collectEnvironmentSample();

    const entries = diagnosticsSnapshot(diagnosticsOn).entries;
    expect(entries.map((entry) => entry.event)).toEqual([
      "environment-sample",
      "environment-sample",
      "environment-sample",
      "environment-sample"
    ]);
    expect(entries.map((entry) => entry.totalDomNodes)).toEqual([100, 106, 106, 106]);
    expect(entries.at(-1)?.hiddenDomTurns).toBe(1);
  });

  it("coalesces longtask bursts into one bounded diagnostic", async () => {
    const state = { hidden: false, totalDomNodes: 100, totalDomTurns: 10, hiddenDomTurns: 0 };
    let now = 1000;
    installSamplerGlobals(state);
    vi.stubGlobal("performance", {
      now: vi.fn(() => now)
    });
    mockContentDependencies({ ...DEFAULT_SETTINGS, debug: false });
    const { __contentDiagnosticsForTests, diagnosticsSnapshot, resetDiagnosticsForTests } =
      await importContentHarness();
    resetDiagnosticsForTests();
    __contentDiagnosticsForTests.resetSamplerState();
    __contentDiagnosticsForTests.setCurrentSettings(diagnosticsOn);

    __contentDiagnosticsForTests.queueLongTaskDiagnostic(55);
    __contentDiagnosticsForTests.queueLongTaskDiagnostic(120);
    __contentDiagnosticsForTests.queueLongTaskDiagnostic(80);
    expect(diagnosticsSnapshot(diagnosticsOn).entries).toHaveLength(0);

    now = 2050;
    __contentDiagnosticsForTests.flushLongTaskDiagnostics();

    const entries = diagnosticsSnapshot(diagnosticsOn).entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual(
      expect.objectContaining({
        event: "longtask-observed",
        eventCount: 3,
        maxDurationMs: 120,
        durationMs: 120,
        elapsedMs: 1050
      })
    );
  });
});
