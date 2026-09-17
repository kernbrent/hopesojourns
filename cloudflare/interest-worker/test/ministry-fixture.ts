import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import type {AdminEnv} from '../src/admin';

// Real SQLite constraints and atomic batches, with an isolated in-memory file store.
export async function ministryFixture(){
 const sqlite=new DatabaseSync(':memory:');
 const directory=fileURLToPath(new URL('../migrations/',import.meta.url));
 for(const name of readdirSync(directory).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(readFileSync(directory+'/'+name,'utf8'));
 class Statement{
  values: (string|number|null)[]=[];
  constructor(readonly sql:string){}
  bind(...values:unknown[]){this.values=values as (string|number|null)[];return this;}
  async first(){return sqlite.prepare(this.sql).get(...this.values)??null;}
  async all(){return {results:sqlite.prepare(this.sql).all(...this.values),success:true,meta:{}};}
  async run(){const result=sqlite.prepare(this.sql).run(...this.values);return {success:true,meta:{changes:Number(result.changes)},results:[]};}
 }
 const files=new Map<string,Uint8Array>();
 const env={DB:{prepare:(sql:string)=>new Statement(sql),batch:async(statements:Statement[])=>{sqlite.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}}},RECEIPTS:{put:async(key:string,value:Uint8Array)=>files.set(key,value),get:async(key:string)=>files.has(key)?{body:files.get(key)}:null,delete:async(key:string)=>files.delete(key)}} as unknown as AdminEnv;
 const token='a'.repeat(48),csrf='test-csrf-token';
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),b=>b.toString(16).padStart(2,'0')).join('');
 sqlite.prepare('INSERT INTO admin_sessions(id,token_hash,csrf_token,created_at,expires_at,last_seen_at) VALUES(?,?,?,?,?,?)').run('test-session',hash,csrf,new Date().toISOString(),'2099-01-01T00:00:00.000Z',new Date().toISOString());
 const request=(path:string,body?:unknown,method?:string)=>new Request('http://localhost:4188/api/interest'+path,{method:method||(body?'POST':'GET'),headers:{cookie:'hs_admin_session='+token,'x-csrf-token':csrf,...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined});
 return {sqlite,env,request,token,csrf,files};
}
