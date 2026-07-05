import {
  THREADLIGHT_CLEAR_DIAGNOSTICS_MESSAGE,
  THREADLIGHT_GET_DIAGNOSTICS_MESSAGE,
  SETTINGS_STORAGE_KEY,
  THREADLIGHT_GET_SETTINGS_MESSAGE,
  THREADLIGHT_TAB_CLEAR_DIAGNOSTICS_MESSAGE,
  THREADLIGHT_TAB_GET_DIAGNOSTICS_MESSAGE,
  THREADLIGHT_UPDATE_SETTINGS_MESSAGE
} from "./constants";
import { DEFAULT_SETTINGS, isRecord, mergeSettings, normalizeSettings } from "./settings";
import type {
  ThreadLightRuntimeMessage,
  ThreadLightRuntimeResponse,
  ThreadLightSettingsV1,
  ThreadLightTabMessage
} from "./types";
import { isChatGptUrl } from "./url-matcher";

type StorageItems = Record<string, unknown>;
type StorageChange = { oldValue?: unknown; newValue?: unknown };
type StorageChangeListener = (changes: Record<string, StorageChange>, areaName: string) => void;
export type RuntimeMessageSender = Record<string, unknown>;
type RuntimeSendResponse = (response: ThreadLightRuntimeResponse) => void;
type RuntimeMessageListener = (
  message: unknown,
  sender: RuntimeMessageSender,
  sendResponse: RuntimeSendResponse
) => boolean | void | Promise<ThreadLightRuntimeResponse>;

interface StorageArea {
  get(keys?: string | string[] | StorageItems | null): Promise<StorageItems> | StorageItems | void;
  get(keys: string | string[] | StorageItems | null, callback: (items: StorageItems) => void): void;
  set(items: StorageItems): Promise<void> | void;
  set(items: StorageItems, callback: () => void): void;
}

interface StorageOnChanged {
  addListener(listener: StorageChangeListener): void;
  removeListener?(listener: StorageChangeListener): void;
}

interface ExtensionRuntime {
  getURL(path: string): string;
  getManifest?(): { version?: string };
  lastError?: { message?: string };
  sendMessage?(
    message: ThreadLightRuntimeMessage
  ): Promise<ThreadLightRuntimeResponse> | ThreadLightRuntimeResponse | void;
  sendMessage?(
    message: ThreadLightRuntimeMessage,
    callback: (response: ThreadLightRuntimeResponse) => void
  ): void;
  onMessage?: {
    addListener(listener: RuntimeMessageListener): void;
    removeListener?(listener: RuntimeMessageListener): void;
  };
}

interface ExtensionTab {
  id?: number;
  pendingUrl?: string;
  url?: string;
}

interface ExtensionTabs {
  query(queryInfo: {
    active?: boolean;
    currentWindow?: boolean;
  }): Promise<ExtensionTab[]> | ExtensionTab[] | void;
  query(
    queryInfo: { active?: boolean; currentWindow?: boolean },
    callback: (tabs: ExtensionTab[]) => void
  ): void;
  reload(tabId?: number, reloadProperties?: { bypassCache?: boolean }): Promise<void> | void;
  reload(
    tabId: number | undefined,
    reloadProperties: { bypassCache?: boolean } | undefined,
    callback: () => void
  ): void;
  sendMessage?(
    tabId: number,
    message: ThreadLightTabMessage
  ): Promise<ThreadLightRuntimeResponse> | ThreadLightRuntimeResponse | void;
  sendMessage?(
    tabId: number,
    message: ThreadLightTabMessage,
    callback: (response: ThreadLightRuntimeResponse) => void
  ): void;
}

interface ExtensionApi {
  runtime?: ExtensionRuntime;
  storage?: {
    local?: StorageArea;
    onChanged?: StorageOnChanged;
  };
  tabs?: ExtensionTabs;
}

function getExtensionApi(): ExtensionApi | undefined {
  const globalWithExtensions = globalThis as typeof globalThis & {
    browser?: ExtensionApi;
    chrome?: ExtensionApi;
  };
  return globalWithExtensions.browser ?? globalWithExtensions.chrome;
}

function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
  return isRecord(value) && typeof value.then === "function";
}

