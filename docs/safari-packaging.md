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
  --project-location dev/builds/converter-check \
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
dev/builds/debug-derived/Build/Products/Debug/ThreadLight.app
```

Local build products should live under the repo-local, gitignored `dev/builds/` directory. Before building or signing, clear File Provider extended attributes from the source and build roots because those attributes can make codesign fail with:

```text
resource fork, Finder information, or similar detritus not allowed
```

The debug launcher does this automatically with `xattr -cr` before invoking Xcode.

Current local result:

- 2026-07-05: `ThreadLight (macOS)` archives with Xcode 26.6 as version `0.1.16`, build `16`, universal `x86_64 arm64`.
- 2026-07-05: the archive path was `/private/tmp/threadlight-release-0.1.16-16-20260705T181005Z/ThreadLight.xcarchive`.
- 2026-07-05: Developer ID export succeeded at `/private/tmp/threadlight-release-0.1.16-16-20260705T181005Z/export/ThreadLight.app`.
- 2026-07-05: `codesign --verify --deep --strict --verbose=4 /private/tmp/threadlight-release-0.1.16-16-20260705T181005Z/export/ThreadLight.app` passes when run with keychain access.
- 2026-07-05: `dev/builds/release/0.1.16-16-20260705T181005Z/ThreadLight-0.1.16-16-notarized.dmg` was accepted by Apple notarization, stapled, validated, accepted by Gatekeeper as `Notarized Developer ID`, and verified by `hdiutil verify`.
- 2026-07-05: Notary submission `964bbf77-c295-4b4c-91bd-6fb05effe204` returned `Accepted`; the stapled DMG SHA-256 is `afd729db94167819470f74acf1c58f655354eb15099a3fe3570fd931f33a19bc`.
- 2026-07-05: Safari briefly showed ThreadLight with a blank document icon because PlugInKit was registered to a deleted temporary archive path. The verified export was installed to `/Applications/ThreadLight.app`, its `.appex` was registered, and `npm run check:safari-registration -- --expected-app /Applications/ThreadLight.app` confirmed the live extension bundle contains the manifest icon resources.
- 2026-07-03: `ThreadLight (macOS)` archives with Xcode 26.6 as version `0.1.10`, build `10`, universal `x86_64 arm64`.
- 2026-07-03: the archive path was `/private/tmp/ThreadLight-0.1.10-10-codex.xcarchive`.
- 2026-07-03: Developer ID export succeeded at `/private/tmp/threadlight-developer-id-export-codex/ThreadLight.app`.
- 2026-07-03: `codesign --verify --deep --strict --verbose=4 /private/tmp/threadlight-developer-id-export-codex/ThreadLight.app` passes when run with keychain access.
- 2026-07-03: `/private/tmp/ThreadLight-0.1.10-codex.dmg` was accepted by Apple notarization, stapled, validated, accepted by Gatekeeper as `Notarized Developer ID`, and verified by `hdiutil verify`.
- 2026-07-03: App Store Connect export is blocked locally by missing Xcode/App Store account state, a missing `Mac Installer Distribution` signing certificate, and missing profiles for `com.jeremiahgassensmith.threadlight`.
- 2026-07-03: After adding `npm run sync:native`, native WebExtension resources were synced from the current extension build and verified with `cmp` for generated `dist` files, `manifest.json`, and `popup.html`.
- 2026-07-03: A fresh synced macOS archive succeeded at `/private/tmp/ThreadLight-0.1.10-10-codex-sync.xcarchive`.
- 2026-07-03: App Store Connect export from the fresh synced archive still fails locally with `No Accounts`, no `Mac Installer Distribution` signing certificate, and no profiles for `com.jeremiahgassensmith.threadlight`.

Xcode also reports a CoreSimulator version mismatch. That does not block the macOS build, but iOS Simulator testing should wait until the local CoreSimulator/Xcode install is repaired.

## Safari Extension Registration Check

After installing the signed app, check the exact Safari extension bundle macOS registered:

```bash
npm run check:safari-registration -- --expected-app /Applications/ThreadLight.app
```

The command should report a stable path under:

```text
/Applications/ThreadLight.app/Contents/PlugIns/ThreadLight Extension.appex
```

If it reports a `/private/tmp/.../InstallationBuildProductsLocation/...` path, Safari is looking at an archive intermediate rather than the installed app. Install the verified export or DMG copy into `/Applications`, then register the extension bundle:

```bash
pluginkit -a "/Applications/ThreadLight.app/Contents/PlugIns/ThreadLight Extension.appex"
npm run check:safari-registration -- --expected-app /Applications/ThreadLight.app
```

## Release Archive And Notarized DMG Commands

The current macOS archive command tested with Xcode 26.6 was:

```bash
xcodebuild \
  -project native/ThreadLight/ThreadLight.xcodeproj \
  -scheme "ThreadLight (macOS)" \
  -configuration Release \
  -destination 'generic/platform=macOS' \
  -archivePath dev/builds/release/a6d6d85/ThreadLight-0.1.10-10-a6d6d85.xcarchive \
  -derivedDataPath dev/builds/release/a6d6d85/archive-derived \
  archive
