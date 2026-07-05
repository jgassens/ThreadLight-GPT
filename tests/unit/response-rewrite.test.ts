import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../extension/src/shared/settings";
import { rewriteConversationResponse } from "../../extension/src/page/page-proxy";
import { createLinearConversation } from "../fixtures/fixtureFactory";

describe("response rewriting", () => {
  it("rewrites JSON conversation responses and removes stale body headers", async () => {
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
      statusText: "OK",
      headers: {
        "content-type": "application/json",
        "content-length": "9999",
        "content-encoding": "br"
      }
    });

    const result = await rewriteConversationResponse(response, { ...DEFAULT_SETTINGS, keepLastTurns: 5 });

    expect(result.response).not.toBe(response);
    expect(result.response.status).toBe(200);
    expect(result.response.headers.get("content-length")).toBeNull();
    expect(result.response.headers.get("content-encoding")).toBeNull();
    expect(result.response.headers.get("content-type")).toBe("application/json");
    expect(result.status?.state).toBe("trimmed");

    const json = (await result.response.json()) as { mapping: Record<string, unknown> };
    expect(Object.keys(json.mapping)).toHaveLength(6);
  });

  it("preserves the full body when too few turns would be removed, without using clone()", async () => {
    const fixture = createLinearConversation(["user", "assistant", "user", "assistant", "user", "assistant"]);
    const response = new Response(JSON.stringify(fixture), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "content-length": "9999",
        "content-encoding": "br"
      }
    });

    const result = await rewriteConversationResponse(response, { ...DEFAULT_SETTINGS, keepLastTurns: 5 });

    // The body is read from the original exactly once (no clone) and re-wrapped, so huge
    // payloads can never stall on WebKit's tee backpressure.
    expect(result.response).not.toBe(response);
    expect(result.status?.state).toBe("noop");
    expect(result.response.headers.get("content-length")).toBeNull();
    expect(result.response.headers.get("content-encoding")).toBeNull();
    expect(await result.response.json()).toEqual(JSON.parse(JSON.stringify(fixture)));
  });

  it("passes through non-JSON responses untouched", async () => {
    const response = new Response("not json", {
      status: 200,
      headers: { "content-type": "text/plain" }
    });

    const result = await rewriteConversationResponse(response, DEFAULT_SETTINGS);
    expect(result.response).toBe(response);
    expect(result.response.bodyUsed).toBe(false);
    expect(result.status?.state).toBe("noop");
  });

  it("passes through error statuses untouched", async () => {
    const response = new Response(JSON.stringify({ detail: "not found" }), {
      status: 404,
      headers: { "content-type": "application/json" }
    });

    const result = await rewriteConversationResponse(response, DEFAULT_SETTINGS);
    expect(result.response).toBe(response);
    expect(result.response.bodyUsed).toBe(false);
    expect(result.status?.state).toBe("noop");
  });

  it("preserves unrecognized JSON bodies safely", async () => {
    const response = new Response(JSON.stringify({ nope: true }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });

    const result = await rewriteConversationResponse(response, DEFAULT_SETTINGS);
    expect(result.status?.state).toBe("unrecognized");
    expect(await result.response.json()).toEqual({ nope: true });
  });

  it("preserves malformed JSON bodies instead of dropping them", async () => {
    const response = new Response("{not-json", {
      status: 200,
      headers: { "content-type": "application/json" }
    });

    const result = await rewriteConversationResponse(response, DEFAULT_SETTINGS);
    expect(result.status?.state).toBe("error");
    expect(await result.response.text()).toBe("{not-json");
  });
});
