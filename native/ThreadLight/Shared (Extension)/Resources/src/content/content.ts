import {
  THREADLIGHT_NAVIGATION_EVENT,
  THREADLIGHT_PROXY_READY_MESSAGE,
  THREADLIGHT_REQUEST_CONFIG_EVENT,
  THREADLIGHT_STATUS_EVENT,
  THREADLIGHT_ULTRA_LEAN_CLASS
} from "../shared/constants";
import {
  dispatchSettingsForPage,
  isThreadLightStatusDetail,
  makeThreadLightStatusDetail,
  writeSettingsForPage
} from "../shared/events";
import type { ThreadLightSettingsV1, ThreadLightStatusEventDetail } from "../shared/types";
import { effectiveKeepLastTurns, isRecord } from "../shared/settings";
import { getSettings, subscribeSettingsChanges, updateSettings } from "../shared/storage";
import { CHATGPT_MAIN_SELECTOR } from "./dom-selectors";
import { setDomPruning, type DomPruneStats } from "./dom-pruner";
import { updateStatusPill } from "./status-pill";
import { setUserCollapseEnabled } from "./user-collapse";

const STYLE_ID = "threadlight-content-style";
let currentSettings: ThreadLightSettingsV1 | undefined;
let domPruningSuspendedForFullReload = false;
// Two independent status sources: the page proxy (trims conversation JSON before render)
// and the DOM pruner (hides already-rendered turns). The pill shows whichever is actively
// trimming so the count reflects what is really on screen.
let proxyStatus: ThreadLightStatusEventDetail | undefined;
let domStatus: ThreadLightStatusEventDetail | undefined;

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

function applySettings(settings: ThreadLightSettingsV1): void {
  currentSettings = settings;
  if (settings.suspendOnceForFullReload) {
    domPruningSuspendedForFullReload = true;
  }
  writeSettingsForPage(settings);
  document.documentElement.classList.toggle(THREADLIGHT_ULTRA_LEAN_CLASS, settings.ultraLeanMode);

  if (domPruningSuspendedForFullReload) {
    setDomPruning(
      { ...settings, enabled: false, keepLastTurns: effectiveKeepLastTurns(settings) },
      handlePruneStats
    );
    setUserCollapseEnabled(false, false);
    refreshPill();
    return;
  }

  setDomPruning({ ...settings, keepLastTurns: effectiveKeepLastTurns(settings) }, handlePruneStats);
  // Ultra lean also collapses long messages of any role; the user toggle is user-only.
  setUserCollapseEnabled(
    settings.collapseLongUserMessages || settings.ultraLeanMode,
    settings.ultraLeanMode
  );
  refreshPill();
}

function handleStatusEvent(event: Event): void {
  if (!(event instanceof CustomEvent) || !isThreadLightStatusDetail(event.detail)) {
    return;
  }

  proxyStatus = event.detail;
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
    handleConfigRequest();
  }
}

async function initContent(): Promise<void> {
  ensureContentStyles();
  window.addEventListener(THREADLIGHT_STATUS_EVENT, handleStatusEvent);
  window.addEventListener(THREADLIGHT_REQUEST_CONFIG_EVENT, handleConfigRequest);
  window.addEventListener(THREADLIGHT_NAVIGATION_EVENT, handleNavigationEvent);
  window.addEventListener("message", handleWindowMessage);

  const settings = await getSettings();
  applySettings(settings);

  subscribeSettingsChanges((nextSettings) => {
    applySettings(nextSettings);
  });
}

void initContent();
