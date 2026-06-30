import type { JsonObject, ThreadLightPageConfigV1, ThreadLightSettingsV1 } from "./types";

export const MIN_KEEP_LAST_TURNS = 5;
export const MAX_KEEP_LAST_TURNS = 100;
// Ultra lean mode caps the kept turns well below the slider for maximum responsiveness.
export const ULTRA_LEAN_KEEP_LAST_TURNS = 8;

export const DEFAULT_SETTINGS: ThreadLightSettingsV1 = Object.freeze({
  version: 1,
  enabled: true,
  keepLastTurns: 20,
  showStatusPill: false,
  ultraLeanMode: false,
  collapseLongUserMessages: false,
  debug: false,
  suspendOnceForFullReload: false
});

export function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readBoolean(record: JsonObject, key: keyof ThreadLightSettingsV1): boolean {
  const value = record[key];
  const fallback = DEFAULT_SETTINGS[key];
  return typeof value === "boolean" ? value : Boolean(fallback);
}

export function clampKeepLastTurns(value: unknown): number {
  const numericValue = typeof value === "number" && Number.isFinite(value) ? value : DEFAULT_SETTINGS.keepLastTurns;
  const rounded = Math.round(numericValue);
  return Math.min(MAX_KEEP_LAST_TURNS, Math.max(MIN_KEEP_LAST_TURNS, rounded));
}

// The number of turns actually kept once ultra lean mode is taken into account.
export function effectiveKeepLastTurns(
  settings: Pick<ThreadLightSettingsV1, "keepLastTurns" | "ultraLeanMode">
): number {
  const keep = clampKeepLastTurns(settings.keepLastTurns);
  return settings.ultraLeanMode ? Math.min(keep, ULTRA_LEAN_KEEP_LAST_TURNS) : keep;
}

export function normalizeSettings(value: unknown): ThreadLightSettingsV1 {
  if (!isRecord(value)) {
    return { ...DEFAULT_SETTINGS };
  }

  return {
    version: 1,
    enabled: readBoolean(value, "enabled"),
    keepLastTurns: clampKeepLastTurns(value.keepLastTurns),
    showStatusPill: readBoolean(value, "showStatusPill"),
    ultraLeanMode: readBoolean(value, "ultraLeanMode"),
    collapseLongUserMessages: readBoolean(value, "collapseLongUserMessages"),
    debug: readBoolean(value, "debug"),
    suspendOnceForFullReload: readBoolean(value, "suspendOnceForFullReload")
  };
}

export function mergeSettings(
  current: ThreadLightSettingsV1,
  patch: Partial<ThreadLightSettingsV1>
): ThreadLightSettingsV1 {
  return normalizeSettings({ ...current, ...patch, version: 1 });
}

export function settingsToPageConfig(settings: ThreadLightSettingsV1): ThreadLightPageConfigV1 {
  const normalized = normalizeSettings(settings);
  return {
    version: 1,
    enabled: normalized.enabled,
    keepLastTurns: normalized.keepLastTurns,
    showStatusPill: normalized.showStatusPill,
    ultraLeanMode: normalized.ultraLeanMode,
    collapseLongUserMessages: normalized.collapseLongUserMessages,
    debug: normalized.debug,
    suspendOnceForFullReload: normalized.suspendOnceForFullReload
  };
}

export function settingsToJson(settings: ThreadLightSettingsV1): string {
  return JSON.stringify(settingsToPageConfig(settings));
}
