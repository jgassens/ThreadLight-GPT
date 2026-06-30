# PLANS.md — ThreadLight for Safari

Working name: **ThreadLight**  
Product: a paid Safari Web Extension that keeps long ChatGPT web conversations responsive in Safari by reducing the conversation tree that the ChatGPT frontend renders locally.  
Date: 2026-06-29  
Status: implementation plan for Codex-driven development

## 1. Product thesis

Safari can become sluggish in very long ChatGPT web threads because the ChatGPT page accumulates a large amount of client-side state and rendered UI. ThreadLight should reduce Safari's rendering and memory burden without changing the user's actual ChatGPT conversation stored by OpenAI.

The product promise is narrow:

> Keep long ChatGPT web threads usable in Safari by showing only the recent part of the thread in the current tab, while preserving the full conversation on ChatGPT's servers and allowing the user to restore the full view by reloading.

The product must not claim to speed up the model, bypass ChatGPT limits, improve model context, scrape ChatGPT, automate ChatGPT, or provide any official OpenAI integration.

The commercial angle is practical: Safari users have fewer extension options than Chrome users, and Safari is the browser where this pain is most visible. A small, privacy-preserving paid utility can be viable if it is reliable, low-permission, clear about its limitations, and easy to enable.

## 2. Verified external constraints and source notes

These were checked on 2026-06-29.

- Safari Web Extensions use familiar web technologies, can read and modify webpage content, can communicate with native apps, are built with Xcode, and are distributed through the App Store Extensions category. Source: Apple Developer Safari Extensions page, https://developer.apple.com/safari/extensions/
- Apple says Xcode supports the WebExtension API and includes a porting tool to bring extensions to Safari. The same Apple page also says web extensions from other browsers can be converted into an Xcode project configured with macOS and/or iOS/iPadOS apps.
- Apple now documents an App Store Connect workflow that can package a web extension ZIP without a Mac or Xcode, but the development plan should still target a normal Xcode project because this product needs a polished native container app and commercial distribution. Source: Apple Developer Safari Extensions page, https://developer.apple.com/safari/extensions/
- Safari content scripts execute in an isolated JavaScript world. The fetch-proxy must run in the page context, not only in the isolated content script. Source: Apple WWDC Safari Web Extensions material, https://developer.apple.com/videos/play/wwdc2020/10665/
- Codex reads AGENTS.md before work and can layer global and repo instructions. Source: OpenAI Codex AGENTS.md guide, https://developers.openai.com/codex/guides/agents-md
- OpenAI recommends strong task context and suggests PLANS.md/execution-plan style guidance for complex work. Source: OpenAI Codex best practices, https://developers.openai.com/codex/learn/best-practices
- Existing open-source prior art, LightSession, validates the useful architecture: document-start page injection, fetch interception of ChatGPT conversation JSON, message/role-transition based trimming, settings via extension storage, and local-only behavior. Source: https://github.com/11me/light-session

Important intellectual-property note: LightSession is MIT-licensed, but ThreadLight should be implemented as an independent product. Do not copy source code directly unless the resulting repo includes the MIT license notice and attribution. The preferred path is to use the architectural lessons and write fresh code.

## 3. Product positioning

### 3.1 Primary user

The user is a Safari user who keeps long ChatGPT web threads open for research, coding, writing, planning, or debugging. They are not looking for a new AI client. They want the normal ChatGPT website to stop dragging Safari down.

### 3.2 Core value proposition

- Long ChatGPT threads stay responsive.
- The extension is local-only.
- It asks for access only to ChatGPT domains.
- It does not collect, transmit, or analyze chat content.
- The user can restore the full ChatGPT page by reloading.
- The extension can be disabled at any time from the popup.

### 3.3 Product name guidance

Use a distinct product name in the App Store title, for example:

- ThreadLight
- ThreadLight for Safari
- Long Thread Helper
- Safari Thread Cleaner

Avoid making the primary app name look official or OpenAI-affiliated. The App Store subtitle or description may use descriptive compatibility language such as “performance helper for long ChatGPT web conversations,” with a visible disclaimer: “Unofficial utility. Not affiliated with OpenAI.”

### 3.4 MVP pricing recommendation

Start with a **paid-upfront App Store app**. This avoids StoreKit entitlement complexity in the MVP.

Suggested initial price test: USD $4.99 or nearby local equivalents. The exact App Store price tier should be selected in App Store Connect. Revisit after TestFlight feedback and competitor scan.

Alternative commercial paths:

- Free app with one-time in-app purchase for “Pro”: more friction to build, but better for trial conversion.
- Subscription: not appropriate for V1 unless ongoing maintenance is packaged clearly. A subscription for a small performance helper may create avoidable user resistance.
- Mac-only direct sale outside the App Store: not recommended for V1 because iOS/iPadOS Safari extension support and App Store discovery are meaningful advantages.

## 4. Product scope

### 4.1 MVP features

1. Enable/disable extension globally for ChatGPT.
2. Choose “keep last N visible turns” with a slider.
3. Default retention: 20 visible turns.
4. Range: 5 to 100 visible turns.
5. Fetch-proxy trimming for ChatGPT conversation JSON endpoints.
6. Local-only settings stored via WebExtension storage.
7. Minimal status indicator showing how many visible turns are being shown.
8. “Restore full thread” button that reloads the ChatGPT tab.
9. “Ultra lean mode” optional CSS performance mode.
10. Native SwiftUI container app with setup instructions and a privacy summary.
11. App Store-ready privacy policy and review notes.

### 4.2 MVP non-features

Do not implement these in V1:

- ChatGPT API integration.
- OpenAI account login.
- Exporting conversations.
- Search across old messages.
- Summarizing old turns.
- Sending chat content to a server.
- Analytics or telemetry.
- Cross-browser support beyond what falls out naturally from the WebExtension structure.
- Manipulating model context.
- Automating messages, retries, or scraping.
- Bypassing paywalls, quotas, access controls, or usage limits.

### 4.3 Future features

After V1 stabilizes:

- “Peek old thread” mode using a local placeholder/timeline, if it can be implemented without storing chat content.
- Per-conversation retention settings.
- Mac menu bar helper for enabling Safari extension settings.
- Free trial with StoreKit 2.
- Diagnostic mode that measures local render pressure without reading chat content.
- Optional “local-only diagnostics export” that redacts all message content and includes only counts, timings, endpoint shapes, and extension versions.

## 5. User experience design

### 5.1 Popup controls

The Safari toolbar popup should be plain and fast. Avoid React unless there is a compelling reason. Use HTML/CSS/TypeScript.

Popup layout:

- Product name: ThreadLight
- Status row: “Running on this ChatGPT tab” or “Open ChatGPT to use ThreadLight”
- Toggle: “Enable ThreadLight”
- Slider: “Show last N turns”
- Checkbox: “Show status pill on page”
- Checkbox: “Ultra lean mode”
- Button: “Restore full thread”
- Link/button: “Privacy”
- Small disclaimer: “Local-only. Reloading restores the full page.”

