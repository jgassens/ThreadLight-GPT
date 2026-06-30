import { SETTINGS_PAGE_STORAGE_KEY, THREADLIGHT_CONFIG_EVENT, THREADLIGHT_STATUS_EVENT } from "./constants";
import {
  DEFAULT_SETTINGS,
  isRecord,
  normalizeSettings,
  settingsToJson,
  settingsToPageConfig
} from "./settings";
import type {
  ThreadLightSettingsV1,
  ThreadLightStatusEventDetail,
  ThreadLightStatusReason,
  ThreadLightStatusState,
  TrimResult,
  TrimStats
} from "./types";

const STATUS_STATES = new Set(["trimmed", "noop", "unrecognized", "disabled", "paused", "error"]);
const STATUS_REASONS = new Set([
  "trimmed",
  "no-op",
  "disabled",
  "unrecognized",
  "error",
  "suspended-once",
  "navigation",
  "non-json"
]);
const STATUS_DETAIL_KEYS = new Set([
  "source",
  "version",
  "enabled",
  "recognized",
  "state",
  "keepLastTurns",
  "lastUpdatedAt",
  "totalVisibleTurns",
  "keptVisibleTurns",
  "removedVisibleTurns",
  "totalNodesOnPath",
  "keptNodes",
  "reason"
]);

export function readSettingsFromPage(): ThreadLightSettingsV1 {
  if (typeof window === "undefined") {
    return { ...DEFAULT_SETTINGS };
  }

  try {
    const raw = window.localStorage.getItem(SETTINGS_PAGE_STORAGE_KEY);
    return raw ? normalizeSettings(JSON.parse(raw)) : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function dispatchSettingsForPage(settings: ThreadLightSettingsV1): void {
  if (typeof window === "undefined") {
    return;
  }

  const json = settingsToJson(settings);
  window.dispatchEvent(new CustomEvent(THREADLIGHT_CONFIG_EVENT, { detail: json }));
}

export function writeSettingsForPage(settings: ThreadLightSettingsV1): void {
  if (typeof window === "undefined") {
    return;
  }

  const json = settingsToJson(settings);
  try {
    window.localStorage.setItem(SETTINGS_PAGE_STORAGE_KEY, json);
  } catch {
    // Storage can be unavailable in private or restricted contexts. The event still carries config.
  }
  window.dispatchEvent(new CustomEvent(THREADLIGHT_CONFIG_EVENT, { detail: json }));
}

export function parseSettingsEventDetail(detail: unknown): ThreadLightSettingsV1 {
  if (typeof detail === "string") {
    try {
      return normalizeSettings(JSON.parse(detail));
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }
  return normalizeSettings(detail);
}

function emptyStats(): TrimStats {
  return {
    totalVisibleTurns: 0,
    keptVisibleTurns: 0,
    removedVisibleTurns: 0,
    totalNodesOnPath: 0,
    keptNodes: 0
  };
}

export function makeThreadLightStatusDetail(input: {
  settings: ThreadLightSettingsV1;
  state: ThreadLightStatusState;
  recognized: boolean;
  reason?: ThreadLightStatusReason | undefined;
  stats?: TrimStats | undefined;
  now?: number | undefined;
}): ThreadLightStatusEventDetail {
  const pageConfig = settingsToPageConfig(input.settings);
  const stats = input.stats ?? emptyStats();
  const detail: ThreadLightStatusEventDetail = {
    source: "threadlight",
    version: 1,
    enabled: pageConfig.enabled,
    recognized: input.recognized,
    state: input.state,
    keepLastTurns: pageConfig.keepLastTurns,
    lastUpdatedAt: input.now ?? Date.now(),
    ...stats
  };
  if (input.reason) {
    detail.reason = input.reason;
  }
  return detail;
}

export function statusFromTrimResult(
  result: TrimResult,
  settings: ThreadLightSettingsV1,
  now?: number
): ThreadLightStatusEventDetail {
  if (result.kind === "trimmed") {
    return makeThreadLightStatusDetail({
      settings,
      state: "trimmed",
      recognized: true,
      reason: "trimmed",
      stats: result.stats,
      now
    });
  }

  if (result.kind === "noop") {
    return makeThreadLightStatusDetail({
      settings,
      state: "noop",
      recognized: true,
      reason: "no-op",
      stats: result.stats,
      now
    });
  }

  return makeThreadLightStatusDetail({
    settings,
    state: "unrecognized",
    recognized: false,
    reason: "unrecognized",
    now
  });
}

function isOptionalFiniteNumber(record: Record<string, unknown>, key: string): boolean {
  const value = record[key];
  return value === undefined || (typeof value === "number" && Number.isFinite(value));
}

export function isThreadLightStatusDetail(value: unknown): value is ThreadLightStatusEventDetail {
  if (!isRecord(value)) {
    return false;
  }

  if (Object.keys(value).some((key) => !STATUS_DETAIL_KEYS.has(key))) {
    return false;
  }

  return (
    value.source === "threadlight" &&
    value.version === 1 &&
    typeof value.enabled === "boolean" &&
    typeof value.recognized === "boolean" &&
    typeof value.state === "string" &&
    STATUS_STATES.has(value.state) &&
    typeof value.keepLastTurns === "number" &&
    Number.isFinite(value.keepLastTurns) &&
    typeof value.lastUpdatedAt === "number" &&
    Number.isFinite(value.lastUpdatedAt) &&
    isOptionalFiniteNumber(value, "totalVisibleTurns") &&
    isOptionalFiniteNumber(value, "keptVisibleTurns") &&
    isOptionalFiniteNumber(value, "removedVisibleTurns") &&
    isOptionalFiniteNumber(value, "totalNodesOnPath") &&
    isOptionalFiniteNumber(value, "keptNodes") &&
    (value.reason === undefined ||
      (typeof value.reason === "string" && STATUS_REASONS.has(value.reason)))
  );
}

export function dispatchStatus(detail: ThreadLightStatusEventDetail): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent(THREADLIGHT_STATUS_EVENT, { detail }));
}
