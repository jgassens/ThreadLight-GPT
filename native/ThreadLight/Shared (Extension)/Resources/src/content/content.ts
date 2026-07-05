import {
  THREADLIGHT_DIAGNOSTIC_EVENT,
  THREADLIGHT_DIAGNOSTIC_REPLAY_REQUEST_EVENT,
  THREADLIGHT_HIDDEN_TURN_CLASS,
  THREADLIGHT_NAVIGATION_EVENT,
  THREADLIGHT_PROXY_READY_MESSAGE,
  THREADLIGHT_REQUEST_CONFIG_EVENT,
  THREADLIGHT_STATUS_EVENT,
  THREADLIGHT_TAB_CLEAR_DIAGNOSTICS_MESSAGE,
  THREADLIGHT_TAB_GET_DIAGNOSTICS_MESSAGE,
  THREADLIGHT_ULTRA_LEAN_CLASS
} from "../shared/constants";
import {
  dispatchSettingsForPage,
  isThreadLightStatusDetail,
  makeThreadLightStatusDetail,
  writeSettingsForPage
} from "../shared/events";
import type {
  ThreadLightRuntimeResponse,
  ThreadLightSettingsV1,
  ThreadLightStatusEventDetail
} from "../shared/types";
import { effectiveKeepLastTurns, isRecord } from "../shared/settings";
import {
  addRuntimeMessageListener,
  getExtensionVersion,
  getSettings,
  isDiagnosticsTabMessage,
  subscribeSettingsChanges,
  updateSettings
} from "../shared/storage";
import { CHATGPT_MAIN_SELECTOR, CHATGPT_TURN_SELECTOR } from "./dom-selectors";
import { setDomPruning, type DomPruneDiagnostic, type DomPruneStats } from "./dom-pruner";
import { updateStatusPill } from "./status-pill";
import { setUserCollapseEnabled } from "./user-collapse";
import {
  clearDiagnostics,
  diagnosticsSnapshot,
  storeContentDiagnostic,
  storeDiagnosticCandidateResult
} from "./diagnostics-buffer";

const STYLE_ID = "threadlight-content-style";
const PAGE_PROXY_MARKER = "threadlightProxyInjected";
const MAIN_THREAD_STALL_THRESHOLD_MS = 250;
const MAIN_THREAD_STALL_MIN_REPORT_INTERVAL_MS = 1000;
const ENVIRONMENT_SAMPLE_INTERVAL_MS = 5000;
const ENVIRONMENT_SAMPLE_HEARTBEAT_MS = 30000;
const ENVIRONMENT_SAMPLE_NODE_CHANGE_RATIO = 0.05;
const LONGTASK_COALESCE_WINDOW_MS = 1000;
const PENDING_DIAGNOSTICS_LIMIT = 300;
let currentSettings: ThreadLightSettingsV1 | undefined;
let domPruningSuspendedForFullReload = false;
let pendingDiagnostics: unknown[] = [];
let stallSamplerHandle: number | undefined;
let lastAnimationFrameTime: number | undefined;
let lastStallReportAt = 0;
let environmentSampleHandle: number | undefined;
let lastEnvironmentSample: EnvironmentSample | undefined;
let lastEnvironmentSampleAt: number | undefined;
let longTaskObserver: PerformanceObserver | undefined;
let longTaskFlushHandle: number | undefined;
let pendingLongTaskSummary: LongTaskSummary | undefined;
// Two independent status sources: the page proxy (trims conversation JSON before render)
// and the DOM pruner (hides already-rendered turns). The pill shows whichever is actively
// trimming so the count reflects what is really on screen.
let proxyStatus: ThreadLightStatusEventDetail | undefined;
let domStatus: ThreadLightStatusEventDetail | undefined;

interface EnvironmentSample {
  totalDomNodes: number;
  totalDomTurns: number;
  hiddenDomTurns: number;
}

