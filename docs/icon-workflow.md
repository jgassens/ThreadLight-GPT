# ThreadLight Icon Workflow

ThreadLight keeps two icon paths:

- The checked-in native asset catalog uses ordinary PNGs so Xcode builds remain predictable.
- `assets/threadlight-icon-source.png` is the focal ThreadLight chat-bubble/knot mark used to generate the light, dark, and tinted app-icon appearances.
- `assets/icon-composer/` stores generated preview output for a future Icon Composer / Liquid Glass handoff.

## Generate Native App Icons

Run this after changing `assets/threadlight-icon-source.png` or `scripts/generate-native-app-icons.mjs`:

```bash
npm run generate:app-icons
```

The script renders:

- `universal-icon-1024@1x.png` for the default light iOS app icon, using the chat-bubble/knot mark on a light background.
- `universal-icon-dark-1024@1x.png` for the iOS dark appearance, using the source artwork directly.
- `universal-icon-tinted-1024@1x.png` for the iOS tinted appearance, using a grayscale adaptation of the same mark.
- `icon-256.png` and `icon-256-dark.png` for the in-app large icon.
- `threadlight-app-icon-clear-preview.png` as a transparent preview for a future clear Liquid Glass variant.

The macOS launcher icon stays on the stable `.icns` asset-catalog fallback until a real Icon Composer `.icon` document is created and verified in a signed build. Adding `appearances` entries to the old macOS `AppIcon.appiconset` was tested with Xcode 26.6 and did not change the compiled `AppIcon.icns`.

## Icon Composer Handoff

Xcode 26 includes:

```text
/Applications/Xcode.app/Contents/Applications/Icon Composer.app
/Applications/Xcode.app/Contents/Applications/Icon Composer.app/Contents/Executables/ictool
```

`ictool` exports from an existing `.icon` document; it does not create that document from scratch. Once a `.icon` file exists, export previews with commands like:

```bash
"/Applications/Xcode.app/Contents/Applications/Icon Composer.app/Contents/Executables/ictool" \
  path/to/ThreadLight.icon \
  --export-image \
  --output-file /tmp/threadlight-default.png \
  --platform macOS \
  --rendition Default \
  --width 1024 \
  --height 1024 \
  --scale 1
```

For a tinted preview:

```bash
"/Applications/Xcode.app/Contents/Applications/Icon Composer.app/Contents/Executables/ictool" \
  path/to/ThreadLight.icon \
  --export-image \
  --output-file /tmp/threadlight-tinted-dark.png \
  --platform iOS \
  --rendition TintedDark \
  --width 1024 \
  --height 1024 \
  --scale 1 \
  --tint-color 0.58 \
  --tint-strength 0.75
```

Before replacing the macOS launcher icon with an Icon Composer output, verify the built app in light, dark, tinted, and clear looks and confirm signing/notarization still passes.
