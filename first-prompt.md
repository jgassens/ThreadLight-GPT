# first-prompt.md — first Codex prompt for ThreadLight

Use this as the first prompt in Codex from the root of a new empty repository containing `PLANS.md` and `AGENTS.md`.

---

You are working in the ThreadLight repository. Read `AGENTS.md` and `PLANS.md` first, then implement the first working WebExtension-core milestone. Do not start with Xcode. Build the TypeScript Safari WebExtension core, tests, and documentation scaffold.

Goal: create a buildable, testable MVP scaffold for a Safari Web Extension that trims long ChatGPT conversation JSON before the page renders it. Keep the implementation local-only and low-permission.

Hard constraints:

- No analytics, telemetry, backend calls, remote config, or external network calls.
- Do not store or log chat content.
- Do not request broad permissions.
- Manifest host permissions must only include `https://chatgpt.com/*` and `https://chat.openai.com/*`.
- Page proxy must fail open and return the original response on any error or unrecognized data shape.
- Do not copy competitor source code verbatim. Implement independently.
- Do not create or modify Xcode project files in this first task.

Implement this repo structure:

```text
package.json
package-lock.json if npm creates it
tsconfig.json
eslint.config.js
vitest.config.ts
.prettierrc
.gitignore
README.md
extension/
  manifest.safari.json
  manifest.json                 # generated or copied by build script
  icons/
    placeholder icons or documented placeholders
  popup/
    popup.html
    popup.css
    popup.ts
  src/
    background/
      background.ts
    content/
      page-inject.ts
      content.ts
      status-pill.ts
      dom-selectors.ts
    page/
      page-proxy.ts
    shared/
      constants.ts
      events.ts
      logger.ts
      settings.ts
      storage.ts
      trimmer.ts
      types.ts
      url-matcher.ts
scripts/
  build-extension.mjs
  clean.mjs
tests/
  unit/
    trimmer.test.ts
    url-matcher.test.ts
    settings.test.ts
    response-rewrite.test.ts
  fixtures/
    fixtureFactory.ts
docs/
  architecture.md
  safari-packaging.md
  privacy-policy.md
  app-review-notes.md
```

Package/tooling requirements:

- Use TypeScript in strict mode.
- Use esbuild for bundling extension entry points.
- Use Vitest for tests.
- Use ESLint and Prettier.
- Create these scripts:
  - `npm run clean`
  - `npm run build:safari`
  - `npm run typecheck`
  - `npm run lint`
  - `npm run test`
  - `npm run verify` = typecheck + lint + test + build:safari

Extension behavior to implement now:

1. Settings
   - Define `ThreadLightSettingsV1` with:
     - `version: 1`
     - `enabled: boolean`
     - `keepLastTurns: number`
     - `showStatusPill: boolean`
     - `ultraLeanMode: boolean`
     - `collapseLongUserMessages: boolean`
     - `debug: boolean`
     - `suspendOnceForFullReload: boolean`
   - Defaults:
     - enabled true
     - keepLastTurns 20
     - showStatusPill false
     - ultraLeanMode false
     - collapseLongUserMessages false
     - debug false
     - suspendOnceForFullReload false
   - Clamp keepLastTurns to 5–100.
   - Validate unknown settings safely.

2. Trimmer
   - Implement a pure function `trimConversationData(data, keepLastTurns)`.
   - Accept a ChatGPT-like `mapping`, `current_node`, and optional `root`.
   - Reconstruct active path by walking parent links from current_node.
   - Detect cycles and fail safely.
   - Count visible turns by role transitions, not raw node count.
   - Treat `system`, `tool`, and `thinking` as hidden roles.
   - Preserve hidden nodes that fall inside the kept suffix.
   - Preserve a non-visible root anchor when possible.
   - Repair parent/children links for the kept active path.
   - Preserve unknown fields by shallow-copying original objects.
   - Return a discriminated result:
     - `kind: 'trimmed'`
     - `kind: 'noop'`
     - `kind: 'unrecognized'`
   - Include stats: totalVisibleTurns, keptVisibleTurns, removedVisibleTurns, totalNodesOnPath, keptNodes.

3. URL matcher
   - Match only:
     - `GET /backend-api/conversation/<id>`
     - `GET /backend-api/shared_conversation/<id>`
   - Support both `chatgpt.com` and `chat.openai.com`.
   - Reject extra path segments like `/stream_status` and `/textdocs`.
   - Reject non-GET methods.

4. Page proxy
   - Runs in page context.
   - Does not use `browser` or `chrome` APIs.
   - Patches `window.fetch` once using a namespaced flag.
   - For non-matching requests, immediately call native fetch.
   - For matching requests:
     - call native fetch
     - only process JSON responses
     - clone and parse JSON safely
     - call trimmer
     - if trimmed, return a modified Response with JSON body
     - delete stale `content-length` and `content-encoding`
     - preserve status and statusText
     - dispatch a status event with counts only
     - on errors, return original response
   - Add a small exported helper for response rewriting if needed so it can be unit tested outside the page context.

5. Page injection and content script
   - `page-inject.ts` runs at `document_start`.
   - It injects `dist/page-proxy.js` into page context using `browser.runtime.getURL` or a small browser/chrome compatibility helper.
   - It syncs sanitized config to page localStorage under `threadlight_config_v1` and dispatches a `threadlight-config` CustomEvent with a JSON string.
   - `content.ts` runs at `document_idle`, listens for status events, applies optional ultra lean root class, and manages a minimal optional status pill.
   - No chat content may be included in status events or UI.

6. Popup
   - Build a plain HTML/CSS/TS popup with:
     - enable toggle
     - keep-last-turns slider
     - status pill toggle
     - ultra lean toggle
     - restore full thread button placeholder
     - privacy link placeholder
   - Popup reads/writes local extension settings.
   - Keep it accessible with labels and keyboard-friendly controls.

7. Manifest
   - MV3 Safari manifest.
   - Permissions: storage only unless a specific small permission is required and explained in a comment/doc.
   - Host permissions only ChatGPT domains.
   - `page-inject.js` at document_start.
   - `content.js` at document_idle.
   - `page-proxy.js` as a web accessible resource only for ChatGPT domains.

8. Tests
   - Add unit tests for settings validation.
   - Add URL matcher tests.
   - Add trimmer tests covering:
     - simple trim
     - no-op under limit
     - hidden roles not counted
     - consecutive same-role nodes count as one turn
     - root anchor preserved
     - children/parent links repaired
     - branch outside active path omitted
     - cycle handled safely
   - Add response rewriting tests that verify modified JSON response headers and pass-through behavior.

9. Docs
   - README with project summary, local-only promise, and development commands.
   - docs/architecture.md explaining fetch-proxy design.
   - docs/safari-packaging.md with placeholder/manual steps for Xcode converter; clearly note that exact commands should be verified on a Mac with current Xcode.
   - docs/privacy-policy.md draft.
   - docs/app-review-notes.md draft.

After implementation:

- Run `npm run verify`.
- Report exactly what passed.
- If anything fails because of environment limitations, report the exact command and error, and leave the repo in the best working state.
- Summarize the main files created and the next recommended Codex task.