interface LongTaskSummary {
  eventCount: number;
  maxDurationMs: number;
  startedAt: number;
}

function ensureContentStyles(): void {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_ID;
  // Ultra lean mode caps the heaviest elements so kept turns render lighter.
  style.textContent = `
html.${THREADLIGHT_ULTRA_LEAN_CLASS} ${CHATGPT_MAIN_SELECTOR} pre {
  max-height: 320px;
  overflow: auto;
}
html.${THREADLIGHT_ULTRA_LEAN_CLASS} ${CHATGPT_MAIN_SELECTOR} img,
html.${THREADLIGHT_ULTRA_LEAN_CLASS} ${CHATGPT_MAIN_SELECTOR} video,
html.${THREADLIGHT_ULTRA_LEAN_CLASS} ${CHATGPT_MAIN_SELECTOR} canvas {
  max-height: 240px;
  object-fit: contain;
}`;
  document.documentElement.append(style);
}

function requestDiagnosticReplay(): void {
  window.dispatchEvent(new CustomEvent(THREADLIGHT_DIAGNOSTIC_REPLAY_REQUEST_EVENT));
}

function queuePendingDiagnostic(candidate: unknown): void {
  pendingDiagnostics.push(candidate);
  if (pendingDiagnostics.length > PENDING_DIAGNOSTICS_LIMIT) {
    pendingDiagnostics = pendingDiagnostics.slice(-PENDING_DIAGNOSTICS_LIMIT);
  }
}

function recordDiagnosticRejection(reason: "malformed-diagnostic" | "duplicate-diagnostic"): void {
  storeContentDiagnostic(
    {
      diagnosticSource: "content",
      level: reason === "malformed-diagnostic" ? "warn" : "debug",
      phase: "diagnostics",
      event: "diagnostic-event-rejected",
      state: "rejected",
      reason
    },
    currentSettings
  );
}

function storeIncomingDiagnostic(candidate: unknown): void {
  const result = storeDiagnosticCandidateResult(candidate, currentSettings);
  if (result.kind === "invalid") {
    recordDiagnosticRejection("malformed-diagnostic");
  } else if (result.kind === "duplicate") {
    // Replay intentionally overlaps with live events; duplicates are expected and content-free.
  }
}

function flushPendingDiagnostics(): void {
  if (!currentSettings || pendingDiagnostics.length === 0) {
    return;
  }

  const pending = pendingDiagnostics;
  pendingDiagnostics = [];
  pending.forEach(storeIncomingDiagnostic);
}

function nowMs(): number {
  return typeof globalThis.performance?.now === "function"
    ? globalThis.performance.now()
    : Date.now();
}

function readEnvironmentSample(): EnvironmentSample {
  return {
    totalDomNodes: document.getElementsByTagName("*").length,
    totalDomTurns: document.querySelectorAll(CHATGPT_TURN_SELECTOR).length,
    hiddenDomTurns: document.querySelectorAll(`.${THREADLIGHT_HIDDEN_TURN_CLASS}`).length
  };
}

function sampleChangedMeaningfully(sample: EnvironmentSample): boolean {
  if (lastEnvironmentSample === undefined) {
    return true;
  }

  if (
    sample.totalDomTurns !== lastEnvironmentSample.totalDomTurns ||
    sample.hiddenDomTurns !== lastEnvironmentSample.hiddenDomTurns
  ) {
    return true;
  }

  const previousNodes = lastEnvironmentSample.totalDomNodes;
  if (previousNodes === 0) {
    return sample.totalDomNodes !== 0;
  }

  return (
    Math.abs(sample.totalDomNodes - previousNodes) / previousNodes >=
    ENVIRONMENT_SAMPLE_NODE_CHANGE_RATIO
  );
}

function environmentSampleHeartbeatDue(monotonicTime: number): boolean {
  return (
    lastEnvironmentSampleAt === undefined ||
    monotonicTime - lastEnvironmentSampleAt >= ENVIRONMENT_SAMPLE_HEARTBEAT_MS
  );
}

