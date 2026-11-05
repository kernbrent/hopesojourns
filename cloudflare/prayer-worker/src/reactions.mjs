import {resourceAccess} from './resource-access.mjs';
const types={posts:{table:'post_hearts',key:'post_id',count:'heart_count',mine:'hearted',verb:'heart'},resources:{table:'resource_thumbs',key:'resource_id',count:'thumb_count',mine:'thumbed',verb:'thumb'}};
// Only decorate rows already authorized by the caller; never return reactor identities.
export async function decorateReactions(db,rows,type,userId) {
 const spec=types[type],ids=[...new Set(rows.map(row=>row.post_id||row.id))];
 if(!ids.length) return rows;
 const totals=(await db.prepare(`SELECT ${spec.key} id,count(*) total,max(user_id=?) mine FROM ${spec.table} WHERE ${spec.key} IN (${ids.map(()=>'?').join(',')}) GROUP BY ${spec.key}`).bind(userId,...ids).all()).results;
 const lookup=new Map(totals.map(row=>[row.id,row]));
 for(const row of rows) {const total=lookup.get(row.post_id||row.id);row[spec.count]=total?.total||0;row[spec.mine]=!!total?.mine;}
 return rows;
}
export async function handleReaction(request,db,auth,url,h) {
 const match=/^\/api\/(posts|resources)\/([^/]+)\/(heart|thumb)$/.exec(url.pathname);
 if(!match || request.method!=='POST') return null;
 const [,type,id,verb]=match,spec=types[type];
 h.requireValue(verb===spec.verb,'Reaction unavailable.',404);
 h.requireValue(auth.access_level!=='provisional','Admin approval is required to react.',403);
 const data=await h.body(request);h.requireValue(typeof data.active==='boolean','Choose whether to add this reaction.');
 await h.rateLimit(db,`reaction:${auth.id}`,120);
 const resource=type==='resources',access=resource?resourceAccess(auth):{sql:h.visibility,args:h.visibleArgs(auth)};
 const target=resource?'resources r':'posts p',alias=resource?'r':'p';
 // Recheck live account authority and demographic values in the mutation itself.
 const live="EXISTS(SELECT 1 FROM users actor WHERE actor.id=? AND actor.status='active' AND actor.access_level='full' AND actor.role=? AND actor.gender=? AND coalesce(actor.birth_date,'')=?)";
 const args=[id,...access.args,auth.id,auth.role,auth.gender||'',auth.birth_date||''];
 const where=`${alias}.id=? AND (${access.sql}) AND ${live}`;
 if(data.active) await db.prepare(`INSERT OR IGNORE INTO ${spec.table} (${spec.key},user_id,created_at) SELECT ${alias}.id,?,? FROM ${target} WHERE ${where}`).bind(auth.id,Date.now(),...args).run();
 else await db.prepare(`DELETE FROM ${spec.table} WHERE ${spec.key}=? AND user_id=? AND EXISTS(SELECT 1 FROM ${target} WHERE ${where})`).bind(id,auth.id,...args).run();
 const row=await db.prepare(`SELECT ${alias}.id FROM ${target} WHERE ${where}`).bind(...args).first();
 h.requireValue(row,'Item unavailable.',404);
 await decorateReactions(db,[row],type,auth.id);
 return h.json({count:row[spec.count],active:row[spec.mine]});
}
