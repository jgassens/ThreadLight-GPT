import { THREADLIGHT_DIAGNOSTIC_EVENT } from "./constants";
import { isRecord } from "./settings";
import type {
  ThreadLightDiagnosticContentTypeKind,
  ThreadLightDiagnosticEndpointKind,
  ThreadLightDiagnosticEventDetail,
  ThreadLightDiagnosticEventName,
  ThreadLightDiagnosticLevel,
  ThreadLightDiagnosticPhase,
  ThreadLightDiagnosticReason,
  ThreadLightDiagnosticSource,
  ThreadLightDiagnosticState,
  ThreadLightDiagnosticStatusCodeClass
} from "./types";

const MAX_SAFE_STRING_LENGTH = 64;
const MAX_SAFE_NUMBER = Number.MAX_SAFE_INTEGER;
const URL_LIKE_PATTERN = /(?:https?:\/\/|www\.|[a-z0-9.-]+\.[a-z]{2,}\/)/i;
const UUID_LIKE_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;

const DIAGNOSTIC_SOURCES = new Set<ThreadLightDiagnosticSource>([
  "page-proxy",
  "page-inject",
  "content",
  "dom-pruner",
  "user-collapse",
  "background",
  "popup"
]);

const DIAGNOSTIC_LEVELS = new Set<ThreadLightDiagnosticLevel>(["debug", "info", "warn", "error"]);

const DIAGNOSTIC_PHASES = new Set<ThreadLightDiagnosticPhase>([
  "startup",
  "config",
  "fetch",
  "response",
  "trim",
  "dom",
  "navigation",
  "restore",
  "settings",
  "diagnostics",
  "performance",
  "popup"
]);

const DIAGNOSTIC_ENDPOINT_KINDS = new Set<ThreadLightDiagnosticEndpointKind>([
  "conversation",
  "shared_conversation",
  "other-backend-api",
  "unmatched"
]);

const DIAGNOSTIC_STATES = new Set<ThreadLightDiagnosticState>([
  "started",
  "pending",
  "finished",
  "accepted",
  "rejected",
  "trimmed",
  "noop",
  "unrecognized",
  "disabled",
  "paused",
  "error",
  "skipped",
  "applied",
  "deferred",
  "cleared",
  "timeout",
  "empty",
  "active"
]);

const DIAGNOSTIC_REASONS = new Set<ThreadLightDiagnosticReason>([
  "trimmed",
  "no-op",
  "disabled",
  "unrecognized",
  "error",
  "suspended-once",
  "navigation",
  "non-json",
  "config-timeout",
  "config-received",
  "native-fetch",
  "native-fetch-failed",
  "body-read",
  "body-read-failed",
  "body-read-slow",
  "json-parse",
  "json-parse-failed",
  "rewrapped",
  "modified",
  "streaming-branch",
  "within-limit",
  "below-trim-threshold",
  "no-visible-suffix",
  "not-object",
  "missing-mapping-or-current-node",
  "missing-or-cyclic-active-path",
  "fallback-injection",
  "main-world",
  "already-active",
  "settings-applied",
  "scrolling",
  "mutating",
  "signature-unchanged",
  "no-turns",
  "below-dom-threshold",
  "diagnostics-disabled",
  "content-script-unavailable",
  "page-not-ready",
  "chatgpt-tab-not-active",
  "old-build-mismatch",
  "restricted-page",
  "cleared",
  "malformed-diagnostic",
  "duplicate-diagnostic",
  "main-thread-stall",
  "environment-sample",
  "longtask",
  "unknown"
]);

