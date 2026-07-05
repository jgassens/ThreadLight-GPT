import { describe, expect, it } from "vitest";
import {
  formatDiagnosticsJsonl,
  formatDiagnosticsSummary,
  isThreadLightDiagnosticDetail,
  sanitizeDiagnostic
} from "../../extension/src/shared/diagnostics";
import type { ThreadLightDiagnosticEventDetail } from "../../extension/src/shared/types";

function validDiagnostic(): ThreadLightDiagnosticEventDetail {
  return {
    source: "threadlight",
    version: 1,
    diagnosticSource: "page-proxy",
    sourceSequence: 1,
    level: "info",
    phase: "response",
    event: "body-read-end",
    at: 123456,
    monotonicTime: 42,
    endpointKind: "conversation",
    state: "finished",
    reason: "body-read",
    durationMs: 12,
    responseCharCount: 4000
  };
}

describe("diagnostics", () => {
  it("accepts a bounded enum and numeric diagnostic entry", () => {
    expect(isThreadLightDiagnosticDetail(validDiagnostic())).toBe(true);
  });

  it("rejects unknown keys and sensitive content-shaped keys", () => {
    expect(
      sanitizeDiagnostic({
        ...validDiagnostic(),
        url: "https://chatgpt.com/backend-api/conversation/synthetic"
      })
    ).toBeUndefined();

    expect(
      sanitizeDiagnostic({
        ...validDiagnostic(),
        message: "synthetic message content"
      })
    ).toBeUndefined();

    expect(
      sanitizeDiagnostic({
        ...validDiagnostic(),
        meta: { text: "nested synthetic content" }
      })
    ).toBeUndefined();
  });

  it("rejects URL-like, UUID-like, long, and non-finite values", () => {
    expect(
      sanitizeDiagnostic({ ...validDiagnostic(), event: "https://example.com/nope" })
    ).toBeUndefined();
    expect(
      sanitizeDiagnostic({
        ...validDiagnostic(),
        reason: "123e4567-e89b-12d3-a456-426614174000"
      })
    ).toBeUndefined();
    expect(sanitizeDiagnostic({ ...validDiagnostic(), reason: "x".repeat(65) })).toBeUndefined();
    expect(
      sanitizeDiagnostic({ ...validDiagnostic(), durationMs: Number.POSITIVE_INFINITY })
    ).toBeUndefined();
  });

  it("formats export text without URL-like, UUID-like, or long free-text values", () => {
    const entry = validDiagnostic();
    const jsonl = formatDiagnosticsJsonl([entry]);
    const summary = formatDiagnosticsSummary([entry]);
    const combined = `${jsonl}\n${summary}`;

    expect(combined).not.toMatch(/https?:\/\//i);
    expect(combined).not.toMatch(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i
    );
    expect(combined).not.toContain("synthetic message content");
  });
});
