import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await rm(path.join(root, "extension/dist"), { recursive: true, force: true });
await rm(path.join(root, "extension/manifest.json"), { force: true });
