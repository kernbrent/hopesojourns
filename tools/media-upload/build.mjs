import {build} from 'esbuild';
import {mkdir,copyFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const out=root+'admin/trips/vendor/';
await mkdir(out,{recursive:true});
await build({entryPoints:[fileURLToPath(new URL('./vendor-entry.mjs',import.meta.url))],bundle:true,minify:true,format:'esm',platform:'browser',target:'es2022',outfile:out+'mediabunny-1.59.0.js',legalComments:'inline',banner:{js:'/*! Mediabunny 1.59.0, MPL-2.0. See mediabunny-LICENSE.txt and mediabunny-NOTICE.txt. */'}});
await copyFile(new URL('./node_modules/mediabunny/LICENSE',import.meta.url),out+'mediabunny-LICENSE.txt');
await writeFile(out+'mediabunny-NOTICE.txt','Mediabunny 1.59.0 by Vanilagy, licensed under MPL-2.0.\nUnmodified library source: https://registry.npmjs.org/mediabunny/-/mediabunny-1.59.0.tgz\nProject: https://github.com/Vanilagy/mediabunny\nRebuild using tools/media-upload/build.mjs and its pinned lockfile.\n');
