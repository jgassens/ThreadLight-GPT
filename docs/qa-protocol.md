# QA Protocol

Never commit real ChatGPT conversation content. Use synthetic fixtures or manually created throwaway chats.

## Automated Gate

Run before every release candidate:

```bash
npm run verify
npm run package:safari:zip
```

Current automated coverage includes:

- settings validation
- URL matching
- event payload validation
- diagnostics validation and formatting
- diagnostics buffer behavior
- trimmer correctness
- response rewriting
- synthetic 2,000-turn trimmer benchmark

## Manual Safari Matrix

Test on macOS Safari and at least one iOS or iPadOS Safari target before release.

Scenarios:

1. New empty chat.
2. Short chat under the retention limit.
3. Long text-only chat with 100+ visible turns.
4. Long chat with code blocks.
5. Long chat with Markdown tables.
6. Long chat with math.
7. Long chat with citations.
8. Long chat with file cards or artifacts if available.
9. Long chat with images if available.
10. Shared conversation page.
11. Edit old message after trim.
12. Retry assistant response after trim.
13. Branch from a recent message.
14. Branch from an old hidden message after restore.
15. Reload with extension enabled.
16. Reload with extension disabled.
17. Restore full thread action.
18. Unknown ChatGPT UI or response shape.
19. Slow or offline network.
20. Private browsing and Safari profile permission differences.
21. Diagnostics mode enabled in a long throwaway thread.
22. Diagnostics mode disabled.

Expected outcomes:

- Recent turns render and new prompts remain usable.
- Old hidden turns are not visible until restore.
- Unknown response shapes pass through without breaking ChatGPT.
- The popup can update settings.
- The status pill, when enabled, shows only counts and state.
- Diagnostics mode shows only sanitized timing, state, endpoint-kind, and count metadata.
- Diagnostics mode captures replayed page-proxy startup events, main-thread stall samples, and periodic DOM count samples without chat content.
- Diagnostics copy/export contains no raw URLs, conversation IDs, headers, cookies, prompts, responses, or message text.
- No extension-originated network requests occur.

## Diagnostics + Safari Web Inspector

For hang/stall investigations:

1. In Safari, enable Settings > Advanced > Show features for web developers.
2. Open Web Inspector from the Develop menu.
3. In Console, filter for `ThreadLight`.
4. In Network, filter for `backend-api`, enable Preserve Log, and optionally Ignore Cache while debugging.
5. In Timelines, start recording before reload and correlate ThreadLight `console.timeStamp` markers plus `performance.measure` spans with Network Requests, JavaScript & Events, Layout & Rendering, CPU, and Memory.
6. Avoid Automatically Pause Connecting to JSContexts unless intentionally stepping through startup, because it pauses JavaScript execution and can create artificial stall behavior.
7. In the popup, use Copy full report to capture extension/page versions, settings, diagnostics state, summary, and JSONL in one paste.
8. If Diagnostics mode was disabled during a hang, check Console for a content-free 30s `conversation request still pending` warning.

Known V1 limitations to verify and document:

- Users may need to restore the full thread before editing older hidden messages.
- Branch history is limited to the active path.
- iOS Safari may require a DOM/CSS fallback if page-context injection loses the fetch race.
