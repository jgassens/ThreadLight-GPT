import { afterEach, describe, expect, it, vi } from "vitest";
import { THREADLIGHT_CONFIG_EVENT } from "../../extension/src/shared/constants";
import { DEFAULT_SETTINGS, settingsToJson } from "../../extension/src/shared/settings";

type Listener = (event: Event) => void;

class TestCustomEvent extends Event {
  detail: unknown;

  constructor(type: string, init?: { detail?: unknown }) {
    super(type);
    this.detail = init?.detail;
  }
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function installPageProxyGlobals(nativeFetch: typeof fetch): void {
  const listeners = new Map<string, Listener[]>();
  const documentElement = { dataset: {} };
  const history = {
    pushState: vi.fn(),
    replaceState: vi.fn()
  };

  vi.stubGlobal("CustomEvent", TestCustomEvent);
  vi.stubGlobal("document", { documentElement });
  vi.stubGlobal("window", {
    addEventListener: vi.fn((type: string, listener: Listener) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    }),
    dispatchEvent: vi.fn((event: Event) => {
      listeners.get(event.type)?.forEach((listener) => listener(event));
      return true;
    }),
    fetch: nativeFetch,
    history,
    localStorage: {
      getItem: vi.fn(() => null),
      setItem: vi.fn()
    },
    location: {
      href: "https://chatgpt.com/c/test",
      origin: "https://chatgpt.com"
    },
    postMessage: vi.fn(),
    setTimeout: vi.fn(() => 1)
  });
}

describe("page proxy install", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("does not install in the extension isolated world", async () => {
    const nativeFetch = vi.fn() as unknown as typeof fetch;
    installPageProxyGlobals(nativeFetch);
    vi.stubGlobal("browser", { runtime: { id: "threadlight-extension" } });

    await import("../../extension/src/page/page-proxy");

    expect(window.fetch).toBe(nativeFetch);
    expect(document.documentElement.dataset.threadlightProxyActive).toBeUndefined();
  });

  it("starts conversation fetches before waiting for initial config", async () => {
    const fetchDeferred = deferred<Response>();
    const nativeFetchMock = vi.fn(() => fetchDeferred.promise);
    installPageProxyGlobals(nativeFetchMock as unknown as typeof fetch);

    await import("../../extension/src/page/page-proxy");

    const response = new Response("ok", {
      headers: { "content-type": "text/plain" }
    });
    const fetchPromise = window.fetch("https://chatgpt.com/backend-api/conversation/abc");

    expect(nativeFetchMock).toHaveBeenCalledTimes(1);

    window.dispatchEvent(
      new CustomEvent(THREADLIGHT_CONFIG_EVENT, {
        detail: settingsToJson(DEFAULT_SETTINGS)
      })
    );
    fetchDeferred.resolve(response);

    await expect(fetchPromise).resolves.toBe(response);
  });
});
