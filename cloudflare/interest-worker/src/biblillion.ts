import {AdminError,adminJson,authenticate,auditStatement,readAdminJson,type AdminEnv} from './admin';
import {can} from './mmt-permissions';
import {QUESTIONS,BANK_VERSION,LEGACY_BANK_VERSION,PREVIOUS_BANK_VERSION,SUPPORTED_BANKS,BALANCED_BANK_VERSION,REWARD_BANKS,COMMON_BANKS} from '../../../preview/biblillion/content.js';
import {expectedDaily,dateKey} from '../../../preview/biblillion/engine.js';
import {ARRIVAL_TIERS} from '../../../preview/biblillion/rewards.js';
import {DESTINATIONS} from '../../../preview/biblillion/destinations.js';

const travelBonusSQL=`CASE WHEN result_count=7 AND bank_version IN (${REWARD_BANKS.map(v=>`'${v}'`).join(',')}) THEN CASE ${ARRIVAL_TIERS.map(t=>`WHEN base_points>=${t.min} THEN ${t.bonus}`).join(' ')} ELSE 0 END ELSE 0 END`;
const REPORTING_VERSION='2026-11-25.auto1',CONSENT='2026-11-25',UUID=/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const hash=async(text:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),n=>n.toString(16).padStart(2,'0')).join('');
function field(value:unknown,max:number,empty=false){if(typeof value!=='string'||value.length>max||(!empty&&!value.trim())||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))throw new AdminError(422,'INVALID_FIELD','Check the supplied fields.');return value.trim();}
function filters(url:URL){const days=Number(url.searchParams.get('days')||30),mode=url.searchParams.get('mode')||'all',destination=url.searchParams.get('destination')||'all';if(![7,30,90,365].includes(days)||!['all','daily','practice'].includes(mode)||destination!=='all'&&!DESTINATIONS.some(d=>d.id===destination))throw new AdminError(422,'FILTER','Choose a listed filter.');const now=new Date();now.setUTCDate(now.getUTCDate()-days+1);return {days,mode,destination,from:dateKey(now)};}
function where(f:ReturnType<typeof filters>,alias=''){const p=alias?alias+'.':'';return {sql:`${p}result_count>0 AND ${p}started_day>=? AND (?='all' OR ${p}mode=?) AND (?='all' OR ${p}destination_id=?)`,args:[f.from,f.mode,f.mode,f.destination,f.destination]};}
async function rate(request:Request,env:AdminEnv){const now=Date.now(),hour=Math.floor(now/3600000),key=await hash(`${env.ADMIN_SESSION_SECRET||'test-only'}:biblillion:${hour}:${request.headers.get('cf-connecting-ip')||'local'}`);await env.DB.prepare('DELETE FROM biblillion_limits WHERE expires_at<?').bind(now).run();const row=await env.DB.prepare('INSERT INTO biblillion_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key,(hour+1)*3600000).first<{count:number}>();if((row?.count||0)>500)throw new AdminError(429,'RATE_LIMIT','Please try sharing again later. Your local progress is safe.');}
export async function handleBiblillion(request:Request,env:AdminEnv,path:string):Promise<Response>{
 if(env.ENVIRONMENT!=='test')return adminJson({error:'Not found.'},404);
 try{
  if(path==='/public/biblillion/results'){
   if(request.method!=='POST')throw new AdminError(405,'METHOD','Use POST.');
   if(request.headers.get('origin')!==new URL(request.url).origin)throw new AdminError(403,'ORIGIN','Share results from this website.');
   const b=await readAdminJson(request,2048),keys=['id','roundId','bankVersion','roundDay','mode','destinationId','slot','questionId','answer','skipped','corrected','timedOut','reportingVersion','consent','consentVersion'];
   if(Object.keys(b).some(k=>!keys.includes(k)))throw new AdminError(422,'EXTRA_FIELD','Only anonymous game-result fields are accepted.');
   const automatic=b.reportingVersion!==undefined;
   if(automatic?(b.reportingVersion!==REPORTING_VERSION||'consent'in b||'consentVersion'in b):(b.consent!==true||b.consentVersion!==CONSENT))throw new AdminError(422,'REPORTING','Use a supported anonymous game report.');
   const id=field(b.id,36),roundId=field(b.roundId,36),version=field(b.bankVersion,40),day=field(b.roundDay,10),mode=field(b.mode,10),destination=field(b.destinationId,50),questionId=field(b.questionId,80);
   if(!UUID.test(id)||!UUID.test(roundId)||!SUPPORTED_BANKS.includes(version)||!['daily','practice'].includes(mode)||!DESTINATIONS.some(d=>d.id===destination)||!Number.isInteger(b.slot)||Number(b.slot)<0||Number(b.slot)>6||typeof b.skipped!=='boolean'||typeof b.corrected!=='boolean'||b.timedOut!==undefined&&typeof b.timedOut!=='boolean'||b.timedOut===true&&(!b.skipped||b.corrected))throw new AdminError(422,'RESULT','Check this game result.');
   const parsed=new Date(day+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==day||day<'2026-11-24'||day>dateKey(new Date(Date.now()+86400000)))throw new AdminError(422,'DAY','Invalid round date.');
   const question=QUESTIONS.find(q=>q.id===questionId),answer=question?.answers.find(a=>a.name===b.answer);
   if(!question||(COMMON_BANKS.includes(version)&&!question.active)||(!COMMON_BANKS.includes(version)&&!QUESTIONS.slice(0,version===LEGACY_BANK_VERSION?14:version===PREVIOUS_BANK_VERSION?210:286).includes(question))||(b.skipped?(b.answer!==null||b.corrected):!answer))throw new AdminError(422,'ANSWER','Use a reviewed answer or a skip.');
   if(mode==='daily'&&expectedDaily(day,version)[Number(b.slot)].id!==questionId)throw new AdminError(422,'SCHEDULE','This question does not belong in that daily slot.');
   const points=b.skipped?0:answer!.points,signature=await hash(JSON.stringify({roundId,version,day,mode,destination,slot:Number(b.slot),questionId,answer:b.skipped?null:answer!.name,skipped:b.skipped,corrected:b.corrected,points,...(automatic?{reportingVersion:REPORTING_VERSION}:{consent:CONSENT}),...(REWARD_BANKS.includes(version)?{timedOut:b.timedOut===true}:{})}));
   const prior=await env.DB.prepare('SELECT request_hash FROM biblillion_results WHERE id=?').bind(id).first<{request_hash:string}>();
   if(prior){if(prior.request_hash!==signature)throw new AdminError(409,'ID_REUSED','This result ID was already used.');return adminJson({accepted:true});}
   await rate(request,env);const now=new Date().toISOString(),today=dateKey();
   await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO biblillion_rounds(id,bank_version,round_day,mode,destination_id,started_day,first_shared_at,last_shared_at) VALUES(?,?,?,?,?,?,?,?)').bind(roundId,version,day,mode,destination,today,now,now),
    env.DB.prepare(`INSERT OR IGNORE INTO biblillion_results(id,request_hash,round_id,slot,question_id,answer,skipped,corrected,points,received_at,timed_out) SELECT ?,?,id,?,?,?,?,?,?,?,? FROM biblillion_rounds WHERE id=? AND bank_version=? AND round_day=? AND mode=? AND destination_id=? AND (recorded_slots & (1 << ?))=0`).bind(id,signature,Number(b.slot),questionId,b.skipped?null:answer!.name,b.skipped?1:0,b.corrected?1:0,points,now,b.timedOut===true?1:0,roundId,version,day,mode,destination,Number(b.slot)),
    env.DB.prepare('DELETE FROM biblillion_results WHERE received_at<?').bind(new Date(Date.now()-180*86400000).toISOString()),
   ]);
   const saved=await env.DB.prepare('SELECT request_hash FROM biblillion_results WHERE id=?').bind(id).first<{request_hash:string}>();if(saved?.request_hash!==signature)throw new AdminError(409,'ROUND_CONFLICT','That round slot or destination was already recorded.');
   return adminJson({accepted:true},201);
  }
  const write=request.method!=='GET',session=await authenticate(request,env,write);if(!can(session.user,'contacts',write))throw new AdminError(403,'ACCESS_DENIED','Contacts access is required.');
  if(path==='/admin/biblillion'&&request.method==='GET'){
   const f=filters(new URL(request.url)),w=where(f),answers=await env.DB.prepare(`SELECT question_id,answer_key,corrected,sum(total) total,sum(points) points FROM biblillion_answer_counts WHERE day>=? AND (?='all' OR mode=?) AND (?='all' OR destination_id=?) GROUP BY question_id,answer_key,corrected`).bind(...w.args).all();
   const summary=await env.DB.prepare(`SELECT count(*) rounds,coalesce(sum(timeouts),0) timeouts,coalesce(sum(${travelBonusSQL}),0) travel_bonus,coalesce(sum(result_count),0) shared_answers,coalesce(sum(stamps),0) stamps,coalesce(sum(base_points),0) base_points,coalesce(sum(CASE WHEN result_count=7 THEN 1 ELSE 0 END),0) completed,coalesce(sum(CASE WHEN result_count=7 AND stamps=7 THEN 1 ELSE 0 END),0) passports FROM biblillion_rounds WHERE ${w.sql}`).bind(...w.args).first();
   const trend=await env.DB.prepare(`SELECT started_day day,count(*) rounds,sum(result_count) answers,sum(stamps) stamps,sum(base_points) base_points,sum((CASE WHEN result_count=7 AND stamps=7 THEN 150 ELSE 0 END)+(${travelBonusSQL})) bonus FROM biblillion_rounds WHERE ${w.sql} GROUP BY started_day ORDER BY started_day`).bind(...w.args).all();
   const destinations=await env.DB.prepare(`SELECT destination_id,count(*) rounds,sum(stamps) stamps,sum(CASE WHEN result_count=7 AND stamps=7 THEN 1 ELSE 0 END) passports FROM biblillion_rounds WHERE ${w.sql} GROUP BY destination_id`).bind(...w.args).all();
   const rounds=await env.DB.prepare(`SELECT * FROM biblillion_rounds WHERE ${w.sql} ORDER BY first_shared_at DESC,id LIMIT 50`).bind(...w.args).all();
   const recentResults=await env.DB.prepare(`SELECT round_id,slot,question_id,answer,skipped,corrected,timed_out,points FROM biblillion_results WHERE round_id IN (SELECT id FROM biblillion_rounds WHERE ${w.sql} ORDER BY first_shared_at DESC,id LIMIT 50) ORDER BY round_id,slot`).bind(...w.args).all();
   const drafts=await env.DB.prepare('SELECT * FROM biblillion_devotional_drafts ORDER BY updated_at DESC,id LIMIT 50').all();
   return adminJson({bankVersion:BANK_VERSION,arrivalTiers:ARRIVAL_TIERS,rewardBanks:REWARD_BANKS,questions:QUESTIONS,destinations:DESTINATIONS,filters:f,summary,trend:trend.results,destinationCounts:destinations.results,answerCounts:answers.results,rounds:rounds.results,recentResults:recentResults.results,drafts:drafts.results,canEdit:can(session.user,'contacts',true)});
  }
  if(path==='/admin/biblillion/drafts'&&request.method==='POST'){
   const b=await readAdminJson(request,18000),id=field(b.id,36),qid=field(b.questionId,80);if(!UUID.test(id)||!QUESTIONS.some(q=>q.id===qid))throw new AdminError(422,'DRAFT','Choose a listed question.');
   const destination=b.destinationId?field(b.destinationId,50):null;if(destination&&!DESTINATIONS.some(d=>d.id===destination))throw new AdminError(422,'DESTINATION','Choose a listed destination.');
   const title=field(b.title,160),ref=field(b.scriptureRef,500),reflection=field(b.reflection,6000,true),prayer=field(b.prayer,1800,true),practice=field(b.practice,1800,true),now=new Date().toISOString();
   await env.DB.batch([env.DB.prepare('INSERT INTO biblillion_devotional_drafts(id,question_id,destination_id,title,scripture_ref,reflection,prayer,practice,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,scripture_ref=excluded.scripture_ref,reflection=excluded.reflection,prayer=excluded.prayer,practice=excluded.practice,updated_at=excluded.updated_at WHERE biblillion_devotional_drafts.question_id=excluded.question_id AND biblillion_devotional_drafts.destination_id IS excluded.destination_id').bind(id,qid,destination,title,ref,reflection,prayer,practice,session.user!.id,now,now),auditStatement(env,'biblillion_devotional',id,'saved_draft',{questionId:qid})]);
   const saved=await env.DB.prepare('SELECT question_id,destination_id FROM biblillion_devotional_drafts WHERE id=?').bind(id).first<{question_id:string;destination_id:string|null}>();if(saved?.question_id!==qid||saved.destination_id!==destination)throw new AdminError(409,'DRAFT_CONFLICT','This draft ID belongs to another question or destination.');
   return adminJson({saved:true,id});
  }
  throw new AdminError(404,'NOT_FOUND','Not found.');
 }catch(e){if(e instanceof AdminError)return adminJson({error:e.message,code:e.code},e.status);console.error('Biblillion request failed');return adminJson({error:'Biblillion results are temporarily unavailable. Local game progress is safe.'},503);}
}
