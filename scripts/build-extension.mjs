import { build } from "esbuild";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateIcons } from "./generate-icons.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extensionRoot = path.join(root, "extension");
const distDir = path.join(extensionRoot, "dist");
const args = new Set(process.argv.slice(2));
const isDev = args.has("--dev");

const allowedHosts = new Set(["https://chatgpt.com/*", "https://chat.openai.com/*"]);
const forbiddenPermissions = new Set([
  "<all_urls>",
  "cookies",
  "history",
  "bookmarks",
  "webRequest",
  "webRequestBlocking"
]);

function assertArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`Manifest ${label} must be an array.`);
  }
  return value;
}

function validateManifest(manifest) {
  const permissions = assertArray(manifest.permissions ?? [], "permissions");
  const hostPermissions = assertArray(manifest.host_permissions ?? [], "host_permissions");

  for (const permission of permissions) {
    if (typeof permission !== "string") {
      throw new Error("Manifest permissions must be strings.");
    }
    if (forbiddenPermissions.has(permission)) {
      throw new Error(`Forbidden manifest permission: ${permission}`);
    }
  }

  for (const host of hostPermissions) {
    if (typeof host !== "string" || !allowedHosts.has(host)) {
      throw new Error(`Unexpected manifest host permission: ${String(host)}`);
    }
  }

  const resources = assertArray(manifest.web_accessible_resources ?? [], "web_accessible_resources");
  const hasPageProxy = resources.some((entry) => {
    if (!entry || typeof entry !== "object" || !Array.isArray(entry.resources)) {
      return false;
    }
    return entry.resources.includes("dist/page-proxy.js");
  });

  if (!hasPageProxy) {
    throw new Error("Manifest must expose dist/page-proxy.js as a web accessible resource.");
  }
}

async function writeManifest() {
  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const manifest = JSON.parse(await readFile(path.join(extensionRoot, "manifest.safari.json"), "utf8"));
  manifest.version = packageJson.version;
  validateManifest(manifest);
  await writeFile(path.join(extensionRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });
await generateIcons(extensionRoot);

const browserShared = {
  bundle: true,
  platform: "browser",
  target: ["safari16"],
  sourcemap: isDev,
  minify: !isDev,
  logLevel: "info",
  legalComments: "none"
};

await Promise.all([
  build({
    ...browserShared,
    entryPoints: [path.join(extensionRoot, "src/background/background.ts")],
    outfile: path.join(distDir, "background.js"),
    format: "iife"
  }),
  build({
    ...browserShared,
    entryPoints: [path.join(extensionRoot, "src/content/page-inject.ts")],
    outfile: path.join(distDir, "page-inject.js"),
    format: "iife"
  }),
  build({
    ...browserShared,
    entryPoints: [path.join(extensionRoot, "src/content/content.ts")],
    outfile: path.join(distDir, "content.js"),
    format: "iife"
  }),
  build({
    ...browserShared,
    entryPoints: [path.join(extensionRoot, "src/page/page-proxy.ts")],
    outfile: path.join(distDir, "page-proxy.js"),
    format: "iife"
  }),
  build({
    ...browserShared,
    entryPoints: [path.join(extensionRoot, "popup/popup.ts")],
    outfile: path.join(distDir, "popup.js"),
    format: "iife"
  })
]);

await writeManifest();
