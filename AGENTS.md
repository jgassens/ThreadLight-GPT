# AGENTS.md — ThreadLight repository instructions

These instructions are for Codex or any coding agent working in this repository.

## Mission

Build **ThreadLight**, a paid Safari Web Extension that keeps long ChatGPT web conversations responsive in Safari by reducing how much of the conversation tree the ChatGPT frontend renders locally.

The extension must be privacy-preserving, local-only, low-permission, and honest about limitations. It is an unofficial utility and must not imply affiliation with OpenAI.

## Primary architecture

Use this architecture unless a tested Safari limitation forces a documented alternative:

1. A native SwiftUI Safari extension container app for App Store distribution.
2. A Manifest V3 Safari WebExtension.
3. A `document_start` content script that injects a page-context script.
4. A page-context fetch proxy that intercepts only ChatGPT conversation JSON GET responses.
5. A pure TypeScript trimmer that keeps only the last N visible role-transition turns in the active conversation path.
6. Popup and content scripts for local settings, status display, and restore behavior.

DOM cleanup and CSS containment are fallback/supplemental features. The paid product should primarily reduce data before ChatGPT renders it.

## Hard constraints

- Do not add analytics, telemetry, tracking, remote config, or backend calls.
- Do not send chat content, prompts, responses, account data, cookies, or browsing history anywhere.
- Do not store chat content in extension storage, localStorage, logs, fixtures, screenshots, or docs.
- Do not request broad permissions such as `<all_urls>`, cookies, history, bookmarks, or unrestricted scripting.
- Host permissions must be limited to:
  - `https://chatgpt.com/*`
  - `https://chat.openai.com/*`
- Do not use `eval`, `new Function`, or remote script loading.
- Do not automate ChatGPT usage, bypass limits, scrape data, or alter server-side behavior.
- Fail open: if ChatGPT response shape is unknown or any error occurs, return the original response and let ChatGPT work normally.
- Keep App Store and privacy claims aligned with implementation.
- Do not copy competitor source code verbatim. If any MIT-licensed code is intentionally incorporated, preserve license notices and document the dependency. Preferred approach: implement independently.

## Product language rules

Use precise claims:

- “Helps Safari stay responsive.”
- “Shows only the most recent turns in the current tab.”
- “Reloading restores the full conversation view.”
- “Local-only settings.”
- “Unofficial utility. Not affiliated with OpenAI.”

Avoid unsupported claims:

- “Makes ChatGPT faster.”
- “Speeds up model responses.”
- “Improves context.”
- “Unlimited ChatGPT.”
- “Official ChatGPT extension.”
- “Works forever.”

## Repo layout expectations

Expected structure:

```text
extension/
  manifest.safari.json
  popup/
  src/
    background/
    content/
    page/
    shared/
native/
  README.md
scripts/
tests/
  unit/
  fixtures/
  performance/
docs/
```

Keep generated files out of git unless there is a specific reason to commit them. `extension/dist/` should normally be generated.

## TypeScript standards

- Use strict TypeScript.
- Prefer `unknown` plus type guards for external data.
- Avoid `any`; if unavoidable, isolate it and explain why.
- Keep trimmer logic pure and browser-independent.
- Keep page-context code free of `browser` and `chrome` APIs.
- Keep content/background/popup browser API usage behind small helper modules where useful.
- Preserve unknown fields from ChatGPT response objects when shallow-copying nodes.
- Do not log message content.

## Core modules and responsibilities

`extension/src/shared/trimmer.ts`

- Pure functions only.
- Input: ChatGPT conversation-like JSON.
- Output: trimmed JSON or explicit no-op/unrecognized result.
- Count visible turns by role transitions, not raw nodes.
- Hidden roles: `system`, `tool`, `thinking`.
- Preserve root anchor when possible.
- Repair parent/children links.
- Protect against cycles.

`extension/src/page/page-proxy.ts`

- Runs in page context.
- Patches `window.fetch` once.
- Intercepts only GET conversation/shared_conversation JSON endpoints.
- Parses JSON from a cloned response.
- Uses the trimmer.
- Rewrites Response only when visible trimming occurs.
- Deletes stale `content-length` and `content-encoding` headers.
- Dispatches status without content.
- Returns original response on every error.

`extension/src/content/page-inject.ts`

- Runs at `document_start`.
- Injects `dist/page-proxy.js` into page context immediately.
- Syncs minimal settings to page localStorage and sends a config CustomEvent.
- Stays tiny.

`extension/src/content/content.ts`

- Runs at `document_idle`.
- Manages settings updates, status pill, ultra lean mode, SPA navigation detection, and restore behavior.
- Validates all page-originated payloads.
- Never transfers chat content into extension storage.

`extension/src/background/background.ts`

- Minimal settings/message broker.
- Initialize defaults on install.
- Avoid long-running background behavior.

`extension/popup/popup.ts`

- Plain, accessible settings UI.
- No framework unless justified.
- Keyboard and VoiceOver friendly.

## Testing expectations

Before marking work complete, run:

```bash
npm run typecheck
npm run lint
npm run test
npm run build:safari
```

If these scripts do not exist yet, create them.

Required test categories:

- settings validation
- URL matching
- trimmer correctness
- response rewriting
- event payload validation
- synthetic performance fixture

Never commit real ChatGPT conversations. Use synthetic fixtures only.

## Manual Safari testing expectations

Automated tests are not enough. Before release-related work is considered complete, document manual results for:

- macOS Safari
- iOS Safari or iPadOS Safari
- ChatGPT normal conversation
- ChatGPT shared conversation
- long text thread
- long thread with code blocks
- disable/reload behavior
- restore-full-thread behavior
- permission prompt behavior

## Build and packaging expectations

Keep the extension core stable before creating or heavily modifying Xcode project files.

Preferred flow:

1. `npm run verify`
2. `npm run build:safari`
3. Run Safari Web Extension converter or current Apple packager command.
4. Customize native app.
5. Build/sign/test in Xcode.

Document exact packaging commands in `docs/safari-packaging.md` after testing on a Mac with current Xcode.

## Privacy and security review checklist

For any PR or substantial change, verify:

- No network calls were added.
- Manifest permissions did not broaden.
- No chat content storage was added.
- No content appears in logs.
- No raw external response shape assumptions can crash the page.
- Unknown ChatGPT data shape leads to pass-through behavior.
- Popup and status pill cannot inject HTML from page data.
- App Store privacy text still matches code.

## Implementation behavior when uncertain

When uncertain about ChatGPT internals or Safari behavior:

1. Prefer the safest behavior for the user.
2. Preserve normal ChatGPT functionality over aggressive optimization.
3. Add a test fixture for the discovered shape.
4. Document the limitation.
5. Do not make broad claims.

## Done criteria for a coding task

A task is done when:

- Code is implemented.
- Relevant tests are added or updated.
- Build/lint/typecheck/tests pass, or the failure is documented with the exact blocker.
- Privacy constraints remain intact.
- No real chat content is committed.
- Documentation is updated when behavior changes.

## First task

Use `first-prompt.md` for the first implementation run.
