import {edition,shuffledIds,findQuestion,publicQuestion,feedbackFor,scoreAnswers} from './trivia-questions.mjs';
export async function handleTrivia(request,db,auth,url,{json,body,text,requireValue,rateLimit}) {
 const path=url.pathname,method=request.method;
 if(!path.startsWith('/api/trivia'))return null;
 requireValue(auth.access_level!=='provisional','Admin approval is required for this feature.',403);
 const active="EXISTS(SELECT 1 FROM users WHERE id=? AND status='active' AND access_level='full')";
 const ranked=async round=>await db.prepare('SELECT score,attempt_id FROM trivia_results WHERE user_id=? AND edition=? AND round=?').bind(auth.id,edition,round).first();
 async function present(row) {
  const state=JSON.parse(row.state),result=row.completed_at?await ranked(row.round):null;
  return {id:row.id,round:row.round,total:10,answered:state.answers.length,completed:!!row.completed_at,
   question:row.completed_at?null:publicQuestion(state.order[state.answers.length]),
   feedback:state.answers.length?feedbackFor(state.answers.at(-1).question_id,state.answers.at(-1).choices):null,
   ...(row.completed_at?{score:scoreAnswers(state.answers),ranked:result?.attempt_id===row.id}:{}),expires_at:row.expires_at};
 }
 if(path==='/api/trivia'&&method==='GET') {
  const {results}=await db.prepare('SELECT round,score FROM trivia_results WHERE user_id=? AND edition=? ORDER BY round').bind(auth.id,edition).all();
  const {results:attempts}=await db.prepare('SELECT id,round,revision FROM trivia_attempts WHERE user_id=? AND edition=? AND completed_at IS NULL AND expires_at>? ORDER BY expires_at DESC').bind(auth.id,edition,Date.now()).all();
  return json({edition,results,attempts});
 }
 if(path==='/api/trivia/leaderboard'&&method==='GET') {
  const round=Number(url.searchParams.get('round'));requireValue([1,2].includes(round),'Choose round 1 or 2.');
  const {results}=await db.prepare(`SELECT r.display_name,r.score,r.user_id FROM trivia_results r JOIN users u ON u.id=r.user_id WHERE r.edition=? AND r.round=? AND u.status='active' AND u.access_level='full' ORDER BY r.score DESC,r.completed_at,r.attempt_id LIMIT 100`).bind(edition,round).all();
  let rank=0,previous;return json({round,items:results.map((r,i)=>{if(r.score!==previous)rank=i+1;previous=r.score;return {rank,name:r.display_name,score:r.score,you:r.user_id===auth.id};})});
 }
 if(path==='/api/trivia/start'&&method==='POST') {
  const data=await body(request),round=Number(data.round);requireValue([1,2].includes(round),'Choose round 1 or 2.');
  if(round===2)requireValue(await ranked(1),'Complete round 1 before starting round 2.',409);
  const name=text(data.display_name,40,'Leaderboard display name');
  await rateLimit(db,`trivia-start:${auth.id}`,20);
  const time=Date.now(),row={id:crypto.randomUUID(),user_id:auth.id,edition,round,display_name:name,state:JSON.stringify({order:shuffledIds(round),answers:[]}),revision:0,expires_at:time+86400000};
  await db.batch([
   db.prepare('DELETE FROM trivia_attempts WHERE user_id=? AND (expires_at<=? OR completed_at IS NULL)').bind(auth.id,time),
   db.prepare(`INSERT INTO trivia_attempts(id,user_id,edition,round,display_name,state,revision,expires_at) SELECT ?,?,?,?,?,?,0,? WHERE ${active}`).bind(row.id,auth.id,edition,round,name,row.state,row.expires_at,auth.id)
  ]);
  requireValue(await db.prepare('SELECT id FROM trivia_attempts WHERE id=?').bind(row.id).first(),'Your account is no longer available.',401);
  return json({...await present(row),practice:!!await ranked(round)});
 }
 const match=/^\/api\/trivia\/attempts\/([^/]+)(?:\/(answer|abandon))?$/.exec(path);
 if(!match)return null;
 const row=await db.prepare('SELECT * FROM trivia_attempts WHERE id=? AND user_id=? AND edition=? AND expires_at>?').bind(match[1],auth.id,edition,Date.now()).first();
 requireValue(row,'This round is no longer available. Start a new round; unfinished rounds receive no score.',404);
 if(!match[2]&&method==='GET')return json(await present(row));
 if(match[2]==='abandon'&&method==='POST') {
  requireValue(!row.completed_at,'This round is already complete.',409);
  await db.prepare('DELETE FROM trivia_attempts WHERE id=? AND user_id=? AND completed_at IS NULL').bind(row.id,auth.id).run();return json({ok:true});
 }
 if(match[2]==='answer'&&method==='POST') {
  const data=await body(request),state=JSON.parse(row.state);
  const prior=state.answers.find(a=>a.question_id===data.question_id);
  if(prior) {
   requireValue(data.choices&&Object.keys(data.choices).length===Object.keys(prior.choices).length&&Object.keys(prior.choices).every(k=>prior.choices[k]===data.choices[k]),'This answer was already submitted. Refresh the round.',409);
   return json(await present(row));
  }
  requireValue(!row.completed_at,'This round is already complete.',409);
  requireValue(data.question_id===state.order[state.answers.length],'Answer the current question. Refresh the round.',409);
  const q=findQuestion(data.question_id),choices=data.choices;
  requireValue(choices&&typeof choices==='object'&&!Array.isArray(choices)&&Object.keys(choices).length===q.parts.length&&q.parts.every(p=>p.choices.some(c=>c.id===choices[p.id])),'Choose one answer for each part.');
  state.answers.push({question_id:q.id,choices:Object.fromEntries(q.parts.map(p=>[p.id,choices[p.id]]))});
  const complete=state.answers.length===10,time=Date.now(),serialized=JSON.stringify(state);
  const statements=[db.prepare(`UPDATE trivia_attempts SET state=?,revision=revision+1,completed_at=? WHERE id=? AND user_id=? AND revision=? AND completed_at IS NULL AND expires_at>? AND ${active}`).bind(serialized,complete?time:null,row.id,auth.id,row.revision,time,auth.id)];
  if(complete)statements.push(db.prepare(`INSERT OR IGNORE INTO trivia_results(attempt_id,user_id,edition,round,display_name,score,completed_at) SELECT id,user_id,edition,round,display_name,?,completed_at FROM trivia_attempts WHERE id=? AND user_id=? AND revision=? AND state=? AND completed_at=? AND ${active}`).bind(scoreAnswers(state.answers),row.id,auth.id,row.revision+1,serialized,time,auth.id));
  const results=await db.batch(statements);requireValue(results[0].meta.changes===1,'The round changed in another tab. Refresh the round.',409);
  return json(await present({...row,state:serialized,completed_at:complete?time:null}));
 }
 return null;
}
