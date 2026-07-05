export type JsonObject = Record<string, unknown>;

export interface ThreadLightSettingsV1 {
  version: 1;
  enabled: boolean;
  keepLastTurns: number;
  showStatusPill: boolean;
  ultraLeanMode: boolean;
  collapseLongUserMessages: boolean;
  debug: boolean;
  suspendOnceForFullReload: boolean;
}

export interface ThreadLightPageConfigV1 {
  version: 1;
  enabled: boolean;
  keepLastTurns: number;
  showStatusPill: boolean;
  ultraLeanMode: boolean;
  collapseLongUserMessages: boolean;
  debug: boolean;
  suspendOnceForFullReload: boolean;
}

export interface TrimStats {
  totalVisibleTurns: number;
  keptVisibleTurns: number;
  removedVisibleTurns: number;
  totalNodesOnPath: number;
  keptNodes: number;
}

export type TrimResult =
  | {
      kind: "trimmed";
      data: JsonObject;
      stats: TrimStats;
    }
  | {
      kind: "noop";
      data: unknown;
      stats: TrimStats;
      reason: string;
    }
  | {
      kind: "unrecognized";
      data: unknown;
      reason: string;
    };

export type ThreadLightStatusState =
  "trimmed" | "noop" | "unrecognized" | "disabled" | "paused" | "error";

export type ThreadLightStatusReason =
  | "trimmed"
  | "no-op"
  | "disabled"
  | "unrecognized"
  | "error"
  | "suspended-once"
  | "navigation"
  | "non-json";

export interface ThreadLightStatusEventDetail {
  source: "threadlight";
  version: 1;
  enabled: boolean;
  recognized: boolean;
  state: ThreadLightStatusState;
  keepLastTurns: number;
  lastUpdatedAt: number;
  totalVisibleTurns?: number;
  keptVisibleTurns?: number;
  removedVisibleTurns?: number;
  totalNodesOnPath?: number;
  keptNodes?: number;
  reason?: ThreadLightStatusReason;
}

export type ThreadLightDiagnosticSource =
  | "page-proxy"
  | "page-inject"
  | "content"
  | "dom-pruner"
  | "user-collapse"
  | "background"
  | "popup";

export type ThreadLightDiagnosticLevel = "debug" | "info" | "warn" | "error";

export type ThreadLightDiagnosticPhase =
  | "startup"
  | "config"
  | "fetch"
  | "response"
  | "trim"
  | "dom"
  | "navigation"
  | "restore"
  | "settings"
  | "diagnostics"
  | "performance"
  | "popup";

export type ThreadLightDiagnosticEndpointKind =
  "conversation" | "shared_conversation" | "other-backend-api" | "unmatched";

export type ThreadLightDiagnosticState =
  | "started"
  | "pending"
  | "finished"
  | "accepted"
  | "rejected"
  | "trimmed"
  | "noop"
  | "unrecognized"
  | "disabled"
  | "paused"
  | "error"
  | "skipped"
  | "applied"
  | "deferred"
  | "cleared"
  | "timeout"
  | "empty"
  | "active";

export type ThreadLightDiagnosticReason =
  | ThreadLightStatusReason
  | "config-timeout"
  | "config-received"
  | "native-fetch"
  | "native-fetch-failed"
  | "body-read"
  | "body-read-failed"
  | "body-read-slow"
  | "json-parse"
  | "json-parse-failed"
  | "rewrapped"
  | "modified"
  | "streaming-branch"
  | "within-limit"
  | "below-trim-threshold"
  | "no-visible-suffix"
  | "not-object"
  | "missing-mapping-or-current-node"
  | "missing-or-cyclic-active-path"
  | "fallback-injection"
  | "main-world"
  | "already-active"
  | "settings-applied"
  | "scrolling"
  | "mutating"
  | "signature-unchanged"
  | "no-turns"
  | "below-dom-threshold"
  | "diagnostics-disabled"
  | "content-script-unavailable"
  | "page-not-ready"
  | "chatgpt-tab-not-active"
  | "old-build-mismatch"
  | "restricted-page"
  | "cleared"
  | "malformed-diagnostic"
  | "duplicate-diagnostic"
  | "main-thread-stall"
  | "environment-sample"
  | "longtask"
  | "unknown";