function collectEnvironmentSample(): void {
  const settings = currentSettings;
  if (!settings?.debug) {
    return;
  }

  const sample = readEnvironmentSample();
  const monotonicTime = nowMs();
  if (!sampleChangedMeaningfully(sample) && !environmentSampleHeartbeatDue(monotonicTime)) {
    return;
  }

  storeContentDiagnostic(
    {
      diagnosticSource: "content",
      level: "debug",
      phase: "performance",
      event: "environment-sample",
      state: "active",
      reason: "environment-sample",
      totalDomNodes: sample.totalDomNodes,
      totalDomTurns: sample.totalDomTurns,
      hiddenDomTurns: sample.hiddenDomTurns
    },
    settings
  );
  lastEnvironmentSample = sample;
  lastEnvironmentSampleAt = monotonicTime;
}

function flushLongTaskDiagnostics(): void {
  if (longTaskFlushHandle !== undefined) {
    window.clearTimeout(longTaskFlushHandle);
    longTaskFlushHandle = undefined;
  }

  const summary = pendingLongTaskSummary;
  pendingLongTaskSummary = undefined;
  const settings = currentSettings;
  if (!settings?.debug || summary === undefined) {
    return;
  }

  storeContentDiagnostic(
    {
      diagnosticSource: "content",
      level: "warn",
      phase: "performance",
      event: "longtask-observed",
      state: "active",
      reason: "longtask",
      durationMs: summary.maxDurationMs,
      maxDurationMs: summary.maxDurationMs,
      eventCount: summary.eventCount,
      elapsedMs: Math.max(0, nowMs() - summary.startedAt)
    },
    settings
  );
}

function queueLongTaskDiagnostic(durationMs: number): void {
  const boundedDuration = Math.max(0, durationMs);
  if (pendingLongTaskSummary === undefined) {
    pendingLongTaskSummary = {
      eventCount: 0,
      maxDurationMs: 0,
      startedAt: nowMs()
    };
  }

  pendingLongTaskSummary.eventCount += 1;
  pendingLongTaskSummary.maxDurationMs = Math.max(
    pendingLongTaskSummary.maxDurationMs,
    boundedDuration
  );
  if (longTaskFlushHandle === undefined) {
    longTaskFlushHandle = window.setTimeout(flushLongTaskDiagnostics, LONGTASK_COALESCE_WINDOW_MS);
  }
}

function stopDiagnosticsSamplers(): void {
  if (stallSamplerHandle !== undefined) {
    window.cancelAnimationFrame(stallSamplerHandle);
    stallSamplerHandle = undefined;
  }
  if (environmentSampleHandle !== undefined) {
    window.clearInterval(environmentSampleHandle);
    environmentSampleHandle = undefined;
  }
  if (longTaskFlushHandle !== undefined) {
    window.clearTimeout(longTaskFlushHandle);
    longTaskFlushHandle = undefined;
  }
  pendingLongTaskSummary = undefined;
  longTaskObserver?.disconnect();
  longTaskObserver = undefined;
  lastAnimationFrameTime = undefined;
  lastEnvironmentSample = undefined;
  lastEnvironmentSampleAt = undefined;
}

function handleAnimationFrame(timestamp: number): void {
  const settings = currentSettings;
  if (!settings?.debug) {
    stallSamplerHandle = undefined;
    lastAnimationFrameTime = undefined;
    return;
  }

  if (document.hidden) {
    lastAnimationFrameTime = undefined;
    stallSamplerHandle = window.requestAnimationFrame(handleAnimationFrame);
    return;
  }

  if (lastAnimationFrameTime !== undefined) {
    const gap = Math.max(0, timestamp - lastAnimationFrameTime);
    if (
      gap >= MAIN_THREAD_STALL_THRESHOLD_MS &&
      timestamp - lastStallReportAt >= MAIN_THREAD_STALL_MIN_REPORT_INTERVAL_MS
    ) {
      lastStallReportAt = timestamp;
      storeContentDiagnostic(
        {
          diagnosticSource: "content",
          level: "warn",
          phase: "performance",
          event: "main-thread-stall",
          state: "active",
          reason: "main-thread-stall",
          durationMs: gap
        },
        settings
      );
    }
  }

  lastAnimationFrameTime = timestamp;
  stallSamplerHandle = window.requestAnimationFrame(handleAnimationFrame);
}

