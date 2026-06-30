import { describe, expect, it } from "vitest";
import { isConversationJsonRequest, matchesConversationEndpoint } from "../../extension/src/shared/url-matcher";

describe("url matcher", () => {
  it("matches ChatGPT conversation JSON GET endpoints", () => {
    expect(matchesConversationEndpoint(new URL("https://chatgpt.com/backend-api/conversation/abc"))).toBe(true);
    expect(
      matchesConversationEndpoint(new URL("https://chat.openai.com/backend-api/shared_conversation/abc?x=1"))
    ).toBe(true);
  });

  it("rejects non-GET requests", () => {
    expect(matchesConversationEndpoint(new URL("https://chatgpt.com/backend-api/conversation/abc"), "POST")).toBe(false);
  });

  it("rejects extra path segments", () => {
    expect(
      matchesConversationEndpoint(new URL("https://chatgpt.com/backend-api/conversation/abc/stream_status"))
    ).toBe(false);
    expect(matchesConversationEndpoint(new URL("https://chatgpt.com/backend-api/conversation/abc/textdocs"))).toBe(false);
  });

  it("rejects non-ChatGPT domains", () => {
    expect(matchesConversationEndpoint(new URL("https://example.com/backend-api/conversation/abc"))).toBe(false);
  });

  it("resolves relative requests against the current ChatGPT page", () => {
    expect(isConversationJsonRequest("/backend-api/conversation/abc", undefined, "https://chatgpt.com/c/abc")).toBe(
      true
    );
  });

  it("matches Request objects and respects their method", () => {
    expect(isConversationJsonRequest(new Request("https://chatgpt.com/backend-api/conversation/abc"))).toBe(
      true
    );
    expect(
      isConversationJsonRequest(
        new Request("https://chatgpt.com/backend-api/conversation/abc", { method: "POST" })
      )
    ).toBe(false);
  });
});
