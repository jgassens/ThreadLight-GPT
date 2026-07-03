import { spawn } from "node:child_process";
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extensionRoot = path.join(root, "extension");
const packageRoot = path.join(root, "packages");
const stagingRoot = path.join(packageRoot, "threadlight-extension");
const zipPath = path.join(packageRoot, "threadlight-extension.zip");
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

await run("npm", ["run", "build:safari"], { cwd: root });
await rm(packageRoot, { recursive: true, force: true });
await mkdir(path.join(stagingRoot, "popup"), { recursive: true });
await mkdir(path.join(stagingRoot, "icons"), { recursive: true });

await Promise.all([
  cp(path.join(extensionRoot, "dist"), path.join(stagingRoot, "dist"), { recursive: true }),
  cp(path.join(extensionRoot, "manifest.json"), path.join(stagingRoot, "manifest.json")),
  cp(path.join(extensionRoot, "popup", "popup.html"), path.join(stagingRoot, "popup", "popup.html")),
  cp(path.join(extensionRoot, "popup", "popup.css"), path.join(stagingRoot, "popup", "popup.css")),
  ...iconSizes.map((size) =>
    cp(path.join(extensionRoot, "icons", `icon-${size}.png`), path.join(stagingRoot, "icons", `icon-${size}.png`))
  )
]);

await run("zip", ["-X", "-r", path.basename(zipPath), path.basename(stagingRoot)], { cwd: packageRoot });
console.log(`Created ${zipPath}`);
