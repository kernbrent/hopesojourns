import {it, expect} from 'vitest';
import {build} from 'esbuild';
import {Miniflare, convertV4MiniflareOptions} from 'miniflare';

it('constructs account mail in Workers and refuses redirects without forwarding credentials', async () => {
  const bundled = await build({stdin: {contents: `import {sendAccountEmail} from './src/account-email'; export default {async fetch(){return Response.json({accepted:await sendAccountEmail({MMT_EMAIL_PROVIDER:'resend',MMT_EMAIL_DELIVERY_MODE:'live',RESEND_API_KEY:'dummy-test-key'}, {to:'test@example.test',subject:'test',text:'test'},'runtime-test')});}}`,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'browser'});
  let requests=0;
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-08-23',compatibilityFlags:['nodejs_compat'],outboundService:async (request) => {
    requests++;
    expect(request.url).toBe('https://api.resend.com/emails');
    expect(request.headers.get('Authorization')).toBe('Bearer dummy-test-key');
    return new Response(null,{status:302,headers:{Location:'https://must-not-follow.example.test'}});
  }}));
  try {
    const response=await mf.dispatchFetch('http://localhost/');
    expect(await response.json()).toEqual({accepted:false});
    expect(requests).toBe(1);
  } finally {await mf.dispose();}
},30000);
