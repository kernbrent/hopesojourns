const {chromium}=require('C:/Users/kernb/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
fs.mkdirSync('.tmp/discovery-browser',{recursive:true});
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const base='http://localhost:8798';
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:1000});await page.goto(base);await page.locator('[data-discovery-open]').click();
  await page.locator('[data-start]').click();await page.locator('input[value="mission"]').check();await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:'Back',exact:true}).click();assert(await page.locator('input[value="mission"]').isChecked());
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  for(const choice of ['relationships','hospitality','church','year','cost']){await page.locator(`input[value="${choice}"]`).check();await page.getByRole('button',{name:/^(Continue|See my next steps)$/}).click();}
  assert(await page.getByRole('link',{name:'Explore mission journeys',exact:true}).isVisible());
  assert.equal(await page.locator('[data-consent]').isChecked(),false);
  await page.locator('[data-save]').click();assert.match(await page.locator('[data-save-status]').textContent(),/agree/);
  const overflow=await page.locator('.discovery-dialog').evaluate(el=>el.scrollWidth>el.clientWidth+1);assert.equal(overflow,false,'Dialog overflow '+width);
  await page.screenshot({path:`.tmp/discovery-browser/result-${width}.png`});
  if(width===1440){await page.locator('[data-consent]').check();await page.locator('[data-save]').click();await page.getByText('Your answers have been shared. Thank you.',{exact:true}).waitFor();assert(await page.locator('[data-save]').isDisabled());}
  await page.keyboard.press('Escape');assert(await page.locator('[data-discovery-open]').evaluate(el=>document.activeElement===el));
 }
 // Every route, back navigation, edit, and start over.
 for(const [path,title] of [['internship','Explore internship placements'],['corporate','Explore corporate journeys'],['support','Explore ways to give'],['unsure','Explore corporate journeys']]){
  await page.goto(base);await page.locator('[data-discovery-open]').click();await page.locator('[data-start]').click();
  for(const choice of [path,'leadership','professional','colleagues','browsing','fit']){await page.locator(`input[value="${choice}"]`).check();await page.getByRole('button',{name:/^(Continue|See my next steps)$/}).click();}
  assert(await page.locator('.discovery-dialog').getByRole('link',{name:title,exact:true}).isVisible());await page.getByRole('button',{name:'Change my answers',exact:true}).click();assert(await page.locator(`input[value="${path}"]`).isChecked());
 }
 await page.goto(base+'/admin/discovery/');await page.getByText(/shared interviews ·/).waitFor();assert(await page.getByRole('heading',{name:'Anonymous visitor',exact:true}).count()>0);await page.screenshot({path:'.tmp/discovery-browser/staff-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'Associate with a contact',exact:true}).first().click();await page.locator('#contact-query').fill('Nobody');await page.locator('#contact-search button').click();await page.getByText('No matching contacts.',{exact:true}).waitFor();
 await page.locator('#contact-query').fill('visitor@example.test');await page.locator('#contact-search button').click();await page.getByRole('button',{name:'Sample Visitor · visitor@example.test',exact:true}).click();await page.getByText('Sample teacher',{exact:false}).waitFor();await page.getByRole('button',{name:'Unlink contact',exact:true}).first().click();await page.getByText('Sample teacher',{exact:false}).waitFor({state:'hidden'});
 assert.deepEqual(errors,[]);console.log('Passed visitor flows at 1440/390/320px, all pathways, edit/back, consent/save, focus return, and staff review/search.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
