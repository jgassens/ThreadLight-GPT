import type { ThreadLightSettingsV1 } from "./types";

export function debugLog(
  settings: ThreadLightSettingsV1,
  message: string,
  details?: Record<string, unknown>
): void {
  if (!settings.debug) {
    return;
  }

  if (details) {
    console.debug("[ThreadLight]", message, details);
    return;
  }

  console.debug("[ThreadLight]", message);
}
