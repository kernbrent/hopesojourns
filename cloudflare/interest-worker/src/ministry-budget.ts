import { AdminError, type AdminEnv } from './admin';

export const STANDARD_BUDGET = [
  ['airfare','Airfare','traveler',1], ['ground','Ground transportation','traveler',1],
  ['lodging','Lodging','traveler',1], ['meals','Meals','traveler',1],
  ['insurance','Travel insurance','traveler',1], ['visas','Visas and government fees','traveler',1],
  ['supplies','Supplies','traveler',0], ['ministry-donation','Local ministry gift','ministry',0],
  ['hs-admin','HS Trip Leadership & Administration Fee','hs',0],
  ['hs-leadership','HS Travel contribution','hs',0],
  ['contingency','Contingency','traveler',0],
] as const;
export const cents = (n: number) => Math.round(n * 100);
export const dollars = (n: number) => Math.round(n) / 100;

export function standardTripStatements(env: AdminEnv, tripId: string, start: string | null, end: string | null, now: string): D1PreparedStatement[] {
  const statements = STANDARD_BUDGET.map(([key,title,group,eligible]) => env.DB.prepare(`INSERT INTO trip_cost_items
    (id,trip_id,category_id,description,expense_scope,quantity,estimated_unit_cost,estimated_total,actual_total,
     settlement_route,payment_status,calculation_method,percentage_rate,budget_group,travel_eligible,needs_estimate,template_key,created_at,updated_at)
    VALUES (?1,?2,?3,?4,'individual',1,0,0,0,'through_hs','planned',?5,?6,?7,?8,?9,?10,?11,?11)`)
    .bind(crypto.randomUUID(),tripId,'category-'+key,title,key==='hs-leadership'?'percentage_of_individual':'per_traveler',key==='hs-leadership'?10:null,group,eligible,key==='hs-leadership'?0:1,key,now));
  const addContent = (type: string,title: string,body: string,date: string|null,order: number) => statements.push(env.DB.prepare(`INSERT INTO trip_content
    (id,trip_id,content_type,title,content,event_date,visibility,publication_status,sort_order,created_at,updated_at)
    VALUES (?1,?2,?3,?4,?5,?6,'travelers','draft',?7,?8,?8)`).bind(crypto.randomUUID(),tripId,type,title,body,date,order,now));
  statements.push(env.DB.prepare(`INSERT INTO trip_cost_items(id,trip_id,category_id,description,expense_scope,quantity,estimated_unit_cost,estimated_total,actual_total,settlement_route,payment_status,calculation_method,budget_group,needs_estimate,template_key,bill_to_traveler,created_at,updated_at)
    VALUES(?1,?2,'category-hs-leadership','HS leader travel expense','trip',1,0,0,0,'through_hs','planned','fixed','hs',1,'hs-leader-expense',0,?3,?3)`).bind(crypto.randomUUID(),tripId,now));
  addContent('instruction','Welcome and preparation','Review the trip purpose, preparation meetings, packing list, and emergency contacts.',null,0);
  addContent('resource','Packing list','Add destination-specific clothing, documents, medicines, and ministry supplies.',null,1);
  const days = start && end ? Math.round((Date.parse(end)-Date.parse(start))/86400000)+1 : 0;
  if (days>90) throw new AdminError(422,'TRIP_TOO_LONG','Use a trip of up to 90 days for automatic daily drafts.');
  for(let i=0;i<days;i++) {
    const day=new Date(Date.parse(start!)+i*86400000).toISOString().slice(0,10);
    addContent('devotional',`Day ${i+1} devotional`,'Scripture:\n\nReflection:\n\nDiscussion:\n\nPrayer:',day,i);
    addContent('itinerary',`Day ${i+1} itinerary`,'Add the high-level plan for this day. Review before publishing.',day,i);
  }
  return statements;
}

