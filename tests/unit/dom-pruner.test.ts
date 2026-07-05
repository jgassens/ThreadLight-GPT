import { describe, expect, it, vi } from "vitest";
import {
  CHATGPT_MAIN_SELECTOR,
  CHATGPT_TURN_SELECTOR
} from "../../extension/src/content/dom-selectors";
import {
  domPruneStats,
  hiddenTurnElementIndexes,
  hiddenTurnIndexes,
  setDomPruning,
  shouldApplyDomPruning,
  turnElementGroups
} from "../../extension/src/content/dom-pruner";
import { DEFAULT_SETTINGS } from "../../extension/src/shared/settings";

function alternatingRoles(count: number): string[] {
  return Array.from({ length: count }, (_value, index) => (index % 2 === 0 ? "user" : "assistant"));
}

function fakeClassList(): DOMTokenList {
  const values = new Set<string>();
  return {
    add: vi.fn((...tokens: string[]) => {
      tokens.forEach((token) => values.add(token));
    }),
    remove: vi.fn((...tokens: string[]) => {
      tokens.forEach((token) => values.delete(token));
    }),
    contains: vi.fn((token: string) => values.has(token)),
    toggle: vi.fn((token: string, force?: boolean) => {
      const shouldAdd = force ?? !values.has(token);
      if (shouldAdd) {
        values.add(token);
      } else {
        values.delete(token);
      }
      return shouldAdd;
    })
  } as unknown as DOMTokenList;
}

function fakeTurn(role: string, top: number): HTMLElement {
  return {
    classList: fakeClassList(),
    parentElement: null,
    getAttribute: vi.fn((name: string) => (name === "data-turn" ? role : null)),
    querySelector: vi.fn(() => null),
    getBoundingClientRect: vi.fn(
      () =>
        ({
          top,
          bottom: top + 20,
          left: 0,
          right: 100,
          width: 100,
          height: 20,
          x: 0,
          y: top,
          toJSON: () => ({})
        }) as DOMRect
    )
  } as unknown as HTMLElement;
}

class FakeMutationObserver {
  observe = vi.fn();
  disconnect = vi.fn();
}

interface PrunerHarness {
  timeouts: Map<number, () => void>;
  documentQuerySelectorAll: ReturnType<typeof vi.fn>;
  setTurns: (next: HTMLElement[]) => void;
}

function createPrunerHarness(): PrunerHarness {
  const timeouts = new Map<number, () => void>();
  let nextTimeoutId = 1;
  let turns: HTMLElement[] = [];

  const documentElement = {
    append: vi.fn(),
    classList: fakeClassList(),
    clientHeight: 1000,
    scrollTop: 0
  };
  const main = { querySelectorAll: vi.fn(() => turns) };
  const documentQuerySelectorAll = vi.fn(() => {
    throw new Error("turn queries should be scoped to main");
  });

  vi.stubGlobal("document", {
    createElement: vi.fn(() => ({ id: "", textContent: "" })),
    documentElement,
    getElementById: vi.fn(() => null),
    querySelector: vi.fn((selector: string) => (selector === CHATGPT_MAIN_SELECTOR ? main : null)),
    querySelectorAll: documentQuerySelectorAll,
    scrollingElement: documentElement
  });
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    clearTimeout: vi.fn((handle: number) => {
      timeouts.delete(handle);
    }),
    getComputedStyle: vi.fn(() => ({ overflowY: "visible" })),
    innerHeight: 1000,
    removeEventListener: vi.fn(),
    setTimeout: vi.fn((callback: TimerHandler) => {
      const handle = nextTimeoutId;
      nextTimeoutId += 1;
      if (typeof callback === "function") {
        timeouts.set(handle, callback as () => void);
      }
      return handle;
    })
  });
  vi.stubGlobal("MutationObserver", FakeMutationObserver);

  return {
    timeouts,
    documentQuerySelectorAll,
    setTurns: (next: HTMLElement[]) => {
      turns = next;
    }
  };
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

  it("retries pruning after an empty first pass and scopes turn queries to main", () => {
    const { timeouts, documentQuerySelectorAll, setTurns } = createPrunerHarness();
    const onPrune = vi.fn();

    try {
      setDomPruning({ ...DEFAULT_SETTINGS, keepLastTurns: 5 }, onPrune);

      expect(onPrune).toHaveBeenLastCalledWith({
        totalTurns: 0,
        keptTurns: 0,
        hiddenTurns: 0,
        pruned: false
      });
      expect(timeouts.size).toBe(3);

      setTurns(alternatingRoles(10).map((role, index) => fakeTurn(role, index * 30)));
      timeouts.get(1)?.();

      expect(onPrune).toHaveBeenLastCalledWith({
        totalTurns: 10,
        keptTurns: 5,
        hiddenTurns: 5,
        pruned: true
      });
      expect(documentQuerySelectorAll).not.toHaveBeenCalled();
    } finally {
      setDomPruning({ ...DEFAULT_SETTINGS, enabled: false });
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
  });

  it("recomputes the hidden set at a constant turn count when roles change", () => {
    const { timeouts, setTurns } = createPrunerHarness();
    const onPrune = vi.fn();

    try {
      setTurns(alternatingRoles(10).map((role, index) => fakeTurn(role, index * 30)));
      setDomPruning({ ...DEFAULT_SETTINGS, keepLastTurns: 5 }, onPrune);

      expect(onPrune).toHaveBeenLastCalledWith({
        totalTurns: 10,
        keptTurns: 5,
        hiddenTurns: 5,
        pruned: true
      });

      // Same element count, but the roles now collapse into a single group (recycled nodes, or a
      // data-turn that hydrated after insertion). The old count cache skipped this and left stale
      // hidden turns behind; the signature-only cache must recompute and clear them.
      setTurns(Array.from({ length: 10 }, (_value, index) => fakeTurn("user", index * 30)));
      timeouts.get(1)?.();

      expect(onPrune).toHaveBeenLastCalledWith({
        totalTurns: 1,
        keptTurns: 1,
        hiddenTurns: 0,
        pruned: false
      });
    } finally {
      setDomPruning({ ...DEFAULT_SETTINGS, enabled: false });
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
  });
});
