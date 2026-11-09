import {it,expect} from 'vitest';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

it('sanitizes responsive newsletter HTML inside the actual Workers runtime',async()=>{
 const bundle=await build({stdin:{contents:`import {newsletterHtml} from './src/contact-email-html'; export default {async fetch(request){return Response.json({html:newsletterHtml(await request.text())});}}`,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'browser',external:['cloudflare:workers','node:*']});
 const runtime=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-08-23',compatibilityFlags:['nodejs_compat']}));
 try{
  const response=await runtime.dispatchFetch('http://localhost/',{method:'POST',body:'<style>@media(max-width:640px){.shell{width:100%}}</style><p style="padding:20px">Welcome</p><script>alert(1)</script>'});
  expect(response.status).toBe(200);const result=await response.json() as {html:string};expect(result.html).toContain('@media(max-width:640px)');expect(result.html).toContain('style="padding:20px"');expect(result.html).not.toContain('<script');
 }finally{await runtime.dispose();}
});
