const {build}=require('../cloudflare/interest-worker/node_modules/esbuild');
const path=require('node:path'),{pathToFileURL}=require('node:url');
(async()=>{await build({entryPoints:['tools/traveler-vetting-dev-server.ts'],bundle:true,platform:'node',format:'esm',outfile:'.tmp/traveler-vetting-dev-server.mjs',external:['node:*'],define:{'import.meta.url':JSON.stringify(pathToFileURL(path.resolve('cloudflare/interest-worker/test/ministry-fixture.ts')).href)}});await import('../.tmp/traveler-vetting-dev-server.mjs');})().catch(e=>{console.error(e);process.exit(1)});
