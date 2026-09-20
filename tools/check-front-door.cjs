const { chromium } = require('C:/Users/kernb/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
const base = process.argv[2] || 'http://127.0.0.1:8096';
const output = path.resolve(__dirname, '../output/front-door-review');
fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser = await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  for(const width of [1440,768,390,320]){
   await page.setViewportSize({width,height:1000});
   for(const route of ['/','/explore/','/stories/','/discover/','/partners/','/groups/','/students/','/internships/','/giving/','/about/']){
    const response=await page.goto(base+route,{waitUntil:'domcontentloaded'});
    await page.locator('.main-site-link').waitFor();
    if(response.status()!==200)throw Error(route+' status '+response.status());
    if(!await page.locator('.main-site-link').isVisible())throw Error('Missing main site escape '+route);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
    if(overflow){console.log(await page.locator('body *').evaluateAll(items=>items.filter(el=>el.getBoundingClientRect().right>innerWidth+1).map(el=>({tag:el.tagName,cls:el.className,right:el.getBoundingClientRect().right})).slice(0,20)));throw Error('Horizontal overflow '+width+' '+route);}
    if(width===1440||width===390)await page.screenshot({path:path.join(output,`${width}-${route.replaceAll('/','')||'welcome'}.png`),fullPage:true});
   }
  }
  await page.goto(base+'/stories/');
  await page.locator('#red-1 a[href="#red-2"]').click();
  if(!await page.locator('#red-2').isVisible()||await page.locator('#red-1').isVisible())throw Error('Story advance failed');
  await page.goBack();
  if(!await page.locator('#red-1').isVisible())throw Error('Story history failed');
  await page.locator('.hs-story-switch a[href="#john-1"]').click();
  await page.locator('#john-1 a[href="#john-2"]').click();
  if(!await page.locator('#john-2').isVisible())throw Error('John story failed');
  await page.goto(base+'/discover/');
  for(const key of ['partners','together','discover']){
   await page.locator(`[data-curiosity-link="${key}"]`).click();
   if(!await page.locator('#'+key).isVisible())throw Error('Curiosity '+key);
  }
  await page.locator('.nav-toggle').click();
  if(await page.locator('.nav-toggle').getAttribute('aria-expanded')!=='true')throw Error('Mobile menu');
  await page.keyboard.press('Escape');
  if(await page.locator('.nav-toggle').getAttribute('aria-expanded')!=='false')throw Error('Mobile menu escape');
  await page.goto(base+'/explore/');
  const broken=await page.locator('img').evaluateAll(images=>images.filter(img=>img.complete&&!img.naturalWidth).map(img=>img.src));
  if(broken.length)throw Error('Broken images: '+broken.join(', '));
  const nojs=await browser.newPage({javaScriptEnabled:false});
  await nojs.goto(base+'/stories/');
  if(await nojs.locator('[data-story-panel]:visible').count()!==4)throw Error('No-JS stories unavailable');
  if(errors.length)throw Error(errors.join('\n'));
  console.log('PASS: 10 public routes at 4 widths, both stories, native history, 3 curiosity paths, mobile menu/Escape, images, no-JS stories. No JavaScript errors.');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
