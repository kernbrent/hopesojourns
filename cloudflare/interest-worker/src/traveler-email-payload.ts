import {Buffer} from 'node:buffer';
import {AdminError,type AdminEnv} from './admin';
async function key(env:AdminEnv){
 if(!env.ADMIN_SESSION_SECRET)throw new AdminError(503,'EMAIL_SECRET','The portal email encryption key is not configured.');
 return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',new TextEncoder().encode('hs-traveler-email:'+env.ADMIN_SESSION_SECRET)),{name:'AES-GCM'},false,['encrypt','decrypt']);
}
export async function sealTravelerEmail(env:AdminEnv,payload:unknown){const iv=crypto.getRandomValues(new Uint8Array(12)),data=await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(env),new TextEncoder().encode(JSON.stringify(payload)));return JSON.stringify({v:1,iv:Buffer.from(iv).toString('base64'),data:Buffer.from(data).toString('base64')});}
export async function openTravelerEmail(env:AdminEnv,value:string){const saved=JSON.parse(value);if(saved.v!==1)throw new AdminError(503,'EMAIL_PAYLOAD','The saved email could not be opened.');const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(saved.iv,'base64')},await key(env),Buffer.from(saved.data,'base64'));return JSON.parse(new TextDecoder().decode(plain));}