Accessibility requirements:

- All controls have labels.
- Full keyboard operation.
- Visible focus states.
- VoiceOver-friendly descriptions.
- No tiny-only controls.
- Respect dark mode.

### 5.2 In-page status pill

The status pill should be optional and off by default if it feels distracting.

Content examples:

- “ThreadLight: showing 20 of 188 turns. Reload to restore full thread.”
- “ThreadLight paused.”
- “ThreadLight could not recognize this ChatGPT page version.”

The pill must not contain message text. It should only show counts and state.

### 5.3 Restore full thread behavior

The clearest restore behavior is a page reload. Reloading fetches the full conversation again from ChatGPT. If ThreadLight remains enabled, the fetch proxy will trim again; therefore the Restore button should temporarily suspend trimming for one reload.

Implementation:

1. Popup sets `suspendOnceForFullReload: true` in extension storage.
2. Popup tells content script to reload current ChatGPT tab.
3. `page-proxy` reads the suspend flag via config event/localStorage and skips the next matching conversation response.
4. Content script clears the flag after first page load or after a timeout.
5. Status pill shows “Full thread restored for this reload. ThreadLight will resume on next navigation unless disabled.”

Alternative if suspend-once is too fragile: the restore button disables ThreadLight and reloads. User re-enables manually. This is less elegant but simpler and safer.

## 6. Technical architecture

### 6.1 Architecture summary

ThreadLight consists of four layers:

1. Native Safari container app
   - SwiftUI app distributed through App Store.
   - Shows onboarding, privacy, and setup instructions.
   - V1 paid-upfront app; no purchase state needed inside extension.

2. WebExtension background/service worker
   - Owns extension settings.
   - Responds to popup/content messages.
   - Does not inspect chat content.

3. Isolated content scripts
   - Run on `https://chatgpt.com/*` and `https://chat.openai.com/*`.
   - Inject page-context script at `document_start`.
   - Sync settings into page context via localStorage and CustomEvents.
   - Listen for status events from page context.
   - Manage status pill and optional CSS mode.

4. Page-context fetch proxy
   - Runs inside the ChatGPT page JavaScript context.
   - Patches `window.fetch` early.
   - Intercepts only specific ChatGPT conversation JSON GET endpoints.
   - Trims the response mapping before the ChatGPT React app renders it.
   - Fails open by returning the original response on any error.

ASCII flow:

```text
Safari App Store app
        |
        | contains
        v
Safari Web Extension
        |
        +-- popup.html/popup.ts  <---- user settings
        |
        +-- background.ts        <---- storage.local
        |
        +-- content/page-inject.ts at document_start
        |        |
        |        +-- injects dist/page-proxy.js into page context
        |
        +-- content/content.ts at document_idle
                 |
                 +-- status pill, settings sync, reload control

ChatGPT page context
        |
        +-- page-proxy.ts patches window.fetch
                 |
                 +-- GET /backend-api/conversation/<id>
                 +-- GET /backend-api/shared_conversation/<id>
                 |
                 +-- parse JSON mapping
                 +-- trim active path to last N visible role transitions
                 +-- return modified Response
```

### 6.2 Why fetch proxy instead of DOM cleanup

DOM cleanup is useful as a fallback, but it happens after ChatGPT has already downloaded, parsed, reconciled, and rendered a large conversation tree. In long threads, the expensive work has already happened.

The fetch-proxy approach is stronger because it modifies the conversation data before React renders it. This reduces rendered DOM and React work from the start. It also avoids a flash of fully rendered content and avoids continuous MutationObserver cleanup.

### 6.3 Endpoint matching

Intercept only these requests:

```text
GET https://chatgpt.com/backend-api/conversation/<conversation_id>
GET https://chatgpt.com/backend-api/shared_conversation/<conversation_id>
GET https://chat.openai.com/backend-api/conversation/<conversation_id>
GET https://chat.openai.com/backend-api/shared_conversation/<conversation_id>
```

Do not intercept:

- POST requests.
- streaming endpoints.
- `/backend-api/conversation/<id>/stream_status`
- `/backend-api/conversation/<id>/textdocs`
- `/backend-api/me`
- `/backend-api/models`
- `/backend-api/settings`
- any non-JSON response.
- any non-ChatGPT domain.

Endpoint matcher:

```ts
function isConversationRequest(method: string, url: URL): boolean {
  if (method !== 'GET') return false;
  return /^\/backend-api\/(conversation|shared_conversation)\/[^/]+\/?$/.test(url.pathname);
}
```

### 6.4 Conversation data shape

The current ChatGPT web conversation response usually includes a mapping shaped broadly like this:

```ts
interface ConversationData {
  mapping?: Record<string, ConversationNode>;
  current_node?: string;
  root?: string;
  [key: string]: unknown;
}

interface ConversationNode {
  id?: string;
  parent?: string | null;
  children?: string[];
  message?: {
    id?: string;
    author?: { role?: string; [key: string]: unknown };
    content?: unknown;
    metadata?: Record<string, unknown>;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
}
```

The code must tolerate missing fields and unknown extra fields. This is a private web response, not a public API. The extension must fail open when the shape changes.

### 6.5 Trimming concept

The trimmer keeps only the active path from root to `current_node`, and within that path keeps the most recent N **visible turns**.

A visible turn is a contiguous sequence of nodes with the same visible role. This is better than raw node count because ChatGPT may use multiple assistant nodes for one rendered assistant response.

Hidden/internal roles excluded from the visible turn count:

- `system`
- `tool`
- `thinking`

Hidden nodes within the retained suffix should be kept when they are near retained visible turns, because the frontend may depend on them for rendering metadata or state.

The root anchor should be preserved when possible.

### 6.6 Trimming algorithm

Pseudocode:

```text
trimConversation(data, keepLastVisibleTurns):
  validate data.mapping and data.current_node
  build activePath by walking parent links from current_node to root
  stop if missing node or cycle detected
  reverse activePath to chronological order

  visibleTotal = count visible role transitions across activePath
  if visibleTotal <= keepLastVisibleTurns:
      return no-op

  walk activePath backward
  count visible role transitions from newest to oldest
  when count exceeds keepLastVisibleTurns:
      cutIndex = currentIndex + 1
      break

  keptSuffix = activePath.slice(cutIndex)
  if keptSuffix has no visible messages:
      return no-op

  rootCandidate = activePath[0]
  if rootCandidate exists and has no visible role:
      include rootCandidate as root anchor
      root.children = [first kept node]
      first kept node.parent = rootCandidate
  else:
      first kept node.parent = null

  for every node in keptSuffix:
      shallow copy original node
      repair parent and children to represent a single active path
      preserve all unknown fields

  return:
      mapping: repaired mapping
      current_node: last kept node
      root: root anchor or first kept node
      stats: visibleTotal, visibleKept, removed
```

