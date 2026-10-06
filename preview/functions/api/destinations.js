/* Public preview read-only gateway: never forwards credentials or accepts writes. */
export async function onRequestGet(){
 try{const r=await fetch('https://hopesojourns.com/api/interest/public/destinations',{headers:{Accept:'application/json'},cache:'no-store'});if(!r.ok)throw Error();return new Response(JSON.stringify(await r.json()),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}catch{return new Response('{"error":"Destinations unavailable"}',{status:502,headers:{'Content-Type':'application/json'}});}
}
