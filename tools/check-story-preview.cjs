const {chromium}=require('C:/Users/kernb/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const base=process.argv[2]||'http://127.0.0.1:8099';
const output=path.resolve(__dirname,'../outputs/story-options-qa');fs.mkdirSync(output,{recursive:true});
const routes=['','open-door/','field-journal/','people-first/','wide-horizon/','your-next-step/'];
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const page=await browser.newPage({reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const width of [1440,768,390,320]){
   await page.setViewportSize({width,height:1000});
   for(const route of routes){
    const response=await page.goto(base+'/'+route);assert.equal(response.status(),200);
    for(const img of await page.locator('img').all()) await img.scrollIntoViewIfNeeded();await page.evaluate(()=>window.scrollTo(0,0));
    await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`Overflow ${route} ${width}`);
    assert.equal(await page.locator('h1').count(),1);
    if(width===1440||width===390){
     await page.screenshot({path:path.join(output,`${route.replace('/','')||'compare'}-${width}.png`),fullPage:true});
     await page.screenshot({path:path.join(output,`${route.replace('/','')||'compare'}-opening-${width}.png`)});
    }
    if(!route){assert.equal(await page.locator('.compare-option').count(),5);continue;}
    for(const story of ['red','john']){
     const details=page.locator('#'+story+'-story');
     await details.locator('summary').click();assert(await details.evaluate(d=>d.open));
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`Story overflow ${route} ${width}`);
     if(route==='open-door/'&&(width===1440||width===390))await details.screenshot({path:path.join(output,`${story}-reading-${width}.png`)});
     await details.locator('.close-story').click();assert.equal(await details.evaluate(d=>d.open),false);
     assert.equal(await details.locator('summary').evaluate(el=>el===document.activeElement),true);
    }
    await page.goto(base+'/'+route+'#red-story');assert(await page.locator('#red-story').evaluate(d=>d.open));
    await page.locator('.next-story').click();assert(await page.locator('#john-story').evaluate(d=>d.open));
    if(route==='your-next-step/'){
     for(const choice of ['people','story','travel']){
      await page.locator(`[data-path="${choice}"]`).click();assert.equal(await page.locator('[data-path][aria-pressed=true]').count(),1);
      assert.equal(await page.locator(`[data-path="${choice}"]`).getAttribute('aria-pressed'),'true');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
     }
     await page.locator('[data-path="story"]').click();await page.locator('.path-answer .primary').click();
     await page.locator('#red-story .close-story').click();
     await page.locator('.path-answer .primary').click();assert(await page.locator('#red-story').evaluate(d=>d.open));
    }
    assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
   }
  }
  assert.deepEqual(errors,[]);
  const nojs=await browser.newContext({javaScriptEnabled:false});const fallback=await nojs.newPage();
  await fallback.goto(base+'/open-door/');await fallback.locator('#red-story summary').click();assert(await fallback.locator('#red-story').evaluate(d=>d.open));
  console.log('Passed: comparison and 5 directions at 4 widths; both stories, direct links, repeated links, keyboard focus, choices, images, no overflow, no-JS reading, no storage, no runtime errors.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
