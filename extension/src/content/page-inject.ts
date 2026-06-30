import { THREADLIGHT_REQUEST_CONFIG_EVENT } from "../shared/constants";
import { dispatchSettingsForPage, writeSettingsForPage } from "../shared/events";
import { getRuntimeUrl, getSettings, subscribeSettingsChanges } from "../shared/storage";
import type { ThreadLightSettingsV1 } from "../shared/types";

const PAGE_PROXY_MARKER = "threadlightProxyInjected";

function injectPageProxy(): void {
  const root = document.documentElement;
  if (root.dataset[PAGE_PROXY_MARKER] === "true") {
    return;
  }
  root.dataset[PAGE_PROXY_MARKER] = "true";

  const script = document.createElement("script");
  script.src = getRuntimeUrl("dist/page-proxy.js");
  script.async = false;
  script.dataset.threadlight = "page-proxy";

  const target = document.documentElement || document.head;
  target.append(script);
  script.remove();
}

let currentSettings: ThreadLightSettingsV1 | undefined;
let settingsLoad: Promise<ThreadLightSettingsV1> | undefined;

function loadSettings(): Promise<ThreadLightSettingsV1> {
  settingsLoad ??= getSettings()
    .then((settings) => {
      currentSettings = settings;
      return settings;
    })
    .finally(() => {
      settingsLoad = undefined;
    });
  return settingsLoad;
}

async function syncInitialSettings(): Promise<void> {
  writeSettingsForPage(await loadSettings());
}

function respondToConfigRequest(): void {
  if (currentSettings) {
    dispatchSettingsForPage(currentSettings);
    return;
  }

  void loadSettings().then(dispatchSettingsForPage);
}

injectPageProxy();
window.addEventListener(THREADLIGHT_REQUEST_CONFIG_EVENT, respondToConfigRequest);
void syncInitialSettings();
subscribeSettingsChanges((settings) => {
  currentSettings = settings;
  writeSettingsForPage(settings);
});