### 6.7 Response rewriting

The page proxy should:

1. Save a bound reference to native fetch.
2. Patch `window.fetch` once.
3. Extract URL and method without consuming request bodies.
4. Immediately pass through non-matching requests.
5. For matching requests:
   - wait briefly for config, but do not block indefinitely.
   - call native fetch.
   - clone the response.
   - parse JSON safely.
   - validate data shape.
   - trim mapping.
   - if no visible trim occurred, return original response.
   - otherwise create a new Response with modified JSON.
6. Remove or recalculate headers that are no longer valid:
   - delete `content-length`
   - delete `content-encoding`
   - set `content-type` to JSON
7. Preserve response `status` and `statusText`.
8. On any error, return original response.

### 6.8 Config transfer into page context

The page-context script cannot access WebExtension APIs. Use this sequence:

1. `page-inject.ts` runs at `document_start` in isolated content script world.
2. It immediately injects `dist/page-proxy.js` into the page context using a `script.src = browser.runtime.getURL(...)` tag.
3. In parallel, it reads `browser.storage.local` and writes a small settings object to the page's `localStorage` under a namespaced key, such as `threadlight_config_v1`.
4. It also dispatches a `threadlight-config` CustomEvent containing a JSON string.
5. `page-proxy.ts` reads localStorage on startup and listens for `threadlight-config` events.
6. `content.ts` also sends config events after document idle and on storage changes.

Only store settings in localStorage, never message content.

Settings schema:

```ts
interface ThreadLightSettingsV1 {
  version: 1;
  enabled: boolean;
  keepLastTurns: number;
  showStatusPill: boolean;
  ultraLeanMode: boolean;
  collapseLongUserMessages: boolean;
  debug: boolean;
  suspendOnceForFullReload: boolean;
}
```

### 6.9 Event protocol

Use namespaced events to avoid collisions.

Page script listens for:

- `threadlight-config`
- `threadlight-request-config`

Content script listens for:

- `threadlight-status`
- `message` with `{ type: 'threadlight-proxy-ready' }`

Status payload:

```ts
interface ThreadLightTrimStatus {
  version: 1;
  enabled: boolean;
  recognized: boolean;
  totalVisibleTurns: number;
  keptVisibleTurns: number;
  removedVisibleTurns: number;
  keepLastTurns: number;
  lastUpdatedAt: number;
  reason?: 'trimmed' | 'no-op' | 'disabled' | 'unrecognized' | 'error' | 'suspended-once';
}
```

No message text, author names, timestamps, prompts, or content fragments should be included.

### 6.10 Ultra lean mode

Ultra lean mode is optional CSS applied by content script. It is a fallback and supplement, not the core feature.

Possible CSS:

```css
html.threadlight-ultra-lean * {
  animation-duration: 0.001s !important;
  transition-duration: 0.001s !important;
}

html.threadlight-ultra-lean [data-testid^="conversation-turn"],
html.threadlight-ultra-lean article,
html.threadlight-ultra-lean [data-message-author-role] {
  content-visibility: auto !important;
  contain-intrinsic-size: auto 720px !important;
}

html.threadlight-ultra-lean pre,
html.threadlight-ultra-lean code,
html.threadlight-ultra-lean .markdown,
html.threadlight-ultra-lean .prose {
  contain: content !important;
}
```

This mode must be reversible by removing one root class.

### 6.11 Long user message collapse

A long pasted user message can also strain layout. Provide an optional presentation-only collapse feature for user-authored messages over a threshold.

V1 threshold: 2,000 visible characters.

Implementation constraints:

- Do not remove content from DOM.
- Use CSS max-height and a small expand button.
- User can expand individual messages.
- Do not run expensive text scans repeatedly.
- Debounce MutationObserver.
- Disable this feature if selector confidence is low.

This feature can be deferred if it threatens launch stability.

## 7. Safari-specific implementation notes

### 7.1 Content script isolation

Because Safari content scripts are isolated from page scripts, patching `window.fetch` from a normal content script is not sufficient. The plan must inject a separate page-context script at `document_start`.

Implementation strategy:

```ts
const script = document.createElement('script');
script.src = browser.runtime.getURL('dist/page-proxy.js');
(document.head || document.documentElement).prepend(script);
script.onload = () => script.remove();
```

Test this on:

- macOS Safari current release.
- iOS Safari current release.
- iPadOS Safari current release.

If Safari blocks script tag injection or timing is unreliable, evaluate alternatives:

- `browser.scripting.executeScript` with main-world support if available.
- Inline injected script generated at build time, only if App Store review accepts it and CSP behavior is reliable.
- DOM-only fallback mode for affected Safari versions.

### 7.2 Manifest version

Use Manifest V3 unless Safari compatibility testing shows a specific blocker.

Minimum manifest:

```json
{
  "manifest_version": 3,
  "name": "ThreadLight",
  "version": "0.1.0",
  "description": "Keep long ChatGPT web threads responsive in Safari. Local-only.",
  "permissions": ["storage"],
  "host_permissions": [
    "https://chatgpt.com/*",
    "https://chat.openai.com/*"
  ],
  "action": {
    "default_title": "ThreadLight",
    "default_popup": "popup/popup.html"
  },
  "background": {
    "service_worker": "dist/background.js"
  },
  "content_scripts": [
    {
      "matches": ["https://chatgpt.com/*", "https://chat.openai.com/*"],
      "js": ["dist/page-inject.js"],
      "run_at": "document_start"
    },
    {
      "matches": ["https://chatgpt.com/*", "https://chat.openai.com/*"],
      "js": ["dist/content.js"],
      "run_at": "document_idle"
    }
  ],
  "web_accessible_resources": [
    {
      "resources": ["dist/page-proxy.js"],
      "matches": ["https://chatgpt.com/*", "https://chat.openai.com/*"]
    }
  ]
}
```

Do not request `<all_urls>`. Do not request browsing history. Do not request cookies. Do not request network request interception permissions. Do not add analytics SDKs.

### 7.3 Xcode packaging

Preferred V1 route:

1. Build the web extension resources from TypeScript.
2. Run Safari Web Extension converter to create native macOS/iOS/iPadOS app project.
3. Customize native SwiftUI app.
4. Build and test through Xcode.
5. Submit through App Store Connect.

Candidate command:

```bash
xcrun safari-web-extension-converter ./extension --project-location ./native --app-name ThreadLight --bundle-identifier com.example.threadlight
```

Actual flags should be checked against the installed Xcode tool output because Apple has updated packaging terminology. Run:

```bash
xcrun safari-web-extension-converter --help
```

or the current packager command help if Xcode reports a newer tool name.

### 7.4 TestFlight

Use TestFlight before paid launch.

Test matrix:

