import { spawn } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SIZES = [16, 32, 48, 128, 256, 512];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceIcon = path.join(root, "assets", "threadlight-icon-source.png");
const magick = process.env.MAGICK_BIN ?? "magick";
const sourceBackgroundColor = "#051f52";
const speechPanelPath =
  "M 320 456 C 344 394 374 331 423 313 C 453 302 564 341 674 382 C 711 396 732 428 725 466 L 694 584 C 686 615 661 638 629 645 L 458 680 C 414 689 374 666 350 628 C 323 586 305 517 320 456 Z";

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "inherit"] });
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

async function resizeIcon(outputPath, size) {
  const artworkSize = Math.max(1, Math.round(size * 0.9));

  await run(magick, [
    "-size",
    "1024x1024",
    "xc:none",
    "-fill",
    "#061a3c",
    "-stroke",
    "#69d9ff",
    "-strokewidth",
    "4",
    "-draw",
    `path '${speechPanelPath}'`,
    "(",
    sourceIcon,
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
    "-trim",
    "+repage",
    "-resize",
    `${artworkSize}x${artworkSize}`,
    "-gravity",
    "center",
    "-background",
    "none",
    "-extent",
    `${size}x${size}`,
    "-strip",
    "-depth",
    "8",
    `PNG32:${outputPath}`
  ]);
}

export async function generateIcons(extensionRoot) {
  await stat(sourceIcon);

  const iconDir = path.join(extensionRoot, "icons");
  await mkdir(iconDir, { recursive: true });
  await Promise.all(
    SIZES.map((size) => resizeIcon(path.join(iconDir, `icon-${size}.png`), size))
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const extensionRoot = process.argv[2] ?? path.resolve("extension");
  await generateIcons(extensionRoot);
}
