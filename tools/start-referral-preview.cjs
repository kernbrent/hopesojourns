const {build}=require('../cloudflare/interest-worker/node_modules/esbuild');
const path=require('node:path'),{pathToFileURL}=require('node:url');
(async()=>{
 await build({entryPoints:['tools/referral-preview.ts'],bundle:true,platform:'node',format:'esm',outfile:'.tmp/referral-preview.mjs',external:['node:*'],banner:{js:"import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);"},alias:{'cloudflare:workers':path.resolve('cloudflare/interest-worker/test/worker-entrypoint-shim.ts')},define:{'import.meta.url':JSON.stringify(pathToFileURL(path.resolve('cloudflare/interest-worker/test/ministry-fixture.ts')).href)}});
 await import('../.tmp/referral-preview.mjs');
})().catch(error=>{console.error(error);process.exitCode=1;});
