import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { trimConversationData } from "../../extension/src/shared/trimmer";
import { createLinearConversation } from "../fixtures/fixtureFactory";

function alternatingRoles(count: number): string[] {
  return Array.from({ length: count }, (_value, index) => (index % 2 === 0 ? "user" : "assistant"));
}

describe("trimmer performance", () => {
  it("trims a synthetic 2,000-turn conversation within a conservative bound", () => {
    const fixture = createLinearConversation(alternatingRoles(2000));
    const start = performance.now();
    const result = trimConversationData(fixture, 20);
    const durationMs = performance.now() - start;

    console.info(`trimConversationData synthetic 2,000-turn duration: ${durationMs.toFixed(2)}ms`);
    expect(result.kind).toBe("trimmed");
    expect(durationMs).toBeLessThan(500);
  });
});
