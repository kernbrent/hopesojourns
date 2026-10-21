import {describe,it,expect} from 'vitest';
import {ministryFixture} from './ministry-fixture';
import {handleMinistryAdminRequest} from '../src/ministry-admin';

describe('Supporting documents',()=>{
 it('stores supporting folders privately and preserves replacements and Trash recovery',async()=>{
  const f=await ministryFixture();
  const root='/admin/ministry/documents';
  const upload=async(path:string,title:string)=>{
   const body=new FormData();body.set('title',title);body.set('category','Supporting Documents / Envelope Templates');
   body.set('file',new File(['%PDF-1.7\nEnvelope template'], 'envelope.pdf',{type:'application/pdf'}));
   const response=await handleMinistryAdminRequest(f.request(path,body),f.env,path);
   expect(response.status).toBe(201);return await response.json() as {id:string;versionId:string};
  };
  const first=await upload(root,'HS envelope template');
  const second=await upload(root+'/'+first.id,'HS envelope template updated');
  let response=await handleMinistryAdminRequest(f.request(root),f.env,root);
  const listed=await response.json() as any;
  expect(listed.canManage).toBe(true);expect(listed.journeys).toEqual([]);
  expect(listed.documents).toHaveLength(2);
  expect(listed.documents.every((d:any)=>d.category==='Supporting Documents / Envelope Templates')).toBe(true);
  const download=root+'/'+first.id+'/versions/'+first.versionId;
  response=await handleMinistryAdminRequest(f.request(download),f.env,download);
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect(await response.text()).toContain('Envelope template');
  await handleMinistryAdminRequest(f.request(root+'/'+first.id,{},'DELETE'),f.env,root+'/'+first.id);
  expect((await handleMinistryAdminRequest(f.request(download),f.env,download)).status).toBe(404);
  await handleMinistryAdminRequest(f.request(root+'/'+first.id,{},'PATCH'),f.env,root+'/'+first.id);
  expect((await handleMinistryAdminRequest(f.request(download),f.env,download)).status).toBe(200);
  expect(second.id).toBe(first.id);
 });
});