export type BudgetLine = {id:string; description:string; estimated_total:number; calculation_method:string; estimated_unit_cost:number; quantity:number; template_key:string|null; needs_estimate:number; payment_status:string; budget_group:string; travel_eligible:number; category_id:string; account_id:string|null; bill_to_traveler:number};
export async function budgetLines(env:AdminEnv, tripId:string) {
 return (await env.DB.prepare('SELECT * FROM trip_cost_items WHERE trip_id=?1 AND payment_status != \'canceled\'').bind(tripId).all<BudgetLine>()).results;
}
export function perTravelerAmount(line:BudgetLine,count:number) {
 return dollars(cents(Number(line.estimated_total))/(line.account_id?1:count));
}
// Snapshot charges preserve already-issued traveler prices until a reviewed update.
export async function assignTravelerBudget(env:AdminEnv,tripId:string,personId:string,now:string):Promise<D1PreparedStatement[]> {
 const trip=await env.DB.prepare('SELECT paying_traveler_count FROM trips WHERE id=?1').bind(tripId).first<{paying_traveler_count:number}>();
 if(!trip) return [];
 const person=await env.DB.prepare('SELECT first_name,last_name,email FROM people WHERE id=?1').bind(personId).first<{first_name:string;last_name:string;email:string}>();
 if(!person) throw new AdminError(422,'PERSON_REQUIRED','Choose an existing person.');
 const existing=await env.DB.prepare("SELECT id FROM trip_accounts WHERE trip_id=?1 AND person_id=?2 AND account_type='individual' AND status='active' ORDER BY created_at LIMIT 1").bind(tripId,personId).first<{id:string}>();
 const accountId=existing?.id??crypto.randomUUID();
 const statements:D1PreparedStatement[]=[];
 if(!existing) statements.push(env.DB.prepare(`INSERT INTO trip_accounts(id,trip_id,account_type,name,person_id,billing_email,created_at,updated_at,auto_budget)
 VALUES(?1,?2,'individual',?3,?4,?5,?6,?6,1)`).bind(accountId,tripId,`${person.first_name} ${person.last_name}`,personId,person.email,now));
 statements.push(env.DB.prepare('INSERT OR IGNORE INTO trip_account_members(account_id,person_id,created_at) VALUES(?1,?2,?3)').bind(accountId,personId,now));
 for(const line of await budgetLines(env,tripId)) {
   if(!line.bill_to_traveler || line.needs_estimate || (line.account_id && line.account_id!==accountId)) continue;
   const amount=perTravelerAmount(line,trip.paying_traveler_count);
   if(amount<=0) continue;
   statements.push(env.DB.prepare(`INSERT INTO trip_charges(id,trip_id,account_id,cost_item_id,title,purpose,amount,budget_managed,created_at,updated_at)
    SELECT ?1,?2,?3,?4,?5,?6,?7,1,?8,?8 WHERE NOT EXISTS(SELECT 1 FROM trip_charges WHERE account_id=?3 AND cost_item_id=?4 AND budget_managed=1)`)
    .bind(crypto.randomUUID(),tripId,accountId,line.id,line.description,line.category_id==='category-hs-admin'?'admin_fee':'trip_payment',amount,now));
 }
 return statements;
}

export type OpenCharge={id:string;amount:number;applied:number};
export function fundingStatusStatement(env:AdminEnv,accountId:string,now:string){
 const applied=`COALESCE((SELECT SUM(a.amount) FROM trip_payment_applications a WHERE a.charge_id=trip_charges.id),0)+COALESCE((SELECT SUM(a.amount) FROM trip_award_applications a JOIN trip_coverage_awards w ON w.id=a.award_id WHERE a.charge_id=trip_charges.id AND w.status='approved'),0)`;
 return env.DB.prepare(`UPDATE trip_charges SET status=CASE WHEN ROUND((${applied})*100)>=ROUND(amount*100) THEN 'paid' WHEN (${applied})>0 THEN 'partially_paid' ELSE 'open' END,updated_at=?1 WHERE account_id=?2 AND status NOT IN ('waived','canceled')`).bind(now,accountId);
}
export function allocatePayment(amount:number, charges:OpenCharge[]) {
 let remaining=cents(amount); const allocations:{chargeId:string;amount:number}[]=[];
 if(!Number.isSafeInteger(remaining)||remaining<=0) throw new AdminError(422,'INVALID_AMOUNT','Enter a positive payment.');
 for(const charge of charges) { const available=Math.max(0,cents(charge.amount)-cents(charge.applied)); const used=Math.min(available,remaining); if(used>0) allocations.push({chargeId:charge.id,amount:dollars(used)}); remaining-=used; }
 if(remaining>0) throw new AdminError(409,'EXCESS_PAYMENT','The payment exceeds the selected unpaid items. Refresh balances before recording it.');
 return allocations;
}