const DIAGNOSTIC_EVENTS = new Set<ThreadLightDiagnosticEventName>([
  "proxy-install",
  "main-world-active",
  "fallback-injection-used",
  "fallback-injection-skipped",
  "config-requested",
  "config-received",
  "config-wait-timeout",
  "fetch-matched",
  "fetch-start",
  "fetch-end",
  "fetch-failed",
  "body-read-start",
  "body-read-slow",
  "body-read-end",
  "body-read-failed",
  "json-parse-start",
  "json-parse-end",
  "json-parse-failed",
  "trim-start",
  "trim-result",
  "response-rewrite-start",
  "response-rewrite-end",
  "response-rewrapped",
  "response-modified",
  "restore-suspended-once",
  "fail-open",
  "content-init",
  "version-marker",
  "settings-applied",
  "proxy-ready-message",
  "status-event-accepted",
  "status-event-rejected",
  "diagnostic-event-rejected",
  "navigation-event",
  "dom-prune-scheduled",
  "dom-prune-deferred",
  "dom-prune-applied",
  "dom-prune-skipped",
  "user-collapse-mode",
  "diagnostics-cleared",
  "diagnostics-requested",
  "diagnostics-response",
  "main-thread-stall",
  "environment-sample",
  "longtask-observed",
  "popup-state"
]);

const STATUS_CODE_CLASSES = new Set<ThreadLightDiagnosticStatusCodeClass>([
  "1xx",
  "2xx",
  "3xx",
  "4xx",
  "5xx",
  "unknown"
]);

const CONTENT_TYPE_KINDS = new Set<ThreadLightDiagnosticContentTypeKind>([
  "json",
  "non-json",
  "missing",
  "unknown"
]);

const DIAGNOSTIC_DETAIL_KEYS = new Set([
  "source",
  "version",
  "diagnosticSource",
  "sourceSequence",
  "bufferSequence",
  "level",
  "phase",
  "event",
  "at",
  "monotonicTime",
  "endpointKind",
  "state",
  "reason",
  "durationMs",
  "elapsedMs",
  "statusCode",
  "statusCodeClass",
  "contentTypeKind",
  "requestByteCount",
  "responseCharCount",
  "totalVisibleTurns",
  "keptVisibleTurns",
  "removedVisibleTurns",
  "totalNodesOnPath",
  "keptNodes",
  "totalDomNodes",
  "totalDomTurns",
  "keptDomTurns",
  "hiddenDomTurns",
  "keepLastTurns"
]);

const SENSITIVE_KEYS = new Set([
  "url",
  "href",
  "conversationid",
  "conversation_id",
  "request",
  "response",
  "headers",
  "cookie",
  "authorization",
  "body",
  "content",
  "text",
  "message",
  "prompt",
  "completion"
]);

const sourceSequences = new Map<ThreadLightDiagnosticSource, number>();

export type ThreadLightDiagnosticInput = Omit<
  ThreadLightDiagnosticEventDetail,
  "source" | "version" | "sourceSequence" | "bufferSequence" | "at" | "monotonicTime"
>;

interface RecordDiagnosticOptions {
  dispatch?: boolean;
  mirrorToConsole?: boolean;
}

function monotonicTime(): number {
  const maybePerformance = globalThis.performance;
  return typeof maybePerformance?.now === "function" ? maybePerformance.now() : Date.now();
}

function nextSourceSequence(source: ThreadLightDiagnosticSource): number {
  const next = (sourceSequences.get(source) ?? 0) + 1;
  sourceSequences.set(source, next);
  return next;
}

function isSafeString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_SAFE_STRING_LENGTH &&
    !URL_LIKE_PATTERN.test(value) &&
    !UUID_LIKE_PATTERN.test(value)
  );
}

function isSafeNumber(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= MAX_SAFE_NUMBER
  );
}

function isSafeInteger(value: unknown): value is number {
  return Number.isInteger(value) && isSafeNumber(value);
}

function hasOnlyAllowedKeys(record: Record<string, unknown>): boolean {
  return Object.keys(record).every((key) => {
    const normalized = key.toLowerCase();
    return DIAGNOSTIC_DETAIL_KEYS.has(key) && !SENSITIVE_KEYS.has(normalized);
  });
}

function isOptionalSafeNumber(record: Record<string, unknown>, key: string): boolean {
  const value = record[key];
  return value === undefined || isSafeNumber(value);
}

function readOptionalSafeNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return isSafeNumber(value) ? value : undefined;
}

function readOptionalSafeInteger(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return isSafeInteger(value) ? value : undefined;
}

function readOptionalEnum<T extends string>(
  record: Record<string, unknown>,
  key: string,
  values: Set<T>
): T | undefined {
  const value = record[key];
  return isSafeString(value) && values.has(value as T) ? (value as T) : undefined;
}

function isOptionalEnum<T extends string>(
  record: Record<string, unknown>,
  key: string,
  values: Set<T>
): boolean {
  return record[key] === undefined || readOptionalEnum(record, key, values) !== undefined;
}

export function statusCodeClass(statusCode: number): ThreadLightDiagnosticStatusCodeClass {
  if (statusCode >= 100 && statusCode < 200) {
    return "1xx";
  }
  if (statusCode >= 200 && statusCode < 300) {
    return "2xx";
  }
  if (statusCode >= 300 && statusCode < 400) {
    return "3xx";
  }
  if (statusCode >= 400 && statusCode < 500) {
    return "4xx";
  }
  if (statusCode >= 500 && statusCode < 600) {
    return "5xx";
  }
  return "unknown";
}

export function contentTypeKind(contentType: string | null): ThreadLightDiagnosticContentTypeKind {
  if (contentType === null || contentType.length === 0) {
    return "missing";
  }
  return contentType.toLowerCase().includes("json") ? "json" : "non-json";
}

export function diagnosticReasonFromTrimReason(reason: string): ThreadLightDiagnosticReason {
  if (reason === "Conversation response is not an object.") {
    return "not-object";
  }
  if (reason === "Missing mapping or current_node.") {
    return "missing-mapping-or-current-node";
  }
  if (reason === "Active path is missing or cyclic.") {
    return "missing-or-cyclic-active-path";
  }
  if (DIAGNOSTIC_REASONS.has(reason as ThreadLightDiagnosticReason)) {
    return reason as ThreadLightDiagnosticReason;
  }
  return "unknown";
}

