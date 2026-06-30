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

  it("does not rewrite JSON when only a tiny number of turns would be removed", async () => {
    const fixture = createLinearConversation(["user", "assistant", "user", "assistant", "user", "assistant"]);
    const response = new Response(JSON.stringify(fixture), {
      status: 200,
      headers: { "content-type": "application/json" }
    });

    const result = await rewriteConversationResponse(response, { ...DEFAULT_SETTINGS, keepLastTurns: 5 });

    expect(result.response).toBe(response);
    expect(result.status?.state).toBe("noop");
  });

  it("passes through non-JSON responses", async () => {
    const response = new Response("not json", {
      status: 200,
      headers: { "content-type": "text/plain" }
    });

    const result = await rewriteConversationResponse(response, DEFAULT_SETTINGS);
    expect(result.response).toBe(response);
    expect(result.status?.state).toBe("noop");
  });

  it("passes through unrecognized JSON safely", async () => {
    const response = new Response(JSON.stringify({ nope: true }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });

    const result = await rewriteConversationResponse(response, DEFAULT_SETTINGS);
    expect(result.response).toBe(response);
    expect(result.status?.state).toBe("unrecognized");
  });
});
