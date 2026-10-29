// Authenticated deployment operation. Only a token hash is stored in a Worker
// secret; the recipient chooses their own password through the one-time link.
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {digest,token} from '../src/index.mjs';
const environment=process.argv[2];
if(!['test','production'].includes(environment)) throw new Error('Specify test or production explicitly.');
const config=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
const deployment=config.env[environment];
if(!deployment?.durable_objects?.bindings?.some(binding=>binding.name==='PRAYER_STORE')) throw new Error('Unexpected storage configuration.');
const data=JSON.parse(readFileSync(0,'utf8'));
if(typeof data.email!=='string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) || data.email.length>254) throw new Error('Supply the initial admin email as JSON on stdin.');
const raw=token(),expiresAt=Date.now()+7*86400000;
const secret=JSON.stringify({email:data.email.toLowerCase(),tokenHash:await digest(raw),expiresAt});
const result=spawnSync(process.execPath,['../interest-worker/node_modules/wrangler/bin/wrangler.js','secret','put','INITIAL_ADMIN_SETUP','--env',environment],{input:secret,encoding:'utf8',stdio:['pipe','pipe','pipe']});
if(result.status!==0) throw new Error('Initial-admin setup failed; no invitation link was returned.');
console.log(JSON.stringify({environment,email:data.email.toLowerCase(),expiresAt:new Date(expiresAt).toISOString(),link:`https://${deployment.routes[0].pattern}/#invite=${raw}`}));
