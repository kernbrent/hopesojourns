const {chromium}=require('C:/Users/kernb/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const origin='https://supporting.hopesojourns.invalid';
  const documents=[['a','Mexico brochure','Brochures','journey1'],['b','Envelope template','Envelope Templates',null],['c','Packing list','Journey Documents','journey1']].map(([id,title,folder,trip_id])=>({id,title,category:'Supporting Documents / '+folder,trip_id,version_id:id,filename:title+'.pdf',updated_at:'2026-10-20'}));
  await page.route('**/*',async route=>{
   const path=new URL(route.request().url()).pathname;
   if(path==='/api/interest/admin/session')return route.fulfill({json:{csrfToken:'test'}});
   if(path==='/api/interest/admin/ministry/documents')return route.fulfill({json:{documents,journeys:[{id:'journey1',title:'Mexico City 2027'}],canManage:true}});
   if(path==='/admin/ministry/')return route.fulfill({contentType:'text/html',body:fs.readFileSync('admin/ministry/index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'')});
   const file=path.slice(1);if(fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.css')?'text/css':'image/png'});
   return route.abort();
  });
  await page.goto(origin+'/admin/ministry/#documents/supporting');
  await page.addScriptTag({content:fs.readFileSync('admin/ministry/ministry.js','utf8')});
  await page.getByRole('heading',{name:'Supporting Documents',exact:true}).waitFor();
  await page.getByText('3 documents',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Envelope Templates',exact:true}).click();
  assert.equal(await page.locator('#document-list article').count(),1);
  await page.getByRole('button',{name:'Upload document',exact:true}).click();
  assert.equal(await page.locator('[name=category]').inputValue(),'Supporting Documents / Envelope Templates');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.locator('#document-folder').selectOption('');
  await page.locator('#document-journey').selectOption('journey1');
  assert.equal(await page.locator('#document-list article').count(),2);
  await page.locator('#document-search').fill('packing');
  assert.equal(await page.locator('#document-list article').count(),1);
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);
  console.log('Supporting document folder, upload defaults, search, journey filter and mobile checks passed.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
