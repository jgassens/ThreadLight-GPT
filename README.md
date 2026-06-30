# ThreadLight

ThreadLight is an unofficial, local-only Safari WebExtension project for keeping very long ChatGPT web conversations usable in Safari. The extension core trims recognized ChatGPT conversation JSON responses before the page renders them, so the current tab shows only the most recent visible turns while the full conversation remains on ChatGPT's servers.

ThreadLight does not use analytics, telemetry, remote config, backend services, or chat-content storage. Reloading can restore the full conversation view, and the extension is scoped to `https://chatgpt.com/*` and `https://chat.openai.com/*`.

Unofficial utility. Not affiliated with OpenAI.

## Current Milestone

This repository currently contains the WebExtension core only:

- strict TypeScript source
- esbuild Safari extension bundling
- Vitest unit tests for settings, URL matching, trimming, and response rewriting
- privacy and packaging documentation scaffolds

Xcode and native SwiftUI container work are intentionally deferred until the extension core stabilizes.

## Development

```bash
npm install
npm run verify
```

Useful scripts:

```bash
npm run clean
npm run typecheck
npm run lint
npm run test
npm run build:safari
npm run package:safari:zip
npm run verify
```

`npm run build:safari` writes bundled scripts to `extension/dist/` and copies `extension/manifest.safari.json` to `extension/manifest.json`.
`npm run package:safari:zip` writes a loadable extension ZIP to `packages/threadlight-extension.zip`.

## Privacy Promise

- No chat content leaves the browser because of ThreadLight.
- No chat content is stored in extension storage, localStorage, logs, fixtures, screenshots, or docs.
- Settings are local-only.
- Unknown ChatGPT response shapes pass through unchanged.
- Host permissions are limited to ChatGPT domains.

## Next Recommended Task

Load the generated WebExtension in Safari's extension tooling, verify document-start page injection on current Safari, and document the exact converter or packaging command in `docs/safari-packaging.md` after testing with current Xcode.