- macOS Safari on current macOS.
- iOS Safari current release.
- iPadOS Safari current release.
- Private Browsing if supported by user permissions.
- Safari Profiles.
- ChatGPT logged-in normal conversations.
- ChatGPT shared conversation links.
- New empty chat.
- Long thread with code blocks.
- Long thread with images or file cards.
- Long thread with citations.
- Conversation branch/edit/retry behavior.

## 8. Repository plan

### 8.1 Proposed repo tree

```text
threadlight/
  AGENTS.md
  PLANS.md
  first-prompt.md
  README.md
  package.json
  package-lock.json
  tsconfig.json
  eslint.config.js
  vitest.config.ts
  .prettierrc
  .gitignore
  extension/
    manifest.safari.json
    manifest.dev.json
    manifest.json
    icons/
      icon-16.png
      icon-32.png
      icon-48.png
      icon-128.png
      icon-256.png
      icon-512.png
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
        user-collapse.ts
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
    dist/
      generated files, gitignored
  native/
    README.md
    ThreadLight.xcodeproj/   # generated later by converter, git may include project files after creation
    ThreadLight/
      SwiftUI container files after converter/customization
  scripts/
    build-extension.mjs
    clean.mjs
    package-safari.mjs
    make-fixtures.mjs
  tests/
    unit/
      trimmer.test.ts
      url-matcher.test.ts
      settings.test.ts
      response-rewrite.test.ts
    fixtures/
      conversation-small.json
      conversation-hidden-roles.json
      conversation-branches.json
      conversation-500-turns.json
    performance/
      trim-benchmark.test.ts
  docs/
    architecture.md
    safari-packaging.md
    app-store-listing.md
    app-review-notes.md
    privacy-policy.md
    qa-protocol.md
    release-checklist.md
```

### 8.2 Dependencies

Use minimal dependencies.

Development dependencies:

- TypeScript
- esbuild
- Vitest
- ESLint with TypeScript support
- Prettier

Avoid:

- React/Vue/Svelte for popup unless needed.
- Analytics SDKs.
- Remote config SDKs.
- Browser polyfills that create large bundles unless the code truly needs them.

Browser API wrapper:

- Either write a tiny local wrapper over `browser` and `chrome`, or add `webextension-polyfill` if Safari testing shows it is necessary.
- Keep popup and content script bundles small.

### 8.3 Package scripts

```json
{
  "scripts": {
    "clean": "node scripts/clean.mjs",
    "build": "node scripts/build-extension.mjs --target=safari",
    "build:safari": "node scripts/build-extension.mjs --target=safari",
    "build:dev": "node scripts/build-extension.mjs --target=safari --dev --watch=false",
    "watch": "node scripts/build-extension.mjs --target=safari --watch",
    "typecheck": "tsc --noEmit",
    "lint": "eslint extension/src extension/popup tests scripts --max-warnings=0",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "package:safari:zip": "node scripts/package-safari.mjs",
    "verify": "npm run typecheck && npm run lint && npm run test && npm run build:safari"
  }
}
```

## 9. Implementation milestones

### Milestone 0 — product and compliance foundation

Expected outcome:

- Repo contains the planning docs, privacy stance, and App Store positioning.
- Codex has clear project instructions.
- No code yet needs to work.

Tasks:

1. Choose working product name.
2. Create repo and commit PLANS.md, AGENTS.md, first-prompt.md.
3. Create README.md with one-paragraph product summary and local-only disclaimer.
4. Create docs/privacy-policy.md draft.
5. Create docs/app-review-notes.md draft.
6. Decide paid-upfront MVP or free plus IAP. Default: paid upfront.
7. Confirm Apple Developer Program account status and Paid Apps Agreement status.

Readiness criteria:

- A new developer can read AGENTS.md and understand how to proceed.
- App Store positioning does not imply official OpenAI affiliation.
- Privacy policy says exactly what data is and is not collected.

Alternative result and response:

- If naming/trademark risk feels high, keep the repo name generic and defer final App Store name until metadata review.

### Milestone 1 — TypeScript extension scaffold

Expected outcome:

- `npm run verify` exists.
- Build emits extension assets and manifest.
- No ChatGPT behavior yet.

Tasks:

1. Initialize package.json with ESM.
2. Add TypeScript strict config.
3. Add ESLint, Prettier, Vitest.
4. Add esbuild script with these entry points:
   - `extension/src/background/background.ts` -> `extension/dist/background.js`
   - `extension/src/content/page-inject.ts` -> `extension/dist/page-inject.js`
   - `extension/src/content/content.ts` -> `extension/dist/content.js`
   - `extension/src/page/page-proxy.ts` -> `extension/dist/page-proxy.js`
   - `extension/popup/popup.ts` -> `extension/popup/popup.js`
5. Copy `manifest.safari.json` to `manifest.json` during build.
6. Create placeholder popup HTML/CSS.
7. Create icons placeholders or add generated simple vector-derived PNGs.
8. Ensure dist outputs are deterministic and gitignored.

Readiness criteria:

- `npm run typecheck` passes.
- `npm run lint` passes.
- `npm run test` passes with at least one placeholder test.
- `npm run build:safari` creates a loadable extension directory.

Alternative result and response:

- If Safari requires different manifest fields, create target-specific manifest transform and document the difference.

### Milestone 2 — settings and storage

Expected outcome:

- Popup can read/write settings locally.
- Content script receives changes.
- Settings migration is testable.

Tasks:

1. Define `ThreadLightSettingsV1`.
2. Implement defaults:
   - enabled: true
   - keepLastTurns: 20
   - showStatusPill: false
   - ultraLeanMode: false
   - collapseLongUserMessages: false
   - debug: false
   - suspendOnceForFullReload: false
3. Implement `validateSettings(input)` with hard range checking.
4. Implement `loadSettings()`, `saveSettings()`, and `onSettingsChanged()`.
5. Add schema version.
6. Add migration hook for future versions.
7. Build popup UI that updates storage.
8. Add tests for defaulting and invalid values.

Readiness criteria:

- Invalid keep counts are clamped to 5–100.
- Missing settings are filled from defaults.
- Popup reflects saved settings after reload.
- No setting includes chat content.

Alternative result and response:

- If Safari storage behavior differs between macOS and iOS, implement a background-mediated settings API and keep direct `browser.storage.local` calls inside one module.

### Milestone 3 — trimmer core

Expected outcome:

- Pure TypeScript trimmer works against fixtures.
- No browser APIs required.

Tasks:

1. Define `ConversationData`, `ConversationNode`, `TrimResult` types.
2. Implement `isVisibleNode(node)`.
3. Implement active path reconstruction.
4. Implement cycle protection.
5. Implement visible role-transition counting.
6. Implement suffix selection.
7. Preserve root anchor if available.
8. Repair parent and children links.
9. Preserve unknown fields on copied nodes.
10. Return explicit no-op result when no visible trimming is needed.
11. Return explicit failure result when shape is unrecognized.
12. Add fixture generator for synthetic conversation trees.

