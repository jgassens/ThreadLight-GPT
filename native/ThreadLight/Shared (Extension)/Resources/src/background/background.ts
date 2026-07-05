import {
  THREADLIGHT_CLEAR_DIAGNOSTICS_MESSAGE,
  THREADLIGHT_GET_DIAGNOSTICS_MESSAGE,
  THREADLIGHT_GET_SETTINGS_MESSAGE,
  THREADLIGHT_RESTORE_MESSAGE,
  THREADLIGHT_TAB_CLEAR_DIAGNOSTICS_MESSAGE,
  THREADLIGHT_TAB_GET_DIAGNOSTICS_MESSAGE,
  THREADLIGHT_UPDATE_SETTINGS_MESSAGE
} from "../shared/constants";
import {
  addRuntimeMessageListener,
  getActiveChatGptTabId,
  getSettings,
  reloadTab,
  sendTabMessage,
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
    value.type === THREADLIGHT_GET_SETTINGS_MESSAGE ||
    value.type === THREADLIGHT_GET_DIAGNOSTICS_MESSAGE ||
    value.type === THREADLIGHT_CLEAR_DIAGNOSTICS_MESSAGE
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
      } else if (
        message.type === THREADLIGHT_GET_DIAGNOSTICS_MESSAGE ||
        message.type === THREADLIGHT_CLEAR_DIAGNOSTICS_MESSAGE
      ) {
        const tabId = await getActiveChatGptTabId();
        if (tabId === undefined) {
          response = {
            ok: false,
            reason: "chatgpt-tab-not-active",
            diagnosticsState: "no-active-chatgpt-tab"
          };
          sendResponse(response);
          return;
        }
        response = await sendTabMessage(tabId, {
          type:
            message.type === THREADLIGHT_GET_DIAGNOSTICS_MESSAGE
              ? THREADLIGHT_TAB_GET_DIAGNOSTICS_MESSAGE
              : THREADLIGHT_TAB_CLEAR_DIAGNOSTICS_MESSAGE
        });
      } else {
        const tabId = await getActiveChatGptTabId();
        if (tabId === undefined) {
          response = { ok: false, reason: "chatgpt-tab-not-active" };
          sendResponse(response);
          return;
        }
        const settings = await updateSettings({ suspendOnceForFullReload: true });
        const didReload = await reloadTab(tabId);
        if (!didReload) {
          const restoredSettings = await updateSettings({ suspendOnceForFullReload: false });
          response = { ok: false, reason: "tab-reload-failed", settings: restoredSettings };
          sendResponse(response);
          return;
        }
        response = { ok: true, settings };
      }
    } catch {
      response = { ok: false, reason: "runtime-message-failed" };
    }
    sendResponse(response);
  })();

  return true;
});
