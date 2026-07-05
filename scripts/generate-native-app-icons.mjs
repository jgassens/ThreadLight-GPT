import { spawn } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const iconSourceRoot = path.join(root, "assets", "icon-composer");
const sourceArtwork = path.join(root, "assets", "threadlight-icon-source.png");
const appIconSet = path.join(
  root,
  "native",
  "ThreadLight",
  "Shared (App)",
  "Assets.xcassets",
  "AppIcon.appiconset"
);
const largeIconSet = path.join(
  root,
  "native",
  "ThreadLight",
  "Shared (App)",
  "Assets.xcassets",
  "LargeIcon.imageset"
);

const magick = process.env.MAGICK_BIN ?? "magick";

const sourceBackgroundColor = "#051f52";
const speechPanelPath =
  "M 320 456 C 344 394 374 331 423 313 C 453 302 564 341 674 382 C 711 396 732 428 725 466 L 694 584 C 686 615 661 638 629 645 L 458 680 C 414 689 374 666 350 628 C 323 586 305 517 320 456 Z";

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "inherit", "inherit"] });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

async function assertSourcesExist() {
  await stat(sourceArtwork);
}

async function renderSourcePng(outputPath, size, options = {}) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const pngPrefix = options.alpha ? "PNG32:" : "PNG24:";
  await run(magick, [
    sourceArtwork,
    "-resize",
    `${size}x${size}!`,
    "-strip",
    "-depth",
    "8",
    `${pngPrefix}${outputPath}`
  ]);
}

async function renderLightPng(outputPath, size, options = {}) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const pngPrefix = options.alpha ? "PNG32:" : "PNG24:";
  const background = options.alpha ? "xc:none" : "xc:#f3fbff";

  await run(magick, [
    "-size",
    "1024x1024",
    background,
    "-fill",
    "#061a3c",
    "-stroke",
    "#69d9ff",
    "-strokewidth",
    "4",
    "-draw",
    `path '${speechPanelPath}'`,
    "(",
    sourceArtwork,
    "-resize",
    "1024x1024!",
    "-fuzz",
    "8%",
    "-transparent",
    sourceBackgroundColor,
    ")",
    "-compose",
    "over",
    "-composite",
    "-resize",
    `${size}x${size}!`,
    "-strip",
    "-depth",
    "8",
    `${pngPrefix}${outputPath}`
  ]);
}

async function renderTintedPng(outputPath, size) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await run(magick, [
    sourceArtwork,
    "-resize",
    "1024x1024!",
    "-colorspace",
    "Gray",
    "-level",
    "4%,96%",
    "-resize",
    `${size}x${size}!`,
    "-strip",
    "-depth",
    "8",
    `PNG24:${outputPath}`
  ]);
}

export async function generateNativeAppIcons() {
  await assertSourcesExist();

  await Promise.all([
    renderLightPng(path.join(appIconSet, "universal-icon-1024@1x.png"), 1024),
    renderSourcePng(path.join(appIconSet, "universal-icon-dark-1024@1x.png"), 1024),
    renderTintedPng(path.join(appIconSet, "universal-icon-tinted-1024@1x.png"), 1024),
    renderLightPng(path.join(largeIconSet, "icon-256.png"), 256),
    renderSourcePng(path.join(largeIconSet, "icon-256-dark.png"), 256),
    renderLightPng(path.join(iconSourceRoot, "threadlight-app-icon-clear-preview.png"), 1024, {
      alpha: true
    })
  ]);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await generateNativeAppIcons();
  console.log("Generated native ThreadLight app icons.");
}