Unit tests:

- Empty data returns failure/no-op without throwing.
- Missing current node returns failure/no-op.
- Simple 10-turn conversation trimmed to 4 visible turns.
- Consecutive assistant nodes count as one visible turn.
- Hidden roles are not counted.
- Hidden nodes inside retained suffix are preserved.
- Root node is preserved when non-visible.
- Parent/children links are repaired as a single active path.
- Branches outside active path are omitted.
- Cycle in parent chain does not infinite loop.
- Limit below minimum is clamped before trimmer call.
- 500-turn fixture trims quickly.

Performance target:

- Synthetic 500 visible turns trims in under 20 ms on a typical development machine.
- Synthetic 2,000 visible turns trims in under 75 ms on a typical development machine.

Readiness criteria:

- Unit test coverage focuses on trimmer correctness, not coverage vanity metrics.
- No browser or DOM dependency in trimmer.

Alternative result and response:

- If ChatGPT response shape differs, add a new fixture from a redacted structure. Do not include real chat content in the repo.

### Milestone 4 — page-context fetch proxy

Expected outcome:

- Page script patches fetch, trims matching response JSON, and fails open safely.

Tasks:

1. Implement `url-matcher.ts`.
2. Implement `createModifiedJsonResponse(original, data)`.
3. Implement fetch patch guard using a namespaced flag, e.g. `window.__THREADLIGHT_FETCH_PATCHED__`.
4. Store bound native fetch.
5. Implement request parsing for string, URL, and Request input.
6. Pass through non-matching requests before config wait.
7. Config wait max 50 ms for matching requests.
8. Read config from localStorage and events.
9. If config not received within a conservative timeout, use defaults or pass through. Prefer pass-through until confidence is high.
10. Dispatch status events after trim/no-op/error.
11. Preserve original response on errors.
12. Add debug logging only when debug is enabled.

Tests:

- Non-matching request calls native fetch unchanged.
- Matching JSON response is trimmed.
- Matching non-JSON response passes through.
- Invalid JSON passes through.
- Disabled setting passes through.
- No-op trim returns original response, not rewritten response.
- Modified response deletes stale content-length and content-encoding.
- Fetch patch is idempotent.

Readiness criteria:

- Page proxy has no imports that require extension APIs at runtime.
- Page proxy can run in page context without `browser` or `chrome`.
- Any thrown error leads to original response.

Alternative result and response:

- If ChatGPT switches from fetch to another transport for initial conversation loading, add a narrowly scoped XMLHttpRequest proxy only after confirming the endpoint behavior.

### Milestone 5 — content injection and config sync

Expected outcome:

- Extension injects page proxy early and transmits config.

Tasks:

1. Implement `page-inject.ts` at document_start.
2. Inject page script as a web accessible resource.
3. Write sanitized config to localStorage.
4. Dispatch config event as a JSON string.
5. Implement `content.ts` at document_idle.
6. Listen for proxy-ready message from same origin only.
7. Listen for status events and validate payload shape.
8. Render optional status pill.
9. Apply ultra lean CSS class.
10. Handle SPA navigation by detecting history pushState/replaceState/popstate changes.
11. Reset status counts on navigation.
12. Implement restore-full-thread message.

Tests:

- Event payload validation rejects malformed data.
- Config serialization never includes extra fields.
- Status pill escapes text and does not accept HTML.
- SPA navigation detector coalesces rapid changes.

Manual tests:

- Open ChatGPT with extension enabled.
- Confirm proxy-ready message in debug mode.
- Confirm first conversation fetch is trimmed before render.
- Change popup slider and reload; new setting takes effect.

Readiness criteria:

- No message content passes from page context to extension context.
- Settings updates work without refreshing popup.

Alternative result and response:

- If document_start injection loses race on Safari, test whether inlining the page proxy or main-world scripting improves timing. Document the chosen path.

### Milestone 6 — popup and native app polish

Expected outcome:

- Extension feels like a paid product, not a prototype.

Popup tasks:

1. Build compact popup UI.
2. Add status row for active tab.
3. Add enable toggle.
4. Add keep-last-turns slider and number display.
5. Add status pill toggle.
6. Add ultra lean mode toggle.
7. Add restore full thread button.
8. Add privacy link.
9. Add version display.
10. Add error state when storage is unavailable.

Native app tasks:

1. Use Safari Web Extension converter to create Xcode project.
2. Replace default native app text with branded onboarding.
3. Add instructions:
   - macOS: Safari > Settings > Extensions > enable ThreadLight.
   - iOS/iPadOS: Settings > Safari > Extensions > enable ThreadLight and allow ChatGPT domains.
4. Add privacy summary.
5. Add support email link.
6. Add “Open Safari” button if practical.
7. Add “How to test it” section.
8. Add local FAQ.

Readiness criteria:

- A user who installs the paid app understands that they must enable the Safari extension.
- App copy is honest: local-only, domain-limited, unofficial.
- No unsupported guarantee such as “will always work.”

Alternative result and response:

- If app review objects to a too-minimal native container, add a small but useful native help center, troubleshooting checklist, and privacy detail screen.

### Milestone 7 — Safari packaging and local device testing

Expected outcome:

- Extension runs in Safari on macOS and at least one iOS/iPadOS device or simulator.

Tasks:

1. Build extension resources.
2. Run Safari converter.
3. Configure bundle IDs.
4. Configure signing team.
5. Enable App Sandbox where required.
6. Run native app target.
7. Enable extension in Safari.
8. Test on `chatgpt.com`.
9. Test on `chat.openai.com` redirect behavior.
10. Test permissions prompt.
11. Test private browsing behavior if extension is allowed.
12. Verify no warnings about excessive permissions.

Readiness criteria:

- Extension can be enabled.
- Popup opens.
- Page proxy injects.
- Long thread visibly trims.
- Restore behavior works.
- Disable toggle immediately prevents future trims.

Alternative result and response:

- If iOS Safari blocks a critical behavior, ship macOS first only if App Store strategy still makes sense. Otherwise fall back to DOM/CSS optimization for iOS and fetch proxy for macOS.

### Milestone 8 — QA protocol

Expected outcome:

- Product behavior is tested against realistic ChatGPT usage.

Test data principle:

Never commit real user chat content. Use synthetic fixtures or manually created throwaway chats.

Manual scenario matrix:

1. New empty chat.
2. Short chat under retention limit.
3. Long text-only chat, 100+ visible turns.
4. Long chat with code blocks.
5. Long chat with Markdown tables.
6. Long chat with math.
7. Long chat with citations.
8. Long chat with file cards/artifacts if available.
9. Long chat with images if available.
10. Shared conversation page.
11. Edit old message after trim.
12. Retry assistant response after trim.
13. Branch from recent message.
14. Branch from old hidden message after restore.
15. Page reload with extension enabled.
16. Page reload with extension disabled.
17. Restore full thread action.
18. ChatGPT UI update/selector unknown.
19. Network offline/slow response.
20. Private browsing/profile permission differences.

