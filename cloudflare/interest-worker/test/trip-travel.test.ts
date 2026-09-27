import {expect, it} from 'vitest';
import {ministryFixture} from './ministry-fixture';
import {handleTripAdminRequest, handleTripPublicRequest} from '../src/trip-platform';
import {readSpreadsheet} from '../src/spreadsheet-reader';
import {buildTripWorkbook} from '../src/trip-xlsx';

async function setup() {
  const f = await ministryFixture();
  f.env.ADMIN_SESSION_SECRET = 'test-only-travel-credential-secret';
  const response = await handleTripAdminRequest(f.request('/admin/trips', {title:'Travel test', location:'London', status:'draft'}), f.env, '/admin/trips');
  const {id} = await response.json() as any;
  const path = `/admin/trips/${id}/content`;
  const save = (body: object) => handleTripAdminRequest(f.request(path, body), f.env, path);
  const workspace = async () => (await handleTripAdminRequest(f.request(`/admin/trips/${id}`), f.env, `/admin/trips/${id}`)).json() as Promise<any>;
  return {...f, id, save, workspace};
}
const leg = {contentType:'travel', title:'Flight to London', eventDate:'2026-10-10', eventTime:'21:00', location:'DFW', arrivalDate:'2026-10-11', arrivalTime:'12:00', arrivalLocation:'LHR', travelMode:'Air', serviceNumber:'AA50', visibility:'travelers', publicationStatus:'published'};

it('saves, edits and presents travel separately while preserving ordinary itineraries', async () => {
  const f = await setup();
  const response = await f.save(leg);
  expect(response.status).toBe(201);
  const {id} = await response.json() as any;
  await f.save({contentType:'itinerary',title:'Ministry visit',content:'Meet the team',visibility:'travelers'});
  let content = (await f.workspace()).content;
  expect(content.find((c:any)=>c.id===id)).toMatchObject({content_type:'travel',arrival_date:'2026-10-11',arrival_location:'LHR',travel_mode:'Air',service_number:'AA50'});
  expect(content.some((c:any)=>c.content_type==='itinerary')).toBe(true);
  expect((await f.save({...leg,id,travelMode:'Train',serviceNumber:'T10'})).status).toBe(200);
  expect((await f.workspace()).content.find((c:any)=>c.id===id).travel_mode).toBe('Train');
  // Local dates may reverse when crossing the international date line.
  expect((await f.save({...leg,id,arrivalDate:'2026-10-09'})).status).toBe(200);
  expect((await f.save({...leg,id,contentType:'itinerary'})).status).toBe(200);
  content = (await f.workspace()).content;
  expect(content.find((c:any)=>c.id===id)).toMatchObject({content_type:'itinerary',arrival_date:null,travel_mode:null});
});

it('rejects public travel and missing departure details at the API and database', async () => {
  const f = await setup();
  for (const invalid of [{visibility:'public'},{eventDate:''},{location:''},{arrivalDate:'invalid'}]) {
    expect((await f.save({...leg,...invalid})).status).toBe(422);
  }
  const {id} = await (await f.save(leg)).json() as any;
  expect(()=>f.sqlite.prepare("UPDATE trip_content SET visibility='public' WHERE id=?").run(id)).toThrow('cannot be public');
});

it('shows only published traveler travel entries in the authenticated traveler portal', async () => {
  const f = await setup();
  await f.save(leg);
  await f.save({...leg,title:'Draft leg',publicationStatus:'draft'});
  await f.save({...leg,title:'Private leg',visibility:'admin'});
  const credential = `/admin/trips/${f.id}/portal-credential`;
  await handleTripAdminRequest(f.request(credential,{loginId:'TRAVEL-TEST',password:'Travel test password'}),f.env,credential);
  const login = await handleTripPublicRequest(f.request('/portal/login',{loginId:'TRAVEL-TEST',password:'Travel test password'}),f.env,'/portal/login');
  const request = f.request('/portal/session');
  request.headers.set('cookie',login.headers.get('set-cookie')!.split(';')[0]);
  const response = await handleTripPublicRequest(request,f.env,'/portal/session');
  expect(response.status).toBe(200);
  const data = await response.json() as any;
  expect(data.content).toHaveLength(1);
  expect(data.content[0]).toMatchObject({content_type:'travel',arrival_location:'LHR',service_number:'AA50'});
});

it('round trips travel details through an exported workbook and applies an edited arrival', async () => {
  const f = await setup();
  const {id} = await (await f.save(leg)).json() as any;
  const path = `/admin/trips/${f.id}/export`;
  const response = await handleTripAdminRequest(f.request(path),f.env,path);
  expect(response.status).toBe(200);
  const sheets = readSpreadsheet('trip.xlsx',new Uint8Array(await response.arrayBuffer()));
  const sheet = sheets.find(s=>s.name==='Content')!;
  const headerRow = sheet.rows.find(r=>r.cells.includes('Content Type'))!;
  const headers = headerRow.cells.map(String);
  const row = sheet.rows.find(r=>r.cells.includes(id))!;
  expect(row.cells[headers.indexOf('Content Type')]).toBe('travel');
  expect(row.cells[headers.indexOf('Arrival Location')]).toBe('LHR');
  expect(row.cells[headers.indexOf('Service Number')]).toBe('AA50');
  row.cells[headers.indexOf('Arrival Location')] = 'London Heathrow Terminal 3';
  const bytes = buildTripWorkbook([{name:'Content',purpose:'Edited travel leg',headers,rows:[row.cells]}]);
  const form = new FormData();
  form.set('file',new File([new Uint8Array(bytes)],'trip.xlsx'));
  form.set('commit','true');
  const importPath = `/admin/trips/${f.id}/import`;
  const imported = await handleTripAdminRequest(f.request(importPath,form),f.env,importPath);
  expect(imported.status).toBe(200);
  expect((await f.workspace()).content.find((c:any)=>c.id===id)).toMatchObject({content_type:'travel',arrival_location:'London Heathrow Terminal 3',service_number:'AA50'});
});
