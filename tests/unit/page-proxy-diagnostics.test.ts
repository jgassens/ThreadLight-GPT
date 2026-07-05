import { afterEach, describe, expect, it, vi } from "vitest";
import { rewriteConversationResponse } from "../../extension/src/page/page-proxy";
import { THREADLIGHT_DIAGNOSTIC_EVENT } from "../../extension/src/shared/constants";
import { DEFAULT_SETTINGS } from "../../extension/src/shared/settings";
import type { ThreadLightDiagnosticEventDetail } from "../../extension/src/shared/types";
import { createLinearConversation } from "../fixtures/fixtureFactory";

type Listener = (event: Event) => void;

class TestCustomEvent extends Event {
  detail: unknown;

  constructor(type: string, init?: { detail?: unknown }) {
    super(type);
    this.detail = init?.detail;
  }
}

function installDiagnosticWindow(): ThreadLightDiagnosticEventDetail[] {
  const listeners = new Map<string, Listener[]>();
  const entries: ThreadLightDiagnosticEventDetail[] = [];

  vi.stubGlobal("CustomEvent", TestCustomEvent);
  vi.stubGlobal("window", {
    addEventListener: vi.fn((type: string, listener: Listener) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    }),
    dispatchEvent: vi.fn((event: Event) => {
      listeners.get(event.type)?.forEach((listener) => listener(event));
      return true;
    })
  });

  window.addEventListener(THREADLIGHT_DIAGNOSTIC_EVENT, (event) => {
    if (event instanceof CustomEvent) {
      entries.push(event.detail as ThreadLightDiagnosticEventDetail);
    }
  });

  vi.spyOn(console, "debug").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);

  return entries;
}

describe("page proxy diagnostics", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("records body read and trim diagnostics for a trimmed response", async () => {
    const entries = installDiagnosticWindow();
    const fixture = createLinearConversation([
      "user",
      "assistant",
      "user",
      "assistant",
      "user",
      "assistant",
      "user",
      "assistant",
      "user",
      "assistant"
    ]);
    const response = new Response(JSON.stringify(fixture), {
      status: 200,
      headers: { "content-type": "application/json" }
    });

    await rewriteConversationResponse(
      response,
      { ...DEFAULT_SETTINGS, debug: true, keepLastTurns: 5 },
      "conversation"
    );

    expect(entries.map((entry) => entry.event)).toEqual(
      expect.arrayContaining([
        "body-read-start",
        "body-read-end",
        "json-parse-start",
        "json-parse-end",
        "trim-start",
        "trim-result",
        "response-rewrite-start",
        "response-modified"
      ])
    );
    expect(entries.find((entry) => entry.event === "trim-result")?.state).toBe("trimmed");
    expect(entries.find((entry) => entry.event === "body-read-end")?.endpointKind).toBe(
      "conversation"
    );
    expect(
      entries.find((entry) => entry.event === "body-read-end")?.responseCharCount
    ).toBeGreaterThan(0);
  });

  it("records malformed JSON diagnostics without dropping the original body", async () => {
    const entries = installDiagnosticWindow();
    const response = new Response("{not-json", {
      status: 200,
      headers: { "content-type": "application/json" }
    });

    const result = await rewriteConversationResponse(
      response,
      { ...DEFAULT_SETTINGS, debug: true },
      "conversation"
    );

    expect(entries.map((entry) => entry.event)).toEqual(
      expect.arrayContaining(["json-parse-failed", "fail-open"])
    );
    expect(await result.response.text()).toBe("{not-json");
  });

  it("records body read failures and returns the original response", async () => {
    const entries = installDiagnosticWindow();
    const response = {
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers({ "content-type": "application/json" }),
      text: vi.fn(async () => {
        throw new Error("synthetic read failure");
      })
    } as unknown as Response;

    const result = await rewriteConversationResponse(
      response,
      { ...DEFAULT_SETTINGS, debug: true },
      "conversation"
    );

    expect(result.response).toBe(response);
    expect(entries.map((entry) => entry.event)).toEqual(
      expect.arrayContaining(["body-read-start", "body-read-failed", "fail-open"])
    );
  });

  it("emits slow body-read warnings and clears pending timers after the read finishes", async () => {
    vi.useFakeTimers();
    const entries = installDiagnosticWindow();
    const fixture = createLinearConversation([
      "user",
      "assistant",
      "user",
      "assistant",
      "user",
      "assistant"
    ]);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        globalThis.setTimeout(() => {
          controller.enqueue(new TextEncoder().encode(JSON.stringify(fixture)));
          controller.close();
        }, 4000);
      }
    });
    const response = new Response(stream, {
      status: 200,
      headers: { "content-type": "application/json" }
    });

    const resultPromise = rewriteConversationResponse(
      response,
      { ...DEFAULT_SETTINGS, debug: true, keepLastTurns: 5 },
      "conversation"
    );
    await vi.advanceTimersByTimeAsync(3000);
    expect(entries.filter((entry) => entry.event === "body-read-slow")).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1000);
    await resultPromise;
    await vi.advanceTimersByTimeAsync(30000);

    expect(entries.filter((entry) => entry.event === "body-read-slow")).toHaveLength(1);
  });

  it("prints a content-free final watchdog warning when diagnostics are disabled", async () => {
    vi.useFakeTimers();
    installDiagnosticWindow();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        globalThis.setTimeout(() => {
          controller.enqueue(new TextEncoder().encode("{}"));
          controller.close();
        }, 31000);
      }
    });
    const response = new Response(stream, {
      status: 200,
      headers: { "content-type": "application/json" }
    });

    const resultPromise = rewriteConversationResponse(response, DEFAULT_SETTINGS, "conversation");
    await vi.advanceTimersByTimeAsync(30000);

    expect(warnSpy).toHaveBeenCalledWith(
      "[ThreadLight] conversation request still pending",
      expect.objectContaining({
        endpointKind: "conversation",
        elapsedMs: 30000
      })
    );

    await vi.advanceTimersByTimeAsync(1000);
    await resultPromise;
  });
});