function sanitizeStorageItems(value: unknown): StorageItems {
  return isRecord(value) ? value : {};
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

async function storageGet(area: StorageArea, keys: StorageItems): Promise<StorageItems> {
  try {
    const maybeResult = area.get(keys);
    if (isPromiseLike<StorageItems>(maybeResult)) {
      return sanitizeStorageItems(await maybeResult);
    }
    if (isRecord(maybeResult)) {
      return maybeResult;
    }
  } catch {
    // Chrome-style callback APIs may throw when called without a callback.
  }

  return new Promise((resolve) => {
    try {
      area.get(keys, (items) => resolve(sanitizeStorageItems(items)));
    } catch {
      resolve({});
    }
  });
}

async function storageSet(area: StorageArea, items: StorageItems): Promise<void> {
  try {
    const maybeResult = area.set(items);
    if (isPromiseLike<void>(maybeResult)) {
      await maybeResult;
    }
    return;
  } catch {
    // Chrome-style callback APIs may throw when called without a callback.
  }

  await new Promise<void>((resolve) => {
    try {
      area.set(items, () => resolve());
    } catch {
      resolve();
    }
  });
}

async function getSettingsFromRuntime(attempts = 1): Promise<ThreadLightSettingsV1 | undefined> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await sendRuntimeMessage({ type: THREADLIGHT_GET_SETTINGS_MESSAGE });
    if (response.ok && response.settings) {
      return normalizeSettings(response.settings);
    }
    if (attempt < attempts - 1) {
      await delay(150 * (attempt + 1));
    }
  }
  return undefined;
}

export async function getSettings(): Promise<ThreadLightSettingsV1> {
  const area = getExtensionApi()?.storage?.local;
  if (area) {
    const items = await storageGet(area, { [SETTINGS_STORAGE_KEY]: DEFAULT_SETTINGS });
    return normalizeSettings(items[SETTINGS_STORAGE_KEY]);
  }

  return (await getSettingsFromRuntime(2)) ?? { ...DEFAULT_SETTINGS };
}

export async function saveSettings(settings: ThreadLightSettingsV1): Promise<void> {
  const area = getExtensionApi()?.storage?.local;
  if (!area) {
    await sendRuntimeMessage({
      type: THREADLIGHT_UPDATE_SETTINGS_MESSAGE,
      patch: normalizeSettings(settings)
    });
    return;
  }

  await storageSet(area, { [SETTINGS_STORAGE_KEY]: normalizeSettings(settings) });
}

export async function updateSettings(
  patch: Partial<ThreadLightSettingsV1>
): Promise<ThreadLightSettingsV1> {
  const area = getExtensionApi()?.storage?.local;
  if (!area) {
    const response = await sendRuntimeMessage({
      type: THREADLIGHT_UPDATE_SETTINGS_MESSAGE,
      patch
    });
    if (response.ok && response.settings) {
      return normalizeSettings(response.settings);
    }
  }

  const next = mergeSettings(await getSettings(), patch);
  await saveSettings(next);
  return next;
}

export function getRuntimeUrl(path: string): string {
  return getExtensionApi()?.runtime?.getURL(path) ?? path;
}

export function getExtensionVersion(): string {
  return getExtensionApi()?.runtime?.getManifest?.().version ?? "dev";
}

export async function sendRuntimeMessage(
  message: ThreadLightRuntimeMessage
): Promise<ThreadLightRuntimeResponse> {
  const runtime = getExtensionApi()?.runtime;
  if (!runtime?.sendMessage) {
    return { ok: false, reason: "runtime-message-unavailable" };
  }

  try {
    const maybeResult = runtime.sendMessage(message);
    if (isPromiseLike<ThreadLightRuntimeResponse>(maybeResult)) {
      return await maybeResult;
    }
    if (isRecord(maybeResult) && typeof maybeResult.ok === "boolean") {
      return maybeResult as ThreadLightRuntimeResponse;
    }
  } catch {
    // Chrome-style callback APIs may throw when called without a callback.
  }

  return new Promise((resolve) => {
    try {
      runtime.sendMessage?.(message, (response) => {
        resolve(
          isRecord(response) && typeof response.ok === "boolean"
            ? (response as ThreadLightRuntimeResponse)
            : { ok: false, reason: "invalid-runtime-response" }
        );
      });
    } catch {
      resolve({ ok: false, reason: "runtime-message-failed" });
    }
  });
}

export function addRuntimeMessageListener(listener: RuntimeMessageListener): () => void {
  const onMessage = getExtensionApi()?.runtime?.onMessage;
  if (!onMessage) {
    return () => undefined;
  }

  onMessage.addListener(listener);
  return () => onMessage.removeListener?.(listener);
}

async function queryActiveTab(tabs: ExtensionTabs): Promise<ExtensionTab | undefined> {
  try {
    const maybeResult = tabs.query({ active: true, currentWindow: true });
    if (isPromiseLike<ExtensionTab[]>(maybeResult)) {
      return (await maybeResult)[0];
    }
    if (Array.isArray(maybeResult)) {
      return maybeResult[0];
    }
  } catch {
    // Chrome-style callback APIs may throw when called without a callback.
  }

  return new Promise((resolve) => {
    try {
      tabs.query({ active: true, currentWindow: true }, (queriedTabs) => {
        resolve(queriedTabs[0]);
      });
    } catch {
      resolve(undefined);
    }
  });
}

