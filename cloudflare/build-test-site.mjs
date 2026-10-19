import {createHash} from 'node:crypto';
import { cp, mkdir, rm, stat, readFile, readdir } from "node:fs/promises";
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
  "experience.css",
  "experience.js",
  "explore",
  "stories",
  "discover",
  "partners",
  "groups",
  "students",
  "trip.js",
  "destination",
  "destinations-public.js",
  "phone-ui.js",
  "about",
  "admin",
  "agreements",
  "assets",
  "brochure",
  "giving",
  "knowledge",
  "faq",
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

// The public search catalog must reflect the exact release inputs, including newly
// added pages. Never silently publish a stale knowledge snapshot.
const catalogSource=await readFile(path.join(repositoryRoot,'cloudflare/interest-worker/src/knowledge-site-content.ts'),'utf8');
const inputLine=catalogSource.split('\n').find(line=>line.startsWith('export const siteContentInputs='));
if(!inputLine)throw new Error('Missing public knowledge catalog; run tools/build_knowledge_site.py.');
const inputs=JSON.parse(inputLine.slice('export const siteContentInputs='.length).trim().replace(/;$/,''));
for(const [file,digest] of Object.entries(inputs)){
 const actual=createHash('sha256').update(await readFile(path.join(repositoryRoot,file))).digest('hex');
 if(actual!==digest)throw new Error('Stale public knowledge input: '+file+'. Run tools/build_knowledge_site.py.');
}
const excluded=new Set(['admin','journey','trip-account','faq','knowledge','logo-explorations','outputs']);
async function verifyHtml(relative){const location=path.join(repositoryRoot,relative),info=await stat(location);if(info.isDirectory()){
 for(const item of await readdir(location))await verifyHtml(path.join(relative,item));
 }else if(relative.endsWith('.html')&&!Object.hasOwn(inputs,relative.split(path.sep).join('/')))throw new Error('New public page is missing from the knowledge catalog: '+relative);
}
for(const entry of publicEntries)if(!excluded.has(entry.split('/')[0]))await verifyHtml(entry);

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
