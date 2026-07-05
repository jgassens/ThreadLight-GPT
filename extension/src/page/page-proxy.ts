import {
  THREADLIGHT_CONFIG_EVENT,
  THREADLIGHT_FETCH_PATCHED_FLAG,
  THREADLIGHT_HISTORY_PATCHED_FLAG,
  THREADLIGHT_NAVIGATION_EVENT,
  THREADLIGHT_PROXY_ACTIVE_DATASET,
  THREADLIGHT_PROXY_READY_MESSAGE,
  THREADLIGHT_REQUEST_CONFIG_EVENT
} from "../shared/constants";
import {
  dispatchStatus,
  makeThreadLightStatusDetail,
  parseSettingsEventDetail,
  readSettingsFromPage,
  statusFromTrimResult,
  writeSettingsForPage
} from "../shared/events";
import { effectiveKeepLastTurns, normalizeSettings } from "../shared/settings";
import { trimConversationData } from "../shared/trimmer";
import type { ThreadLightSettingsV1, ThreadLightStatusEventDetail } from "../shared/types";
import { isConversationJsonRequest } from "../shared/url-matcher";

interface ResponseRewriteResult {
  response: Response;
  status?: ThreadLightStatusEventDetail;
}

type ThreadLightWindow = Window & {
  [THREADLIGHT_FETCH_PATCHED_FLAG]?: boolean;
  [THREADLIGHT_HISTORY_PATCHED_FLAG]?: boolean;
};

type ExtensionIsolatedGlobal = typeof globalThis & {
  browser?: { runtime?: { id?: string } };
  chrome?: { runtime?: { id?: string } };
};

type ResolveConfigWait = () => void;

function isJsonResponse(response: Response): boolean {
  const contentType = response.headers.get("content-type") ?? "";
  return contentType.toLowerCase().includes("json");
}

export function createModifiedJsonResponse(original: Response, body: unknown): Response {
  const headers = new Headers(original.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.set("content-type", "application/json");

  return new Response(JSON.stringify(body), {
    status: original.status,
    statusText: original.statusText,
    headers
  });
}

export async function rewriteConversationResponse(
  response: Response,
  settingsInput: ThreadLightSettingsV1
): Promise<ResponseRewriteResult> {
  const settings = normalizeSettings(settingsInput);

  if (!settings.enabled) {
    return {
      response,
      status: makeThreadLightStatusDetail({
        settings,
        state: "disabled",
        recognized: true,
        reason: "disabled"
      })
    };
  }

  if (!isJsonResponse(response)) {
    return {
      response,
      status: makeThreadLightStatusDetail({
        settings,
        state: "noop",
        recognized: true,
        reason: "non-json"
      })
    };
  }

  try {
    const data = (await response.clone().json()) as unknown;
    const trimResult = trimConversationData(data, effectiveKeepLastTurns(settings));
    const status = statusFromTrimResult(trimResult, settings);

    if (trimResult.kind !== "trimmed") {
      return { response, status };
    }

    return {
      response: createModifiedJsonResponse(response, trimResult.data),
      status
    };
  } catch {
    return {
      response,
      status: makeThreadLightStatusDetail({
        settings,
        state: "error",
        recognized: false,
        reason: "error"
      })
    };
  }
}

function skipOnce(settings: ThreadLightSettingsV1): ThreadLightSettingsV1 {
  const next = normalizeSettings({ ...settings, suspendOnceForFullReload: false });
  writeSettingsForPage(next);
  dispatchStatus(
    makeThreadLightStatusDetail({
      settings: next,
      state: "paused",
      recognized: true,
      reason: "suspended-once"
    })
  );
  return next;
}

function postProxyReady(): void {
  window.postMessage(
    {
      source: "threadlight",
      type: THREADLIGHT_PROXY_READY_MESSAGE,
      version: 1
    },
    window.location.origin
  );
}

function dispatchRequestConfig(): void {
  window.dispatchEvent(new CustomEvent(THREADLIGHT_REQUEST_CONFIG_EVENT));
}

function scheduleStartupConfigRequests(shouldRequest: () => boolean): void {
  for (const delay of [100, 1000, 3000, 6000]) {
    window.setTimeout(() => {
      if (shouldRequest()) {
        dispatchRequestConfig();
      }
    }, delay);
  }
}

function dispatchNavigationStatus(): void {
  window.dispatchEvent(
    new CustomEvent(THREADLIGHT_NAVIGATION_EVENT, {
      detail: { source: "threadlight", version: 1, url: window.location.href }
    })
  );
}

function patchHistoryForNavigationEvents(scopedWindow: ThreadLightWindow): void {
  if (scopedWindow[THREADLIGHT_HISTORY_PATCHED_FLAG]) {
    return;
  }
  scopedWindow[THREADLIGHT_HISTORY_PATCHED_FLAG] = true;

  const dispatchSoon = (): void => {
    window.setTimeout(dispatchNavigationStatus, 0);
  };
  const nativePushState = window.history.pushState.bind(window.history);
  const nativeReplaceState = window.history.replaceState.bind(window.history);

  window.history.pushState = (...args) => {
    const result = nativePushState(...args);
    dispatchSoon();
    return result;
  };

  window.history.replaceState = (...args) => {
    const result = nativeReplaceState(...args);
    dispatchSoon();
    return result;
  };

  window.addEventListener("popstate", dispatchSoon);
}

function isExtensionIsolatedWorld(): boolean {
  const extGlobal = globalThis as ExtensionIsolatedGlobal;
  return Boolean(extGlobal.browser?.runtime?.id ?? extGlobal.chrome?.runtime?.id);
}

export function installThreadLightFetchProxy(): void {
  if (typeof window === "undefined" || typeof window.fetch !== "function") {
    return;
  }

  if (isExtensionIsolatedWorld()) {
    return;
  }

  const scopedWindow = window as ThreadLightWindow;
  if (scopedWindow[THREADLIGHT_FETCH_PATCHED_FLAG]) {
    return;
  }
  scopedWindow[THREADLIGHT_FETCH_PATCHED_FLAG] = true;
  document.documentElement.dataset[THREADLIGHT_PROXY_ACTIVE_DATASET] = "true";

  let settings = readSettingsFromPage();
  let configReceived = false;
  let resolveConfigWait: ResolveConfigWait | undefined;
  const initialConfigWait = new Promise<void>((resolve) => {
    resolveConfigWait = resolve;
    window.setTimeout(resolve, 750);
  });
  const nativeFetch = window.fetch.bind(window);

  window.addEventListener(THREADLIGHT_CONFIG_EVENT, (event) => {
    if (event instanceof CustomEvent) {
      settings = parseSettingsEventDetail(event.detail);
      configReceived = true;
      resolveConfigWait?.();
    }
  });

  patchHistoryForNavigationEvents(scopedWindow);
  postProxyReady();
  dispatchRequestConfig();
  scheduleStartupConfigRequests(() => !configReceived);

  const patchedFetch: typeof window.fetch = async (input, init) => {
    if (!isConversationJsonRequest(input, init, window.location.href)) {
      return nativeFetch(input, init);
    }

    const responsePromise = nativeFetch(input, init);
    responsePromise.catch(() => {});

    if (!configReceived) {
      await initialConfigWait;
    }

    const response = await responsePromise;

    if (settings.suspendOnceForFullReload) {
      settings = skipOnce(settings);
      return response;
    }

    const rewritten = await rewriteConversationResponse(response, settings);
    if (rewritten.status) {
      dispatchStatus(rewritten.status);
    }
    return rewritten.response;
  };

  window.fetch = patchedFetch;
}

installThreadLightFetchProxy();
