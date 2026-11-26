const {chromium}=require('C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1119-907-0_26.1119.907.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),{createHash}=require('node:crypto');
const origin=process.env.BIBLILLION_TEST_ORIGIN||'http://localhost:4195';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});try{
 const page=await browser.newPage({reducedMotion:'reduce'});
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});await page.goto(origin+'/');
  if(width<700)await page.getByRole('button',{name:'Menu',exact:true}).click();
  await page.locator('.nav-resources summary').click();
  const link=page.locator('.nav-resources').getByRole('link',{name:'Biblillion discovery game',exact:true});await link.scrollIntoViewIfNeeded();assert.equal(await link.getAttribute('href'),'/biblillion/');await link.click();
  await page.getByRole('heading',{name:'Biblillion.',exact:true}).waitFor();assert.equal(new URL(page.url()).pathname,'/biblillion/');assert.equal(await page.locator('.brand').getAttribute('href'),'/');assert.ok(await page.getByText('TEST PREVIEW',{exact:false}).isVisible());
  await page.locator('[data-destination="mexico-city"]').click();await page.getByRole('button',{name:'Skip & discover',exact:true}).click();await page.reload();await page.locator('#reveal-title').waitFor();
  const cookie=(await page.context().cookies()).find(c=>c.name==='hs_biblillion_progress');assert.equal(cookie.path,'/biblillion/');if(origin.startsWith('https:'))assert.equal(cookie.secure,true);
  await page.screenshot({path:`outputs/biblillion-qa/test-release-${width}.png`,fullPage:true});
  await page.evaluate(()=>localStorage.removeItem('hs-biblillion-v1'));
 }
 for(const file of ['index.html','game.css','game.js','content.js','engine.js','expanded-bank.js','destinations.js','analytics.js','passport.js','general-bank.js','question-settings.js','rewards.js','timer.js','passport.css','friendly-bank.js','mission-bank.js','country-areas.js']){
  const response=await page.request.get(origin+'/biblillion/'+file);assert.equal(response.status(),200);assert.equal(hash(await response.body()),hash(await fs.readFile('site-dist-biblillion-test/biblillion/'+file)),file+' deployment differs');
 }
 console.log('Passed desktop/mobile Resources navigation, test-only banner, same-site home link, /biblillion/ resume and cookie scope, and exact game asset hashes.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
