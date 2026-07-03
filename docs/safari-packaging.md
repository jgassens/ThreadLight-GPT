# Safari Packaging Notes

Local tool check on this Mac:

- Xcode: `Xcode 26.6`, build `17F113`
- Safari: `26.5`, build `21624.2.5.11.4`
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

`npm run package:safari:zip` stages only runtime files and then runs the equivalent of:

```bash
cd packages
zip -X -r threadlight-extension.zip threadlight-extension
```

The 2026-07-03 package check was:

```bash
unzip -l packages/threadlight-extension.zip
unzip -l packages/threadlight-extension.zip | rg "(__MACOSX|\\.ts$|README|DS_Store)"
```

The second command must return no matches.

## Generate The Native Project

Preferred local command, tested with Xcode 26.6:

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

The same command was smoke-tested without touching the checked-in native project by changing only the output path and forcing the throwaway destination:

```bash
xcrun safari-web-extension-converter ./extension \
  --project-location /private/tmp/threadlight-converter-check-20260630-1606 \
  --app-name ThreadLight \
  --bundle-identifier com.jeremiahgassensmith.threadlight \
  --swift \
  --copy-resources \
  --no-open \
  --no-prompt \
  --force
```

Current converter output:

- Generated a Swift Xcode project successfully.
- Reported `Platform: All`.
- Warned that manifest key `world` is not supported by the current Safari. ThreadLight still uses the `document_start` `page-inject.js` script-tag path to put `page-proxy.js` into the page world.

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

- 2026-07-03: `ThreadLight (macOS)` archives with Xcode 26.6 as version `0.1.10`, build `10`, universal `x86_64 arm64`.
- 2026-07-03: the archive path was `/private/tmp/ThreadLight-0.1.10-10-codex.xcarchive`.
- 2026-07-03: Developer ID export succeeded at `/private/tmp/threadlight-developer-id-export-codex/ThreadLight.app`.
- 2026-07-03: `codesign --verify --deep --strict --verbose=4 /private/tmp/threadlight-developer-id-export-codex/ThreadLight.app` passes when run with keychain access.
- 2026-07-03: `/private/tmp/ThreadLight-0.1.10-codex.dmg` was accepted by Apple notarization, stapled, validated, accepted by Gatekeeper as `Notarized Developer ID`, and verified by `hdiutil verify`.
- 2026-07-03: App Store Connect export is blocked locally by missing Xcode/App Store account state, a missing `Mac Installer Distribution` signing certificate, and missing profiles for `com.jeremiahgassensmith.threadlight`.

Xcode also reports a CoreSimulator version mismatch. That does not block the macOS build, but iOS Simulator testing should wait until the local CoreSimulator/Xcode install is repaired.

## Release Archive And Notarized DMG Commands

The current macOS archive command tested with Xcode 26.6 was:

```bash
xcodebuild \
  -project native/ThreadLight/ThreadLight.xcodeproj \
  -scheme "ThreadLight (macOS)" \
  -configuration Release \
  -destination 'generic/platform=macOS' \
  -archivePath /private/tmp/ThreadLight-0.1.10-10-codex.xcarchive \
  -derivedDataPath /private/tmp/threadlight-archive-derived-codex \
  archive
```

The App Store Connect export command tested was:

```bash
xcodebuild \
  -exportArchive \
  -archivePath /private/tmp/ThreadLight-0.1.10-10-codex.xcarchive \
  -exportPath /private/tmp/threadlight-appstore-export-codex \
  -exportOptionsPlist /private/tmp/threadlight-export-options-app-store.plist \
  -allowProvisioningUpdates
```

The export options used `method=app-store-connect`, `destination=export`, `signingStyle=automatic`, and team `C2N7W5247T`. The local result was `** EXPORT FAILED **` with `No Accounts`, no `Mac Installer Distribution` signing certificate, and no profiles for `com.jeremiahgassensmith.threadlight`.

The Developer ID export command tested was:

```bash
xcodebuild \
  -exportArchive \
  -archivePath /private/tmp/ThreadLight-0.1.10-10-codex.xcarchive \
  -exportPath /private/tmp/threadlight-developer-id-export-codex \
  -exportOptionsPlist /private/tmp/threadlight-export-options-developer-id.plist \
  -allowProvisioningUpdates
```

The export options used `method=developer-id`, `destination=export`, `signingStyle=automatic`, and team `C2N7W5247T`.

The notarized DMG was created and validated with:

```bash
hdiutil create \
  -volname ThreadLight \
  -srcfolder /private/tmp/threadlight-dmg-root.gIGz66 \
  -format UDZO \
  -ov \
  /private/tmp/ThreadLight-0.1.10-codex.dmg

codesign \
  --force \
  --sign "Developer ID Application: JEREMIAH JOSEPH GASSENSMITH (C2N7W5247T)" \
  /private/tmp/ThreadLight-0.1.10-codex.dmg

xcrun notarytool submit \
  /private/tmp/ThreadLight-0.1.10-codex.dmg \
  --keychain-profile threadlight-notary \
  --wait

xcrun stapler staple /private/tmp/ThreadLight-0.1.10-codex.dmg
xcrun stapler validate /private/tmp/ThreadLight-0.1.10-codex.dmg
spctl -a -t open --context context:primary-signature -vv /private/tmp/ThreadLight-0.1.10-codex.dmg
hdiutil verify /private/tmp/ThreadLight-0.1.10-codex.dmg
shasum -a 256 /private/tmp/ThreadLight-0.1.10-codex.dmg
```

Notary submission `e992840e-5d46-4baa-8938-085058fe63c6` returned `Accepted`. The stapled DMG hash was:

```text
b347dccfe3992cdf61f99fb762f6dfa12dea391f4d1ac2187a26c7f909811547  /private/tmp/ThreadLight-0.1.10-codex.dmg
```

## Safari Document-Start Verification

Verified on Safari `26.5` after running:

```bash
npm run build:safari
./script/build_and_run.sh --verify
```

Generated resource parity was checked with `cmp` for:

- `extension/dist/background.js`
- `extension/dist/content.js`
- `extension/dist/page-inject.js`
- `extension/dist/page-proxy.js`
- `extension/dist/popup.js`
- `extension/manifest.json`

Safari loaded the generated extension through the native app container. A live `https://chatgpt.com/` tab reported:

```json
{
  "url": "https://chatgpt.com/",
  "readyState": "complete",
  "pageInjectMarker": "true",
  "fetchPatched": true,
  "historyPatched": true,
  "scriptMarkerCount": 0
}
```

The `pageInjectMarker` comes from `extension/src/content/page-inject.ts`, which is declared in the generated manifest with `run_at: "document_start"`. `fetchPatched` and `historyPatched` come from the page-world proxy. `scriptMarkerCount` is expected to be `0` because `page-inject.ts` removes its temporary `script[data-threadlight="page-proxy"]` element immediately after insertion.

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
