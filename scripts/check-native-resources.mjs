import { readdir, readFile } from "node:fs/promises";
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
const manifestFiles = ["manifest.json", "manifest.safari.json"];

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

function assertSafeRelativeResourcePath(relativePath, manifestFile) {
  if (path.isAbsolute(relativePath) || relativePath.split(/[\\/]+/).includes("..")) {
    throw new Error(`${manifestFile} references an unsafe resource path: ${relativePath}`);
  }
}

async function assertSameFile(relativePath) {
  const source = path.join(extensionRoot, relativePath);
  const destination = path.join(nativeResourceRoot, relativePath);
  const [sourceContents, destinationContents] = await Promise.all([
    readFile(source),
    readFile(destination)
  ]);

  if (!sourceContents.equals(destinationContents)) {
    throw new Error(`Native resource is stale: ${relativePath}`);
  }
}

async function assertSameFolder(relativeFolder) {
  const entries = await readdir(path.join(extensionRoot, relativeFolder), {
    recursive: true,
    withFileTypes: true
  });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name))
    .map((filePath) => path.relative(extensionRoot, filePath));

  await Promise.all(files.map(assertSameFile));
}

async function assertNativeIconSet() {
  const iconDir = path.join(nativeResourceRoot, "icons");
  const actualIcons = (await readdir(iconDir)).filter((name) => name.endsWith(".png")).sort();
  const expectedIcons = iconSizes.map((size) => `icon-${size}.png`).sort();

  if (actualIcons.join("\n") !== expectedIcons.join("\n")) {
    throw new Error(`Native icon set is stale or contains extra files: ${actualIcons.join(", ")}`);
  }

  await Promise.all(expectedIcons.map((name) => assertSameFile(path.join("icons", name))));
}

async function assertManifestIconReferences(manifestFile) {
  const manifest = JSON.parse(await readFile(path.join(extensionRoot, manifestFile), "utf8"));

  await Promise.all(
    collectManifestIconPaths(manifest).map(async (relativePath) => {
      assertSafeRelativeResourcePath(relativePath, manifestFile);

      try {
        await assertSameFile(relativePath);
      } catch (error) {
        throw new Error(
          `${manifestFile} references a missing or stale icon resource: ${relativePath}\n${error.message}`
        );
      }
    })
  );
}

await Promise.all([
  assertSameFolder("dist"),
  assertSameFolder("popup"),
  assertSameFolder("src"),
  ...manifestFiles.map((manifestFile) => assertSameFile(manifestFile)),
  assertNativeIconSet(),
  ...manifestFiles.map((manifestFile) => assertManifestIconReferences(manifestFile))
]);

console.log(`Native Safari extension resources match ${extensionRoot}`);
