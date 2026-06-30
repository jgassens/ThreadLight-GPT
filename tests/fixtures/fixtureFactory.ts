import type { JsonObject } from "../../extension/src/shared/types";

interface FixtureNode extends JsonObject {
  id: string;
  parent: string | null;
  children: string[];
  message: JsonObject | null;
}

export interface FixtureConversation extends JsonObject {
  mapping: Record<string, FixtureNode>;
  current_node: string;
  root: string;
}

export function createLinearConversation(roles: string[]): FixtureConversation {
  const root = "root";
  const mapping: Record<string, FixtureNode> = {
    [root]: {
      id: root,
      parent: null,
      children: [],
      message: null
    }
  };

  let parent = root;
  roles.forEach((role, index) => {
    const id = `node-${index}`;
    const parentNode = mapping[parent];
    if (!parentNode) {
      throw new Error(`Missing synthetic parent: ${parent}`);
    }
    parentNode.children = [id];
    mapping[id] = {
      id,
      parent,
      children: [],
      message: {
        author: { role },
        content: { content_type: "text", parts: [`synthetic ${role} ${index}`] }
      }
    };
    parent = id;
  });

  return {
    mapping,
    current_node: parent,
    root
  };
}

export function mappingKeys(data: FixtureConversation | JsonObject): string[] {
  const mapping = data.mapping;
  return mapping && typeof mapping === "object" && !Array.isArray(mapping)
    ? Object.keys(mapping).sort()
    : [];
}