Expected outcomes:

- For normal use, recent turns render and new prompts work.
- Old hidden turns are not visible until restore.
- Reload restores the full page if ThreadLight is disabled or suspended once.
- If endpoint shape is unknown, ThreadLight does nothing rather than breaking ChatGPT.
- No extension-originated network requests occur.

Alternative results and responses:

- If editing old hidden turns breaks, document that the user should restore the full thread before editing older messages.
- If branch history is incomplete, keep active path only in V1 and document restore behavior.
- If status counts are wrong but trimming works, hide status pill by default until counts are reliable.

### Milestone 9 — privacy, security, and App Store review package

Expected outcome:

- App Store submission has clear privacy answers and review instructions.

Privacy policy claims that must remain true:

- ThreadLight does not collect chat content.
- ThreadLight does not transmit chat content.
- ThreadLight does not use analytics or tracking.
- ThreadLight stores only local settings.
- ThreadLight runs only on specified ChatGPT domains.
- ThreadLight has no backend server.

Security checklist:

- Host permissions limited to ChatGPT domains.
- No remote code loading.
- No eval/new Function.
- No analytics SDK.
- No external network calls.
- No cookies permission.
- No all_urls permission.
- All page-to-content events validated.
- No message content in logs by default.
- Debug logs avoid content and include only counts/state.
- Fail open on endpoint mismatch.

App Review notes should include:

- What the extension does.
- Exact domains it runs on.
- Why it needs page access.
- That it stores settings locally only.
- How reviewer can test:
  1. Install app.
  2. Enable extension in Safari.
  3. Open ChatGPT.
  4. Open or create long conversation.
  5. Use toolbar popup to set retention.
  6. Reload to observe trimmed view.
- Unaffiliated disclaimer.

Readiness criteria:

- App Privacy answers match implementation.
- Review notes are short and reproducible.
- No hidden data flow contradicts the privacy policy.

Alternative result and response:

- If App Review asks for more app functionality beyond the extension, expand native app troubleshooting and FAQ instead of adding unrelated features.

### Milestone 10 — TestFlight and beta feedback

Expected outcome:

- Small group validates the pain point and catches Safari-specific issues.

Beta plan:

- 10–25 testers.
- Include Mac, iPhone, iPad.
- Include at least five people who use long ChatGPT threads daily.
- Provide a simple feedback form.

Feedback prompts:

- Which device and Safari version?
- How long was the ChatGPT thread?
- What symptoms improved?
- Did anything break?
- Did restore full thread work?
- Was the popup understandable?
- Were the permissions acceptable?
- Would you pay $4.99 for this?

Readiness criteria:

- No severe ChatGPT breakage in common flows.
- Users understand restore behavior.
- At least some testers report clear improvement.
- No privacy concern caused by wording or permissions.

Alternative result and response:

- If users do not perceive enough benefit, add better onboarding showing when the extension is active and create a performance comparison demo.
- If users distrust page access, improve the privacy screen and reduce permissions further if technically possible.

### Milestone 11 — App Store launch

Expected outcome:

- Paid app submitted with polished metadata.

App Store metadata draft:

Name: ThreadLight  
Subtitle: Keep long ChatGPT threads responsive  
Category: Safari Extensions / Productivity  
Price: start around USD $4.99  
Privacy: no data collected, assuming implementation remains local-only  
Disclaimer: Unofficial utility. Not affiliated with OpenAI.

Short description:

> ThreadLight helps Safari stay responsive during long ChatGPT web conversations by showing only the most recent turns in the current tab. Your full conversation remains on ChatGPT and can be restored by reloading.

Screenshot plan:

1. Native app setup screen.
2. Safari popup with retention slider.
3. Status pill on ChatGPT page.
4. Privacy/local-only screen.
5. Restore full thread explanation.

Support materials:

- Privacy policy page.
- Support email.
- FAQ.
- Known limitations page.

Readiness criteria:

- App Store screenshots match actual UI.
- Metadata does not overpromise.
- Review notes included.
- Bundle IDs, signing, and pricing complete.

Alternative result and response:

- If first submission is rejected, preserve the rejection text in `docs/review-history.md`, fix the specific issue, and resubmit with clearer notes.

### Milestone 12 — post-launch maintenance

Expected outcome:

- Fast response to ChatGPT UI/API changes.

Maintenance plan:

- Check ChatGPT compatibility weekly during first month.
- Keep a small suite of redacted endpoint-shape fixtures.
- Add a “compatibility status” page if support burden grows.
- Release small compatibility updates quickly.
- Maintain `docs/known-issues.md`.

Versioning:

- 1.0.0: paid MVP.
- 1.0.x: compatibility and bug fixes.
- 1.1.0: improved restore flow and more robust iOS support.
- 1.2.0: optional local diagnostics.
- 2.0.0: new commercial model only if there is strong demand.

## 10. Detailed code modules

### 10.1 `extension/src/shared/types.ts`

Define:

- `ThreadLightSettingsV1`
- `ThreadLightConfigForPage`
- `ThreadLightTrimStatus`
- `ConversationData`
- `ConversationNode`
- `TrimResult`
- runtime message types

Rules:

- Use `unknown` for unknown external data.
- Avoid `any` except inside tightly isolated adapter code, and prefer `unknown` plus type guards.
- Keep page-safe types separate from extension-only types.

### 10.2 `extension/src/shared/settings.ts`

Functions:

- `defaultSettings(): ThreadLightSettingsV1`
- `validateSettings(input: unknown): ThreadLightSettingsV1`
- `settingsToPageConfig(settings): ThreadLightConfigForPage`
- `clampKeepLastTurns(n): number`

Tests:

- clamps low and high values.
- ignores extra fields.
- preserves booleans only when actual boolean.
- migrates missing version.

### 10.3 `extension/src/shared/storage.ts`

Functions:

- `loadSettings()`
- `saveSettings(partial)`
- `listenForSettingsChanges(callback)`
- `syncPageConfigToLocalStorage(settings)`; this one may live in content layer if it touches page localStorage.

Storage keys:

- `threadlight_settings_v1`
- page localStorage key: `threadlight_config_v1`

Never store chat content.

### 10.4 `extension/src/shared/trimmer.ts`

Core pure function:

```ts
export function trimConversationData(
  data: ConversationData,
  keepLastVisibleTurns: number
): TrimResult;
```

Return shape:

```ts
interface TrimResult {
  kind: 'trimmed' | 'noop' | 'unrecognized';
  data?: ConversationData;
  stats: {
    totalVisibleTurns: number;
    keptVisibleTurns: number;
    removedVisibleTurns: number;
    totalNodesOnPath: number;
    keptNodes: number;
  };
  reason?: string;
}
```

Design choice:

Return a full modified `ConversationData` copy only when trimming happened. For no-op/unrecognized, return no data and let caller use original response.

