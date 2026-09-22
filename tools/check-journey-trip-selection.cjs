const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('journey/journey.js', 'utf8');
const start = source.indexOf('function requestedTripMatches');
const end = source.indexOf('document.querySelector("#journey-login-form").addEventListener', start);
async function check(search, trip, expected, fail = false) {
 const form = { elements: { loginId: { value: '' } } };
 const context = { URLSearchParams, location: { search }, login: { hidden: false }, portal: { hidden: true },
 document: { querySelector: () => form }, api: async () => { if(fail) throw {status:401}; return {trip}; },
 setStatus: () => {}, render: () => { context.rendered = true; } };
 vm.createContext(context);
 await vm.runInContext(source.slice(start, end) + ';restore()', context);
 assert.equal(!!context.rendered, expected, search);
 if (!expected) { assert.equal(context.portal.hidden, true); assert.equal(context.login.hidden, false); }
 if (search.includes('trip=')) assert.equal(form.elements.loginId.value, new URLSearchParams(search).get('trip').toUpperCase());
}
(async () => {
 const fot = {id:'fot-id',code:'FOT-2026-FLORIDA',slug:'fot-florida'};
 await check('?trip=ENG-2026-001',fot,false);
 await check('?trip=MEX-2027-001',fot,false);
 await check('?trip=ENGLAND-CUSTOM&tripId=eng-id',fot,false);
 await check('?trip=ENGLAND-CUSTOM&tripId=eng-id',{id:'eng-id',code:'ENG-2026-001'},true);
 await check('?trip=fot-2026-florida',fot,true);
 await check('?trip=fot-florida',fot,true);
 await check('',fot,true);
 await check('?trip=ENG-2026-001',fot,false,true);
 console.log('Passed 8 portal trip-selection regression cases.');
})().catch(error => {console.error(error);process.exitCode=1;});
