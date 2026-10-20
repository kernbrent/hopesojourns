// Local sample-data preview only. Never include this tool or its database in a public build.
const path=require('node:path');
const fs=require('node:fs');
const {pathToFileURL}=require('node:url');
(async()=>{
 fs.mkdirSync('.tmp',{recursive:true});
 process.env.HS_VOLUNTEER_PREVIEW_DB=path.resolve('.tmp/volunteer-local.sqlite');
 await require('../cloudflare/interest-worker/node_modules/esbuild').build({entryPoints:['tools/volunteer-dev-server.ts'],bundle:true,platform:'node',format:'esm',outfile:'.tmp/volunteer-local.mjs',external:['node:*'],define:{'import.meta.url':JSON.stringify(pathToFileURL(path.resolve('cloudflare/interest-worker/test/ministry-fixture.ts')).href)}});
 const qa=await import('../.tmp/volunteer-local.mjs');
 const server=require('node:http').createServer(qa.serve);
 server.listen(4190,'127.0.0.1',()=>console.log('Volunteer local preview: http://127.0.0.1:4190/admin/volunteer/\nSample drafts and reports persist in .tmp/volunteer-local.sqlite.'));
 server.on('error',error=>{console.error(error.message);process.exit(1);});
})().catch(error=>{console.error(error);process.exit(1);});
