import {
  emitDiagnosticConsole,
  isThreadLightDiagnosticDetail,
  recordDiagnostic,
  sanitizeDiagnostic,
  type ThreadLightDiagnosticInput
} from "../shared/diagnostics";
import type { ThreadLightDiagnosticEventDetail, ThreadLightSettingsV1 } from "../shared/types";

export const DIAGNOSTICS_BUFFER_LIMIT = 300;

let diagnosticsBuffer: ThreadLightDiagnosticEventDetail[] = [];
let nextBufferSequence = 1;
let seenDiagnosticKeys = new Set<string>();

export type StoreDiagnosticCandidateResult =
  | { kind: "stored"; entry: ThreadLightDiagnosticEventDetail }
  | { kind: "disabled" }
  | { kind: "duplicate" }
  | { kind: "invalid" };

function diagnosticsState(
  settings: ThreadLightSettingsV1 | undefined
): "diagnostics-disabled" | "empty" | "active" | "page-not-ready" {
  if (!settings) {
    return "page-not-ready";
  }
  if (!settings.debug) {
    return "diagnostics-disabled";
  }
  return diagnosticsBuffer.length === 0 ? "empty" : "active";
}

export function storeDiagnosticCandidate(
  candidate: unknown,
  settings: ThreadLightSettingsV1 | undefined
): ThreadLightDiagnosticEventDetail | undefined {
  const result = storeDiagnosticCandidateResult(candidate, settings);
  return result.kind === "stored" ? result.entry : undefined;
}

export function storeDiagnosticCandidateResult(
  candidate: unknown,
  settings: ThreadLightSettingsV1 | undefined
): StoreDiagnosticCandidateResult {
  if (!isThreadLightDiagnosticDetail(candidate)) {
    return { kind: "invalid" };
  }

  if (!settings?.debug) {
    return { kind: "disabled" };
  }

  const dedupeKey = `${candidate.diagnosticSource}:${candidate.sourceSequence}`;
  if (seenDiagnosticKeys.has(dedupeKey)) {
    return { kind: "duplicate" };
  }

  const stored = sanitizeDiagnostic({
    ...candidate,
    bufferSequence: nextBufferSequence
  });
  if (!stored) {
    return { kind: "invalid" };
  }

  const storedKey = `${stored.diagnosticSource}:${stored.sourceSequence}`;
  if (seenDiagnosticKeys.has(storedKey)) {
    return { kind: "duplicate" };
  }

  seenDiagnosticKeys.add(storedKey);
  nextBufferSequence += 1;
  diagnosticsBuffer.push(stored);
  if (diagnosticsBuffer.length > DIAGNOSTICS_BUFFER_LIMIT) {
    diagnosticsBuffer = diagnosticsBuffer.slice(-DIAGNOSTICS_BUFFER_LIMIT);
    seenDiagnosticKeys = new Set(
      diagnosticsBuffer.map((entry) => `${entry.diagnosticSource}:${entry.sourceSequence}`)
    );
  }
  emitDiagnosticConsole(stored);
  return { kind: "stored", entry: stored };
}

export function storeContentDiagnostic(
  input: ThreadLightDiagnosticInput,
  settings: ThreadLightSettingsV1 | undefined
): ThreadLightDiagnosticEventDetail | undefined {
  const candidate = recordDiagnostic(input, { dispatch: false, mirrorToConsole: false });
  if (!candidate) {
    return undefined;
  }
  return storeDiagnosticCandidate(candidate, settings);
}

export function diagnosticsSnapshot(settings: ThreadLightSettingsV1 | undefined): {
  state: "diagnostics-disabled" | "empty" | "active" | "page-not-ready";
  entries: ThreadLightDiagnosticEventDetail[];
} {
  return {
    state: diagnosticsState(settings),
    entries: diagnosticsBuffer.map((entry) => ({ ...entry }))
  };
}

export function clearDiagnostics(settings: ThreadLightSettingsV1 | undefined): void {
  diagnosticsBuffer = [];
  nextBufferSequence = 1;
  seenDiagnosticKeys = new Set();
  storeContentDiagnostic(
    {
      diagnosticSource: "content",
      level: "info",
      phase: "diagnostics",
      event: "diagnostics-cleared",
      state: "cleared",
      reason: "cleared"
    },
    settings
  );
}

export function resetDiagnosticsForTests(): void {
  diagnosticsBuffer = [];
  nextBufferSequence = 1;
  seenDiagnosticKeys = new Set();
}