export function sanitizeDiagnostic(value: unknown): ThreadLightDiagnosticEventDetail | undefined {
  if (!isRecord(value) || !hasOnlyAllowedKeys(value)) {
    return undefined;
  }

  if (
    value.source !== "threadlight" ||
    value.version !== 1 ||
    !isSafeString(value.diagnosticSource) ||
    !DIAGNOSTIC_SOURCES.has(value.diagnosticSource as ThreadLightDiagnosticSource) ||
    !isSafeInteger(value.sourceSequence) ||
    (value.bufferSequence !== undefined && !isSafeInteger(value.bufferSequence)) ||
    !isSafeString(value.level) ||
    !DIAGNOSTIC_LEVELS.has(value.level as ThreadLightDiagnosticLevel) ||
    !isSafeString(value.phase) ||
    !DIAGNOSTIC_PHASES.has(value.phase as ThreadLightDiagnosticPhase) ||
    !isSafeString(value.event) ||
    !DIAGNOSTIC_EVENTS.has(value.event as ThreadLightDiagnosticEventName) ||
    !isSafeNumber(value.at) ||
    !isSafeNumber(value.monotonicTime) ||
    !isOptionalEnum(value, "endpointKind", DIAGNOSTIC_ENDPOINT_KINDS) ||
    !isOptionalEnum(value, "state", DIAGNOSTIC_STATES) ||
    !isOptionalEnum(value, "reason", DIAGNOSTIC_REASONS) ||
    !isOptionalEnum(value, "statusCodeClass", STATUS_CODE_CLASSES) ||
    !isOptionalEnum(value, "contentTypeKind", CONTENT_TYPE_KINDS)
  ) {
    return undefined;
  }

  const numberKeys = [
    "durationMs",
    "elapsedMs",
    "requestByteCount",
    "responseCharCount",
    "totalVisibleTurns",
    "keptVisibleTurns",
    "removedVisibleTurns",
    "totalNodesOnPath",
    "keptNodes",
    "totalDomNodes",
    "totalDomTurns",
    "keptDomTurns",
    "hiddenDomTurns",
    "keepLastTurns"
  ];
  if (!numberKeys.every((key) => isOptionalSafeNumber(value, key))) {
    return undefined;
  }

  const statusCodeValue = value.statusCode;
  if (statusCodeValue !== undefined) {
    if (
      !Number.isInteger(statusCodeValue) ||
      typeof statusCodeValue !== "number" ||
      statusCodeValue < 100 ||
      statusCodeValue > 599
    ) {
      return undefined;
    }
  }

  const detail: ThreadLightDiagnosticEventDetail = {
    source: "threadlight",
    version: 1,
    diagnosticSource: value.diagnosticSource as ThreadLightDiagnosticSource,
    sourceSequence: value.sourceSequence,
    level: value.level as ThreadLightDiagnosticLevel,
    phase: value.phase as ThreadLightDiagnosticPhase,
    event: value.event as ThreadLightDiagnosticEventName,
    at: value.at,
    monotonicTime: value.monotonicTime
  };

  const bufferSequence = readOptionalSafeInteger(value, "bufferSequence");
  if (bufferSequence !== undefined) {
    detail.bufferSequence = bufferSequence;
  }

  const endpointKind = readOptionalEnum(value, "endpointKind", DIAGNOSTIC_ENDPOINT_KINDS);
  if (endpointKind !== undefined) {
    detail.endpointKind = endpointKind;
  }

  const state = readOptionalEnum(value, "state", DIAGNOSTIC_STATES);
  if (state !== undefined) {
    detail.state = state;
  }

  const reason = readOptionalEnum(value, "reason", DIAGNOSTIC_REASONS);
  if (reason !== undefined) {
    detail.reason = reason;
  }

  const statusClass = readOptionalEnum(value, "statusCodeClass", STATUS_CODE_CLASSES);
  if (statusClass !== undefined) {
    detail.statusCodeClass = statusClass;
  }

  const contentKind = readOptionalEnum(value, "contentTypeKind", CONTENT_TYPE_KINDS);
  if (contentKind !== undefined) {
    detail.contentTypeKind = contentKind;
  }

  const statusCode = readOptionalSafeInteger(value, "statusCode");
  if (statusCode !== undefined) {
    detail.statusCode = statusCode;
  }

  numberKeys.forEach((key) => {
    const numberValue = readOptionalSafeNumber(value, key);
    if (numberValue !== undefined) {
      (detail as unknown as Record<string, unknown>)[key] = numberValue;
    }
  });

  return detail;
}

export function isThreadLightDiagnosticDetail(
  value: unknown
): value is ThreadLightDiagnosticEventDetail {
  return sanitizeDiagnostic(value) !== undefined;
}

export function dispatchDiagnostic(detail: ThreadLightDiagnosticEventDetail): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent(THREADLIGHT_DIAGNOSTIC_EVENT, { detail }));
}

function consolePayload(detail: ThreadLightDiagnosticEventDetail): Record<string, number | string> {
  const payload: Record<string, number | string> = {
    phase: detail.phase,
    event: detail.event,
    state: detail.state ?? "pending",
    reason: detail.reason ?? "unknown"
  };

  if (detail.endpointKind !== undefined) {
    payload.endpointKind = detail.endpointKind;
  }
  if (detail.durationMs !== undefined) {
    payload.durationMs = detail.durationMs;
  }
  if (detail.elapsedMs !== undefined) {
    payload.elapsedMs = detail.elapsedMs;
  }
  if (detail.statusCodeClass !== undefined) {
    payload.statusCodeClass = detail.statusCodeClass;
  }
  if (detail.responseCharCount !== undefined) {
    payload.responseCharCount = detail.responseCharCount;
  }
  if (detail.totalVisibleTurns !== undefined) {
    payload.totalVisibleTurns = detail.totalVisibleTurns;
  }
  if (detail.removedVisibleTurns !== undefined) {
    payload.removedVisibleTurns = detail.removedVisibleTurns;
  }
  if (detail.totalDomTurns !== undefined) {
    payload.totalDomTurns = detail.totalDomTurns;
  }
  if (detail.hiddenDomTurns !== undefined) {
    payload.hiddenDomTurns = detail.hiddenDomTurns;
  }
  if (detail.totalDomNodes !== undefined) {
    payload.totalDomNodes = detail.totalDomNodes;
  }

  return payload;
}

