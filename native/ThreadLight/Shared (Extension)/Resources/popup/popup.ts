import {
  THREADLIGHT_CLEAR_DIAGNOSTICS_MESSAGE,
  THREADLIGHT_GET_DIAGNOSTICS_MESSAGE
} from "../src/shared/constants";
import { formatDiagnosticsJsonl, formatDiagnosticsSummary } from "../src/shared/diagnostics";
import type {
  ThreadLightDiagnosticEventDetail,
  ThreadLightRuntimeResponse,
  ThreadLightSettingsV1
} from "../src/shared/types";
import { DEFAULT_SETTINGS, effectiveKeepLastTurns } from "../src/shared/settings";
import {
  getExtensionVersion,
  getSettings,
  sendRuntimeMessage,
  updateSettings
} from "../src/shared/storage";

const RANGE_SAVE_DEBOUNCE_MS = 250;
const DIAGNOSTICS_REFRESH_MS = 1000;
let keepLastTurnsSaveHandle: number | undefined;
let diagnosticsRefreshHandle: number | undefined;
let latestDiagnostics: ThreadLightDiagnosticEventDetail[] = [];
let latestSettings: ThreadLightSettingsV1 = DEFAULT_SETTINGS;
let latestDiagnosticsResponse: ThreadLightRuntimeResponse = {
  ok: false,
  diagnosticsState: "page-not-ready",
  diagnostics: []
};

function queryElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing popup element: ${selector}`);
  }
  return element;
}

function render(settings: ThreadLightSettingsV1): void {
  latestSettings = settings;
  queryElement<HTMLInputElement>("#enabled").checked = settings.enabled;
  const slider = queryElement<HTMLInputElement>("#keep-last-turns");
  slider.value = String(settings.keepLastTurns);
  // Ultra lean overrides the slider with a lower cap, so reflect that and lock the slider.
  slider.disabled = settings.ultraLeanMode;
  queryElement<HTMLElement>("#keep-last-turns-value").textContent = settings.ultraLeanMode
    ? `${effectiveKeepLastTurns(settings)} (ultra lean)`
    : String(settings.keepLastTurns);
  queryElement<HTMLInputElement>("#show-status-pill").checked = settings.showStatusPill;
  queryElement<HTMLInputElement>("#ultra-lean-mode").checked = settings.ultraLeanMode;
  queryElement<HTMLInputElement>("#collapse-long-user-messages").checked =
    settings.collapseLongUserMessages;
  queryElement<HTMLInputElement>("#diagnostics-mode").checked = settings.debug;
}

let settingsWriteQueue = Promise.resolve();

async function persist(patch: Partial<ThreadLightSettingsV1>): Promise<void> {
  settingsWriteQueue = settingsWriteQueue
    .then(async () => {
      const next = await updateSettings(patch);
      render(next);
    })
    .catch(() => {
      queryElement<HTMLElement>("#status-text").textContent = "Could not save settings.";
    });

  await settingsWriteQueue;
}

function diagnosticsStatusText(response: Awaited<ReturnType<typeof sendRuntimeMessage>>): string {
  if (response.diagnosticsState === "diagnostics-disabled") {
    return "Diagnostics are off.";
  }
  if (response.diagnosticsState === "no-active-chatgpt-tab") {
    return "Open this popup from a ChatGPT tab.";
  }
  if (response.diagnosticsState === "content-script-unavailable") {
    return "Content script unavailable. Check site permission or reload the ChatGPT tab.";
  }
  if (response.diagnosticsState === "page-restricted") {
    return "Safari blocked diagnostics on this page.";
  }
  if (response.diagnosticsState === "page-not-ready") {
    return "ChatGPT page is not ready yet.";
  }
  if (response.diagnosticsState === "old-build-mismatch") {
    return "Old build mismatch detected. Reload Safari and the ChatGPT tab.";
  }
  if (response.diagnosticsState === "cleared") {
    return "Diagnostics cleared.";
  }
  if (response.diagnosticsState === "empty") {
    return "Diagnostics are on. No entries yet.";
  }
  if (response.diagnosticsState === "active") {
    return `${response.diagnostics?.length ?? 0} diagnostic entries.`;
  }
  return response.ok ? "Diagnostics ready." : "Diagnostics unavailable.";
}

function renderDiagnostics(response: Awaited<ReturnType<typeof sendRuntimeMessage>>): void {
  latestDiagnosticsResponse = response;
  latestDiagnostics = response.diagnostics ?? [];
  queryElement<HTMLElement>("#diagnostics-state").textContent = diagnosticsStatusText(response);
  queryElement<HTMLElement>("#diagnostics-log").textContent =
    latestDiagnostics.length === 0 ? "" : formatDiagnosticsSummary(latestDiagnostics.slice(-30));
}

function formatFullDiagnosticsReport(): string {
  const settingsSnapshot = {
    enabled: latestSettings.enabled,
    keepLastTurns: latestSettings.keepLastTurns,
    showStatusPill: latestSettings.showStatusPill,
    ultraLeanMode: latestSettings.ultraLeanMode,
    collapseLongUserMessages: latestSettings.collapseLongUserMessages,
    debug: latestSettings.debug,
    suspendOnceForFullReload: latestSettings.suspendOnceForFullReload
  };

  return [
    "ThreadLight diagnostics report",
    `extensionVersion=${latestDiagnosticsResponse.extensionVersion ?? getExtensionVersion()}`,
    `pageVersion=${latestDiagnosticsResponse.pageVersion ?? "unknown"}`,
    `diagnosticsState=${latestDiagnosticsResponse.diagnosticsState ?? "unknown"}`,
    `ok=${latestDiagnosticsResponse.ok ? "true" : "false"}`,
    "",
    "settings",
    JSON.stringify(settingsSnapshot, null, 2),
    "",
    "summary",
    formatDiagnosticsSummary(latestDiagnostics),
    "",
    "jsonl",
    formatDiagnosticsJsonl(latestDiagnostics)
  ].join("\n");
}

async function refreshDiagnostics(): Promise<void> {
  if (!latestSettings.debug) {
    renderDiagnostics({ ok: true, diagnosticsState: "diagnostics-disabled", diagnostics: [] });
    return;
  }
  const response = await sendRuntimeMessage({ type: THREADLIGHT_GET_DIAGNOSTICS_MESSAGE });
  renderDiagnostics(response);
}

async function clearDiagnosticsLog(): Promise<void> {
  const response = await sendRuntimeMessage({ type: THREADLIGHT_CLEAR_DIAGNOSTICS_MESSAGE });
  renderDiagnostics(response);
}

async function copyDiagnostics(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    queryElement<HTMLElement>("#status-text").textContent = "Diagnostics copied.";
  } catch {
    queryElement<HTMLElement>("#status-text").textContent = "Could not copy diagnostics.";
  }
}

function startDiagnosticsRefresh(): void {
  if (diagnosticsRefreshHandle !== undefined) {
    window.clearInterval(diagnosticsRefreshHandle);
  }

  diagnosticsRefreshHandle = window.setInterval(() => {
    if (document.visibilityState === "visible") {
      void refreshDiagnostics();
    }
  }, DIAGNOSTICS_REFRESH_MS);
}

function persistKeepLastTurns(value: number): void {
  if (keepLastTurnsSaveHandle !== undefined) {
    window.clearTimeout(keepLastTurnsSaveHandle);
    keepLastTurnsSaveHandle = undefined;
  }
  void persist({ keepLastTurns: value });
}

function scheduleKeepLastTurnsPersist(value: number): void {
  if (keepLastTurnsSaveHandle !== undefined) {
    window.clearTimeout(keepLastTurnsSaveHandle);
  }
  keepLastTurnsSaveHandle = window.setTimeout(() => {
    keepLastTurnsSaveHandle = undefined;
    void persist({ keepLastTurns: value });
  }, RANGE_SAVE_DEBOUNCE_MS);
}

async function initPopup(): Promise<void> {
  const settings = await getSettings();
  render(settings);
  queryElement<HTMLElement>("#version-text").textContent = `Version ${getExtensionVersion()}`;

  queryElement<HTMLInputElement>("#enabled").addEventListener("change", (event) => {
    const target = event.currentTarget as HTMLInputElement;
    void persist({ enabled: target.checked });
  });

  queryElement<HTMLInputElement>("#keep-last-turns").addEventListener("input", (event) => {
    const target = event.currentTarget as HTMLInputElement;
    const value = Number(target.value);
    queryElement<HTMLElement>("#keep-last-turns-value").textContent = target.value;
    scheduleKeepLastTurnsPersist(value);
  });

  queryElement<HTMLInputElement>("#keep-last-turns").addEventListener("change", (event) => {
    const target = event.currentTarget as HTMLInputElement;
    persistKeepLastTurns(Number(target.value));
  });

  queryElement<HTMLInputElement>("#show-status-pill").addEventListener("change", (event) => {
    const target = event.currentTarget as HTMLInputElement;
    void persist({ showStatusPill: target.checked });
  });

  queryElement<HTMLInputElement>("#ultra-lean-mode").addEventListener("change", (event) => {
    const target = event.currentTarget as HTMLInputElement;
    void persist({ ultraLeanMode: target.checked });
  });

  queryElement<HTMLInputElement>("#collapse-long-user-messages").addEventListener(
    "change",
    (event) => {
      const target = event.currentTarget as HTMLInputElement;
      void persist({ collapseLongUserMessages: target.checked });
    }
  );

  queryElement<HTMLInputElement>("#diagnostics-mode").addEventListener("change", (event) => {
    const target = event.currentTarget as HTMLInputElement;
    void persist({ debug: target.checked }).then(refreshDiagnostics);
  });

  queryElement<HTMLButtonElement>("#refresh-diagnostics").addEventListener("click", () => {
    void refreshDiagnostics();
  });

  queryElement<HTMLButtonElement>("#copy-diagnostics-report").addEventListener("click", () => {
    void copyDiagnostics(formatFullDiagnosticsReport());
  });

  queryElement<HTMLButtonElement>("#copy-diagnostics-summary").addEventListener("click", () => {
    void copyDiagnostics(formatDiagnosticsSummary(latestDiagnostics));
  });

  queryElement<HTMLButtonElement>("#copy-diagnostics-jsonl").addEventListener("click", () => {
    void copyDiagnostics(formatDiagnosticsJsonl(latestDiagnostics));
  });

  queryElement<HTMLButtonElement>("#clear-diagnostics").addEventListener("click", () => {
    void clearDiagnosticsLog();
  });

  queryElement<HTMLButtonElement>("#restore-full-thread").addEventListener("click", () => {
    void (async () => {
      const response = await sendRuntimeMessage({ type: "threadlight-restore-full-thread" });
      if (response.settings) {
        render(response.settings);
      }
      queryElement<HTMLElement>("#status-text").textContent = response.ok
        ? "Reloading once with the full thread restored."
        : "Open ThreadLight from a ChatGPT tab to restore the full thread.";
    })();
  });

  queryElement<HTMLAnchorElement>("#privacy-link").addEventListener("click", (event) => {
    event.preventDefault();
    queryElement<HTMLElement>("#status-text").textContent =
      "ThreadLight stores only local settings and no chat content.";
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void refreshDiagnostics();
    }
  });

  await refreshDiagnostics();
  startDiagnosticsRefresh();
}

document.addEventListener("DOMContentLoaded", () => {
  render(DEFAULT_SETTINGS);
  void initPopup();
});