function handleVisibilityChange(): void {
  lastAnimationFrameTime = undefined;
  if (!document.hidden && currentSettings?.debug && stallSamplerHandle === undefined) {
    startStallSampler();
  }
}

function startStallSampler(): void {
  if (stallSamplerHandle !== undefined || typeof window.requestAnimationFrame !== "function") {
    return;
  }
  lastAnimationFrameTime = undefined;
  stallSamplerHandle = window.requestAnimationFrame(handleAnimationFrame);
}

function startEnvironmentSampler(): void {
  if (environmentSampleHandle !== undefined) {
    return;
  }
  collectEnvironmentSample();
  environmentSampleHandle = window.setInterval(
    collectEnvironmentSample,
    ENVIRONMENT_SAMPLE_INTERVAL_MS
  );
}

function startLongTaskObserver(): void {
  const observerConstructor = globalThis.PerformanceObserver;
  if (longTaskObserver || typeof observerConstructor !== "function") {
    return;
  }
  if (!observerConstructor.supportedEntryTypes?.includes("longtask")) {
    return;
  }

  try {
    longTaskObserver = new observerConstructor((list) => {
      const settings = currentSettings;
      if (!settings?.debug) {
        return;
      }
      list.getEntries().forEach((entry) => queueLongTaskDiagnostic(entry.duration));
    });
    longTaskObserver.observe({ type: "longtask", buffered: true });
  } catch {
    longTaskObserver = undefined;
  }
}

function syncDiagnosticsSamplers(settings: ThreadLightSettingsV1): void {
  if (!settings.debug) {
    stopDiagnosticsSamplers();
    return;
  }

  startStallSampler();
  startEnvironmentSampler();
  startLongTaskObserver();
}

// Prefer whichever path is actively trimming: the DOM pruner reflects the live page, the
// proxy reflects turns removed before render. Otherwise fall back to the latest status.
function currentPillStatus(): ThreadLightStatusEventDetail | undefined {
  if (domStatus?.state === "trimmed") {
    return domStatus;
  }
  if (proxyStatus?.state === "trimmed") {
    return proxyStatus;
  }
  return domStatus ?? proxyStatus;
}

function refreshPill(): void {
  const settings = currentSettings;
  if (!settings) {
    return;
  }

  const status =
    currentPillStatus() ??
    makeThreadLightStatusDetail({
      settings,
      state: settings.enabled ? "noop" : "disabled",
      recognized: false,
      reason: settings.enabled ? "no-op" : "disabled"
    });
  updateStatusPill(status, settings.showStatusPill);
}

// Reflect the live DOM-pruning counts in the status pill ("showing X of Y turns").
function handlePruneStats(stats: DomPruneStats): void {
  const settings = currentSettings;
  if (!settings) {
    return;
  }

  domStatus = makeThreadLightStatusDetail({
    settings,
    state: stats.pruned ? "trimmed" : settings.enabled ? "noop" : "disabled",
    recognized: true,
    reason: stats.pruned ? "trimmed" : settings.enabled ? "no-op" : "disabled",
    stats: {
      totalVisibleTurns: stats.totalTurns,
      keptVisibleTurns: stats.keptTurns,
      removedVisibleTurns: stats.hiddenTurns,
      totalNodesOnPath: stats.totalTurns,
      keptNodes: stats.keptTurns
    }
  });
  refreshPill();
}

