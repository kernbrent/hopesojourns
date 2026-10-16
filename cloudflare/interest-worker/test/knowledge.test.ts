import {expect,it,vi,afterEach} from 'vitest';
import {ministryFixture} from './ministry-fixture';
import {handleKnowledge,seedKnowledge,reserveKnowledgeUsage,cleanupKnowledge,type KnowledgeEnv} from '../src/knowledge';
import {knowledgeCan,topicFor,topicSeeds,safeKnowledgeUrl} from '../src/knowledge-policy';
import {actorContext} from '../src/mmt-permissions';
afterEach(()=>vi.unstubAllGlobals());
async function setup(){const f=await ministryFixture();await seedKnowledge(f.env);const visitor=crypto.randomUUID(),conversation=crypto.randomUUID();
 const admin=(path:string,b?:unknown,method?:string)=>handleKnowledge(f.request('/admin/knowledge'+path,b,method),f.env,'/admin/knowledge'+path);
 const call=(path:string,b?:unknown,method?:string,owner=visitor)=>handleKnowledge(new Request('http://localhost:4188/api/interest/public/knowledge'+path,{method:method||(b?'POST':'GET'),headers:{'Content-Type':'application/json','X-Knowledge-Visitor':owner},body:b?JSON.stringify(b):undefined}),f.env,'/public/knowledge'+path.split('?')[0]);
 const ask=(question:string)=>call('/ask',{question,conversation,context:'/internships/'});
 return {...f,admin,call,ask,visitor,conversation};}
