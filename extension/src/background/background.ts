import {
  THREADLIGHT_GET_SETTINGS_MESSAGE,
  THREADLIGHT_RESTORE_MESSAGE,
  THREADLIGHT_UPDATE_SETTINGS_MESSAGE
} from "../shared/constants";
import {
  addRuntimeMessageListener,
  getSettings,
  reloadCurrentTab,
  updateSettings
} from "../shared/storage";
import { isRecord } from "../shared/settings";
import type { ThreadLightRuntimeMessage, ThreadLightRuntimeResponse } from "../shared/types";


function isRuntimeMessage(value: unknown): value is ThreadLightRuntimeMessage {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }

  if (
    value.type === THREADLIGHT_RESTORE_MESSAGE ||
    value.type === THREADLIGHT_GET_SETTINGS_MESSAGE
  ) {
    return true;
  }

  return value.type === THREADLIGHT_UPDATE_SETTINGS_MESSAGE && isRecord(value.patch);
}

addRuntimeMessageListener((message, _sender, sendResponse) => {
  if (!isRuntimeMessage(message)) {
    return false;
  }

  void (async (): Promise<void> => {
    let response: ThreadLightRuntimeResponse = { ok: true };
    try {
      if (message.type === THREADLIGHT_GET_SETTINGS_MESSAGE) {
        response = { ok: true, settings: await getSettings() };
      } else if (message.type === THREADLIGHT_UPDATE_SETTINGS_MESSAGE) {
        response = { ok: true, settings: await updateSettings(message.patch) };
      } else {
        const settings = await updateSettings({ suspendOnceForFullReload: true });
        await reloadCurrentTab();
        response = { ok: true, settings };
      }
    } catch {
      response = { ok: false, reason: "runtime-message-failed" };
    }
    sendResponse(response);
  })();

  return true;
});

