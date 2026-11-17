const {build}=require('../cloudflare/interest-worker/node_modules/esbuild');
const path=require('node:path'),{pathToFileURL}=require('node:url');
(async()=>{await build({entryPoints:['tools/mexico-host-preview.ts'],bundle:true,platform:'node',format:'esm',outfile:'.tmp/mexico-host-preview.mjs',external:['node:*'],define:{'import.meta.url':JSON.stringify(pathToFileURL(path.resolve('cloudflare/interest-worker/test/ministry-fixture.ts')).href)}});await import('../.tmp/mexico-host-preview.mjs');})().catch(error=>{console.error(error);process.exit(1)});
