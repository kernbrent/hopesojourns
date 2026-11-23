import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const dist = fileURLToPath(new URL('../site-dist/', import.meta.url));
const read = file => readFile(path.join(dist, file), 'utf8');
const origin = 'https://hopesojourns.com';
const destinations = ['arkansas','athens','belize','camino-de-santiago','halifax','kenya','kilimanjaro','mexico-city','nice','others'];
const privatePaths = ['/admin/','/api/','/application/','/journey/','/trip-account/'];

test('every sitemap entry points to a unique built public page with a matching canonical', async () => {
  const sitemap = await read('sitemap.xml');
  assert.match(sitemap, /^<\?xml version="1\.0" encoding="UTF-8"\?>\r?\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  const urls = Array.from(sitemap.matchAll(/<loc>([^<]+)<\/loc>/g), ([, value]) => value);
  assert.equal(urls.length, new Set(urls).size);
  assert.ok(urls.length >= 25);
  for (const value of urls) {
    const url = new URL(value);
    assert.equal(url.origin, origin);
    assert.ok(url.pathname.endsWith('/') && !url.search && !url.hash);
    assert.ok(!privatePaths.some(prefix => url.pathname.startsWith(prefix)));
    const html = await read(path.join(url.pathname.slice(1), 'index.html'));
    assert.deepEqual(Array.from(html.matchAll(/<link rel="canonical" href="([^"]+)"/g), ([,link]) => link), [value]);
    assert.doesNotMatch(html, /<meta[^>]+name="robots"[^>]+noindex/);
  }
  const robots = await read('robots.txt');
  assert.match(robots, /^User-agent: \*/);
  for (const prefix of privatePaths) assert.ok(robots.includes('Disallow: '+prefix));
  assert.ok(robots.includes('Sitemap: '+origin+'/sitemap.xml'));
});

test('all ten destination entries are readable and linked without JavaScript and do not promise departures', async () => {
  const home = await read('index.html');
  const explore = await read('explore/index.html');
  const sitemap = await read('sitemap.xml');
  assert.deepEqual((await readdir(path.join(dist, 'trips'), {withFileTypes:true})).filter(f => f.isDirectory()).map(f=>f.name).sort(), destinations);
  for (const slug of destinations) {
    const route = '/trips/'+slug+'/';
    const html = await read(route.slice(1)+'index.html');
    assert.ok(sitemap.includes(origin+route));
    assert.ok(home.includes('href="'+route+'"') && explore.includes('href="'+route+'"'));
    assert.match(html, /<main id="trip-main">\s*<section[^>]*>.*<h1>[^<]+<\/h1><p>[^<]{60,}/s);
    assert.match(html, /<meta name="description" content="[^"]{60,}"/);
    assert.match(html, /href="\/styles\.css\?/);
    assert.doesNotMatch(html, /Team confirmed|Spots available|trip-status|2027/);
  }
  const halifax = await read('trips/halifax/index.html');
  assert.match(halifax, /data-trip="england"/);
  const custom = await read('trips/others/index.html');
  assert.match(custom, /form your team, choose dates, build the itinerary with local partners, and lead the journey alongside you/);
  assert.match(custom, /href="\/schedule\/"/);
  assert.match(await read('groups/index.html'), /form your team, choose dates, build the itinerary with local partners, and lead the journey alongside you/);
  assert.doesNotMatch(home + explore, /Additional spots available|Spots available/);
});
