# ThreadLight Architecture

ThreadLight is built around a narrow fetch-proxy design.

1. A document-start content script injects `dist/page-proxy.js` into the ChatGPT page context.
2. The page-context script patches `window.fetch` once.
3. Only `GET /backend-api/conversation/<id>` and `GET /backend-api/shared_conversation/<id>` responses on ChatGPT domains are considered.
4. JSON responses are cloned and parsed. Unrecognized shapes pass through unchanged.
5. A pure trimmer reconstructs the active conversation path from `current_node`, keeps the most recent visible role-transition turns, repairs parent/children links, and preserves unknown fields by shallow-copying nodes.
6. If trimming occurs, the proxy returns a new JSON `Response` with stale body headers removed.
7. Status events contain only counts and state, never message text.

The isolated content scripts own settings sync, optional status UI, and CSS containment. The page proxy does not use `browser` or `chrome` APIs.

## Failure Model

ThreadLight fails open. Any unknown response shape, cycle, missing node, JSON parse error, or rewrite error returns the original response so normal ChatGPT behavior wins over aggressive trimming.

## Permission Model

The manifest requests `storage` and host access only for:

- `https://chatgpt.com/*`
- `https://chat.openai.com/*`

No cookies, history, bookmarks, unrestricted scripting, analytics, telemetry, remote config, or backend calls are used.
