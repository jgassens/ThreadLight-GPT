import { spawn } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SIZES = [16, 32, 48, 128, 256, 512];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceIcon = path.join(root, "assets", "threadlight-icon-source.png");

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
  await run("sips", ["-z", String(size), String(size), sourceIcon, "--out", outputPath]);
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
