import app from './index.mjs';
export {PrayerStore} from './prayer-store.mjs';
export default {
  async fetch(request,env) {
    if(env.PRAYER_STORE && new URL(request.url).pathname.startsWith('/api/')) {
      try {
        // Buffer before forwarding so handlers that intentionally ignore a JSON
        // body do not leave the outer request's network stream open.
        let forwarded=request;
        if(request.body) {
          const reader=request.body.getReader(),chunks=[];let length=0;
          for(;;) {
            const {value,done}=await reader.read();if(done) break;
            length+=value.length;
            if(length>65536) {await reader.cancel();return Response.json({error:'This submission is too large.'},{status:413,headers:{'Cache-Control':'no-store'}});}
            chunks.push(value);
          }
          const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.length;}
          forwarded=new Request(request,{body:bytes});
        }
        return await env.PRAYER_STORE.get(env.PRAYER_STORE.idFromName('organization')).fetch(forwarded);
      }
      catch {return Response.json({error:'The prayer portal is temporarily unavailable. Please try again.'},{status:503,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
    }
    return app.fetch(request,env);
  }
};