function handlePruneDiagnostic(diagnostic: DomPruneDiagnostic): void {
  const settings = currentSettings;
  if (!settings) {
    return;
  }

  storeContentDiagnostic(
    {
      diagnosticSource: "dom-pruner",
      level: diagnostic.state === "applied" ? "info" : "debug",
      phase: "dom",
      event: diagnostic.event,
      state: diagnostic.state,
      reason: diagnostic.reason,
      ...(diagnostic.stats === undefined
        ? {}
        : {
            totalDomTurns: diagnostic.stats.totalTurns,
            keptDomTurns: diagnostic.stats.keptTurns,
            hiddenDomTurns: diagnostic.stats.hiddenTurns
          })
    },
    settings
  );
}

function applySettings(settings: ThreadLightSettingsV1): void {
  currentSettings = settings;
  syncDiagnosticsSamplers(settings);
  if (settings.suspendOnceForFullReload) {
    domPruningSuspendedForFullReload = true;
  }
  writeSettingsForPage(settings);
  document.documentElement.classList.toggle(THREADLIGHT_ULTRA_LEAN_CLASS, settings.ultraLeanMode);

  if (domPruningSuspendedForFullReload) {
    setDomPruning(
      { ...settings, enabled: false, keepLastTurns: effectiveKeepLastTurns(settings) },
      handlePruneStats,
      handlePruneDiagnostic
    );
    setUserCollapseEnabled(false, false);
    refreshPill();
    storeContentDiagnostic(
      {
        diagnosticSource: "content",
        level: "info",
        phase: "settings",
        event: "settings-applied",
        state: "paused",
        reason: "suspended-once",
        keepLastTurns: effectiveKeepLastTurns(settings)
      },
      settings
    );
    return;
  }

  setDomPruning(
    { ...settings, keepLastTurns: effectiveKeepLastTurns(settings) },
    handlePruneStats,
    handlePruneDiagnostic
  );
  // Ultra lean also collapses long messages of any role; the user toggle is user-only.
  setUserCollapseEnabled(
    settings.collapseLongUserMessages || settings.ultraLeanMode,
    settings.ultraLeanMode
  );
  refreshPill();
  storeContentDiagnostic(
    {
      diagnosticSource: "content",
      level: "info",
      phase: "settings",
      event: "settings-applied",
      state: settings.enabled ? "applied" : "disabled",
      reason: "settings-applied",
      keepLastTurns: effectiveKeepLastTurns(settings)
    },
    settings
  );
  storeContentDiagnostic(
    {
      diagnosticSource: "user-collapse",
      level: "debug",
      phase: "dom",
      event: "user-collapse-mode",
      state: settings.collapseLongUserMessages || settings.ultraLeanMode ? "applied" : "disabled",
      reason: settings.ultraLeanMode ? "settings-applied" : "unknown"
    },
    settings
  );
}

function handleStatusEvent(event: Event): void {
  if (!(event instanceof CustomEvent) || !isThreadLightStatusDetail(event.detail)) {
    storeContentDiagnostic(
      {
        diagnosticSource: "content",
        level: "warn",
        phase: "diagnostics",
        event: "status-event-rejected",
        state: "rejected",
        reason: "unknown"
      },
      currentSettings
    );
    return;
  }

  proxyStatus = event.detail;
  const statusCounts = {
    ...(event.detail.totalVisibleTurns === undefined
      ? {}
      : { totalVisibleTurns: event.detail.totalVisibleTurns }),
    ...(event.detail.keptVisibleTurns === undefined
      ? {}
      : { keptVisibleTurns: event.detail.keptVisibleTurns }),
    ...(event.detail.removedVisibleTurns === undefined
      ? {}
      : { removedVisibleTurns: event.detail.removedVisibleTurns }),
    ...(event.detail.totalNodesOnPath === undefined
      ? {}
      : { totalNodesOnPath: event.detail.totalNodesOnPath }),
    ...(event.detail.keptNodes === undefined ? {} : { keptNodes: event.detail.keptNodes })
  };
  storeContentDiagnostic(
    {
      diagnosticSource: "content",
      level: "debug",
      phase: "diagnostics",
      event: "status-event-accepted",
      state: "accepted",
      reason: event.detail.reason ?? "unknown",
      ...statusCounts
    },
    currentSettings
  );
  if (
    event.detail.state === "paused" &&
    event.detail.reason === "suspended-once" &&
    currentSettings?.suspendOnceForFullReload
  ) {
    domPruningSuspendedForFullReload = true;
    void updateSettings({ suspendOnceForFullReload: false });
  }
  refreshPill();
}

