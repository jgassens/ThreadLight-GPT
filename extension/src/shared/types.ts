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
  | "trimmed"
  | "noop"
  | "unrecognized"
  | "disabled"
  | "paused"
  | "error";

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

export type ThreadLightRuntimeMessage =
  | ThreadLightRestoreFullThreadMessage
  | ThreadLightGetSettingsMessage
  | ThreadLightUpdateSettingsMessage;

export interface ThreadLightRuntimeResponse {
  ok: boolean;
  reason?: string;
  settings?: ThreadLightSettingsV1;
}
