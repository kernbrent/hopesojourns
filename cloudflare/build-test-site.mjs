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
  "journey",
  "letters",
  "logo-explorations",
  "outputs/contact-import-template",
  "past-trips",
  "resources",
  "schedule",
  "trip",
  "trip-account",
  "trips",
];

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

for (const entry of publicEntries) {
  const source = path.join(repositoryRoot, entry);
  await stat(source);
  await cp(source, path.join(outputDirectory, entry), { recursive: true });
}

await mkdir(path.join(outputDirectory, "downloads"), { recursive: true });
await cp(
  path.join(repositoryRoot, "outputs", "01a0775c-925e-7713-9822-42450cb2f4b6", "Hope-Sojourns-Trip-Bulk-Import-Template.xlsx"),
  path.join(outputDirectory, "downloads", "Hope-Sojourns-Trip-Bulk-Import-Template.xlsx"),
);

console.log(`Prepared ${publicEntries.length} public site entries.`);
