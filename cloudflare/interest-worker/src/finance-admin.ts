import {AdminError, adminJson, authenticate, auditStatement, readAdminJson, type AdminEnv} from './admin';

type Body = Record<string, unknown>;
const statuses = ['included', 'excluded', 'needs_review'];
function text(value: unknown, maximum = 250, optional = false): string {
  if (optional && (value == null || value === '')) return '';
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new AdminError(422, 'INVALID_FIELD', 'Complete the required fields.');
  return value.trim();
}
function number(value: unknown, minimum = 0, maximum = 1000000): number {
  if (value === '' || value == null || !['number','string'].includes(typeof value)) throw new AdminError(422,'INVALID_NUMBER','Enter a valid number.');
  const result = Number(value);
  if (!Number.isFinite(result) || result < minimum || result > maximum) throw new AdminError(422,'INVALID_NUMBER',`Enter a number between ${minimum} and ${maximum}.`);
  return result;
}
function date(value: unknown): string {
  const result = text(value,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(Date.parse(result)) || new Date(result).toISOString().slice(0,10) !== result) throw new AdminError(422,'INVALID_DATE','Enter a valid date.');
  return result;
}
function choice(value: unknown, values: string[]): string { if (!values.includes(String(value))) throw new AdminError(422,'INVALID_CHOICE','Choose a valid option.'); return String(value); }
function flag(value: unknown): number { return value === true || value === 1 ? 1 : 0; }
async function reference(env: AdminEnv, table: 'trips'|'ministries', value: unknown): Promise<string|null> {
  if (!value) return null;
  const id = text(value,80);
  if (!await env.DB.prepare(`SELECT id FROM ${table} WHERE id=?`).bind(id).first()) throw new AdminError(422,'INVALID_LINK','Choose an existing trip or ministry.');
  return id;
}
async function links(env: AdminEnv, body: Body) { return Promise.all([reference(env,'trips',body.trip_id),reference(env,'ministries',body.ministry_id)]); }
async function exists(env: AdminEnv, table: string, id: string) {
  if (!await env.DB.prepare(`SELECT id FROM ${table} WHERE id=?`).bind(id).first()) throw new AdminError(404,'NOT_FOUND','This record no longer exists.');
}
async function bootstrap(env: AdminEnv) {
  const [settings,trips,ministries,rates,routes] = await Promise.all([
    env.DB.prepare("SELECT * FROM finance_settings WHERE id='primary'").first(),
    env.DB.prepare('SELECT id,title FROM trips ORDER BY start_date DESC').all(),
    env.DB.prepare('SELECT id,name FROM ministries ORDER BY name').all(),
    env.DB.prepare('SELECT * FROM finance_rates ORDER BY effective_from DESC').all(),
    env.DB.prepare('SELECT * FROM finance_routes WHERE archived=0 ORDER BY name').all()
  ]);
  return adminJson({settings,trips:trips.results,ministries:ministries.results,rates:rates.results,routes:routes.results});
}
async function records(request: Request, env: AdminEnv) {
  const url = new URL(request.url), values: (string|number)[] = [], where: string[] = ["l.accounting_class = 'operating'"];
  for (const [query,column] of [['from','l.transaction_date >='],['to','l.transaction_date <='],['type','l.entry_type ='],['source','l.source_type ='],['trip','COALESCE(r.trip_id,l.trip_id) ='],['ministry','r.ministry_id ='],['status',"COALESCE(r.status,'included') ="]]) {
    const value = url.searchParams.get(query); if (value) { if (query==='from'||query==='to') date(value); where.push(`${column} ?`); values.push(value); }
  }
  if (url.searchParams.get('review')==='1') where.push('r.accountant_review=1');
  if (url.searchParams.get('reimbursable')==='1') where.push('r.reimbursable=1 AND r.reimbursed=0');
  if (url.searchParams.get('missing')==='1') where.push("l.entry_type='expense' AND NOT EXISTS(SELECT 1 FROM ledger_receipts WHERE ledger_entry_id=l.id)");
  const search=url.searchParams.get('search');
  if(search){where.push("(COALESCE(l.name,'') LIKE ? OR COALESCE(l.note,'') LIKE ? OR l.budget_category LIKE ?)");values.push(...Array(3).fill('%'+search.slice(0,200)+'%'));}
  const clause=where.length?'WHERE '+where.join(' AND '):'';
  const page=Math.max(1, Math.min(100000, Number(url.searchParams.get('page'))||1));
  const base=`FROM ledger_entries l LEFT JOIN finance_review r ON r.ledger_id=l.id ${clause}`;
  const [entries,summary]=await Promise.all([
    env.DB.prepare(`SELECT l.*,COALESCE(r.trip_id,l.trip_id) AS linked_trip_id,r.ministry_id,COALESCE(r.status,'included') AS review_status,COALESCE(r.accountant_review,0) AS accountant_review,COALESCE(r.reimbursable,0) AS reimbursable,COALESCE(r.reimbursed,0) AS reimbursed,COALESCE(r.notes,'') AS review_notes,(SELECT COUNT(*) FROM ledger_receipts WHERE ledger_entry_id=l.id) AS receipt_count,(SELECT i.number FROM finance_invoice_payments p JOIN finance_invoices i ON i.id=p.invoice_id WHERE p.ledger_id=l.id) AS invoice_number ${base} ORDER BY l.transaction_date DESC,l.id LIMIT 100 OFFSET ?`).bind(...values,(page-1)*100).all(),
    env.DB.prepare(`SELECT COUNT(*) AS count,COALESCE(SUM(CASE WHEN l.entry_type='income' THEN ROUND(l.amount*100) ELSE 0 END),0)/100.0 AS income,COALESCE(SUM(CASE WHEN l.entry_type='income' AND l.charitable_amount>0 THEN ROUND(l.charitable_amount*100) ELSE 0 END),0)/100.0 AS gross_giving,COALESCE(SUM(CASE WHEN l.entry_type='expense' THEN ROUND(l.amount*100) ELSE 0 END),0)/100.0 AS expenses ${base}`).bind(...values).first()
  ]);
  return adminJson({entries:entries.results,summary,page,pageSize:100});
}
async function mileage(request: Request, env: AdminEnv) {
  const url=new URL(request.url), values:string[]=[], conditions=[url.searchParams.get('trash')==='1'?'m.deleted_at IS NOT NULL':'m.deleted_at IS NULL'];
  for(const [query,column] of [['from','m.travel_date >='],['to','m.travel_date <='],['trip','m.trip_id ='],['ministry','m.ministry_id ='],['status','m.status =']]){const value=url.searchParams.get(query);if(value){if(query==='from'||query==='to')date(value);conditions.push(`${column} ?`);values.push(value);}}
  const page=Math.max(1,Math.min(100000,Number(url.searchParams.get('page'))||1));
  const base=`FROM finance_mileage m LEFT JOIN finance_rates r ON r.active=1 AND m.travel_date BETWEEN r.effective_from AND r.effective_to WHERE ${conditions.join(' AND ')}`;
  const [rows,summary]=await Promise.all([
    env.DB.prepare(`SELECT m.*,r.rate,CASE WHEN r.rate IS NULL THEN NULL ELSE ROUND(m.miles*r.rate*100)/100.0 END AS mileage_value ${base} ORDER BY m.travel_date DESC,m.id LIMIT 100 OFFSET ?`).bind(...values,(page-1)*100).all(),
    env.DB.prepare(`SELECT COUNT(*) AS count,COALESCE(SUM(m.miles),0) AS miles,COALESCE(SUM(m.tolls),0) AS tolls,COALESCE(SUM(ROUND(m.miles*r.rate*100)),0)/100.0 AS mileage_value,SUM(CASE WHEN r.id IS NULL THEN 1 ELSE 0 END) AS missing_rates ${base}`).bind(...values).first()
  ]);
  return adminJson({entries:rows.results,summary,page,pageSize:100});
}
async function saveMileage(request:Request,env:AdminEnv,id?:string){
  const body=await readAdminJson(request), [trip,ministry]=await links(env,body), now=new Date().toISOString();
  if(id)await exists(env,'finance_mileage',id);
  const dates=id?[date(body.travel_date)]:Array.isArray(body.dates)?body.dates.map(date):[date(body.travel_date)];
  if(!dates.length||dates.length>90||new Set(dates).size!==dates.length)throw new AdminError(422,'INVALID_DATES','Choose 1–90 different travel dates.');
  const fields=[text(body.origin),text(body.destination),text(body.purpose,1000),number(body.miles,.01,100000),number(body.tolls??0),trip,ministry,choice(body.status??'included',statuses),flag(body.accountant_review),text(body.notes,2000,true)];
  const batch=crypto.randomUUID();
  await env.DB.batch([...dates.map(day=>id?
    env.DB.prepare('UPDATE finance_mileage SET travel_date=?,origin=?,destination=?,purpose=?,miles=?,tolls=?,trip_id=?,ministry_id=?,status=?,accountant_review=?,notes=?,updated_at=? WHERE id=?').bind(day,...fields,now,id):
    env.DB.prepare('INSERT INTO finance_mileage(id,travel_date,origin,destination,purpose,miles,tolls,trip_id,ministry_id,status,accountant_review,notes,batch_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),day,...fields,batch,now,now)),auditStatement(env,'finance_mileage',id??batch,id?'updated':'created',{count:dates.length})]);
  return adminJson({ok:true});
}
async function saveInvoice(request:Request,env:AdminEnv,id?:string){
  const body=await readAdminJson(request),[trip,ministry]=await links(env,body),now=new Date().toISOString();
  if(id){await exists(env,'finance_invoices',id);if(await env.DB.prepare('SELECT id FROM finance_invoice_payments WHERE invoice_id=? LIMIT 1').bind(id).first())throw new AdminError(409,'PAID_INVOICE','Invoices with payments cannot be rewritten. Keep the original invoice for your records.');}
  if(!Array.isArray(body.lines)||!body.lines.length||body.lines.length>50)throw new AdminError(422,'INVALID_LINES','Add 1–50 invoice lines.');
  const lines=body.lines.map((raw:unknown)=>{const row=raw as Body;if(!row||typeof row!=='object')throw new AdminError(422,'INVALID_LINES','Complete each invoice line.');const quantity=number(row.quantity,.001,10000),unit=Math.round(number(row.unit_amount)*100);return {description:text(row.description,1000),quantity,unit,total:Math.round(quantity*unit)};});
  const total=lines.reduce((sum,row)=>sum+row.total,0);if(total<=0||total>100000000)throw new AdminError(422,'INVALID_TOTAL','Invoice total must be between $0.01 and $1,000,000.');
  const issued=date(body.issued_date),due=date(body.due_date);if(due<issued)throw new AdminError(422,'INVALID_DUE_DATE','Due date must be on or after the invoice date.');
  const invoiceId=id??crypto.randomUUID();
  const fields=[text(body.number,60),issued,due,text(body.bill_to),text(body.address,1500,true),trip,ministry,text(body.notes,3000,true),choice(body.status??'draft',['draft','issued','void']),total,now];
  await env.DB.batch([
    id?env.DB.prepare('UPDATE finance_invoices SET number=?,issued_date=?,due_date=?,bill_to=?,address=?,trip_id=?,ministry_id=?,notes=?,status=?,total_cents=?,updated_at=? WHERE id=?').bind(...fields,id):env.DB.prepare('INSERT INTO finance_invoices(number,issued_date,due_date,bill_to,address,trip_id,ministry_id,notes,status,total_cents,updated_at,id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(...fields,invoiceId,now),
    env.DB.prepare('DELETE FROM finance_invoice_lines WHERE invoice_id=?').bind(invoiceId),
    ...lines.map((row,index)=>env.DB.prepare('INSERT INTO finance_invoice_lines(id,invoice_id,description,quantity,unit_cents,total_cents,sort_order) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),invoiceId,row.description,row.quantity,row.unit,row.total,index)),
    auditStatement(env,'finance_invoice',invoiceId,id?'updated':'created',{totalCents:total})
  ]);
  return adminJson({id:invoiceId});
}
async function invoicePayment(request:Request,env:AdminEnv,invoiceId:string){
  const body=await readAdminJson(request),operation=text(body.operationId,36),ledgerId=text(body.ledger_id,80);
  if(!/^[a-f0-9-]{36}$/i.test(operation))throw new AdminError(422,'INVALID_OPERATION','Refresh the payment form.');
  const previous=await env.DB.prepare('SELECT invoice_id,ledger_id FROM finance_invoice_payments WHERE id=?').bind(operation).first<{invoice_id:string;ledger_id:string}>();
  if(previous){if(previous.invoice_id!==invoiceId||previous.ledger_id!==ledgerId)throw new AdminError(409,'OPERATION_CONFLICT','This payment request was already used.');return adminJson({ok:true,alreadyRecorded:true});}
  const income=await env.DB.prepare("SELECT amount FROM ledger_entries WHERE id=? AND entry_type='income'").bind(ledgerId).first<{amount:number}>();
  if(!income)throw new AdminError(422,'INVALID_PAYMENT','Choose a received income entry from the ledger.');
  await env.DB.batch([env.DB.prepare('INSERT INTO finance_invoice_payments(id,invoice_id,ledger_id,amount_cents,created_at) VALUES(?,?,?,?,?)').bind(operation,invoiceId,ledgerId,Math.round(income.amount*100),new Date().toISOString()),auditStatement(env,'finance_invoice',invoiceId,'payment_linked',{ledgerId})]);
  return adminJson({ok:true});
}
export async function handleFinanceAdminRequest(request:Request,env:AdminEnv,path:string):Promise<Response>{
  try{
    await authenticate(request,env,request.method!=='GET');
    if(request.method==='GET'){
      if(path==='/admin/finance/bootstrap')return await bootstrap(env);
      if(path==='/admin/finance/records')return await records(request,env);
      if(path==='/admin/finance/mileage')return await mileage(request,env);
      if(path==='/admin/finance/invoices')return adminJson({entries:(await env.DB.prepare('SELECT i.*,COALESCE((SELECT SUM(amount_cents) FROM finance_invoice_payments WHERE invoice_id=i.id),0) AS paid_cents FROM finance_invoices i ORDER BY issued_date DESC,id').all()).results});
      const invoice=path.match(/^\/admin\/finance\/invoices\/([a-f0-9-]{36})$/i);
      if(invoice){await exists(env,'finance_invoices',invoice[1]);const [record,lines,payments]=await Promise.all([env.DB.prepare('SELECT * FROM finance_invoices WHERE id=?').bind(invoice[1]).first(),env.DB.prepare('SELECT * FROM finance_invoice_lines WHERE invoice_id=? ORDER BY sort_order').bind(invoice[1]).all(),env.DB.prepare('SELECT p.*,l.transaction_date,l.payment_type FROM finance_invoice_payments p JOIN ledger_entries l ON l.id=p.ledger_id WHERE invoice_id=? ORDER BY p.created_at').bind(invoice[1]).all()]);return adminJson({invoice:record,lines:lines.results,payments:payments.results});}
    }
    const unlink=path.match(/^\/admin\/finance\/invoices\/([a-f0-9-]{36})\/payments\/([a-f0-9-]{36})$/i);
    if(unlink&&request.method==='DELETE'){
      const existing=await env.DB.prepare('SELECT ledger_id FROM finance_invoice_payments WHERE id=? AND invoice_id=?').bind(unlink[2],unlink[1]).first<{ledger_id:string}>();
      if(!existing)throw new AdminError(404,'NOT_FOUND','This payment link no longer exists.');
      await env.DB.batch([env.DB.prepare('DELETE FROM finance_invoice_payments WHERE id=? AND invoice_id=?').bind(unlink[2],unlink[1]),auditStatement(env,'finance_invoice',unlink[1],'payment_unlinked',{ledgerId:existing.ledger_id})]);
      return adminJson({ok:true});
    }
    const match=path.match(/^\/admin\/finance\/(mileage|routes|rates|review|invoices)(?:\/([a-z0-9-]+))?(?:\/(payments))?$/i);
    if(match){
      const [,kind,id,action]=match;
      if(kind==='invoices'&&action==='payments'&&id&&request.method==='POST')return await invoicePayment(request,env,id);
      if(!action&&['POST','PUT'].includes(request.method)&&((request.method==='PUT')===Boolean(id))){
        if(kind==='mileage')return await saveMileage(request,env,id);
        if(kind==='invoices')return await saveInvoice(request,env,id);
        const body=await readAdminJson(request),now=new Date().toISOString(),recordId=id??crypto.randomUUID();
        if(kind==='review'&&id){
          await exists(env,'ledger_entries',id);const [trip,ministry]=await links(env,body);
          if(flag(body.reimbursed)&&!flag(body.reimbursable))throw new AdminError(422,'INVALID_REIMBURSEMENT','Mark this expense reimbursable before marking it reimbursed.');
          await env.DB.batch([env.DB.prepare('INSERT INTO finance_review(ledger_id,trip_id,ministry_id,status,accountant_review,reimbursable,reimbursed,notes,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(ledger_id) DO UPDATE SET trip_id=excluded.trip_id,ministry_id=excluded.ministry_id,status=excluded.status,accountant_review=excluded.accountant_review,reimbursable=excluded.reimbursable,reimbursed=excluded.reimbursed,notes=excluded.notes,updated_at=excluded.updated_at').bind(id,trip,ministry,choice(body.status,statuses),flag(body.accountant_review),flag(body.reimbursable),flag(body.reimbursed),text(body.notes,2000,true),now),auditStatement(env,'finance_review',id,'updated')]);return adminJson({ok:true});
        }
        if(kind==='rates'){
          if(id)await exists(env,'finance_rates',id);const from=date(body.effective_from),to=date(body.effective_to);if(to<from)throw new AdminError(422,'INVALID_RANGE','End date must follow start date.');
          const fields=[text(body.label),from,to,number(body.rate,0,100),flag(body.active??true)];
          await env.DB.batch([id?env.DB.prepare('UPDATE finance_rates SET label=?,effective_from=?,effective_to=?,rate=?,active=? WHERE id=?').bind(...fields,id):env.DB.prepare('INSERT INTO finance_rates(label,effective_from,effective_to,rate,active,id) VALUES(?,?,?,?,?,?)').bind(...fields,recordId),auditStatement(env,'finance_rate',recordId,id?'updated':'created')]);return adminJson({id:recordId});
        }
        if(kind==='routes'){
          if(id)await exists(env,'finance_routes',id);const [trip,ministry]=await links(env,body);const fields=[text(body.name),text(body.origin),text(body.destination),text(body.purpose,1000),number(body.miles,.01,100000),number(body.tolls??0),trip,ministry];
          await env.DB.batch([id?env.DB.prepare('UPDATE finance_routes SET name=?,origin=?,destination=?,purpose=?,miles=?,tolls=?,trip_id=?,ministry_id=? WHERE id=?').bind(...fields,id):env.DB.prepare('INSERT INTO finance_routes(name,origin,destination,purpose,miles,tolls,trip_id,ministry_id,id) VALUES(?,?,?,?,?,?,?,?,?)').bind(...fields,recordId),auditStatement(env,'finance_route',recordId,id?'updated':'created')]);return adminJson({id:recordId});
        }
      }
      if(id&&!action&&['DELETE','PATCH'].includes(request.method)&&(kind==='mileage'||kind==='routes')){
        const table=kind==='mileage'?'finance_mileage':'finance_routes';await exists(env,table,id);const deleted=request.method==='DELETE';
        await env.DB.batch([kind==='mileage'?env.DB.prepare('UPDATE finance_mileage SET deleted_at=?,updated_at=? WHERE id=?').bind(deleted?new Date().toISOString():null,new Date().toISOString(),id):env.DB.prepare('UPDATE finance_routes SET archived=? WHERE id=?').bind(deleted?1:0,id),auditStatement(env,table,id,deleted?'archived':'restored')]);return adminJson({ok:true});
      }
    }
    if(path==='/admin/finance/settings'&&request.method==='PUT'){
      const body=await readAdminJson(request),year=number(body.reporting_year,2000,2200);if(!Number.isInteger(year))throw new AdminError(422,'INVALID_YEAR','Enter a whole year.');
      await env.DB.batch([env.DB.prepare("UPDATE finance_settings SET organization_name=?,contact_email=?,reporting_year=?,updated_at=? WHERE id='primary'").bind(text(body.organization_name),text(body.contact_email,250,true),year,new Date().toISOString()),auditStatement(env,'finance_settings','primary','updated')]);return adminJson({ok:true});
    }
    throw new AdminError(404,'NOT_FOUND','Not found.');
  }catch(error){
    if(error instanceof AdminError)return adminJson({error:error.message,code:error.code},error.status,error.headers);
    const message=error instanceof Error?error.message:'';
    if(/Mileage rate dates overlap/.test(message))return adminJson({error:'Active mileage rates cannot have overlapping dates.'},409);
    if(/Invoice payment exceeds|finance_invoice_payments.ledger_id/.test(message))return adminJson({error:'Choose an unmatched income entry that does not exceed this issued invoice’s remaining balance.'},409);
    if(/finance_invoices.number/.test(message))return adminJson({error:'That invoice number already exists.'},409);
    console.error(JSON.stringify({event:'finance_error',message}));
    return adminJson({error:'The change could not be saved. Refresh and try again.'},500);
  }
}