```

The App Store Connect export command tested was:

```bash
xcodebuild \
  -exportArchive \
  -archivePath dev/builds/release/a6d6d85/ThreadLight-0.1.10-10-a6d6d85.xcarchive \
  -exportPath dev/builds/release/a6d6d85/appstore-export \
  -exportOptionsPlist native/export-options/app-store-connect.plist \
  -allowProvisioningUpdates
```

The export options used `method=app-store-connect`, `destination=export`, `signingStyle=automatic`, and team `C2N7W5247T`. The local result was `** EXPORT FAILED **` with `No Accounts`, no `Mac Installer Distribution` signing certificate, and no profiles for `com.jeremiahgassensmith.threadlight`.

The same failure repeated on the fresh synced archive:

```bash
xcodebuild \
  -exportArchive \
  -archivePath dev/builds/release/a6d6d85/ThreadLight-0.1.10-10-a6d6d85.xcarchive \
  -exportPath dev/builds/release/a6d6d85/appstore-export \
  -exportOptionsPlist native/export-options/app-store-connect.plist \
  -allowProvisioningUpdates
```

Current failure:

```text
error: exportArchive No Accounts
error: exportArchive No signing certificate "Mac Installer Distribution" found
error: exportArchive No profiles for 'com.jeremiahgassensmith.threadlight' were found
** EXPORT FAILED **
```

The Developer ID export command tested was:

```bash
xcodebuild \
  -exportArchive \
  -archivePath dev/builds/release/a6d6d85/ThreadLight-0.1.10-10-a6d6d85.xcarchive \
  -exportPath dev/builds/release/a6d6d85/developer-id-export \
  -exportOptionsPlist native/export-options/developer-id.plist \
  -allowProvisioningUpdates
```

The export options used `method=developer-id`, `destination=export`, `signingStyle=automatic`, and team `C2N7W5247T`.

The notarized DMG was created and validated with:

```bash
hdiutil create \
  -volname ThreadLight \
  -srcfolder dev/builds/release/a6d6d85/dmg-root \
  -format UDZO \
  -ov \
  dev/builds/release/a6d6d85/ThreadLight-0.1.10-10-a6d6d85-notarized.dmg

codesign \
  --force \
  --sign "Developer ID Application: JEREMIAH JOSEPH GASSENSMITH (C2N7W5247T)" \
  dev/builds/release/a6d6d85/ThreadLight-0.1.10-10-a6d6d85-notarized.dmg

xcrun notarytool submit \
  dev/builds/release/a6d6d85/ThreadLight-0.1.10-10-a6d6d85-notarized.dmg \
  --keychain-profile threadlight-notary \
  --wait

xcrun stapler staple dev/builds/release/a6d6d85/ThreadLight-0.1.10-10-a6d6d85-notarized.dmg
xcrun stapler validate dev/builds/release/a6d6d85/ThreadLight-0.1.10-10-a6d6d85-notarized.dmg
spctl -a -t open --context context:primary-signature -vv dev/builds/release/a6d6d85/ThreadLight-0.1.10-10-a6d6d85-notarized.dmg
hdiutil verify dev/builds/release/a6d6d85/ThreadLight-0.1.10-10-a6d6d85-notarized.dmg
shasum -a 256 dev/builds/release/a6d6d85/ThreadLight-0.1.10-10-a6d6d85-notarized.dmg
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
npm run sync:native
npm run verify
```

`npm run sync:native` rebuilds the WebExtension, then refreshes the checked-in Xcode resources at:

```text
native/ThreadLight/Shared (Extension)/Resources
```

The sync copies the current `dist`, `popup`, `src`, generated manifests, and the manifest-referenced icon PNGs. It intentionally avoids stray duplicate icon files such as `icon-128 2.png`.

Before archiving for App Store Connect, confirm native resources match the extension build:

```bash
npm run verify
```

The final verify rebuilds `extension/dist` and then runs `npm run check:native`, which fails if the generated Xcode resource copy is stale.
