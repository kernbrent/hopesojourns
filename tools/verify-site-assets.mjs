import {readFile, readdir, stat} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

// Pages can return index.html with HTTP 200 for missing assets. Check the
// actual release directory rather than relying on successful page requests.
export async function verifySiteAssets(directory) {
  const root = path.resolve(directory);
  let pages = 0, references = 0;
  async function walk(location) {
    for (const entry of await readdir(location, {withFileTypes: true})) {
      const file = path.join(location, entry.name);
      if (entry.isDirectory()) { await walk(file); continue; }
      if (!entry.name.endsWith('.html')) continue;
      pages++;
      const html = await readFile(file, 'utf8');
      for (const match of html.matchAll(/<(script|link)\b[^>]*>/gi)) {
        const tag = match[0];
        if (match[1].toLowerCase() === 'link' && !/\brel\s*=\s*["']stylesheet["']/i.test(tag)) continue;
        const source = tag.match(/\b(?:src|href)\s*=\s*["']([^"']+)["']/i)?.[1];
        if (!source || /^(?:[a-z]+:|\/\/|#)/i.test(source)) continue;
        const relative = decodeURIComponent(source.split(/[?#]/)[0]);
        const asset = relative.startsWith('/') ? path.resolve(root, '.' + relative) : path.resolve(path.dirname(file), relative);
        if (!asset.startsWith(root + path.sep)) throw new Error(`Asset outside release directory: ${source}`);
        const info = await stat(asset).catch(() => null);
        if (!info?.isFile()) throw new Error(`Missing asset ${source} referenced by ${path.relative(root, file)}`);
        references++;
      }
    }
  }
  await walk(root);
  const phone = await readFile(path.join(root, 'phone-ui.js'), 'utf8');
  if (!phone.includes('window.HSPhones=') || /^\s*</.test(phone)) throw new Error('Invalid phone formatter asset');
  return {pages, references};
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.log(await verifySiteAssets(process.argv[2] || 'site-dist'));
}
