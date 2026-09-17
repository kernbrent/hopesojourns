import {afterEach,expect,it} from 'vitest';
import {ministryFixture} from './ministry-fixture';
import {handleDestinations} from '../src/destinations';
const fixtures:Awaited<ReturnType<typeof ministryFixture>>[]=[];
async function setup(){const f=await ministryFixture();fixtures.push(f);return {...f,call:(path:string,body?:unknown,method?:string)=>handleDestinations(f.request(path,body,method),f.env,path),row:(slug:string)=>f.sqlite.prepare('SELECT * FROM destinations WHERE slug=?').get(slug) as any};}
afterEach(()=>fixtures.splice(0).forEach(f=>f.sqlite.close()));
it('publishes uploaded photos only after publishing, hides them again, and rejects non-images',async()=>{
 const f=await setup();await f.call('/admin/destinations',{slug:'test-place',title:'Test place',location:'Test',status:'draft',sort_order:1,summary:'Tile',introduction:'Page',image_alt:'Test photo'});
 const form=new FormData();form.set('revision','1');form.set('file',new File([new Uint8Array([137,80,78,71,13,10,26,10])],'photo.png',{type:'image/png'}));
 expect((await f.call('/admin/destinations/test-place/image',form)).status).toBe(200);expect(f.files.size).toBe(1);
 expect((await f.call('/public/destinations/test-place/image')).status).toBe(404);
 expect((await f.call('/admin/destinations/test-place',{...f.row('test-place'),status:'published'},'PUT')).status).toBe(200);
 const photo=await f.call('/public/destinations/test-place/image');expect(photo.status).toBe(200);expect(photo.headers.get('content-type')).toBe('image/png');
 const detail=await (await f.call('/public/destinations/test-place')).json() as any;expect(detail.destination).not.toHaveProperty('image_key');expect(detail.destination.image_url).toContain('/public/destinations/test-place/image');
 await f.call('/admin/destinations/test-place',{...f.row('test-place'),status:'archived'},'PUT');expect((await f.call('/public/destinations/test-place/image')).status).toBe(404);
 form.set('revision',String(f.row('test-place').revision));form.set('file',new File(['%PDF-fake'],'document.pdf'));expect((await f.call('/admin/destinations/test-place/image',form)).status).toBe(422);expect(f.files.size).toBe(1);
});
it('inserts an existing destination at an occupied number and shifts all later destinations',async()=>{
 const f=await setup();const before=f.row('athens');
 expect((await f.call('/admin/destinations/belize',{...f.row('belize'),sort_order:10},'PUT')).status).toBe(200);
 expect(f.row('belize').sort_order).toBe(10);expect(f.row('athens').sort_order).toBe(11);expect(f.row('kenya').sort_order).toBe(21);expect(f.row('others').sort_order).toBe(71);
 expect(f.row('athens').revision).toBe(before.revision+1);
 expect(f.sqlite.prepare('SELECT sort_order FROM opportunities WHERE id=?').get(before.id)).toMatchObject({sort_order:11});
 const publicList=await (await f.call('/public/destinations')).json() as any;expect(publicList.destinations[0].slug).toBe('belize');
 expect((await f.call('/admin/destinations/athens',before,'PUT')).status).toBe(409);
 expect(f.row('belize').sort_order).toBe(10);
});
it('creates at an occupied number, leaves gaps alone, and does not reorder ordinary content edits',async()=>{
 const f=await setup();expect((await f.call('/admin/destinations',{slug:'new-place',title:'New place',location:'Somewhere',status:'draft',sort_order:20})).status).toBe(201);
 expect(f.row('kenya').sort_order).toBe(21);expect(f.row('athens').sort_order).toBe(10);
 const before=f.row('kenya');expect((await f.call('/admin/destinations/kenya',{...before,title:'Updated Kenya'},'PUT')).status).toBe(200);expect(f.row('belize').sort_order).toBe(31);
 expect((await f.call('/admin/destinations/kenya',{...f.row('kenya'),sort_order:5},'PUT')).status).toBe(200);expect(f.row('athens').sort_order).toBe(10);expect(f.row('belize').sort_order).toBe(31);
});
it('rolls back bumps if creation fails and rejects stale edits before moving neighbors',async()=>{
 const f=await setup();const before=f.row('kenya');
 expect((await f.call('/admin/destinations',{...before,slug:'kenya',sort_order:10,status:'draft'})).status).toBe(409);
 expect(f.row('athens').sort_order).toBe(10);expect(f.row('kenya')).toEqual(before);
 expect((await f.call('/admin/destinations/kenya',{...before,sort_order:10,revision:0},'PUT')).status).toBe(409);expect(f.row('athens').sort_order).toBe(10);
});
it('requires authentication and CSRF, and hiding preserves the destination and opportunity',async()=>{
 const f=await setup();expect((await handleDestinations(new Request('http://localhost/admin/destinations'),f.env,'/admin/destinations')).status).toBe(401);
 const req=f.request('/admin/destinations/athens',{...f.row('athens'),status:'archived'},'PUT');req.headers.delete('x-csrf-token');expect((await handleDestinations(req,f.env,'/admin/destinations/athens')).status).toBe(403);
 expect((await f.call('/admin/destinations/athens',{...f.row('athens'),status:'archived'},'PUT')).status).toBe(200);
 expect((await f.call('/public/destinations/athens')).status).toBe(404);
 expect(f.sqlite.prepare('SELECT active FROM opportunities WHERE id=?').get('trip-athens')).toMatchObject({active:0});
 const data=await (await f.call('/public/destinations')).json() as any;expect(data.destinations).toHaveLength(6);expect(data.destinations[0]).not.toHaveProperty('image_key');
});
