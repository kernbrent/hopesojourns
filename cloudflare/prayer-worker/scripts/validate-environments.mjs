import assert from 'node:assert/strict';
import { readFileSync,readdirSync } from 'node:fs';
import {schema} from '../src/schema.mjs';
const config=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
const test=config.env.test,production=config.env.production;
assert.notEqual(test.name,production.name,'Workers must be isolated');
for(const [name,env] of Object.entries({test,production})) {
  assert.equal(env.vars.ENVIRONMENT,name);
  assert.equal(env.workers_dev,false);
  assert.equal(env.preview_urls,false);
  assert.deepEqual(env.d1_databases,[],'Hosted prayer data must not bind an existing D1 database');
  assert.deepEqual(env.durable_objects.bindings,[{name:'PRAYER_STORE',class_name:'PrayerStore'}]);
  assert.equal(env.routes.length,1);
  assert.equal(env.routes[0].custom_domain,true);
  assert.equal(env.routes[0].pattern,name==='production'?'prayer.hopesojourns.com':'prayer-test.hopesojourns.com');
}
const folder=new URL('../migrations/',import.meta.url);
assert.deepEqual(schema,readdirSync(folder).filter(x=>x.endsWith('.sql')).sort().map(name=>({name,sql:readFileSync(new URL(name,folder),'utf8')})),'Prepared schema must match canonical SQL migrations');
console.log('Prayer test/production namespace isolation and schema checks passed.');
