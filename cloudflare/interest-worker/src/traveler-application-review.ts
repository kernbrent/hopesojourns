import type {AdminEnv} from './admin';
type Row=Record<string,any>;
export function applicationIndicator(reviewStatus:string,rejectedAt?:unknown,stage?:unknown,applicationRejectedAt?:unknown){
 if(applicationRejectedAt)return 'Application rejected';
 if(rejectedAt)return 'Traveler rejected';
 if(stage==='withdrawn')return 'Traveler withdrawn';
 return reviewStatus==='approved'?'Reviewed and approved':reviewStatus==='reviewed'?'Reviewed — awaiting decision':'Received — awaiting review';
}
export async function travelerApplications(env:AdminEnv,personId?:string):Promise<Row[]>{
 const result=await env.DB.prepare(`SELECT a.id,a.trip_id,a.person_id,a.review_status,a.reviewed_at,a.rejected_at AS application_rejected_at,a.rejection_reason,a.submitted_at AS created_at,t.title AS trip_title,p.first_name||' '||p.last_name AS name,w.stage,w.rejected_at
 FROM traveler_applications a JOIN trips t ON t.id=a.trip_id JOIN people p ON p.id=a.person_id LEFT JOIN traveler_workflows w ON w.trip_id=a.trip_id AND w.person_id=a.person_id
 WHERE a.status='submitted' AND (? IS NULL OR a.person_id=?) ORDER BY a.submitted_at DESC,a.created_at DESC,a.id`).bind(personId??null,personId??null).all<Row>();
 return result.results.map(a=>({...a,indicator:applicationIndicator(a.review_status,a.rejected_at,a.stage,a.application_rejected_at),needsReview:!a.application_rejected_at&&a.review_status!=='approved'&&!a.rejected_at&&a.stage!=='withdrawn',action_url:'/admin/trips/?view=vetting&trip='+a.trip_id+'&traveler='+a.person_id}));
}
export function approveApplicationStatement(env:AdminEnv,tripId:string,personId:string,reviewerId:string,now:string){
 return env.DB.prepare("UPDATE traveler_applications SET review_status='approved',reviewed_at=?,reviewed_by=? WHERE trip_id=? AND person_id=? AND status='submitted' AND review_status!='approved' AND rejected_at IS NULL").bind(now,reviewerId,tripId,personId);
}