export function emitDiagnosticConsole(detail: ThreadLightDiagnosticEventDetail): void {
  if (typeof console === "undefined") {
    return;
  }

  const buffer = detail.bufferSequence === undefined ? "" : `[buffer#${detail.bufferSequence}]`;
  const label = `[ThreadLight][${detail.diagnosticSource}#${detail.sourceSequence}]${buffer} ${detail.event}`;
  const payload = consolePayload(detail);

  if (typeof console.timeStamp === "function") {
    console.timeStamp(
      `ThreadLight ${detail.diagnosticSource}#${detail.sourceSequence} ${detail.event}`
    );
  }

  if (detail.level === "error") {
    console.error(label, payload);
    return;
  }
  if (detail.level === "warn") {
    console.warn(label, payload);
    return;
  }
  if (detail.level === "info") {
    console.info(label, payload);
    return;
  }
  console.debug(label, payload);
}

export function recordDiagnostic(
  input: ThreadLightDiagnosticInput,
  options: RecordDiagnosticOptions = {}
): ThreadLightDiagnosticEventDetail | undefined {
  const candidate = {
    source: "threadlight",
    version: 1,
    sourceSequence: nextSourceSequence(input.diagnosticSource),
    at: Date.now(),
    monotonicTime: monotonicTime(),
    ...input
  };
  const detail = sanitizeDiagnostic(candidate);
  if (!detail) {
    return undefined;
  }

  if (options.dispatch !== false) {
    dispatchDiagnostic(detail);
  }
  if (options.mirrorToConsole !== false) {
    emitDiagnosticConsole(detail);
  }
  return detail;
}

export function formatDiagnosticsJsonl(
  entries: readonly ThreadLightDiagnosticEventDetail[]
): string {
  return entries
    .map(sanitizeDiagnostic)
    .filter((entry): entry is ThreadLightDiagnosticEventDetail => entry !== undefined)
    .map((entry) => JSON.stringify(entry))
    .join("\n");
}

export function formatDiagnosticsSummary(
  entries: readonly ThreadLightDiagnosticEventDetail[]
): string {
  const safeEntries = entries
    .map(sanitizeDiagnostic)
    .filter((entry): entry is ThreadLightDiagnosticEventDetail => entry !== undefined);

  if (safeEntries.length === 0) {
    return "ThreadLight diagnostics: no entries.";
  }

  const lines = [`ThreadLight diagnostics: ${safeEntries.length} entries.`];
  safeEntries.forEach((entry) => {
    const sequence = entry.bufferSequence ?? entry.sourceSequence;
    const time = new Date(entry.at).toISOString();
    const state = entry.state ?? "pending";
    const reason = entry.reason ?? "unknown";
    const endpoint = entry.endpointKind ?? "unmatched";
    const duration =
      entry.durationMs === undefined ? "" : ` duration=${entry.durationMs.toFixed(1)}ms`;
    const counts =
      entry.totalVisibleTurns === undefined
        ? ""
        : ` visible=${entry.keptVisibleTurns ?? 0}/${entry.totalVisibleTurns}`;
    lines.push(
      `#${sequence} ${time} ${entry.diagnosticSource} ${entry.level} ${entry.phase}/${entry.event} state=${state} reason=${reason} endpoint=${endpoint}${duration}${counts}`
    );
  });
  return lines.join("\n");
}
