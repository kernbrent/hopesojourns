import {it,expect} from 'vitest';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {readFileSync,readdirSync} from 'node:fs';

it('uses a private named Workers binding for CSM sign-in and does not expose it over public HTTP',async()=>{
 const authority=await build({entryPoints:['src/index.ts'],bundle:true,write:false,format:'esm',platform:'browser',external:['cloudflare:workers','cloudflare:email','node:*']});
 const client=await build({stdin:{contents:`export default {fetch(request,env){return env.IDENTITY.fetch(new Request('https://identity.internal/admin/login',request));}}`,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'browser'});
 const mf=new Miniflare(convertV4MiniflareOptions({workers:[
  {name:'authority',modules:true,script:authority.outputFiles[0].text,compatibilityDate:'2026-08-23',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'identity-test'},bindings:{SHARED_SIGNIN:'enabled',ADMIN_PASSWORD:'Runtime!Password123',ADMIN_SESSION_SECRET:'runtime-only-secret',ALLOWED_ORIGINS:'http://localhost',ENVIRONMENT:'test'}},
  {name:'client',modules:true,script:client.outputFiles[0].text,compatibilityDate:'2026-08-23',compatibilityFlags:['nodejs_compat'],bindings:{SHARED_SIGNIN:'enabled',ALLOWED_ORIGINS:'http://localhost'},serviceBindings:{IDENTITY:{name:'authority',entrypoint:'CsmIdentity'}}}
 ]}));
 try{
  const db=await mf.getD1Database('DB','authority');
  // D1 exec treats newlines as statement boundaries. Migration trigger bodies
  // are preserved on one line, like Wrangler's migration parser.
  for(const filename of readdirSync('migrations').filter(x=>x.endsWith('.sql')).sort()){
   const sql=readFileSync('migrations/'+filename,'utf8').replace(/--[^\n]*/g,'').replace(/\r?\n/g,' ');
   await db.exec(sql);
  }
  const clientWorker=await mf.getWorker('client') as unknown as {fetch(input:string,init?:RequestInit):Promise<Response>};
  const login=await clientWorker.fetch('http://localhost/api/admin/login',{method:'POST',headers:{origin:'http://localhost','content-type':'application/json'},body:JSON.stringify({username:'admin',password:'Runtime!Password123'})});
  expect(login.status).toBe(200);const data=await login.json() as any;expect(data.user.portal).toBe('csm');expect(data.user.is_org_admin).toBe(true);expect(login.headers.get('set-cookie')).toContain('hs_admin_session=');
  const publicWorker=await mf.getWorker('authority') as unknown as {fetch(input:string,init?:RequestInit):Promise<Response>};
  expect((await publicWorker.fetch('http://localhost/authorize',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status).toBe(404);
 }finally{await mf.dispose();}
},45000);
