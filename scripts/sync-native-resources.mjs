import { spawn } from "node:child_process";
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extensionRoot = path.join(root, "extension");
const nativeResourceRoot = path.join(
  root,
  "native",
  "ThreadLight",
  "Shared (Extension)",
  "Resources"
);
const iconSizes = [16, 32, 48, 128, 256, 512];

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
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

async function replaceFolder(source, destination) {
  await rm(destination, { recursive: true, force: true });
  await cp(source, destination, { recursive: true });
}

async function syncIcons() {
  const destination = path.join(nativeResourceRoot, "icons");
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  await Promise.all(
    iconSizes.map((size) =>
      cp(
        path.join(extensionRoot, "icons", `icon-${size}.png`),
        path.join(destination, `icon-${size}.png`)
      )
    )
  );
}

await run("npm", ["run", "build:safari"], { cwd: root });
await mkdir(nativeResourceRoot, { recursive: true });

await Promise.all([
  replaceFolder(path.join(extensionRoot, "dist"), path.join(nativeResourceRoot, "dist")),
  replaceFolder(path.join(extensionRoot, "popup"), path.join(nativeResourceRoot, "popup")),
  replaceFolder(path.join(extensionRoot, "src"), path.join(nativeResourceRoot, "src")),
  syncIcons(),
  cp(path.join(extensionRoot, "manifest.json"), path.join(nativeResourceRoot, "manifest.json")),
  cp(
    path.join(extensionRoot, "manifest.safari.json"),
    path.join(nativeResourceRoot, "manifest.safari.json")
  )
]);

console.log(`Synced Safari extension resources to ${nativeResourceRoot}`);
