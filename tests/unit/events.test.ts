import { describe, expect, it } from "vitest";
import {
  isThreadLightStatusDetail,
  makeThreadLightStatusDetail
} from "../../extension/src/shared/events";
import { DEFAULT_SETTINGS, settingsToJson } from "../../extension/src/shared/settings";

describe("events", () => {
  it("serializes page config with only allowlisted settings", () => {
    const json = settingsToJson({
      ...DEFAULT_SETTINGS,
      keepLastTurns: 30,
      showStatusPill: true,
      extra: "not allowed"
    } as typeof DEFAULT_SETTINGS & { extra: string });

    expect(JSON.parse(json)).toEqual({
      version: 1,
      enabled: true,
      keepLastTurns: 30,
      showStatusPill: true,
      ultraLeanMode: false,
      collapseLongUserMessages: false,
      debug: false,
      suspendOnceForFullReload: false
    });
  });

  it("accepts count-only ThreadLight status details", () => {
    const detail = makeThreadLightStatusDetail({
      settings: DEFAULT_SETTINGS,
      state: "trimmed",
      recognized: true,
      reason: "trimmed",
      now: 123,
      stats: {
        totalVisibleTurns: 100,
        keptVisibleTurns: 20,
        removedVisibleTurns: 80,
        totalNodesOnPath: 140,
        keptNodes: 28
      }
    });

    expect(isThreadLightStatusDetail(detail)).toBe(true);
  });

  it("rejects malformed status details and content-bearing extras", () => {
    expect(
      isThreadLightStatusDetail({
        source: "threadlight",
        version: 1,
        enabled: true,
        recognized: true,
        state: "trimmed",
        keepLastTurns: 20,
        lastUpdatedAt: 123,
        totalVisibleTurns: 100,
        keptVisibleTurns: 20,
        removedVisibleTurns: 80,
        totalNodesOnPath: 140,
        keptNodes: 28,
        reason: "trimmed",
        messageText: "synthetic content that must not cross the boundary"
      })
    ).toBe(false);
  });
});