function handleConfigRequest(): void {
  if (currentSettings) {
    dispatchSettingsForPage(currentSettings);
    return;
  }

  void (async () => {
    const settings = await getSettings();
    applySettings(settings);
    flushPendingDiagnostics();
    if (settings.debug) {
      requestDiagnosticReplay();
    }
  })();
}

function handleNavigationEvent(event: Event): void {
  if (!(event instanceof CustomEvent) || !currentSettings) {
    return;
  }

  const detail = event.detail;
  if (!isRecord(detail)) {
    return;
  }

  if (detail.source !== "threadlight" || detail.version !== 1) {
    return;
  }

  storeContentDiagnostic(
    {
      diagnosticSource: "content",
      level: "info",
      phase: "navigation",
      event: "navigation-event",
      state: "accepted",
      reason: "navigation"
    },
    currentSettings
  );

  if (!currentSettings.suspendOnceForFullReload) {
    domPruningSuspendedForFullReload = false;
  }

  proxyStatus = makeThreadLightStatusDetail({
    settings: currentSettings,
    state: currentSettings.enabled ? "noop" : "disabled",
    recognized: false,
    reason: "navigation"
  });
  // A fresh navigation invalidates any prior trim counts until the pruner re-runs.
  domStatus = undefined;
  refreshPill();
  applySettings(currentSettings);
}

function handleWindowMessage(event: MessageEvent): void {
  if (event.source !== window || event.origin !== window.location.origin) {
    return;
  }
  const data = event.data;
  if (!isRecord(data)) {
    return;
  }

  if (
    data.source === "threadlight" &&
    data.type === THREADLIGHT_PROXY_READY_MESSAGE &&
    data.version === 1
  ) {
    storeContentDiagnostic(
      {
        diagnosticSource: "content",
        level: "info",
        phase: "startup",
        event: "proxy-ready-message",
        state: "accepted",
        reason: "main-world"
      },
      currentSettings
    );
    handleConfigRequest();
  }
}

function handleDiagnosticEvent(event: Event): void {
  if (!(event instanceof CustomEvent)) {
    return;
  }
  if (!currentSettings) {
    queuePendingDiagnostic(event.detail);
    return;
  }
  storeIncomingDiagnostic(event.detail);
}

function diagnosticsResponse(): ThreadLightRuntimeResponse {
  const snapshot = diagnosticsSnapshot(currentSettings);
  const extensionVersion = getExtensionVersion();
  const response: ThreadLightRuntimeResponse = {
    ok: currentSettings !== undefined,
    diagnosticsState: snapshot.state,
    diagnostics: snapshot.entries,
    extensionVersion
  };
  const pageVersion = document.documentElement.dataset.threadlightVersion;
  if (pageVersion !== undefined) {
    response.pageVersion = pageVersion;
    if (pageVersion !== extensionVersion) {
      response.diagnosticsState = "old-build-mismatch";
    }
  }
  return response;
}

