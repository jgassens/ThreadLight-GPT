import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../extension/src/shared/settings";
import type { ThreadLightDiagnosticEventDetail } from "../../extension/src/shared/types";
import {
  clearDiagnostics,
  diagnosticsSnapshot,
  DIAGNOSTICS_BUFFER_LIMIT,
  resetDiagnosticsForTests,
  storeContentDiagnostic,
  storeDiagnosticCandidate,
  storeDiagnosticCandidateResult
} from "../../extension/src/content/diagnostics-buffer";

const diagnosticsOn = { ...DEFAULT_SETTINGS, debug: true };
const diagnosticsOff = { ...DEFAULT_SETTINGS, debug: false };

function validCandidate(): ThreadLightDiagnosticEventDetail {
  return {
    source: "threadlight",
    version: 1,
    diagnosticSource: "page-proxy",
    sourceSequence: 1,
    level: "info",
    phase: "fetch",
    event: "fetch-start",
    at: 123,
    monotonicTime: 12,
    endpointKind: "conversation",
    state: "started",
    reason: "native-fetch"
  };
}

describe("diagnostics buffer", () => {
  beforeEach(() => {
    vi.spyOn(console, "debug").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    resetDiagnosticsForTests();
    vi.restoreAllMocks();
  });

  it("stores only validated diagnostics and assigns canonical buffer sequence numbers", () => {
    const first = storeDiagnosticCandidate(validCandidate(), diagnosticsOn);
    const second = storeContentDiagnostic(
      {
        diagnosticSource: "content",
        level: "info",
        phase: "startup",
        event: "content-init",
        state: "finished",
        reason: "settings-applied"
      },
      diagnosticsOn
    );

    expect(first?.bufferSequence).toBe(1);
    expect(second?.bufferSequence).toBe(2);
    expect(diagnosticsSnapshot(diagnosticsOn).entries.map((entry) => entry.bufferSequence)).toEqual(
      [1, 2]
    );
  });

  it("rejects invalid candidates and ignores diagnostics when disabled", () => {
    expect(
      storeDiagnosticCandidate({ ...validCandidate(), url: "https://example.com/" }, diagnosticsOn)
    ).toBeUndefined();
    expect(storeDiagnosticCandidate(validCandidate(), diagnosticsOff)).toBeUndefined();
    expect(diagnosticsSnapshot(diagnosticsOff)).toEqual({
      state: "diagnostics-disabled",
      entries: []
    });
  });

  it("reports invalid, disabled, and duplicate candidate outcomes distinctly", () => {
    expect(
      storeDiagnosticCandidateResult(
        { ...validCandidate(), url: "https://example.com/" },
        diagnosticsOn
      )
    ).toEqual({
      kind: "invalid"
    });
    expect(storeDiagnosticCandidateResult(validCandidate(), diagnosticsOff)).toEqual({
      kind: "disabled"
    });
    expect(storeDiagnosticCandidateResult(validCandidate(), diagnosticsOn).kind).toBe("stored");
    expect(storeDiagnosticCandidateResult(validCandidate(), diagnosticsOn)).toEqual({
      kind: "duplicate"
    });
  });

  it("caps the buffer to the most recent entries", () => {
    for (let index = 0; index < DIAGNOSTICS_BUFFER_LIMIT + 5; index += 1) {
      storeContentDiagnostic(
        {
          diagnosticSource: "content",
          level: "info",
          phase: "diagnostics",
          event: "diagnostics-requested",
          state: "accepted",
          reason: "unknown",
          elapsedMs: index
        },
        diagnosticsOn
      );
    }

    const entries = diagnosticsSnapshot(diagnosticsOn).entries;
    expect(entries).toHaveLength(DIAGNOSTICS_BUFFER_LIMIT);
    expect(entries[0]?.bufferSequence).toBe(6);
    expect(entries.at(-1)?.bufferSequence).toBe(DIAGNOSTICS_BUFFER_LIMIT + 5);
  });

  it("clears the buffer and records a bounded clear marker when enabled", () => {
    storeDiagnosticCandidate(validCandidate(), diagnosticsOn);
    clearDiagnostics(diagnosticsOn);

    const snapshot = diagnosticsSnapshot(diagnosticsOn);
    expect(snapshot.state).toBe("active");
    expect(snapshot.entries).toHaveLength(1);
    expect(snapshot.entries[0]?.event).toBe("diagnostics-cleared");
    expect(snapshot.entries[0]?.bufferSequence).toBe(1);
  });
});
