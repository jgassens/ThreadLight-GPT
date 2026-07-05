import { describe, expect, it } from "vitest";
import { trimConversationData } from "../../extension/src/shared/trimmer";
import { createLinearConversation, mappingKeys } from "../fixtures/fixtureFactory";

function defineMappingEntry(mapping: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(mapping, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true
  });
}

describe("trimmer", () => {
  const tenTurnRoles = [
    "user",
    "assistant",
    "user",
    "assistant",
    "user",
    "assistant",
    "user",
    "assistant",
    "user",
    "assistant"
  ];

  it("trims a simple active path to the last visible turns", () => {
    const fixture = createLinearConversation(tenTurnRoles);
    const result = trimConversationData(fixture, 5);

    expect(result.kind).toBe("trimmed");
    if (result.kind !== "trimmed") {
      return;
    }

    expect(result.stats.totalVisibleTurns).toBe(10);
    expect(result.stats.removedVisibleTurns).toBe(5);
    expect(mappingKeys(result.data)).toEqual([
      "node-5",
      "node-6",
      "node-7",
      "node-8",
      "node-9",
      "root"
    ]);
  });

  it("does not trim while a reply is still streaming below the current node", () => {
    const fixture = createLinearConversation(tenTurnRoles);
    const leaf = fixture.mapping["node-9"];
    expect(leaf).toBeDefined();
    if (!leaf) {
      return;
    }
    // An in-flight reply hangs under the active leaf: current_node gains a streaming child.
    fixture.mapping["streaming"] = {
      id: "streaming",
      parent: "node-9",
      children: [],
      message: { author: { role: "assistant" }, content: { parts: [""] } }
    };
    leaf.children.push("streaming");

    const result = trimConversationData(fixture, 5);

    expect(result.kind).toBe("noop");
    if (result.kind === "noop") {
      expect(result.reason).toBe("streaming-branch");
    }
  });

  it("no-ops when too few turns would be removed to justify rewriting the page model", () => {
    const fixture = createLinearConversation([
      "user",
      "assistant",
      "user",
      "assistant",
      "user",
      "assistant"
    ]);
    const result = trimConversationData(fixture, 5);

    expect(result.kind).toBe("noop");
    if (result.kind === "noop") {
      expect(result.reason).toBe("below-trim-threshold");
      expect(result.stats.totalVisibleTurns).toBe(6);
    }
  });

  it("no-ops when the conversation is under the limit", () => {
    const fixture = createLinearConversation(["user", "assistant"]);
    const result = trimConversationData(fixture, 20);

    expect(result.kind).toBe("noop");
    if (result.kind === "noop") {
      expect(result.stats.removedVisibleTurns).toBe(0);
    }
  });

  it("does not count hidden roles as visible turns", () => {
    const fixture = createLinearConversation([
      "user",
      "tool",
      "assistant",
      "thinking",
      "assistant"
    ]);
    const result = trimConversationData(fixture, 20);

    expect(result.kind).toBe("noop");
    if (result.kind === "noop") {
      expect(result.stats.totalVisibleTurns).toBe(2);
    }
  });

  it("counts consecutive same-role nodes as one visible turn", () => {
    const fixture = createLinearConversation(["user", "user", "assistant", "assistant", "user"]);
    const result = trimConversationData(fixture, 20);

    expect(result.kind).toBe("noop");
    if (result.kind === "noop") {
      expect(result.stats.totalVisibleTurns).toBe(3);
    }
  });

  it("preserves a non-visible root anchor when trimming", () => {
    const fixture = createLinearConversation(tenTurnRoles);
    const result = trimConversationData(fixture, 5);

    expect(result.kind).toBe("trimmed");
    if (result.kind === "trimmed") {
      expect(result.data.root).toBe("root");
      expect(mappingKeys(result.data)).toContain("root");
    }
  });

  it("repairs parent and children links for the kept active path", () => {
    const fixture = createLinearConversation(tenTurnRoles);
    const result = trimConversationData(fixture, 5);

    expect(result.kind).toBe("trimmed");
    if (result.kind !== "trimmed") {
      return;
    }

    const mapping = result.data.mapping as Record<
      string,
      { parent: string | null; children: string[] }
    >;
    const rootNode = mapping.root;
    const firstKeptNode = mapping["node-5"];
    const currentNode = mapping["node-9"];

    expect(rootNode).toBeDefined();
    expect(firstKeptNode).toBeDefined();
    expect(currentNode).toBeDefined();
    if (!rootNode || !firstKeptNode || !currentNode) {
      return;
    }

    expect(rootNode.parent).toBeNull();
    expect(rootNode.children).toEqual(["node-5"]);
    expect(firstKeptNode.parent).toBe("root");
    expect(currentNode.children).toEqual([]);
  });

  it("omits branches outside the active path", () => {
    const fixture = createLinearConversation(tenTurnRoles);
    fixture.mapping["branch"] = {
      id: "branch",
      parent: "node-1",
      children: [],
      message: { author: { role: "assistant" }, content: { parts: ["synthetic branch"] } }
    };
    const branchParent = fixture.mapping["node-1"];
    expect(branchParent).toBeDefined();
    if (!branchParent) {
      return;
    }
    branchParent.children.push("branch");

    const result = trimConversationData(fixture, 5);

    expect(result.kind).toBe("trimmed");
    if (result.kind === "trimmed") {
      expect(mappingKeys(result.data)).not.toContain("branch");
    }
  });

  it("fails safely on cycles", () => {
    const fixture = createLinearConversation(["user", "assistant", "user"]);
    const cycleNode = fixture.mapping["node-0"];
    expect(cycleNode).toBeDefined();
    if (!cycleNode) {
      return;
    }
    cycleNode.parent = "node-2";

    const result = trimConversationData(fixture, 20);
    expect(result.kind).toBe("unrecognized");
  });

  it("does not follow inherited mapping entries", () => {
    const mapping = Object.create({
      inherited: {
        id: "inherited",
        parent: null,
        children: [],
        message: { author: { role: "user" } }
      }
    }) as Record<string, unknown>;

    const result = trimConversationData({ mapping, current_node: "inherited" }, 20);

    expect(result.kind).toBe("unrecognized");
  });

  it("keeps __proto__ mapping ids as own data properties when trimming", () => {
    const fixture = createLinearConversation(tenTurnRoles);
    const rootNode = fixture.mapping.root;
    const firstNode = fixture.mapping["node-0"];
    expect(rootNode).toBeDefined();
    expect(firstNode).toBeDefined();
    if (!rootNode || !firstNode) {
      return;
    }

    delete fixture.mapping.root;
    defineMappingEntry(fixture.mapping, "__proto__", {
      ...rootNode,
      id: "__proto__",
      children: ["node-0"]
    });
    fixture.root = "__proto__";
    firstNode.parent = "__proto__";

    const result = trimConversationData(fixture, 5);

    expect(result.kind).toBe("trimmed");
    if (result.kind !== "trimmed") {
      return;
    }

    const mapping = result.data.mapping as Record<string, unknown>;
    expect(Object.getPrototypeOf(mapping)).toBeNull();
    expect(Object.prototype.hasOwnProperty.call(mapping, "__proto__")).toBe(true);
    expect(mappingKeys(result.data)).toContain("__proto__");
  });
});
