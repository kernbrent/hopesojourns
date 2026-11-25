import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fresh,normalize,checkpoint,restore,profilePayload,KEY,COOKIE,MAX_AGE} from '../mission-journey/state.js';
import {days,outlineText} from '../mission-journey/content.js';

test('resume restores the current chapter, chosen day, checkmarks and private reflection',()=>{
  const state={...fresh(),view:'prepare',chapter:3,mood:'busy',encounter:'ask',day:4};state.days[0]=true;state.notes[4]='An honest question';
  const result=restore({getItem:key=>key===KEY?JSON.stringify(state):null},'');
  assert.deepEqual(result,state);
});
test('cookie fallback resumes without putting reflection text or contact data in the cookie',()=>{
  const state={...fresh(),view:'prepare',day:3};state.days[2]=true;state.notes[3]='PRIVATE';
  const small=checkpoint(state);assert.equal(JSON.stringify(small).includes('PRIVATE'),false);
  const result=restore({getItem(){throw Error('blocked');}},COOKIE+'='+encodeURIComponent(JSON.stringify(small)));
  assert.equal(result.day,3);assert.equal(result.days[2],true);assert.deepEqual(result.notes,Array(7).fill(''));
});
test('invalid, expired, future, and unsupported progress recover safely',()=>{
  const storage={getItem:()=>'{broken'};assert.equal(restore(storage,COOKIE+'=%broken').chapter,0);
  for(const changes of [{v:2},{updated:Date.now()-(MAX_AGE+1)*1000},{updated:Date.now()+120000}])assert.equal(normalize({...fresh(),day:4,...changes}).day,0);
  const sanitized=normalize({...fresh(),chapter:100,day:100,mood:'invalid',completed:true,notes:['x'.repeat(2000)]});
  assert.equal(sanitized.chapter,1);assert.equal(sanitized.day,6);assert.equal(sanitized.completed,false);assert.equal(sanitized.notes[0].length,1500);
});
test('freshest valid checkpoint wins; local reflections win equal timestamps',()=>{
  const local={...fresh(),day:2};local.notes[2]='Keep me';const cookie={...checkpoint(local),day:4,updated:local.updated+1};
  assert.equal(restore({getItem:()=>JSON.stringify(local)},COOKIE+'='+encodeURIComponent(JSON.stringify(cookie))).day,4);
  assert.equal(restore({getItem:()=>JSON.stringify(local)},COOKIE+'='+encodeURIComponent(JSON.stringify(checkpoint(local)))).notes[2],'Keep me');
});
test('email-only request never creates a profile payload; profile contains only selected supplied fields',()=>{
  assert.equal(profilePayload({email:'visitor@example.test',name:'Example',contact:true}),null);
  const result=profilePayload({shareProfile:true,email:' visitor@example.test ',name:' Example ',notes:'private',mood:'busy',contact:false});
  assert.equal(result.email,'visitor@example.test');assert.equal(result.name,'Example');assert.equal(result.contact_permission,false);assert.equal('notes' in result,false);assert.equal('mood' in result,false);
});
test('downloaded outline includes all seven complete days',()=>{
  assert.equal(days.length,7);const text=outlineText();for(const day of days){for(const key of ['reference','devotional','prayer','practice','reflection'])assert.ok(text.includes(day[key]));}
});
