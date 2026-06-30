# ThreadLight Native Project

Generated with Xcode 26.6 using:

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

The generated native app has been customized with ThreadLight setup, privacy, restore, and domain-access copy.

## Local Build

Use the project script:

```bash
./script/build_and_run.sh --verify
```

The script builds to `/private/tmp/threadlight-derived` instead of `native/DerivedData` because this Documents folder receives File Provider extended attributes that break codesign when products are created inside the repo.

Verified locally:

- macOS scheme: `ThreadLight (macOS)`
- app bundle: `/private/tmp/threadlight-derived/Build/Products/Debug/ThreadLight.app`
- local build/launch script: passes

Known local warning:

- Xcode reports CoreSimulator is out of date. This does not block the macOS build, but it blocks reliable iOS Simulator work until macOS/Xcode simulator components are aligned.

## Release Signing

The project is configured with development team `C2N7W5247T`.

The Release app has been built with:

```text
Developer ID Application: JEREMIAH JOSEPH GASSENSMITH (C2N7W5247T)
```

Strict verification passes when run with keychain access:

```bash
codesign --verify --deep --strict --verbose=4 /private/tmp/threadlight-release-distribution-entitlements/Build/Products/Release/ThreadLight.app
```

Gatekeeper assessment currently rejects it as `Unnotarized Developer ID`. Notarization cannot be completed until Apple accepts the account's pending Developer/App Store Connect agreement. Keep the private notary material out of this repo.
