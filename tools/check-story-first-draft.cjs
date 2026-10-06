const {chromium}=require('C:/Users/kernb/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const base=process.argv[2]||'http://127.0.0.1:8099/first-draft.html';
const output=path.resolve(__dirname,'../outputs/story-preview-qa');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const width of [1440,768,390,320]){
   await page.setViewportSize({width,height:1000});
   await page.goto(base);assert.equal(await page.locator('#home').isVisible(),true);
   assert.equal(await page.locator('img').evaluateAll(imgs=>imgs.every(i=>i.complete&&i.naturalWidth>0)),true);
   if(width===1440||width===390){await page.screenshot({path:path.join(output,`home-${width}.png`),fullPage:true});await page.screenshot({path:path.join(output,`opening-${width}.png`)});}
   for(const story of ['red','john']){
    await page.goto(base+'#'+story+'-1');
    for(let n=1;n<=6;n++){
     const view=page.locator('#'+story+'-'+n);assert(await view.isVisible());
     assert.equal(await page.locator('[data-view]:visible').count(),1);
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`Overflow ${story}-${n} ${width}`);
     if((n===1||n===5||n===6)&&(width===1440||width===390))await page.screenshot({path:path.join(output,`${story}-${n}-${width}.png`),fullPage:true});
     if(n<6){await view.locator('.solid-link').click();await page.waitForURL('**#'+story+'-'+(n+1));}
    }
    await page.locator('#'+story+'-6 [data-reflection]').first().click();
    assert((await page.locator('#'+story+'-6 .reflection-response').innerText()).length>20);
    await page.locator('#'+story+'-6 .back-link').first().click();assert(await page.locator('#'+story+'-5').isVisible());
    await page.goBack();assert(await page.locator('#'+story+'-6').isVisible());
   }
  }
  await page.goto(base+'#encounters');assert(await page.locator('#home').isVisible());
  await page.goto(base+'#unknown');assert(await page.locator('#home').isVisible());
  assert.equal(await page.evaluate(()=>localStorage.length),0);
  assert.deepEqual(errors,[]);
  const nojs=await browser.newContext({javaScriptEnabled:false});const fallback=await nojs.newPage();await fallback.goto(base);assert(await fallback.getByRole('link',{name:'Read “Do You See Me?”'}).isVisible());
  console.log('Passed: 4 widths, both complete stories, navigation/back history, reflection, images, overflow, no-JS fallback, no storage, no runtime errors.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