### 10.5 `extension/src/shared/url-matcher.ts`

Functions:

- `parseRequestInfo(input, init): { url: URL; method: string } | null`
- `isChatGptConversationUrl(url): boolean`
- `isSupportedChatGptHost(hostname): boolean`

Tests for:

- `chatgpt.com`
- `chat.openai.com`
- wrong path
- extra path segment
- POST method
- relative URL
- Request object

### 10.6 `extension/src/page/page-proxy.ts`

Responsibilities:

- Page context only.
- Patch fetch.
- Read config.
- Rewrite responses.
- Dispatch status.
- Fail open.

Rules:

- Do not import extension storage modules.
- Do not use `browser` or `chrome`.
- Do not log chat content.
- Do not inspect prompt text.
- Do not mutate input JSON in place unless tests prove safe; prefer shallow copies of modified nodes.

### 10.7 `extension/src/content/page-inject.ts`

Responsibilities:

- document_start.
- Inject page-proxy as early as possible.
- Load settings and sync minimal page config.
- Dispatch first config event.

Rules:

- Keep this bundle tiny.
- Do not wait for DOMContentLoaded.
- No status UI here.

### 10.8 `extension/src/content/content.ts`

Responsibilities:

- document_idle.
- Manage status pill.
- Handle settings changes.
- Apply CSS modes.
- Detect SPA navigation.
- Receive popup commands.

Rules:

- Use debounced MutationObservers only.
- Avoid scanning all message text.
- No chat content logs.

### 10.9 `extension/src/background/background.ts`

Responsibilities:

- Initialize default settings on install.
- Respond to popup/content messages.
- Maybe handle active tab reload request.

Rules:

- Keep service worker minimal.
- No long-running timers.
- No chat content access.

### 10.10 `extension/popup/popup.ts`

Responsibilities:

- Render settings.
- Save settings.
- Send restore command.
- Show domain status if available.

Rules:

- No framework unless necessary.
- Use semantic HTML.
- Keyboard accessible.

## 11. Build and packaging details

### 11.1 esbuild

Build all TS entry points with:

- format: IIFE for content/page scripts unless ESM is confirmed working in Safari WebExtension context.
- target: `safari16` or conservative equivalent; verify actual compatibility.
- sourcemaps in dev only.
- minify in production.
- no remote imports.

Entry-specific notes:

- `page-proxy.ts` should be an IIFE because it is inserted into page context.
- `page-inject.ts` should be an IIFE content script.
- `popup.ts` can be IIFE referenced by popup.html.
- `background.ts` format depends on Safari MV3 service worker support; test ESM vs classic.

### 11.2 Manifest transform

The build script should:

1. Read `extension/manifest.safari.json`.
2. Fill version from package.json.
3. Copy to `extension/manifest.json`.
4. Validate host permissions are only ChatGPT domains.
5. Validate `web_accessible_resources` includes page proxy.
6. Fail build if forbidden permissions appear.

Forbidden permissions:

- `<all_urls>`
- `cookies`
- `history`
- `bookmarks`
- `webRequest` unless a future plan explicitly justifies it
- `webRequestBlocking`
- broad scripting permissions without host limitation

### 11.3 Safari packaging docs

Create `docs/safari-packaging.md` with:

- Prerequisites.
- Build command.
- Converter command.
- Xcode signing notes.
- Simulator/device testing steps.
- App Store Connect submission steps.
- How to update the extension resources after a TypeScript change.

## 12. Validation strategy

### 12.1 Automated tests

Run on every change:

```bash
npm run typecheck
npm run lint
npm run test
npm run build:safari
```

Minimum automated test focus:

- Trimmer correctness.
- Endpoint matching.
- Settings validation.
- Response rewriting.
- Event payload validation.

### 12.2 Manual Safari tests

Because Safari extension behavior can differ from Chrome/Firefox behavior, manual Safari testing is mandatory before any release.

Mac manual test checklist:

- Install development app.
- Enable extension in Safari.
- Grant site permission for ChatGPT domains.
- Open ChatGPT.
- Confirm popup sees active tab.
- Confirm settings persist.
- Confirm status pill optional.
- Create/open long test thread.
- Confirm recent turns remain usable.
- Submit new prompt after trim.
- Disable extension and reload; confirm full page.

Mobile manual test checklist:

- Install via Xcode/TestFlight.
- Enable extension in Settings > Safari > Extensions.
- Grant domain permission.
- Open ChatGPT in Safari.
- Confirm extension behavior.
- Test popup/menu availability.
- Test performance on real device, not only simulator.

### 12.3 Performance measurement

Collect only local manual measurements, not user telemetry.

Development metrics:

- Time to trim synthetic fixture.
- Number of visible turns before and after.
- DOM node count before and after, measured manually in Web Inspector.
- Safari memory footprint before and after, measured manually.
- Typing latency subjective score from beta testers.

Do not include user chat content in metrics.

## 13. Known technical risks

### Risk 1 — ChatGPT response shape changes

Expected issue:

- Mapping fields, endpoint paths, or roles change.

Response:

- Fail open.
- Add shape detection.
- Update fixture and trimmer.
- Release compatibility update.

### Risk 2 — Safari page-context injection timing is unreliable

Expected issue:

- ChatGPT fetch starts before page proxy is installed.

Response:

- Optimize `page-inject.ts` bundle size.
- Inject at document_start.
- Test main-world alternatives.
- Provide DOM/CSS fallback.

### Risk 3 — Continuing a trimmed conversation depends on missing ancestors

Expected issue:

- ChatGPT frontend may need old parent nodes for edit/branch flows.

Response:

- Test prompt submission after trim thoroughly.
- Preserve current_node and active suffix.
- Document restore before editing older turns.
- Consider retaining lightweight ancestor shells if necessary.

### Risk 4 — App Review rejects minimal container app

Expected issue:

- Native app seems too thin.

Response:

- Add meaningful setup, troubleshooting, privacy, FAQ, and support flows.
- Keep extension functionality central.

### Risk 5 — Users distrust chat page access

Expected issue:

- Any extension with ChatGPT page access looks sensitive.

Response:

- Domain-limited permissions.
- No telemetry.
- Open privacy policy.
- Explain exactly why page access is required.
- Consider publishing source for the extension core while selling the packaged app.

### Risk 6 — Existing competitor copies or undercuts

Expected issue:

- Chrome/Firefox competitors exist; Safari-specific product may be copied.

Response:

- Win on Safari polish, App Store presence, low permissions, privacy clarity, and fast compatibility updates.

## 14. Commercial plan

### 14.1 MVP business model

Use paid-upfront App Store sale. This avoids implementing and debugging StoreKit for V1.

Rationale:

- The utility solves a narrow pain.
- Purchase is easier to understand than subscription.
- The extension can run without native entitlement checks.
- Less moving code means fewer review and support issues.

