import {createHash} from 'node:crypto';
import { cp, mkdir, rm, stat, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifySiteAssets } from '../tools/verify-site-assets.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Explicit opt-in keeps the Biblillion test release out of normal production builds.
const biblillionTest = process.argv.includes('--biblillion-test');
const outputName = biblillionTest ? 'site-dist-biblillion-test' : 'site-dist';
const outputDirectory = path.resolve(repositoryRoot, outputName);
if (path.dirname(outputDirectory) !== repositoryRoot || path.basename(outputDirectory) !== outputName) {
  throw new Error("Refusing to build outside the expected site-dist directory.");
}

const publicEntries = [
  "_headers",
  "index.html",
  "script.js",
  "discovery.js",
  "discovery.css",
  "styles.css",
  "experience.css",
  "experience.js",
  "explore",
  "stories",
  "discover",
  "partners",
  "groups",
  "corporate-journeys",
  "students",
  "trip.js",
  "destination",
  "destinations-public.js",
  "phone-ui.js",
  "about",
  "admin",
  "application",
  "agreements",
  "assets",
  "brochure",
  "giving",
  "knowledge",
  "faq",
  "interest",
  "mission-journey",
  "mission-journey",
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
 const bytes=await readFile(path.join(repositoryRoot,file));
 const content=/\.(html|json|txt)$/i.test(file)?bytes.toString('utf8').replace(/\r\n/g,'\n'):bytes;
 const actual=createHash('sha256').update(content).digest('hex');
 if(actual!==digest)throw new Error('Stale public knowledge input: '+file+'. Run tools/build_knowledge_site.py.');
}
const excluded=new Set(['admin','application','journey','trip-account','faq','knowledge','logo-explorations','outputs']);
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
if (!biblillionTest) await rm(path.join(outputDirectory,'admin/biblillion'),{recursive:true,force:true});

if (biblillionTest) {
  const gameDirectory = path.join(outputDirectory, 'biblillion');
  await mkdir(gameDirectory, {recursive: true});
  // Copy runtime assets only; never publish the source README or local tooling.
  for (const file of ['index.html', 'game.css', 'game.js', 'content.js', 'engine.js','expanded-bank.js','destinations.js','analytics.js','passport.js','general-bank.js','question-settings.js','rewards.js','timer.js','passport.css','friendly-bank.js','mission-bank.js','country-areas.js','open-ended.js','adventure.js','discovery.js','souvenirs.js']) {
    const source = path.join(repositoryRoot, 'preview/biblillion', file);
    if (file === 'index.html') {
      const html = (await readFile(source, 'utf8'))
        .replace('Hope Sojourns local preview', 'Hope Sojourns test preview')
        .replace('LOCAL PROTOTYPE', 'TEST PREVIEW');
      await writeFile(path.join(gameDirectory, file), html);
    } else await cp(source, path.join(gameDirectory, file));
  }
  const scriptPath = path.join(outputDirectory, 'script.js');
  const sharedScript = await readFile(scriptPath, 'utf8');
  const menuAnchor = '<a href="/mission-journey/">Mission Journey walkthrough</a>';
  if (!sharedScript.includes(menuAnchor)) throw new Error('Resources menu anchor missing.');
  await writeFile(scriptPath, sharedScript.replace(menuAnchor, menuAnchor+'\n            <a href="/biblillion/">Biblillion discovery game</a>'));
  async function reviseCache(directory) {
    for (const entry of await readdir(directory, {withFileTypes:true})) {
      const location = path.join(directory, entry.name);
      if (entry.isDirectory()) await reviseCache(location);
      else if (entry.name.endsWith('.html')) {
        const html = await readFile(location, 'utf8');
        await writeFile(location, html.replace(/\/script\.js\?v=[^"']+/g, '/script.js?v=2026-11-27.biblillion-adventure1').replace(/\/admin\/mmt-navigation\.js\?v=[^"']+/g,'/admin/mmt-navigation.js?v=2026-11-27.biblillion-adventure1').replace(/\/admin\/mmt-session\.js\?v=[^"']+/g,'/admin/mmt-session.js?v=2026-11-27.biblillion-adventure1'));
      }
    }
  }
  await reviseCache(outputDirectory);
  const headerPath = path.join(outputDirectory, '_headers');
  await writeFile(headerPath, (await readFile(headerPath, 'utf8'))+'\n/biblillion/*\n  Cache-Control: no-store\n  Referrer-Policy: no-referrer\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  X-Robots-Tag: noindex, nofollow\n');
}

await mkdir(path.join(outputDirectory, "downloads"), { recursive: true });
await cp(
  path.join(repositoryRoot, "outputs", "01a0775c-925e-7713-9822-42450cb2f4b6", "Hope-Sojourns-Trip-Bulk-Import-Template.xlsx"),
  path.join(outputDirectory, "downloads", "Hope-Sojourns-Trip-Bulk-Import-Template.xlsx"),
);

const assets = await verifySiteAssets(outputDirectory);
console.log(`Prepared ${publicEntries.length} public site entries${biblillionTest ? ' plus Biblillion (TEST ONLY)' : ''}; verified ${assets.references} script/style references across ${assets.pages} pages. Output: ${outputName}`);
