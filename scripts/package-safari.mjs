import { spawn } from "node:child_process";
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extensionRoot = path.join(root, "extension");
const packageRoot = path.join(root, "packages");
const stagingRoot = path.join(packageRoot, "threadlight-extension");
const zipPath = path.join(packageRoot, "threadlight-extension.zip");

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
await mkdir(stagingRoot, { recursive: true });

await Promise.all([
  cp(path.join(extensionRoot, "dist"), path.join(stagingRoot, "dist"), { recursive: true }),
  cp(path.join(extensionRoot, "icons"), path.join(stagingRoot, "icons"), { recursive: true }),
  cp(path.join(extensionRoot, "popup"), path.join(stagingRoot, "popup"), { recursive: true }),
  cp(path.join(extensionRoot, "manifest.json"), path.join(stagingRoot, "manifest.json"))
]);

await run("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", stagingRoot, zipPath]);
console.log(`Created ${zipPath}`);
