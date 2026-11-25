import {afterEach, expect, it, vi} from 'vitest';
import {ministryFixture} from './ministry-fixture';
import worker, {validateSubmissionPayload} from '../src/index';
import {receiveInterest, handleInterestReview} from '../src/interest-review';
import {handleAdminRequest} from '../src/admin';
import {handleInquiries} from '../src/inquiries';
import {referralSources} from '../src/referral-sources';
import {readFileSync} from 'node:fs';

afterEach(()=>vi.unstubAllGlobals());
const raw=(extra:Record<string,unknown>={})=>({firstName:'Referral',lastName:'Visitor',email:'referral@example.test',phone:'9725550188',contactPreference:'email',opportunities:['trip-athens'],consent:true,idempotencyKey:crypto.randomUUID(),...extra});
async function setup(){const f=await ministryFixture();f.env.ENVIRONMENT='test';return {...f,submit:async(extra:Record<string,unknown>={})=>receiveInterest(f.env,validateSubmissionPayload(raw(extra)),crypto.randomUUID(),[{id:'trip-athens'}],null,'/interest/')};}
async function personDetail(f:Awaited<ReturnType<typeof setup>>,personId:string){const path='/admin/people/'+personId;const r=await handleAdminRequest(f.request(path),f.env,path);expect(r.status).toBe(200);return (await r.json() as any).person;}

