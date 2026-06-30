import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  clampKeepLastTurns,
  effectiveKeepLastTurns,
  normalizeSettings
} from "../../extension/src/shared/settings";

describe("settings", () => {
  it("uses safe defaults for unknown values", () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it("clamps keepLastTurns to the supported range", () => {
    expect(clampKeepLastTurns(1)).toBe(5);
    expect(clampKeepLastTurns(500)).toBe(100);
    expect(clampKeepLastTurns(12.4)).toBe(12);
  });

  it("caps kept turns in ultra lean mode but leaves the value alone otherwise", () => {
    expect(effectiveKeepLastTurns({ keepLastTurns: 20, ultraLeanMode: false })).toBe(20);
    expect(effectiveKeepLastTurns({ keepLastTurns: 20, ultraLeanMode: true })).toBe(8);
    expect(effectiveKeepLastTurns({ keepLastTurns: 5, ultraLeanMode: true })).toBe(5);
  });

  it("validates unknown settings without trusting types", () => {
    expect(
      normalizeSettings({
        enabled: "yes",
        keepLastTurns: 3,
        showStatusPill: true,
        ultraLeanMode: false,
        collapseLongUserMessages: true,
        debug: true,
        suspendOnceForFullReload: false,
        extra: "ignored"
      })
    ).toEqual({
      ...DEFAULT_SETTINGS,
      keepLastTurns: 5,
      showStatusPill: true,
      collapseLongUserMessages: true,
      debug: true
    });
  });
});