### 14.2 Future IAP path

If a free trial is needed later:

- Native app implements StoreKit 2.
- Free mode: keep last 20 turns only, no ultra lean mode.
- Pro one-time purchase: keep 5–100 turns, status pill, ultra lean, restore suspend-once.
- Native app writes entitlement state to a shared app group or sends it to extension using Safari extension native messaging if appropriate.
- Extension reads entitlement state without any server.

Do not implement this until V1 has traction.

### 14.3 Support plan

Support channels:

- Support email.
- Simple FAQ page.
- Known issues page.

Common support answers:

- “Enable the extension in Safari settings.”
- “Grant access to chatgpt.com.”
- “Reload restores full thread.”
- “Disable ThreadLight before editing very old hidden turns.”
- “ThreadLight is local-only and does not send chat content anywhere.”

### 14.4 Launch copy guardrails

Use:

- “Helps keep Safari responsive.”
- “Shows only the most recent turns in the current tab.”
- “Reload to restore full thread.”
- “Local-only.”
- “Unofficial utility.”

Avoid:

- “Makes ChatGPT faster” without qualification.
- “Speeds up responses.”
- “Improves model context.”
- “Unlimited ChatGPT.”
- “Official ChatGPT extension.”
- “Works forever.”

## 15. App Store artifact drafts

### 15.1 App Store short description

ThreadLight helps Safari stay responsive during long ChatGPT web conversations by showing only the most recent turns in the current tab. Your full conversation remains on ChatGPT and can be restored by reloading.

### 15.2 App Store long description

ThreadLight is a small Safari extension for people who keep long ChatGPT conversations open.

Long web conversations can become heavy for Safari to render. ThreadLight reduces that load by showing only the most recent part of the current ChatGPT thread in the browser tab. The full conversation remains in ChatGPT and can be restored by reloading or disabling the extension.

Features:

- Choose how many recent turns to show.
- Restore the full thread with a reload.
- Optional status indicator.
- Optional ultra lean mode for very large threads.
- Runs only on ChatGPT web domains.
- Local settings only.
- No analytics, no tracking, no backend server.

ThreadLight is an unofficial utility and is not affiliated with OpenAI.

### 15.3 Privacy policy draft

ThreadLight does not collect personal data.

ThreadLight runs locally in Safari on ChatGPT web pages after you enable the Safari extension and grant site permission. The extension changes how much of a long ChatGPT conversation is rendered in the current browser tab.

ThreadLight stores only local settings such as whether the extension is enabled and how many recent turns to show. These settings remain on your device.

ThreadLight does not operate a backend server. ThreadLight does not send your chat content, prompts, responses, account information, browsing history, or usage data to the developer or any third party.

ThreadLight is not affiliated with OpenAI.

### 15.4 App Review notes draft

ThreadLight is a Safari Web Extension that helps reduce local rendering load in long ChatGPT web conversations. It runs only on `https://chatgpt.com/*` and `https://chat.openai.com/*`. It needs page access to modify the local rendered view of long conversations.

Testing steps:

1. Install the app.
2. Enable the Safari extension.
3. Grant permission for ChatGPT domains.
4. Open ChatGPT in Safari.
5. Open a long conversation or create repeated test messages.
6. Use the ThreadLight toolbar popup to set how many recent turns to show.
7. Reload to restore the full conversation view.

ThreadLight stores settings locally only. It has no backend server, no analytics, and no tracking. It is not affiliated with OpenAI.

## 16. First implementation sequence for Codex

Use `first-prompt.md` as the first Codex instruction. The first task should build the extension core and tests before touching Xcode.

Order:

1. Scaffold TypeScript/WebExtension repo.
2. Implement settings.
3. Implement trimmer and tests.
4. Implement URL matcher and response rewrite tests.
5. Implement page proxy.
6. Implement content injection.
7. Implement popup.
8. Add docs.
9. Run verification.
10. Then use Xcode converter manually or in a follow-up Codex task on a Mac.

Do not start with Xcode. Xcode projects create noise and make code review harder before the extension core is stable.

## 17. Definition of done for V1

V1 is complete when:

- User can install from App Store/TestFlight.
- User can enable extension in Safari.
- Extension runs only on ChatGPT domains.
- Long ChatGPT thread renders only recent N turns.
- User can continue chatting after trimming.
- User can restore full thread by disabling or suspend-reloading.
- Extension remains local-only.
- Privacy policy matches implementation.
- App Review notes are accurate.
- Manual Safari QA passes on macOS and at least one mobile Apple platform.
- `npm run verify` passes.
- No forbidden permissions appear in manifest.
- No real chat content is committed to tests or docs.

## 18. Follow-up prompts for Codex after first implementation

### Prompt A — review security and privacy

Ask Codex:

> Review the extension for privacy and security. Confirm that it makes no network calls, requests only ChatGPT host permissions, never stores chat content, and fails open on errors. Produce a findings list and patch any concrete issues.

### Prompt B — improve Safari packaging docs

Ask Codex:

> Update docs/safari-packaging.md based on the current Xcode converter output in this repo. Include exact commands, manual Xcode steps, and troubleshooting notes. Do not modify extension behavior.

### Prompt C — add synthetic performance fixture

Ask Codex:

> Add a synthetic 2,000-turn conversation fixture generator and performance test for trimConversationData. The fixture must not contain real chat text. Keep the test stable and avoid machine-specific hard failures; report timing and assert only a conservative upper bound.

### Prompt D — app review packet

Ask Codex:

> Create docs/app-review-packet.md with final App Store review notes, privacy answers, screenshot checklist, support URL checklist, and reviewer test credentials guidance. The product has no OpenAI login and no backend.

## 19. Open questions to resolve during build

1. Does Safari current release allow reliable document_start injection of a web-accessible page script on ChatGPT before first conversation fetch?
2. Does ChatGPT current web app continue normal prompt submission when old parent nodes are removed from the local mapping?
3. Does shared conversation loading use the same mapping shape?
4. Does iOS Safari extension popup support feel acceptable, or should the native app provide more controls?
5. Does App Review accept the product with paid-upfront pricing and a helper native container?
6. Is a DOM-only fallback necessary for iOS?
7. Should status pill default to off to reduce visual intrusion?
8. Is the retention default better at 10, 20, or 30 turns?
9. Can restore-full-thread suspend once reliably, or should V1 simply disable and reload?
10. Should the extension core be open source to increase trust while the App Store package remains paid?

## 20. Preferred answers until evidence says otherwise

1. Use fetch-proxy as primary, DOM/CSS as fallback.
2. Start paid-upfront, no StoreKit in V1.
3. Keep status pill off by default.
4. Default retention 20 visible turns.
5. Use exact ChatGPT host permissions only.
6. Publish a clear privacy policy.
7. Keep native app useful but simple.
8. Build and test extension core before Xcode work.
9. Fail open on all unknowns.
10. Do not copy competitor code directly.
