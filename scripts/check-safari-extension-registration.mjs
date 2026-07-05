import { access, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const extensionIdentifier = "com.jeremiahgassensmith.threadlight.Extension";
const allowTempRegistration = process.argv.includes("--allow-temp");
const expectedAppIndex = process.argv.indexOf("--expected-app");

if (expectedAppIndex !== -1 && process.argv[expectedAppIndex + 1] === undefined) {
  throw new Error("--expected-app requires an app bundle path");
}

const expectedAppPath =
  expectedAppIndex === -1 ? undefined : path.resolve(process.argv[expectedAppIndex + 1]);

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function iconPathsFromField(value) {
  if (typeof value === "string") {
    return [value];
  }

  if (!isRecord(value)) {
    return [];
  }

  return Object.values(value).filter((entry) => typeof entry === "string");
}

function collectManifestIconPaths(manifest) {
  const iconPaths = new Set();

  for (const iconPath of iconPathsFromField(manifest.icons)) {
    iconPaths.add(iconPath);
  }

  if (isRecord(manifest.action)) {
    for (const iconPath of iconPathsFromField(manifest.action.default_icon)) {
      iconPaths.add(iconPath);
    }
  }

  return [...iconPaths].sort();
}

function assertSafeRelativeResourcePath(relativePath) {
  if (path.isAbsolute(relativePath) || relativePath.split(/[\\/]+/).includes("..")) {
    throw new Error(`Manifest references an unsafe resource path: ${relativePath}`);
  }
}

function registeredExtensionPaths() {
  const result = spawnSync(
    "pluginkit",
    ["-m", "-A", "-v", "-i", extensionIdentifier],
    { encoding: "utf8" }
  );
  const output = `${result.stdout}${result.stderr}`;

  if (result.status !== 0) {
    throw new Error(`pluginkit failed while checking ${extensionIdentifier}:\n${output}`);
  }

  return [...output.matchAll(/\t(\/[^\n]+?\.appex)\s*$/gm)].map((match) => match[1]);
}

async function assertFileExists(filePath, label) {
  try {
    await access(filePath);
  } catch {
    throw new Error(`${label} is missing: ${filePath}`);
  }
}

const paths = registeredExtensionPaths();

if (paths.length !== 1) {
  throw new Error(
    `Expected one registered ${extensionIdentifier} path, found ${paths.length}:\n${paths.join("\n")}`
  );
}

const [extensionPath] = paths;

if (!allowTempRegistration && extensionPath.startsWith("/private/tmp/")) {
  throw new Error(
    `Safari is registered to a temporary ThreadLight extension path: ${extensionPath}\n` +
      "Install ThreadLight.app into /Applications and re-register its .appex before testing Safari."
  );
}

if (expectedAppPath !== undefined && !extensionPath.startsWith(`${expectedAppPath}${path.sep}`)) {
  throw new Error(
    `Safari is registered to ${extensionPath}, not the expected app ${expectedAppPath}`
  );
}

await assertFileExists(extensionPath, "Registered Safari extension bundle");

const resourcesRoot = path.join(extensionPath, "Contents", "Resources");
const manifestPath = path.join(resourcesRoot, "manifest.json");
await assertFileExists(manifestPath, "Safari extension manifest");

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const iconPaths = collectManifestIconPaths(manifest);

await Promise.all(
  iconPaths.map(async (relativePath) => {
    assertSafeRelativeResourcePath(relativePath);
    await assertFileExists(path.join(resourcesRoot, relativePath), "Manifest icon resource");
  })
);

console.log(`Safari extension registration is stable: ${extensionPath}`);
console.log(`Manifest icon resources exist: ${iconPaths.join(", ")}`);
