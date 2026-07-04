# Release Checklist

## Code Gate

- `npm run verify` passes.
- `npm run sync:native` passes after any extension source changes.
- A second `npm run verify` passes after `npm run sync:native`, proving the native Xcode resource copy is not stale.
- `npm run package:safari:zip` passes.
- Manifest permissions are limited to `storage` and ChatGPT host permissions.
- No forbidden permissions appear in `extension/manifest.json`.
- No real chat content is committed.
- No analytics, telemetry, tracking, remote config, or backend calls are present.

## Native Project Gate

- Safari native project generated from current `extension/manifest.json`.
- Native Safari extension resources match the current `extension/dist`, popup, manifests, and icon files.
- Bundle identifiers configured.
- Signing team configured.
- Native app copy is branded and honest.
- Native app explains how to enable the Safari extension.
- Native app includes privacy summary and support link.

## Manual QA Gate

- macOS Safari tested.
- iOS or iPadOS Safari tested.
- Normal ChatGPT conversation tested.
- Shared conversation tested.
- Long text thread tested.
- Long code-block thread tested.
- Restore full thread tested.
- Disable and reload tested.
- Permission prompt tested.

## App Store Gate

- Privacy policy URL is live.
- Support URL/email is live.
- App Store screenshots match actual UI.
- App Review packet is current.
- Pricing selected.
- Paid Apps Agreement complete.
- TestFlight smoke test complete.
- App Store Connect export/upload succeeds with distribution signing and provisioning.

## Signing And Notary

Use the private signing/notary instructions at:

```text
/Users/jeremiahgassensmith/Documents/programming/.notary
```

Do not commit credentials, key IDs, private keys, or exported signing material.

Current local status:

- 2026-07-03: `npm run verify` passes.
- 2026-07-03: `npm run package:safari:zip` passes and produces a runtime-only zip with no `__MACOSX`, `.ts`, README, or `.DS_Store` entries.
- 2026-07-03: Xcode 26.6 archives `ThreadLight (macOS)` as version `0.1.10`, build `10`, universal `x86_64 arm64`.
- 2026-07-03: Developer ID export succeeds at `/private/tmp/threadlight-developer-id-export-codex/ThreadLight.app`.
- 2026-07-03: `codesign --verify --deep --strict --verbose=4 /private/tmp/threadlight-developer-id-export-codex/ThreadLight.app` passes when run with keychain access.
- 2026-07-03: `/private/tmp/ThreadLight-0.1.10-codex.dmg` is signed, notarized, stapled, Gatekeeper-accepted as `Notarized Developer ID`, and `hdiutil verify` passes.
- 2026-07-03: App Store Connect export is not ready locally. `xcodebuild -exportArchive` with `method=app-store-connect` fails with `No Accounts`, no `Mac Installer Distribution` signing certificate, and no profiles for `com.jeremiahgassensmith.threadlight`.
- 2026-07-03: Xcode reports CoreSimulator `1051.54.0` is older than expected build `1051.55.0`; macOS archive/export is unaffected, but iOS/iPadOS simulator QA should wait until the local Xcode/CoreSimulator install is repaired.
- 2026-07-03: `npm run sync:native` was added and used to sync native WebExtension resources from the current extension build.
- 2026-07-03: A fresh synced macOS archive succeeded at `/private/tmp/ThreadLight-0.1.10-10-codex-sync.xcarchive`.
- 2026-07-03: App Store Connect export from the fresh synced archive still fails with `No Accounts`, no `Mac Installer Distribution` signing certificate, and no profiles for `com.jeremiahgassensmith.threadlight`.
