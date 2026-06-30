# Release Checklist

## Code Gate

- `npm run verify` passes.
- `npm run package:safari:zip` passes.
- Manifest permissions are limited to `storage` and ChatGPT host permissions.
- No forbidden permissions appear in `extension/manifest.json`.
- No real chat content is committed.
- No analytics, telemetry, tracking, remote config, or backend calls are present.

## Native Project Gate

- Safari native project generated from current `extension/manifest.json`.
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

## Signing And Notary

Use the private signing/notary instructions at:

```text
/Users/jeremiahgassensmith/Documents/programming/.notary
```

Do not commit credentials, key IDs, private keys, or exported signing material.

Current local status:

- Developer ID Application signing is available for team `C2N7W5247T`.
- The Release macOS app verifies with `codesign --verify --deep --strict --verbose=4` when keychain access is available.
- `spctl` rejects the app as `Unnotarized Developer ID`.
- `xcrun notarytool store-credentials threadlight-notary ...` is blocked by Apple's `A required agreement is missing or has expired` response.
