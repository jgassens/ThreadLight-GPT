# Safari Packaging Notes

Local tool check on this Mac:

- Xcode: `Xcode 26.6`, build `17F113`
- `xcrun safari-web-extension-converter --help` prints the current `safari-web-extension-packager` usage text.

## Build The Extension

```bash
npm run verify
npm run package:safari:zip
```

Outputs:

- `extension/dist/background.js`
- `extension/dist/page-inject.js`
- `extension/dist/content.js`
- `extension/dist/page-proxy.js`
- `extension/dist/popup.js`
- `extension/manifest.json`
- `packages/threadlight-extension.zip`

Production builds are minified and do not include source maps. Use `npm run build:dev` for local sourcemaps.

## Generate The Native Project

Preferred local command, based on the installed converter help:

```bash
xcrun safari-web-extension-converter ./extension \
  --project-location ./native \
  --app-name ThreadLight \
  --bundle-identifier com.jeremiahgassensmith.threadlight \
  --swift \
  --copy-resources \
  --no-open \
  --no-prompt
```

The converter describes itself as packaging a Web Extension into an app that can be built and run in Safari and distributed through the App Store. It generates an Xcode project based on `manifest.json`.

Useful converter flags from local help:

- `--project-location`
- `--rebuild-project`
- `--app-name`
- `--bundle-identifier`
- `--swift`
- `--objc`
- `--ios-only`
- `--macos-only`
- `--copy-resources`
- `--no-open`
- `--no-prompt`
- `--force`

## Signing And Notary Notes

Signing and notarization material is stored outside this repo at:

```text
/Users/jeremiahgassensmith/Documents/programming/.notary
```

Use those instructions only for signing/notary work. Do not copy private keys or credentials into this repository.

## Local Native Build

Use:

```bash
./script/build_and_run.sh --verify
```

This builds the macOS scheme to:

```text
/private/tmp/threadlight-derived/Build/Products/Debug/ThreadLight.app
```

The build products intentionally live in `/private/tmp` because this repository path receives File Provider extended attributes under `Documents/`, and those attributes can make codesign fail with:

```text
resource fork, Finder information, or similar detritus not allowed
```

Current local result:

- `ThreadLight (macOS)` builds and launches locally.
- The release app builds with `Developer ID Application: JEREMIAH JOSEPH GASSENSMITH (C2N7W5247T)`.
- `codesign --verify --deep --strict --verbose=4` passes for the release app when run with keychain access.
- `spctl --assess --type execute --verbose=4` rejects the release app only because it is still unnotarized.
- Attempting to create the `threadlight-notary` notarytool keychain profile currently fails with Apple's `A required agreement is missing or has expired` response. The account owner needs to accept the pending Apple Developer/App Store Connect agreement before notarization can be submitted.

Xcode also reports a CoreSimulator version mismatch. That does not block the macOS build, but iOS Simulator testing should wait until the local CoreSimulator/Xcode install is repaired.

## Manual Safari Test Steps

1. Build the extension resources with `npm run verify`.
2. Generate or rebuild the native project.
3. Run the app target from Xcode.
4. Enable ThreadLight in Safari settings.
5. Grant access to `chatgpt.com` and `chat.openai.com`.
6. Open ChatGPT and a long synthetic or throwaway thread.
7. Confirm the page proxy reports status without message content.
8. Confirm the popup can update retention settings.
9. Confirm the restore button reloads once with trimming suspended.
10. Disable ThreadLight and reload to confirm normal ChatGPT behavior.

## Updating Extension Resources

After TypeScript changes:

```bash
npm run verify
```

If the native project was generated with `--copy-resources`, rerun the converter with `--rebuild-project` or copy updated extension resources into the generated project according to Xcode's file layout.
