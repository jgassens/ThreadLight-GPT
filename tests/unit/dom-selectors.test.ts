import { afterEach, describe, expect, it, vi } from "vitest";
import { conversationScope, mainScope } from "../../extension/src/content/dom-selectors";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("conversationScope", () => {
  it("returns the turn container (a turn's parent), not <main>, so the composer is excluded", () => {
    const turnContainer = { id: "turn-container" };
    const turn = { parentElement: turnContainer };
    const main = { id: "main" };
    vi.stubGlobal("document", {
      querySelector: vi.fn((selector: string) => (selector === "main" ? main : turn))
    });

    expect(conversationScope()).toBe(turnContainer);
    expect(conversationScope()).not.toBe(main);
  });

  it("falls back to <main> while no turns are rendered yet", () => {
    const main = { id: "main" };
    vi.stubGlobal("document", {
      querySelector: vi.fn((selector: string) => (selector === "main" ? main : null))
    });

    expect(conversationScope()).toBe(main);
    expect(mainScope()).toBe(main);
  });

  it("falls back to document when neither turns nor <main> exist", () => {
    const doc = { querySelector: vi.fn(() => null) };
    vi.stubGlobal("document", doc);

    expect(conversationScope()).toBe(doc);
  });
});
