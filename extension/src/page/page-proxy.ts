import {
  THREADLIGHT_CONFIG_EVENT,
  THREADLIGHT_DIAGNOSTIC_REPLAY_REQUEST_EVENT,
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
import {
  contentTypeKind,
  diagnosticReasonFromTrimReason,
  dispatchDiagnostic,
  recordDiagnostic,
  statusCodeClass
} from "../shared/diagnostics";
import { effectiveKeepLastTurns, normalizeSettings } from "../shared/settings";
import { trimConversationData } from "../shared/trimmer";
import type {
  ThreadLightDiagnosticEndpointKind,
  ThreadLightDiagnosticEventDetail,
  ThreadLightDiagnosticEventName,
  ThreadLightDiagnosticPhase,
  ThreadLightDiagnosticReason,
  ThreadLightDiagnosticState,
  ThreadLightSettingsV1,
  ThreadLightStatusEventDetail,
  TrimStats
} from "../shared/types";
import { diagnosticEndpointKind, isConversationJsonRequest } from "../shared/url-matcher";

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
type StopSlowDiagnostics = () => void;

const INITIAL_CONFIG_WAIT_MS = 750;
const SLOW_DIAGNOSTIC_MS = [3000, 10000, 30000] as const;
const PAGE_DIAGNOSTIC_REPLAY_LIMIT = 120;

let pageDiagnosticQueue: ThreadLightDiagnosticEventDetail[] = [];

function isJsonResponse(response: Response): boolean {
  const contentType = response.headers.get("content-type") ?? "";
  return contentType.toLowerCase().includes("json");
}

// Rebuild a Response around a body string we already hold. The original headers are kept except
// content-length/content-encoding, which describe the original encoded bytes, not this body.
function createRewrappedResponse(original: Response, bodyText: string): Response {
  const headers = new Headers(original.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.set("content-type", "application/json");

  return new Response(bodyText, {
    status: original.status,
    statusText: original.statusText,
    headers
  });
}

function nowMs(): number {
  return typeof globalThis.performance?.now === "function"
    ? globalThis.performance.now()
    : Date.now();
}

function durationSince(start: number): number {
  return Math.max(0, nowMs() - start);
}

function responseStatusDiagnostics(response: Response): {
  statusCode: number;
  statusCodeClass: ReturnType<typeof statusCodeClass>;
  contentTypeKind: ReturnType<typeof contentTypeKind>;
} {
  return {
    statusCode: response.status,
    statusCodeClass: statusCodeClass(response.status),
    contentTypeKind: contentTypeKind(response.headers.get("content-type"))
  };
}

function statsDiagnostics(stats: TrimStats): {
  totalVisibleTurns: number;
  keptVisibleTurns: number;
  removedVisibleTurns: number;
  totalNodesOnPath: number;
  keptNodes: number;
} {
  return {
    totalVisibleTurns: stats.totalVisibleTurns,
    keptVisibleTurns: stats.keptVisibleTurns,
    removedVisibleTurns: stats.removedVisibleTurns,
    totalNodesOnPath: stats.totalNodesOnPath,
    keptNodes: stats.keptNodes
  };
}

function enqueuePageDiagnostic(detail: ThreadLightDiagnosticEventDetail): void {
  pageDiagnosticQueue.push(detail);
  if (pageDiagnosticQueue.length > PAGE_DIAGNOSTIC_REPLAY_LIMIT) {
    pageDiagnosticQueue = pageDiagnosticQueue.slice(-PAGE_DIAGNOSTIC_REPLAY_LIMIT);
  }
}

function diagnosticMarkName(detail: ThreadLightDiagnosticEventDetail): string {
  return `ThreadLight ${detail.diagnosticSource}#${detail.sourceSequence} ${detail.event}`;
}

function markDiagnostic(detail: ThreadLightDiagnosticEventDetail): void {
  try {
    globalThis.performance?.mark?.(diagnosticMarkName(detail));
  } catch {
    // Some WebKit builds can throw if performance buffers are unavailable.
  }
}

function measureDiagnosticsSpan(
  label: string,
  start: ThreadLightDiagnosticEventDetail | undefined,
  end: ThreadLightDiagnosticEventDetail | undefined
): void {
  if (!start || !end) {
    return;
  }

  try {
    globalThis.performance?.measure?.(
      `ThreadLight ${label} ${start.diagnosticSource}#${start.sourceSequence}-${end.sourceSequence}`,
      diagnosticMarkName(start),
      diagnosticMarkName(end)
    );
  } catch {
    // Measures are best-effort Web Inspector breadcrumbs, not runtime behavior.
  }
}

function dispatchQueuedDiagnostics(): void {
  pageDiagnosticQueue.forEach(dispatchDiagnostic);
}

function warnPendingRequest(input: {
  phase: ThreadLightDiagnosticPhase;
  event: ThreadLightDiagnosticEventName;
  endpointKind: ThreadLightDiagnosticEndpointKind;
  elapsedMs: number;
}): void {
  if (typeof console === "undefined") {
    return;
  }
  console.warn("[ThreadLight] conversation request still pending", input);
}

function pageDiagnostic(input: {
  level: "debug" | "info" | "warn" | "error";
  phase: ThreadLightDiagnosticPhase;
  event: ThreadLightDiagnosticEventName;
  state?: ThreadLightDiagnosticState;
  reason?: ThreadLightDiagnosticReason;
  endpointKind?: ThreadLightDiagnosticEndpointKind;
  durationMs?: number;
  elapsedMs?: number;
  statusCode?: number;
  statusCodeClass?: ReturnType<typeof statusCodeClass>;
  contentTypeKind?: ReturnType<typeof contentTypeKind>;
  responseCharCount?: number;
  keepLastTurns?: number;
  stats?: TrimStats;
}): ThreadLightDiagnosticEventDetail | undefined {
  const detail = {
    diagnosticSource: "page-proxy" as const,
    level: input.level,
    phase: input.phase,
    event: input.event,
    ...(input.state === undefined ? {} : { state: input.state }),
    ...(input.reason === undefined ? {} : { reason: input.reason }),
    ...(input.endpointKind === undefined ? {} : { endpointKind: input.endpointKind }),
    ...(input.durationMs === undefined ? {} : { durationMs: input.durationMs }),
    ...(input.elapsedMs === undefined ? {} : { elapsedMs: input.elapsedMs }),
    ...(input.statusCode === undefined ? {} : { statusCode: input.statusCode }),
    ...(input.statusCodeClass === undefined ? {} : { statusCodeClass: input.statusCodeClass }),
    ...(input.contentTypeKind === undefined ? {} : { contentTypeKind: input.contentTypeKind }),
    ...(input.responseCharCount === undefined
      ? {}
      : { responseCharCount: input.responseCharCount }),
    ...(input.keepLastTurns === undefined ? {} : { keepLastTurns: input.keepLastTurns }),
    ...(input.stats === undefined ? {} : statsDiagnostics(input.stats))
  };
  const recorded = recordDiagnostic(detail, { mirrorToConsole: false });
  if (!recorded) {
    return undefined;
  }
  enqueuePageDiagnostic(recorded);
  markDiagnostic(recorded);
  return recorded;
}

function startSlowDiagnostics(
  settings: ThreadLightSettingsV1,
  phase: ThreadLightDiagnosticPhase,
  event: ThreadLightDiagnosticEventName,
  endpointKind: ThreadLightDiagnosticEndpointKind,
  reason: ThreadLightDiagnosticReason
): StopSlowDiagnostics {
  const handles = SLOW_DIAGNOSTIC_MS.map((delay) =>
    globalThis.setTimeout(() => {
      pageDiagnostic({
        level: "warn",
        phase,
        event,
        state: "pending",
        reason,
        endpointKind,
        elapsedMs: delay
      });
      if (!settings.debug && delay === 30000) {
        warnPendingRequest({ phase, event, endpointKind, elapsedMs: delay });
      }
    }, delay)
  );

  return () => {
    handles.forEach((handle) => globalThis.clearTimeout(handle));
  };
}

export function createModifiedJsonResponse(original: Response, body: unknown): Response {
  return createRewrappedResponse(original, JSON.stringify(body));
}

export async function rewriteConversationResponse(
  response: Response,
  settingsInput: ThreadLightSettingsV1,
  endpointKind: ThreadLightDiagnosticEndpointKind = "unmatched"
): Promise<ResponseRewriteResult> {
  const settings = normalizeSettings(settingsInput);

  if (!settings.enabled) {
    pageDiagnostic({
      level: "info",
      phase: "trim",
      event: "trim-result",
      state: "disabled",
      reason: "disabled",
      endpointKind,
      ...responseStatusDiagnostics(response)
    });
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

  if (!isJsonResponse(response) || !response.ok || response.status === 204) {
    pageDiagnostic({
      level: "info",
      phase: "response",
      event: "response-rewrapped",
      state: "noop",
      reason: "non-json",
      endpointKind,
      ...responseStatusDiagnostics(response)
    });
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

  // Read the original body exactly once instead of response.clone(): WebKit's clone() tees the
  // body stream, and on very large conversations the never-consumed original branch applies
  // backpressure that stalls the read — the page's fetch then never resolves (observed as a
  // multi-minute hang on huge threads). With the bytes in hand, every path below returns a
  // rebuilt Response, so nothing downstream depends on the consumed original.
  let bodyText: string;
  const bodyReadStartedAt = nowMs();
  const stopBodySlowDiagnostics = startSlowDiagnostics(
    settings,
    "response",
    "body-read-slow",
    endpointKind,
    "body-read-slow"
  );
  const bodyReadStartDiagnostic = pageDiagnostic({
    level: "debug",
    phase: "response",
    event: "body-read-start",
    state: "started",
    reason: "body-read",
    endpointKind,
    ...responseStatusDiagnostics(response)
  });
  try {
    bodyText = await response.text();
    const bodyReadEndDiagnostic = pageDiagnostic({
      level: "info",
      phase: "response",
      event: "body-read-end",
      state: "finished",
      reason: "body-read",
      endpointKind,
      durationMs: durationSince(bodyReadStartedAt),
      responseCharCount: bodyText.length,
      ...responseStatusDiagnostics(response)
    });
    measureDiagnosticsSpan("body-read", bodyReadStartDiagnostic, bodyReadEndDiagnostic);
  } catch {
    const bodyReadFailedDiagnostic = pageDiagnostic({
      level: "error",
      phase: "response",
      event: "body-read-failed",
      state: "error",
      reason: "body-read-failed",
      endpointKind,
      durationMs: durationSince(bodyReadStartedAt),
      ...responseStatusDiagnostics(response)
    });
    measureDiagnosticsSpan("body-read", bodyReadStartDiagnostic, bodyReadFailedDiagnostic);
    pageDiagnostic({
      level: "warn",
      phase: "response",
      event: "fail-open",
      state: "error",
      reason: "body-read-failed",
      endpointKind
    });
    return {
      response,
      status: makeThreadLightStatusDetail({
        settings,
        state: "error",
        recognized: false,
        reason: "error"
      })
    };
  } finally {
    stopBodySlowDiagnostics();
  }

  let parseStartDiagnostic: ThreadLightDiagnosticEventDetail | undefined;
  try {
    const parseStartedAt = nowMs();
    parseStartDiagnostic = pageDiagnostic({
      level: "debug",
      phase: "response",
      event: "json-parse-start",
      state: "started",
      reason: "json-parse",
      endpointKind,
      responseCharCount: bodyText.length
    });
    const data = JSON.parse(bodyText) as unknown;
    const parseEndDiagnostic = pageDiagnostic({
      level: "debug",
      phase: "response",
      event: "json-parse-end",
      state: "finished",
      reason: "json-parse",
      endpointKind,
      durationMs: durationSince(parseStartedAt),
      responseCharCount: bodyText.length
    });
    measureDiagnosticsSpan("json-parse", parseStartDiagnostic, parseEndDiagnostic);
    const trimStartDiagnostic = pageDiagnostic({
      level: "debug",
      phase: "trim",
      event: "trim-start",
      state: "started",
      reason: "unknown",
      endpointKind,
      keepLastTurns: effectiveKeepLastTurns(settings)
    });
    const trimResult = trimConversationData(data, effectiveKeepLastTurns(settings));
    const status = statusFromTrimResult(trimResult, settings);
    const trimDetail = {
      level: trimResult.kind === "trimmed" ? "info" : "debug",
      phase: "trim",
      event: "trim-result",
      state: trimResult.kind === "trimmed" ? "trimmed" : trimResult.kind,
      reason:
        trimResult.kind === "trimmed"
          ? "trimmed"
          : diagnosticReasonFromTrimReason(trimResult.reason),
      endpointKind
    } as const;
    const trimEndDiagnostic = pageDiagnostic(
      trimResult.kind === "unrecognized" ? trimDetail : { ...trimDetail, stats: trimResult.stats }
    );
    measureDiagnosticsSpan("trim", trimStartDiagnostic, trimEndDiagnostic);

    if (trimResult.kind !== "trimmed") {
      const rewriteStartDiagnostic = pageDiagnostic({
        level: "debug",
        phase: "response",
        event: "response-rewrite-start",
        state: "started",
        reason: "rewrapped",
        endpointKind,
        responseCharCount: bodyText.length
      });
      const rewriteEndDiagnostic = pageDiagnostic({
        level: "debug",
        phase: "response",
        event: "response-rewrapped",
        state: "noop",
        reason: "rewrapped",
        endpointKind,
        responseCharCount: bodyText.length,
        ...responseStatusDiagnostics(response)
      });
      measureDiagnosticsSpan("response-rewrite", rewriteStartDiagnostic, rewriteEndDiagnostic);
      return { response: createRewrappedResponse(response, bodyText), status };
    }

    const rewriteStartDiagnostic = pageDiagnostic({
      level: "debug",
      phase: "response",
      event: "response-rewrite-start",
      state: "started",
      reason: "modified",
      endpointKind,
      stats: trimResult.stats
    });
    const rewriteEndDiagnostic = pageDiagnostic({
      level: "info",
      phase: "response",
      event: "response-modified",
      state: "trimmed",
      reason: "modified",
      endpointKind,
      stats: trimResult.stats
    });
    measureDiagnosticsSpan("response-rewrite", rewriteStartDiagnostic, rewriteEndDiagnostic);
    return {
      response: createModifiedJsonResponse(response, trimResult.data),
      status
    };
  } catch {
    const parseFailedDiagnostic = pageDiagnostic({
      level: "error",
      phase: "response",
      event: "json-parse-failed",
      state: "error",
      reason: "json-parse-failed",
      endpointKind,
      responseCharCount: bodyText.length
    });
    measureDiagnosticsSpan("json-parse", parseStartDiagnostic, parseFailedDiagnostic);
    pageDiagnostic({
      level: "warn",
      phase: "response",
      event: "fail-open",
      state: "error",
      reason: "json-parse-failed",
      endpointKind
    });
    return {
      response: createRewrappedResponse(response, bodyText),
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
  pageDiagnostic({
    level: "info",
    phase: "restore",
    event: "restore-suspended-once",
    state: "paused",
    reason: "suspended-once"
  });
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
      detail: { source: "threadlight", version: 1 }
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
    window.setTimeout(() => {
      if (!configReceived) {
        pageDiagnostic({
          level: "warn",
          phase: "config",
          event: "config-wait-timeout",
          state: "timeout",
          reason: "config-timeout",
          durationMs: INITIAL_CONFIG_WAIT_MS
        });
      }
      resolve();
    }, INITIAL_CONFIG_WAIT_MS);
  });
  const nativeFetch = window.fetch.bind(window);

  window.addEventListener(THREADLIGHT_CONFIG_EVENT, (event) => {
    if (event instanceof CustomEvent) {
      settings = parseSettingsEventDetail(event.detail);
      configReceived = true;
      pageDiagnostic({
        level: "info",
        phase: "config",
        event: "config-received",
        state: "accepted",
        reason: "config-received",
        keepLastTurns: settings.keepLastTurns
      });
      resolveConfigWait?.();
    }
  });
  window.addEventListener(THREADLIGHT_DIAGNOSTIC_REPLAY_REQUEST_EVENT, dispatchQueuedDiagnostics);

  patchHistoryForNavigationEvents(scopedWindow);
  pageDiagnostic({
    level: "info",
    phase: "startup",
    event: "proxy-install",
    state: "applied",
    reason: "main-world"
  });
  pageDiagnostic({
    level: "info",
    phase: "startup",
    event: "main-world-active",
    state: "active",
    reason: "main-world"
  });
  postProxyReady();
  pageDiagnostic({
    level: "debug",
    phase: "config",
    event: "config-requested",
    state: "started",
    reason: "unknown"
  });
  dispatchRequestConfig();
  scheduleStartupConfigRequests(() => !configReceived);

  const patchedFetch: typeof window.fetch = async (input, init) => {
    if (!isConversationJsonRequest(input, init, window.location.href)) {
      return nativeFetch(input, init);
    }

    const endpointKind = diagnosticEndpointKind(input, init, window.location.href);
    pageDiagnostic({
      level: "info",
      phase: "fetch",
      event: "fetch-matched",
      state: "accepted",
      reason: "native-fetch",
      endpointKind
    });
    const fetchStartedAt = nowMs();
    const stopFetchSlowDiagnostics = startSlowDiagnostics(
      settings,
      "fetch",
      "fetch-start",
      endpointKind,
      "native-fetch"
    );
    const fetchStartDiagnostic = pageDiagnostic({
      level: "debug",
      phase: "fetch",
      event: "fetch-start",
      state: "started",
      reason: "native-fetch",
      endpointKind
    });
    const responsePromise = nativeFetch(input, init);
    responsePromise.catch(() => {});

    if (!configReceived) {
      await initialConfigWait;
    }

    let response: Response;
    try {
      response = await responsePromise;
    } catch (error) {
      stopFetchSlowDiagnostics();
      const fetchFailedDiagnostic = pageDiagnostic({
        level: "error",
        phase: "fetch",
        event: "fetch-failed",
        state: "error",
        reason: "native-fetch-failed",
        endpointKind,
        durationMs: durationSince(fetchStartedAt)
      });
      measureDiagnosticsSpan("fetch", fetchStartDiagnostic, fetchFailedDiagnostic);
      throw error;
    }
    stopFetchSlowDiagnostics();
    const fetchEndDiagnostic = pageDiagnostic({
      level: "info",
      phase: "fetch",
      event: "fetch-end",
      state: "finished",
      reason: "native-fetch",
      endpointKind,
      durationMs: durationSince(fetchStartedAt),
      ...responseStatusDiagnostics(response)
    });
    measureDiagnosticsSpan("fetch", fetchStartDiagnostic, fetchEndDiagnostic);

    if (settings.suspendOnceForFullReload) {
      settings = skipOnce(settings);
      return response;
    }

    const rewritten = await rewriteConversationResponse(response, settings, endpointKind);
    if (rewritten.status) {
      dispatchStatus(rewritten.status);
    }
    return rewritten.response;
  };

  window.fetch = patchedFetch;
}

installThreadLightFetchProxy();