function installDiagnosticsMessageListener(): void {
  addRuntimeMessageListener((message, _sender, sendResponse) => {
    if (!isDiagnosticsTabMessage(message)) {
      return false;
    }

    if (message.type === THREADLIGHT_TAB_CLEAR_DIAGNOSTICS_MESSAGE) {
      clearDiagnostics(currentSettings);
      sendResponse({
        ...diagnosticsResponse(),
        ok: currentSettings !== undefined,
        diagnosticsState: currentSettings?.debug
          ? "cleared"
          : diagnosticsSnapshot(currentSettings).state
      });
      return true;
    }

    if (message.type === THREADLIGHT_TAB_GET_DIAGNOSTICS_MESSAGE) {
      storeContentDiagnostic(
        {
          diagnosticSource: "content",
          level: "debug",
          phase: "diagnostics",
          event: "diagnostics-requested",
          state: "accepted",
          reason: "unknown"
        },
        currentSettings
      );
      sendResponse(diagnosticsResponse());
      return true;
    }

    return false;
  });
}

async function initContent(): Promise<void> {
  ensureContentStyles();
  // Expose the live extension version on the DOM so it can be verified from the page (diagnostic
  // for Safari's extension caching, which can otherwise silently keep serving an older build).
  document.documentElement.dataset.threadlightVersion = getExtensionVersion();
  window.addEventListener(THREADLIGHT_STATUS_EVENT, handleStatusEvent);
  window.addEventListener(THREADLIGHT_DIAGNOSTIC_EVENT, handleDiagnosticEvent);
  window.addEventListener(THREADLIGHT_REQUEST_CONFIG_EVENT, handleConfigRequest);
  window.addEventListener(THREADLIGHT_NAVIGATION_EVENT, handleNavigationEvent);
  window.addEventListener("message", handleWindowMessage);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  installDiagnosticsMessageListener();

  const settings = await getSettings();
  applySettings(settings);
  flushPendingDiagnostics();
  if (settings.debug) {
    requestDiagnosticReplay();
  }
  storeContentDiagnostic(
    {
      diagnosticSource: "content",
      level: "info",
      phase: "startup",
      event: "content-init",
      state: "finished",
      reason: "settings-applied"
    },
    settings
  );
  storeContentDiagnostic(
    {
      diagnosticSource: "content",
      level: "info",
      phase: "startup",
      event: "version-marker",
      state: "applied",
      reason: "settings-applied"
    },
    settings
  );
  storeContentDiagnostic(
    {
      diagnosticSource: "page-inject",
      level: "info",
      phase: "startup",
      event:
        document.documentElement.dataset[PAGE_PROXY_MARKER] === "true"
          ? "fallback-injection-used"
          : "fallback-injection-skipped",
      state: document.documentElement.dataset[PAGE_PROXY_MARKER] === "true" ? "applied" : "skipped",
      reason:
        document.documentElement.dataset[PAGE_PROXY_MARKER] === "true"
          ? "fallback-injection"
          : "already-active"
    },
    settings
  );

  subscribeSettingsChanges((nextSettings) => {
    applySettings(nextSettings);
    flushPendingDiagnostics();
    if (nextSettings.debug) {
      requestDiagnosticReplay();
    }
  });
}

const contentDiagnosticsForTests = {
  collectEnvironmentSample,
  flushLongTaskDiagnostics,
  handleAnimationFrame,
  handleVisibilityChange,
  queueLongTaskDiagnostic,
  resetSamplerState: () => {
    stopDiagnosticsSamplers();
    lastStallReportAt = 0;
  },
  setCurrentSettings: (settings: ThreadLightSettingsV1 | undefined) => {
    currentSettings = settings;
  }
};

if (typeof process !== "undefined" && process.env.NODE_ENV === "test") {
  (
    globalThis as typeof globalThis & {
      __THREADLIGHT_CONTENT_DIAGNOSTICS_FOR_TESTS__?: typeof contentDiagnosticsForTests;
    }
  ).__THREADLIGHT_CONTENT_DIAGNOSTICS_FOR_TESTS__ = contentDiagnosticsForTests;
}

void initContent();