export type ThreadLightDiagnosticEventName =
  | "proxy-install"
  | "main-world-active"
  | "fallback-injection-used"
  | "fallback-injection-skipped"
  | "config-requested"
  | "config-received"
  | "config-wait-timeout"
  | "fetch-matched"
  | "fetch-start"
  | "fetch-end"
  | "fetch-failed"
  | "body-read-start"
  | "body-read-slow"
  | "body-read-end"
  | "body-read-failed"
  | "json-parse-start"
  | "json-parse-end"
  | "json-parse-failed"
  | "trim-start"
  | "trim-result"
  | "response-rewrite-start"
  | "response-rewrite-end"
  | "response-rewrapped"
  | "response-modified"
  | "restore-suspended-once"
  | "fail-open"
  | "content-init"
  | "version-marker"
  | "settings-applied"
  | "proxy-ready-message"
  | "status-event-accepted"
  | "status-event-rejected"
  | "diagnostic-event-rejected"
  | "navigation-event"
  | "dom-prune-scheduled"
  | "dom-prune-deferred"
  | "dom-prune-applied"
  | "dom-prune-skipped"
  | "user-collapse-mode"
  | "diagnostics-cleared"
  | "diagnostics-requested"
  | "diagnostics-response"
  | "main-thread-stall"
  | "environment-sample"
  | "longtask-observed"
  | "popup-state";

export type ThreadLightDiagnosticStatusCodeClass =
  "1xx" | "2xx" | "3xx" | "4xx" | "5xx" | "unknown";

export type ThreadLightDiagnosticContentTypeKind = "json" | "non-json" | "missing" | "unknown";

export interface ThreadLightDiagnosticEventDetail {
  source: "threadlight";
  version: 1;
  diagnosticSource: ThreadLightDiagnosticSource;
  sourceSequence: number;
  bufferSequence?: number;
  level: ThreadLightDiagnosticLevel;
  phase: ThreadLightDiagnosticPhase;
  event: ThreadLightDiagnosticEventName;
  at: number;
  monotonicTime: number;
  endpointKind?: ThreadLightDiagnosticEndpointKind;
  state?: ThreadLightDiagnosticState;
  reason?: ThreadLightDiagnosticReason;
  durationMs?: number;
  elapsedMs?: number;
  statusCode?: number;
  statusCodeClass?: ThreadLightDiagnosticStatusCodeClass;
  contentTypeKind?: ThreadLightDiagnosticContentTypeKind;
  eventCount?: number;
  requestByteCount?: number;
  responseCharCount?: number;
  maxDurationMs?: number;
  totalVisibleTurns?: number;
  keptVisibleTurns?: number;
  removedVisibleTurns?: number;
  totalNodesOnPath?: number;
  keptNodes?: number;
  totalDomNodes?: number;
  totalDomTurns?: number;
  keptDomTurns?: number;
  hiddenDomTurns?: number;
  keepLastTurns?: number;
}

export interface ThreadLightProxyReadyMessage {
  source: "threadlight";
  type: "threadlight-proxy-ready";
  version: 1;
}

export interface ThreadLightRestoreFullThreadMessage {
  type: "threadlight-restore-full-thread";
}

export interface ThreadLightGetSettingsMessage {
  type: "threadlight-get-settings";
}

export interface ThreadLightUpdateSettingsMessage {
  type: "threadlight-update-settings";
  patch: Partial<ThreadLightSettingsV1>;
}

export interface ThreadLightGetDiagnosticsMessage {
  type: "threadlight-get-diagnostics";
}

export interface ThreadLightClearDiagnosticsMessage {
  type: "threadlight-clear-diagnostics";
}

export type ThreadLightRuntimeMessage =
  | ThreadLightRestoreFullThreadMessage
  | ThreadLightGetSettingsMessage
  | ThreadLightUpdateSettingsMessage
  | ThreadLightGetDiagnosticsMessage
  | ThreadLightClearDiagnosticsMessage;

export interface ThreadLightTabGetDiagnosticsMessage {
  type: "threadlight-tab-get-diagnostics";
}

export interface ThreadLightTabClearDiagnosticsMessage {
  type: "threadlight-tab-clear-diagnostics";
}

export type ThreadLightTabMessage =
  ThreadLightTabGetDiagnosticsMessage | ThreadLightTabClearDiagnosticsMessage;

export type ThreadLightDiagnosticsState =
  | "diagnostics-disabled"
  | "no-active-chatgpt-tab"
  | "content-script-unavailable"
  | "page-restricted"
  | "page-not-ready"
  | "old-build-mismatch"
  | "empty"
  | "active"
  | "cleared";

export interface ThreadLightRuntimeResponse {
  ok: boolean;
  reason?: string;
  settings?: ThreadLightSettingsV1;
  diagnosticsState?: ThreadLightDiagnosticsState;
  diagnostics?: ThreadLightDiagnosticEventDetail[];
  extensionVersion?: string;
  pageVersion?: string;
}
