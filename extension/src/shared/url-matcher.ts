import { CHATGPT_HOSTS } from "./constants";

const CHATGPT_HOST_SET = new Set<string>(CHATGPT_HOSTS);
const MATCHED_ENDPOINTS = new Set(["conversation", "shared_conversation"]);

function getDefaultBaseUrl(): string {
  if (typeof window !== "undefined" && window.location.href) {
    return window.location.href;
  }
  return "https://chatgpt.com/";
}

export function resolveRequestUrl(
  input: RequestInfo | URL,
  baseUrl: string = getDefaultBaseUrl()
): URL | undefined {
  try {
    if (input instanceof Request) {
      return new URL(input.url, baseUrl);
    }
    if (input instanceof URL) {
      return input;
    }
    return new URL(input, baseUrl);
  } catch {
    return undefined;
  }
}

export function getRequestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (typeof init?.method === "string") {
    return init.method.toUpperCase();
  }
  if (input instanceof Request) {
    return input.method.toUpperCase();
  }
  return "GET";
}

export function matchesConversationEndpoint(url: URL, method: string = "GET"): boolean {
  if (method.toUpperCase() !== "GET") {
    return false;
  }

  if (!CHATGPT_HOST_SET.has(url.hostname)) {
    return false;
  }

  const parts = url.pathname.split("/").filter(Boolean);
  const [apiPrefix, endpoint, id] = parts;
  return (
    parts.length === 3 &&
    apiPrefix === "backend-api" &&
    typeof endpoint === "string" &&
    MATCHED_ENDPOINTS.has(endpoint) &&
    typeof id === "string" &&
    id.length > 0
  );
}

export function isChatGptUrl(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === "https:" && CHATGPT_HOST_SET.has(url.hostname);
  } catch {
    return false;
  }
}

export function isConversationJsonRequest(
  input: RequestInfo | URL,
  init?: RequestInit,
  baseUrl?: string
): boolean {
  const url = resolveRequestUrl(input, baseUrl);
  if (!url) {
    return false;
  }
  return matchesConversationEndpoint(url, getRequestMethod(input, init));
}
