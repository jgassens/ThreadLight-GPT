import { HIDDEN_ROLES } from "./constants";
import { clampKeepLastTurns, isRecord } from "./settings";
import type { JsonObject, TrimResult, TrimStats } from "./types";

export const MIN_REMOVED_VISIBLE_TURNS_FOR_TRIMMING = 3;

interface PathNode {
  id: string;
  node: JsonObject;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readParentId(node: JsonObject): string | undefined {
  const parent = node.parent;
  return parent === null ? undefined : readString(parent);
}

function readRole(node: JsonObject): string | undefined {
  const message = node.message;
  if (!isRecord(message)) {
    return undefined;
  }
  const author = message.author;
  if (!isRecord(author)) {
    return undefined;
  }
  return readString(author.role);
}

function isVisibleRole(role: string | undefined): role is string {
  return role !== undefined && !HIDDEN_ROLES.has(role);
}

function getMapping(data: JsonObject): Record<string, unknown> | undefined {
  return isRecord(data.mapping) ? data.mapping : undefined;
}

function buildActivePath(
  mapping: Record<string, unknown>,
  currentNodeId: string
): PathNode[] | undefined {
  const seen = new Set<string>();
  const reversedPath: PathNode[] = [];
  let nextId: string | undefined = currentNodeId;

  while (nextId) {
    if (seen.has(nextId)) {
      return undefined;
    }
    seen.add(nextId);

    if (!Object.prototype.hasOwnProperty.call(mapping, nextId)) {
      return undefined;
    }

    const node = mapping[nextId];
    if (!isRecord(node)) {
      return undefined;
    }

    reversedPath.push({ id: nextId, node });
    nextId = readParentId(node);
  }

  return reversedPath.reverse();
}

function indexVisibleTurns(path: PathNode[]): {
  totalVisibleTurns: number;
  turnById: Map<string, number | null>;
} {
  let totalVisibleTurns = 0;
  let previousVisibleRole: string | undefined;
  const turnById = new Map<string, number | null>();

  for (const item of path) {
    const role = readRole(item.node);
    if (!isVisibleRole(role)) {
      turnById.set(item.id, null);
      continue;
    }

    if (role !== previousVisibleRole) {
      totalVisibleTurns += 1;
      previousVisibleRole = role;
    }

    turnById.set(item.id, totalVisibleTurns);
  }

  return { totalVisibleTurns, turnById };
}

function makeStats(
  totalVisibleTurns: number,
  keptVisibleTurns: number,
  totalNodesOnPath: number,
  keptNodes: number
): TrimStats {
  return {
    totalVisibleTurns,
    keptVisibleTurns,
    removedVisibleTurns: Math.max(0, totalVisibleTurns - keptVisibleTurns),
    totalNodesOnPath,
    keptNodes
  };
}

function chooseRootAnchor(
  path: PathNode[],
  suffix: PathNode[],
  explicitRootId: string | undefined
): PathNode | undefined {
  const suffixIds = new Set(suffix.map((item) => item.id));
  const explicitRoot = explicitRootId ? path.find((item) => item.id === explicitRootId) : undefined;
  const candidate = explicitRoot ?? path[0];

  if (!candidate || suffixIds.has(candidate.id)) {
    return undefined;
  }

  return isVisibleRole(readRole(candidate.node)) ? undefined : candidate;
}

function cloneKeptPath(data: JsonObject, keptPath: PathNode[], currentNodeId: string): JsonObject {
  const mapping = Object.create(null) as Record<string, JsonObject>;

  keptPath.forEach((item, index) => {
    const parent = index > 0 ? (keptPath[index - 1]?.id ?? null) : null;
    const child = keptPath[index + 1]?.id;
    mapping[item.id] = {
      ...item.node,
      parent,
      children: child ? [child] : []
    };
  });

  const output: JsonObject = {
    ...data,
    mapping,
    current_node: currentNodeId
  };

  const root = readString(data.root);
  if (!root || !mapping[root]) {
    output.root = keptPath[0]?.id;
  }

  return output;
}

export function trimConversationData(data: unknown, keepLastTurnsInput: number): TrimResult {
  if (!isRecord(data)) {
    return { kind: "unrecognized", data, reason: "Conversation response is not an object." };
  }

  const mapping = getMapping(data);
  const currentNodeId = readString(data.current_node);
  if (!mapping || !currentNodeId) {
    return { kind: "unrecognized", data, reason: "Missing mapping or current_node." };
  }

  const path = buildActivePath(mapping, currentNodeId);
  if (!path) {
    return { kind: "unrecognized", data, reason: "Active path is missing or cyclic." };
  }

  const keepLastTurns = clampKeepLastTurns(keepLastTurnsInput);
  const { totalVisibleTurns, turnById } = indexVisibleTurns(path);
  const noopStats = makeStats(totalVisibleTurns, totalVisibleTurns, path.length, path.length);

  // A continuation streaming below the active leaf (current_node has children) means a reply or
  // thinking node hangs under it. Trimming rebuilds the leaf with children:[] and would sever that
  // live branch, blanking the in-progress response, so leave the tree untouched until it settles.
  const currentNode = mapping[currentNodeId];
  if (isRecord(currentNode) && Array.isArray(currentNode.children) && currentNode.children.length > 0) {
    return { kind: "noop", data, stats: noopStats, reason: "streaming-branch" };
  }

  if (totalVisibleTurns <= keepLastTurns) {
    return { kind: "noop", data, stats: noopStats, reason: "within-limit" };
  }

  if (totalVisibleTurns - keepLastTurns < MIN_REMOVED_VISIBLE_TURNS_FOR_TRIMMING) {
    return { kind: "noop", data, stats: noopStats, reason: "below-trim-threshold" };
  }

  const firstTurnToKeep = totalVisibleTurns - keepLastTurns + 1;
  const suffixStartIndex = path.findIndex((item) => {
    const turn = turnById.get(item.id);
    return typeof turn === "number" && turn >= firstTurnToKeep;
  });

  if (suffixStartIndex < 0) {
    return { kind: "noop", data, stats: noopStats, reason: "no-visible-suffix" };
  }

  const suffix = path.slice(suffixStartIndex);
  const explicitRootId = readString(data.root);
  const rootAnchor = chooseRootAnchor(path, suffix, explicitRootId);
  const keptPath = rootAnchor ? [rootAnchor, ...suffix] : suffix;
  const stats = makeStats(totalVisibleTurns, keepLastTurns, path.length, keptPath.length);

  return {
    kind: "trimmed",
    data: cloneKeptPath(data, keptPath, currentNodeId),
    stats
  };
}
