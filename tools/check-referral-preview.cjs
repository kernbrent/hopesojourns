const {chromium}=require('C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1119-907-0_26.1119.907.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const origin='http://localhost:4193';
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});let debugPage;
 try{
  await fs.mkdir('outputs/referral-source-qa',{recursive:true});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];debugPage=page;page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/interest/');await page.locator('[data-choice-group="trip"] input').first().waitFor();
  const source=page.getByLabel('How did you hear about us?',{exact:false}),detail=page.locator('#referral-detail');
  assert.equal(await detail.isDisabled(),true);assert.equal(await page.locator('#referral-detail-field').isVisible(),false);
  for(const [value,prompt] of [['friend-family','Who may we thank?'],['church-ministry','Which church or ministry?'],['previous-participant','Who may we thank?'],['social-media','Which platform or account?'],['online-search','What did you search for?'],['event-presentation','Which event or presentation?'],['other','Tell us a little more.']]){
    await source.selectOption(value);assert.equal(await page.locator('#referral-detail-label').textContent(),prompt);assert.equal(await detail.isEnabled(),true);assert.equal(await detail.getAttribute('required'),null);await detail.fill('Discard this when the category changes');
  }
  await source.selectOption('');assert.equal(await detail.inputValue(),'');assert.equal(await detail.isDisabled(),true);
  await source.selectOption('church-ministry');await detail.fill('Local Review Church');
  await page.locator('#referral-source').scrollIntoViewIfNeeded();await page.screenshot({path:'outputs/referral-source-qa/form-desktop.png'});
  const unique=Date.now(),email=`local-referral-${unique}@example.test`,phone='972555'+String(unique).slice(-4);
  await page.getByLabel('First name',{exact:false}).fill('Local');await page.getByLabel('Last name',{exact:false}).fill('Referral');await page.locator('#email').fill(email);await page.locator('#phone').fill(phone);await page.locator('[name="opportunities"]').first().check();await page.locator('[name=consent]').check();
  const responseEvent=page.waitForResponse(r=>r.url()===origin+'/api/interest/submissions'&&r.request().method()==='POST');await page.getByRole('button',{name:'Share my interest',exact:true}).click();const response=await responseEvent;assert.equal(response.status(),201);const receipt=await response.json();await page.getByRole('heading',{name:'Thank you for taking the next step.',exact:true}).waitFor();
  const inquiry=await(await page.request.get(origin+'/api/interest/admin/inquiries/'+receipt.submissionId)).json();assert.equal(inquiry.inquiries[0].referral_source,'church-ministry');assert.equal(inquiry.inquiries[0].referral_detail,'Local Review Church');
  const id=inquiry.inquiries[0].person_id,contact=await(await page.request.get(origin+'/api/interest/admin/people/'+id)).json();assert.equal(contact.person.referrals[0].referralDetail,'Local Review Church');
  await page.goto(origin+'/admin/?person='+id+'#people');await page.getByRole('heading',{name:'How they heard about us',exact:true}).waitFor();
  await page.locator('#submission-dialog').screenshot({path:'outputs/referral-source-qa/contact-desktop.png'});
  await page.getByRole('heading',{name:'How they heard about us',exact:true}).locator('..').screenshot({path:'outputs/referral-source-qa/contact-referral.png'});
  await page.getByRole('button',{name:'Open source inquiry',exact:true}).click();await page.getByRole('heading',{name:'Inquiry and next steps',exact:true}).waitFor();assert.ok(await page.getByText('How did you hear about us? Church or ministry',{exact:true}).isVisible());
  await page.locator('#submission-dialog').screenshot({path:'outputs/referral-source-qa/inquiry-desktop.png'});
  await page.goto(origin+'/interest/');await page.setViewportSize({width:390,height:844});await source.selectOption('event-presentation');await detail.fill('Church mission evening');await source.scrollIntoViewIfNeeded();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'outputs/referral-source-qa/form-mobile.png'});
  await page.goto(origin+'/');await page.getByRole('heading',{name:'Could a Mission Journey be your next step?',exact:true}).waitFor();await page.locator('[data-invitation-intro]').waitFor({state:'hidden'});await page.locator('.mission-walkthrough-invitation').scrollIntoViewIfNeeded();await page.waitForFunction(()=>getComputedStyle(document.querySelector('.mission-walkthrough-invitation')).opacity==='1');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'outputs/referral-source-qa/homepage-mobile.png'});
  await page.setViewportSize({width:1440,height:1000});await page.locator('.mission-walkthrough-invitation').scrollIntoViewIfNeeded();await page.screenshot({path:'outputs/referral-source-qa/homepage-desktop.png'});
  assert.equal(await page.evaluate(()=>document.querySelector('.mission-walkthrough-invitation').nextElementSibling.id),'trips');await page.getByRole('link',{name:'Try the Mission Journey walkthrough',exact:true}).click();await page.getByRole('button',{name:'Begin my journey',exact:true}).waitFor();
  for(const path of ['/docs/user/Hope-Sojourns-MMT-User-Guide.md','/.git/config','/tools/referral-preview.ts'])assert.equal((await page.request.get(origin+path)).status(),404);
  assert.deepEqual(errors,[]);console.log('Passed: seven tailored prompts, optional fields, stale-detail clearing, real local submission, saved inquiry/contact attribution, contact and inquiry screens, mobile layout, homepage placement and walkthrough link, private-route isolation, and no browser errors.');
 }catch(error){if(debugPage){await debugPage.screenshot({path:'outputs/referral-source-qa/failure.png',fullPage:true});console.error(await debugPage.evaluate(()=>({url:location.href,invalid:[...document.querySelectorAll(':invalid')].map(n=>({name:n.name,message:n.validationMessage})),status:document.querySelector('[data-interest-status]')?.textContent,errors:[...document.querySelectorAll('.form-field-error:not([hidden])')].map(n=>n.textContent)})));}throw error;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
