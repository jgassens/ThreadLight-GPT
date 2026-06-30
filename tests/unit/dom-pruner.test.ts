import { describe, expect, it } from "vitest";
import { CHATGPT_TURN_SELECTOR } from "../../extension/src/content/dom-selectors";
import {
  domPruneStats,
  hiddenTurnElementIndexes,
  hiddenTurnIndexes,
  shouldApplyDomPruning,
  turnElementGroups
} from "../../extension/src/content/dom-pruner";

function alternatingRoles(count: number): string[] {
  return Array.from({ length: count }, (_value, index) => (index % 2 === 0 ? "user" : "assistant"));
}

describe("dom-pruner", () => {
  it("keeps the requested suffix of rendered role turns", () => {
    expect(hiddenTurnIndexes(8, 5)).toEqual([0, 1, 2]);
  });

  it("does not hide turns when the page already fits the limit", () => {
    expect(hiddenTurnIndexes(4, 5)).toEqual([]);
  });

  it("groups consecutive same-role message elements into one rendered turn", () => {
    expect(turnElementGroups(["user", "assistant", "assistant", "user", "assistant"])).toEqual([
      [0],
      [1, 2],
      [3],
      [4]
    ]);
  });

  it("skips DOM pruning when too few turn groups would be hidden", () => {
    expect(shouldApplyDomPruning(22, 20)).toBe(false);
    expect(hiddenTurnElementIndexes(["user", "assistant", "user", "assistant"], 2)).toEqual([]);
  });

  it("hides whole same-role message groups when enough old turns are hidden", () => {
    expect(hiddenTurnElementIndexes(["user", "assistant", "assistant", "user", "assistant"], 1)).toEqual([
      0,
      1,
      2,
      3
    ]);
  });

  it("treats unknown-role elements as separate turns", () => {
    expect(hiddenTurnElementIndexes([undefined, undefined, "assistant", "user"], 1)).toEqual([
      0,
      1,
      2
    ]);
  });

  it("matches current ChatGPT numbered conversation-turn test ids", () => {
    expect(CHATGPT_TURN_SELECTOR).toContain("[data-testid^=\"conversation-turn-\"]");
  });

  it("reports counts for the status pill when turns are pruned", () => {
    expect(domPruneStats(alternatingRoles(10), 5)).toEqual({
      totalTurns: 10,
      keptTurns: 5,
      hiddenTurns: 5,
      pruned: true
    });
  });

  it("reports all turns kept when the thread fits the limit", () => {
    expect(domPruneStats(alternatingRoles(4), 20)).toEqual({
      totalTurns: 4,
      keptTurns: 4,
      hiddenTurns: 0,
      pruned: false
    });
  });

  it("does not report pruning when too few turns would be hidden", () => {
    expect(domPruneStats(alternatingRoles(22), 20)).toEqual({
      totalTurns: 22,
      keptTurns: 22,
      hiddenTurns: 0,
      pruned: false
    });
  });

  it("counts consecutive same-role messages as a single turn for the pill", () => {
    expect(domPruneStats(["user", "assistant", "assistant", "user", "assistant"], 1)).toEqual({
      totalTurns: 4,
      keptTurns: 1,
      hiddenTurns: 3,
      pruned: true
    });
  });
});
