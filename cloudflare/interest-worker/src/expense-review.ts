import {AdminError, adminJson, type AdminEnv} from './admin';

export const expensePurposes = ['operations','outreach','trip','ministry_support'];
export const plannedTripStatuses = ['draft','recruiting','confirmed','full'];

// Version both source and review so an old dialog cannot overwrite a newer decision.
export async function reviewSnapshot(env:AdminEnv,id:string) {
 const row=await env.DB.prepare(`SELECT l.*,r.expense_purpose,r.trip_id AS review_trip_id,
 r.updated_at AS review_updated_at FROM ledger_entries l LEFT JOIN finance_review r ON r.ledger_id=l.id WHERE l.id=?`).bind(id).first<any>();
 if(!row)throw new AdminError(404,'NOT_FOUND','This record no longer exists.');
 return row;
}
export function checkReviewVersion(row:any,body:Record<string,unknown>) {
 if(body.updated_at!==row.updated_at || (body.review_updated_at??null)!==(row.review_updated_at??null))
  throw new AdminError(409,'STALE_REVIEW','This transaction changed. Close this window, refresh, and review it again.');
}
export async function expensePurpose(env:AdminEnv,row:any,body:Record<string,unknown>,trip:string|null) {
 const value=body.expense_purpose===undefined?row.expense_purpose:body.expense_purpose||null;
 if(value!==null && !expensePurposes.includes(value))throw new AdminError(422,'INVALID_PURPOSE','Choose an expense purpose.');
 if(row.entry_type!=='expense' && value)throw new AdminError(422,'INVALID_PURPOSE','Expense purpose only applies to expenses.');
 if(row.entry_type==='expense' && trip && value!=='trip' && trip!==(row.review_trip_id||row.trip_id))
  throw new AdminError(422,'PLANNED_TRIP_REQUIRED','Choose Trip expenses and a planned trip.');
 if(value==='trip') {
  const target=trip?await env.DB.prepare('SELECT status FROM trips WHERE id=?').bind(trip).first<{status:string}>():null;
  const unchanged=row.expense_purpose==='trip' && row.review_trip_id===trip;
  if(!target || (!unchanged && !plannedTripStatuses.includes(target.status)))throw new AdminError(422,'PLANNED_TRIP_REQUIRED','Choose a planned trip for this expense.');
 } else if(value && trip)throw new AdminError(422,'PURPOSE_TRIP_CONFLICT','Choose Trip expenses to link this expense to a trip.');
 if(value && row.trip_id && (value!=='trip'||trip!==row.trip_id))throw new AdminError(409,'SOURCE_TRIP_LOCKED','This expense belongs to a trip record. Keep its original trip and use the trip workspace for corrections.');
 return value;
}
export async function reclassifyTransfer(env:AdminEnv,id:string,body:Record<string,unknown>,actorId:string) {
 const row=await reviewSnapshot(env,id);checkReviewVersion(row,body);
 const reason=typeof body.reason==='string'?body.reason.trim():'';
 if(body.confirm!==true||!reason||reason.length>2000)throw new AdminError(422,'TRANSFER_REASON_REQUIRED','Confirm this is a transfer of existing funds and explain the correction.');
 if(row.entry_type!=='expense'||row.accounting_class!=='operating'||row.trip_id||row.trip_account_id||row.charitable_amount>0)
  throw new AdminError(409,'TRANSFER_NOT_ALLOWED','Only an operating expense without a source trip or charitable gift can be reclassified here.');
 const now=new Date().toISOString();
 const results=await env.DB.batch([
  env.DB.prepare(`UPDATE ledger_entries SET accounting_class='internal_transfer',updated_at=? WHERE id=? AND updated_at=?
   AND accounting_class='operating' AND entry_type='expense' AND trip_id IS NULL AND trip_account_id IS NULL AND charitable_amount=0
   AND COALESCE((SELECT updated_at FROM finance_review WHERE ledger_id=?),'')=?`).bind(now,id,row.updated_at,id,row.review_updated_at||''),
  env.DB.prepare(`INSERT INTO audit_events(id,entity_type,entity_id,event_type,metadata_json,created_at,actor_user_id)
   SELECT ?,'ledger_entry',?,'reclassified_as_transfer',?,?,? WHERE changes()=1`).bind(crypto.randomUUID(),id,JSON.stringify({reason,before:row,after:{accounting_class:'internal_transfer'},reviewFlagsPreserved:true}),now,actorId)
 ]);
 if(!results[0].meta.changes)throw new AdminError(409,'STALE_REVIEW','This transaction changed. Refresh and try again.');
 return adminJson({ok:true});
}
