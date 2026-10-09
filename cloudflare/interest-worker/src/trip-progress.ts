import {type AdminEnv} from './admin';

export function tripDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const value = (type:string) => parts.find(p=>p.type===type)!.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

// Keep the existing stored "traveling" value compatible with imports and history.
// Draft, canceled, archived, completed, and already-ended trips never auto-start.
export async function startDueTrips(env:AdminEnv, now = new Date()) {
  const day=tripDay(now), stamp=now.toISOString();
  const eligible="status IN ('recruiting','confirmed','full') AND start_date IS NOT NULL AND start_date<=? AND (end_date>=? OR (end_date IS NULL AND start_date=?))";
  const results=await env.DB.batch([
    env.DB.prepare(`INSERT INTO audit_events(id,entity_type,entity_id,event_type,metadata_json,created_at)
      SELECT lower(hex(randomblob(16))),'trip',id,'automatically_started',?,? FROM trips WHERE ${eligible}`)
      .bind(JSON.stringify({status:'traveling',timeZone:'America/Chicago'}),stamp,day,day,day),
    env.DB.prepare(`UPDATE trips SET status='traveling',public_enabled=1,portal_enabled=CASE WHEN portal_password_hash IS NOT NULL AND portal_login_id IS NOT NULL THEN 1 ELSE portal_enabled END,updated_at=? WHERE ${eligible}`).bind(stamp,day,day,day),
  ]);
  return results[1].meta.changes;
}
