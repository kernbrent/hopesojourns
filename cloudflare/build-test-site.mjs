import { cp, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.resolve(repositoryRoot, "site-dist");
if (path.dirname(outputDirectory) !== repositoryRoot || path.basename(outputDirectory) !== "site-dist") {
  throw new Error("Refusing to build outside the expected site-dist directory.");
}

const publicEntries = [
  "_headers",
  "index.html",
  "script.js",
  "styles.css",
  "trip.js",
  "about",
  "admin",
  "agreements",
  "assets",
  "brochure",
  "giving",
  "interest",
  "internships",
  "letters",
  "logo-explorations",
  "past-trips",
  "resources",
  "schedule",
  "trips",
];

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

for (const entry of publicEntries) {
  const source = path.join(repositoryRoot, entry);
  await stat(source);
  await cp(source, path.join(outputDirectory, entry), { recursive: true });
}

console.log(`Prepared ${publicEntries.length} public site entries.`);
