import type { ThreadLightSettingsV1 } from "../src/shared/types";
import { DEFAULT_SETTINGS, effectiveKeepLastTurns } from "../src/shared/settings";
import {
  getExtensionVersion,
  getSettings,
  sendRuntimeMessage,
  updateSettings
} from "../src/shared/storage";

const RANGE_SAVE_DEBOUNCE_MS = 250;
let keepLastTurnsSaveHandle: number | undefined;

function queryElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing popup element: ${selector}`);
  }
  return element;
}

function render(settings: ThreadLightSettingsV1): void {
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
}

document.addEventListener("DOMContentLoaded", () => {
  render(DEFAULT_SETTINGS);
  void initPopup();
});