export async function getActiveChatGptTabId(): Promise<number | undefined> {
  const tabs = getExtensionApi()?.tabs;
  if (!tabs?.query) {
    return undefined;
  }

  const activeTab = await queryActiveTab(tabs);
  if (!activeTab || !Number.isInteger(activeTab.id)) {
    return undefined;
  }

  const tabUrl = activeTab.url ?? activeTab.pendingUrl;
  return isChatGptUrl(tabUrl) ? activeTab.id : undefined;
}

function runtimeLastErrorMessage(): string | undefined {
  const lastError = getExtensionApi()?.runtime?.lastError;
  if (!isRecord(lastError)) {
    return undefined;
  }
  return typeof lastError.message === "string" ? lastError.message : "browser runtime error";
}

export async function reloadTab(tabId: number): Promise<boolean> {
  const tabs = getExtensionApi()?.tabs;
  if (!tabs?.reload) {
    return false;
  }

  let usedPromiseApi = false;
  try {
    const maybeResult = tabs.reload(tabId, { bypassCache: false });
    if (isPromiseLike<void>(maybeResult)) {
      usedPromiseApi = true;
      await maybeResult;
    }
    return true;
  } catch {
    if (usedPromiseApi) {
      return false;
    }
    // Chrome-style callback APIs may throw when called without a callback.
  }

  return new Promise<boolean>((resolve) => {
    try {
      tabs.reload(tabId, { bypassCache: false }, () =>
        resolve(runtimeLastErrorMessage() === undefined)
      );
    } catch {
      resolve(false);
    }
  });
}

export async function sendTabMessage(
  tabId: number,
  message: ThreadLightTabMessage
): Promise<ThreadLightRuntimeResponse> {
  const tabs = getExtensionApi()?.tabs;
  if (!tabs?.sendMessage) {
    return { ok: false, reason: "content-script-unavailable", diagnosticsState: "content-script-unavailable" };
  }

  try {
    const maybeResult = tabs.sendMessage(tabId, message);
    if (isPromiseLike<ThreadLightRuntimeResponse>(maybeResult)) {
      return await maybeResult;
    }
    if (isRecord(maybeResult) && typeof maybeResult.ok === "boolean") {
      return maybeResult as ThreadLightRuntimeResponse;
    }
  } catch {
    // Chrome-style callback APIs may throw when called without a callback.
  }

  return new Promise((resolve) => {
    try {
      tabs.sendMessage?.(tabId, message, (response) => {
        const lastError = runtimeLastErrorMessage();
        if (lastError !== undefined) {
          resolve({
            ok: false,
            reason: "content-script-unavailable",
            diagnosticsState: "content-script-unavailable"
          });
          return;
        }
        resolve(
          isRecord(response) && typeof response.ok === "boolean"
            ? (response as ThreadLightRuntimeResponse)
            : {
                ok: false,
                reason: "content-script-unavailable",
                diagnosticsState: "content-script-unavailable"
              }
        );
      });
    } catch {
      resolve({
        ok: false,
        reason: "content-script-unavailable",
        diagnosticsState: "content-script-unavailable"
      });
    }
  });
}

export function isDiagnosticsRuntimeMessage(message: ThreadLightRuntimeMessage): boolean {
  return (
    message.type === THREADLIGHT_GET_DIAGNOSTICS_MESSAGE ||
    message.type === THREADLIGHT_CLEAR_DIAGNOSTICS_MESSAGE
  );
}

export function isDiagnosticsTabMessage(message: unknown): message is ThreadLightTabMessage {
  return (
    isRecord(message) &&
    (message.type === THREADLIGHT_TAB_GET_DIAGNOSTICS_MESSAGE ||
      message.type === THREADLIGHT_TAB_CLEAR_DIAGNOSTICS_MESSAGE)
  );
}

export function subscribeSettingsChanges(
  listener: (settings: ThreadLightSettingsV1) => void
): () => void {
  const onChanged = getExtensionApi()?.storage?.onChanged;
  if (!onChanged) {
    return () => undefined;
  }

  const wrapped: StorageChangeListener = (changes, areaName) => {
    if (areaName !== "local") {
      return;
    }
    const settingsChange = changes[SETTINGS_STORAGE_KEY];
    if (settingsChange) {
      listener(normalizeSettings(settingsChange.newValue));
    }
  };

  onChanged.addListener(wrapped);
  return () => onChanged.removeListener?.(wrapped);
}