it('accepts all seven listed sources, optional follow-ups, and old payloads',()=>{
  for(const referralSource of Object.keys(referralSources)){
    expect(validateSubmissionPayload(raw({referralSource,referralDetail:'  Hope   Church  '}))).toMatchObject({referralSource,referralDetail:'Hope Church'});
    expect(validateSubmissionPayload(raw({referralSource})).referralDetail).toBeNull();
  }
  expect(validateSubmissionPayload(raw())).toMatchObject({referralSource:null,referralDetail:null});
});
it('rejects invented sources, wrong types, overlong details and details without a source',()=>{
  for(const extra of [{referralSource:'unknown'},{referralSource:'__proto__'},{referralSource:false},{referralSource:4},{referralDetail:'Someone'},{referralSource:'other',referralDetail:'x'.repeat(241)},{referralSource:'other',referralDetail:{}},{referralSource:'other',referralDetail:'a\u0000b'}])expect(()=>validateSubmissionPayload(raw(extra))).toThrow('Please review the highlighted fields.');
});
it('saves referral source and details in the inquiry and the dated contact history, visible through MMT APIs',async()=>{
  const f=await setup(),r=await f.submit({referralSource:'church-ministry',referralDetail:'Hope Church'});
  const saved=f.sqlite.prepare('SELECT * FROM interest_submissions WHERE id=?').get(r.submissionId)!;
  expect(saved).toMatchObject({referral_source:'church-ministry',referral_detail:'Hope Church',source_page:'/interest/'});
  expect(f.sqlite.prepare('SELECT * FROM contact_referrals WHERE person_id=?').all(saved.person_id)).toHaveLength(1);
  const person=await personDetail(f,String(saved.person_id));
  expect(person.referrals[0]).toMatchObject({submissionId:r.submissionId,referralSourceLabel:'Church or ministry',referralDetail:'Hope Church'});
  expect(person.submissions[0]).toMatchObject({referralSource:'church-ministry',referralDetail:'Hope Church'});
  for(const path of ['/admin/submissions/'+r.submissionId,'/admin/submissions']){
    const data=await(await handleAdminRequest(f.request(path),f.env,path)).json() as any;
    expect((data.submission||data.submissions[0]).referralSourceLabel).toBe('Church or ministry');
  }
  const path='/admin/inquiries/'+r.submissionId,data=await(await handleInquiries(f.request(path),f.env,path)).json() as any;
  expect(data.inquiries[0]).toMatchObject({referral_source_label:'Church or ministry',referral_detail:'Hope Church'});
});
it('retains referral details during duplicate review, attaches once after approval, and preserves earlier contact attribution',async()=>{
  const f=await setup(),first=await f.submit({referralSource:'friend-family',referralDetail:'A friend'}),personId=String(f.sqlite.prepare('SELECT person_id FROM interest_submissions WHERE id=?').get(first.submissionId)!.person_id);
  const next=await f.submit({referralSource:'event-presentation',referralDetail:'Church mission evening'}),path='/admin/interest-reviews/'+next.submissionId;
  const review=await(await handleInterestReview(f.request(path),f.env,path)).json() as any;
  expect(review.intake).toMatchObject({status:'pending',referralSourceLabel:'Event or presentation',submitted:{referralDetail:'Church mission evening'}});
  expect((await personDetail(f,personId)).referrals).toHaveLength(1);
  const decision={action:'update',personId,fields:[],revision:review.revision};
  for(let n=0;n<2;n++)expect((await handleInterestReview(f.request(path,decision),f.env,path)).status).toBe(200);
  const referrals=(await personDetail(f,personId)).referrals;
  expect(referrals).toHaveLength(2);expect(referrals[0].referralSource).toBe('friend-family');expect(referrals[1].referralDetail).toBe('Church mission evening');
});
it('rejected matching submissions keep their snapshot without adding contact referral history',async()=>{
  const f=await setup();await f.submit();const r=await f.submit({referralSource:'other',referralDetail:'Do not attach'}),path='/admin/interest-reviews/'+r.submissionId;
  expect((await handleInterestReview(f.request(path,{action:'reject'}),f.env,path)).status).toBe(200);
  expect(f.sqlite.prepare('SELECT count(*) n FROM contact_referrals').get()!.n).toBe(0);
  expect(JSON.parse(String(f.sqlite.prepare('SELECT payload_json FROM interest_intake WHERE id=?').get(r.submissionId)!.payload_json)).referralDetail).toBe('Do not attach');
});
it('public retries are idempotent and changing referral answers with the same key is rejected',async()=>{
  const f=await setup();Object.assign(f.env,{ALLOWED_ORIGINS:'http://localhost:4193'});const payload=raw({referralSource:'social-media',referralDetail:'Instagram'});
  const send=(value:unknown)=>worker.fetch(new Request('http://localhost:4193/api/interest/submissions',{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost:4193'},body:JSON.stringify(value)}) as any,f.env as any);
  expect((await send(payload)).status).toBe(201);expect((await send(payload)).status).toBe(200);
  expect((await send({...payload,referralDetail:'Facebook'})).status).toBe(409);
  expect(f.sqlite.prepare('SELECT count(*) n FROM contact_referrals').get()!.n).toBe(1);
});
it('the additive migration preserves old inquiries and contact history follows inquiry deletion',async()=>{
  const old=await ministryFixture('0071_discovery_interviews.sql');
  old.sqlite.exec("INSERT INTO people(id,first_name,last_name,first_name_normalized,last_name_normalized,email,email_normalized,created_at,updated_at) VALUES('legacy','Legacy','Visitor','legacy','visitor','legacy@example.test','legacy@example.test','2026','2026'); INSERT INTO interest_submissions(id,person_id,idempotency_key,request_fingerprint,selected_opportunities_json,consent_at,created_at,updated_at) VALUES('legacy','legacy','legacy-key','legacy-fingerprint','[]','2026','2026','2026')");
  old.sqlite.exec(readFileSync(new URL('../migrations/0072_interest_referral_source.sql',import.meta.url),'utf8'));
  expect(old.sqlite.prepare('SELECT referral_source,referral_detail FROM interest_submissions').get()).toEqual({referral_source:null,referral_detail:null});
  expect(old.sqlite.prepare('SELECT * FROM contact_referrals').all()).toHaveLength(0);expect(old.sqlite.prepare('PRAGMA foreign_key_check').all()).toHaveLength(0);
  const f=await setup(),r=await f.submit({referralSource:'other',referralDetail:'Sample'});f.sqlite.prepare('DELETE FROM inquiry_workflows WHERE submission_id=?').run(r.submissionId);f.sqlite.prepare('DELETE FROM interests WHERE submission_id=?').run(r.submissionId);f.sqlite.prepare('DELETE FROM interest_submissions WHERE id=?').run(r.submissionId);expect(f.sqlite.prepare('SELECT * FROM contact_referrals').all()).toHaveLength(0);
});