async function json(r:Response){return r.json() as Promise<any>;}
it('serves only reviewed, published FAQ entries, with original evidence and honest unknowns',async()=>{
 const f=await setup();const d=await json(await f.call('/faqs'));expect(d.faqs).toHaveLength(2);expect(d.faqs[0].citations[0].url).toBe('/internships/');
 const answer=await json(await f.ask('What support do interns receive?'));expect(answer.mode).toBe('curated');expect(answer.answer).toContain('weekly');
 const unknown=await json(await f.ask('What are the guaranteed exact costs and bed dimensions?'));expect(unknown.answer).toContain('Brent');expect(unknown.citations).toHaveLength(0);
 expect(f.sqlite.prepare('SELECT COUNT(*) n FROM knowledge_candidates WHERE status=?').get('follow_up')!.n).toBe(1);
});
it('shows approved source extracts without pretending a model answered or creating evidence from mock data',async()=>{
 const f=await setup();const d=await json(await f.ask('How do I prepare before leaving?'));expect(d.mode).toBe('source_excerpts');expect(d.answer).toContain('Live AI is currently off');expect(d.followUp).toBe(true);
 expect(JSON.stringify(await json(await f.call('/faqs')))).not.toContain('fictional');
});
it('keeps feedback private and requires distinct review and publication decisions',async()=>{
 const f=await setup(),q=await json(await f.ask('What support do interns receive?'));
 expect((await f.call('/feedback',{id:q.id,helpful:true,comment:'Thanks'})).status).toBe(200);
 let c=(await json(await f.admin('/queue'))).candidates.find((c:any)=>c.id===q.id);expect(c.published).toBe(0);expect(c.reuse_approved).toBe(0);
 expect((await f.admin('/decision',{id:c.id,revision:c.revision,action:'publish'})).status).toBe(422);
 expect((await f.admin('/decision',{id:c.id,revision:c.revision,action:'approve',verified:true})).status).toBe(200);
 c=(await json(await f.admin('/queue'))).candidates.find((c:any)=>c.id===q.id);expect(c.published).toBe(0);
 expect((await f.admin('/decision',{id:c.id,revision:c.revision,action:'publish'})).status).toBe(200);
});
it('enforces current evidence, visibility, corrections, and stale review guards',async()=>{
 const f=await setup();const before=(await json(await f.admin('/sources'))).sources.find((s:any)=>s.id==='supervision');
 expect((await f.admin('/sources',{...before,status:'withdrawn',verified:true,segments:[]})).status).toBe(200);
 expect((await json(await f.call('/faqs'))).faqs).toHaveLength(1);
 expect(f.sqlite.prepare('SELECT reuse_approved,published,status FROM knowledge_candidates WHERE id=?').get('starter-supervision')).toMatchObject({reuse_approved:0,published:0,status:'needs_evidence'});
 expect((await f.admin('/sources',{...before,verified:true,segments:[]})).status).toBe(409);
 expect((await f.admin('/decision',{id:'starter-supervision',revision:1,action:'publish'})).status).toBe(409);
 const q=await json(await f.ask('What support do interns receive?'));expect(q.mode).not.toBe('curated');
});
it('blocks transcript approval without full segments or human verification',async()=>{
 const f=await setup(),s={title:'Interview',url:'/trip/?trip=england-october-2026',kind:'video',status:'approved',body:'A guessed summary',provenance:'Original video'};
 expect((await f.admin('/sources',s)).status).toBe(422);
 expect((await f.admin('/sources',{...s,verified:true})).status).toBe(422);
 const r=await json(await f.admin('/sources',{...s,verified:true,segments:[{start:0,end:10,text:'Reviewed spoken words.'}]}));
 const saved=f.sqlite.prepare('SELECT body,segments_json FROM knowledge_sources WHERE id=?').get(r.id)!;expect(saved.body).toBe('Reviewed spoken words.');
});
it('retrieves relevant late transcript passages and cites their exact timestamp',async()=>{
 const f=await setup();await f.admin('/sources',{title:'Ministry interview',url:'/trip/?trip=england-october-2026',kind:'video',status:'approved',provenance:'Complete interview reviewed',verified:true,segments:[{start:0,end:30,text:'Welcome to our interview.'},{start:960,end:1000,text:'The community pantry distributes cereal and canned goods.'}]});
 const d=await json(await f.ask('What does the community pantry distribute?'));expect(d.answer).toContain('cereal and canned goods');expect(d.citations[0]).toMatchObject({start:960,end:1000});expect(d.citations[0].url).toContain('#t=960');
});
it('requires server-side granular knowledge rights and CSRF, even if navigation is bypassed',async()=>{
 const f=await setup();f.sqlite.exec(`INSERT INTO mmt_users(id,username,first_name,last_name,email,is_org_admin,is_admin,password_hash,registered_at,updated_at) VALUES('other-admin','other-admin','Other','Admin','admin@example.test',1,1,'configured','2026','2026')`);f.sqlite.prepare("UPDATE mmt_users SET is_admin=0,is_org_admin=0,permissions_json=? WHERE id='primary'").run(JSON.stringify({'knowledge.view_analytics':'read'}));
 expect((await f.admin('/queue')).status).toBe(403);expect((await f.admin('/sources')).status).toBe(403);expect((await f.admin('/analytics')).status).toBe(200);
 expect((await f.admin('/decision',{id:'starter-matching',revision:1,action:'publish'})).status).toBe(403);
 const r=new Request(f.request('/admin/knowledge/sources',{title:'x'}),{headers:{'content-type':'application/json',cookie:'hs_admin_session='+f.token}});
 expect((await handleKnowledge(r,f.env,'/admin/knowledge/sources')).status).toBe(403);
 expect(await actorContext.run({portal:'csm'},()=>knowledgeCan({is_admin:1} as any,'manage_sources'))).toBe(false);
});
it('does not leak raw conversations or let another visitor rate or delete them',async()=>{
 const f=await setup(),q=await json(await f.ask('What support do interns receive?')),other=crypto.randomUUID();
 expect((await f.call('/feedback',{id:q.id,helpful:true},undefined,other)).status).toBe(404);
 await f.call('/conversation',undefined,'DELETE',other);expect(f.sqlite.prepare('SELECT id FROM knowledge_questions WHERE id=?').get(q.id)).toBeTruthy();
 await f.call('/feedback',{id:q.id,helpful:true});await f.call('/conversation',undefined,'DELETE');
 expect(f.sqlite.prepare('SELECT id FROM knowledge_questions WHERE id=?').get(q.id)).toBeUndefined();expect(f.sqlite.prepare('SELECT id FROM knowledge_candidates WHERE id=?').get(q.id)).toBeUndefined();
 expect(JSON.stringify(await json(await f.call('/faqs')))).not.toContain(f.visitor);
});
it('counts distinct visitors by topic, supports reviewer merge and split, and prioritizes relevance',async()=>{
 const f=await setup();await f.ask('What support do interns receive?');await f.ask('What support do interns receive?');
 const other=crypto.randomUUID();await f.call('/ask',{question:'What support do interns receive?',conversation:crypto.randomUUID(),context:''},undefined,other);
 const d=await json(await f.call('/faqs'));expect(d.faqs.find((f:any)=>f.topicId==='supervision')).toMatchObject({visitors:2,questions:3});
 expect((await json(await f.call('/faqs?q=match'))).faqs[0].topicId).toBe('matching');
 await f.admin('/topics',{action:'merge',from:'supervision',into:'matching'});
 expect((await json(await f.admin('/analytics'))).topics.find((t:any)=>t.id==='matching')).toMatchObject({visitors:2,questions:3});
 expect(topicFor('Are the mattresses comfortable?',topicSeeds.map(([id,label,aliases])=>({id,label,aliases})))).toBe('bedding');
 expect(topicFor('Are the beds comfortable?',topicSeeds.map(([id,label,aliases])=>({id,label,aliases})))).toBe('bedding');
});
it('expires raw records and unreviewed candidates after 30 days without deleting curated answers',async()=>{
 const f=await setup(),q=await json(await f.ask('An unanswered unique question'));f.sqlite.prepare("UPDATE knowledge_questions SET created_at='2020-01-01' WHERE id=?").run(q.id);f.sqlite.prepare("UPDATE knowledge_candidates SET created_at='2020-01-01' WHERE id=?").run(q.id);
 await cleanupKnowledge(f.env);expect(f.sqlite.prepare('SELECT id FROM knowledge_questions').get()).toBeUndefined();expect(f.sqlite.prepare('SELECT COUNT(*) n FROM knowledge_candidates').get()!.n).toBe(2);expect(f.sqlite.prepare('SELECT COUNT(*) n FROM knowledge_events').get()!.n).toBe(1);
});
it('enforces public rate limits, rejects unsafe source URLs and personal details in approval',async()=>{
 const f=await setup();for(let i=0;i<5;i++)expect((await f.ask('Question '+i)).status).toBe(200);expect((await f.ask('Question six')).status).toBe(429);
 for(const value of ['//evil.test','/admin/','/api/interest/portal/trips/x','/trip/?email=private@example.com','/\\evil'])expect(safeKnowledgeUrl(value)).toBe(false);
});
it('fails closed for paid processing and atomically reserves daily and monthly limits',async()=>{
 const f=await setup();await expect(reserveKnowledgeUsage(f.env,'answer',20000)).rejects.toMatchObject({code:'AI_DISABLED'});
 const env={...f.env,OPENAI_API_KEY:'test-not-real',KNOWLEDGE_AI_ENABLED:'true',KNOWLEDGE_DAILY_USD:'0.02',KNOWLEDGE_MONTHLY_USD:'0.02'} as KnowledgeEnv;
 await reserveKnowledgeUsage(env,'answer',20000);await expect(reserveKnowledgeUsage(env,'answer',20000)).rejects.toMatchObject({code:'USAGE_LIMIT'});
 expect(f.sqlite.prepare('SELECT SUM(units) n FROM knowledge_usage').get()!.n).toBe(20000);
});
