(() => {
  const el=(tag,text='',className='')=>{const node=document.createElement(tag);node.textContent=text;node.className=className;return node;};
  const editable=()=>!window.MmtUser||window.MmtUser.is_admin||window.MmtUser.permissions?.finances==='edit';
  const path=id=>`/ledger/entries/${encodeURIComponent(id)}/thanks`;
  const date=value=>value?new Date(value).toLocaleString():'';
  const summary=items=>!items?.length?'':` Thank-you: ${items.map(i=>i.status==='sent'?'sent':i.status==='captured'?'saved in test mode':i.error||i.status).join('; ')}.`;
  function button(api,id,personId,sent=false,sentAt=null){
    const b=el('button',sent?'Thank-you sent':'Gift thank-you','admin-button admin-button-outline');b.type='button';
    b.disabled=sent||!editable();b.title=sentAt?`Sent ${date(sentAt)}`:sent?'Already sent for this gift':!editable()?'Finance editing permission is required':'Preview and send this gift acknowledgment';
    b.addEventListener('click',()=>open(api,id,personId,b));return b;
  }
  async function open(api,id,personId,source){
    const dialog=el('dialog','','admin-dialog gift-thanks-dialog'),content=el('div','','gift-thanks-content');
    const close=el('button','Close','admin-button admin-button-outline');close.type='button';close.onclick=()=>dialog.close();
    const heading=el('h2','Gift thank-you'),status=el('p','Loading…','admin-form-status');status.setAttribute('role','status');
    const recipients=el('div'),preview=el('div');content.append(close,heading,status,recipients,preview);dialog.append(content);document.body.append(dialog);
    dialog.addEventListener('close',()=>{dialog.remove();source.focus();},{once:true});dialog.showModal();
    let entry;
    async function show(person){
      preview.replaceChildren();status.textContent='Loading email preview…';
      try{
        const {result}=await api(path(id)+'/'+encodeURIComponent(person.personId));
        const from=el('p','From: Hope Sojourns <giving@hopesojourns.com>'),to=el('p',`To: ${result.to||'No email address recorded'}`),subject=el('h3',result.subject);
        const frame=el('iframe','','gift-thanks-preview');frame.title='Gift thank-you email preview';frame.setAttribute('sandbox','');frame.srcdoc=result.html;
        const send=el('button',result.status==='sent'?'Thank-you sent':result.testMode?'Save test preview':result.status==='uncertain'||result.status==='sending'?'Retry safely':'Send thank-you','admin-button admin-button-primary');send.type='button';
        send.disabled=result.locked||!person.hasEmail||!result.ready||!editable();
        status.textContent=result.sentAt?`Sent ${date(result.sentAt)}.`:result.error||(!person.hasEmail?'Add an email address to this contact, then reopen this gift.':!result.ready?'Email delivery is not configured.':result.testMode?'Test mode: this saves a preview without emailing the donor.':'Review the gift and recipient before sending.');
        send.onclick=async()=>{
          send.disabled=true;status.textContent=result.testMode?'Saving test preview…':'Sending…';
          try{
            const {result:sent}=await api(path(id)+'/'+encodeURIComponent(person.personId),{method:'POST',body:{previewHash:result.previewHash}});
            result.status=sent.status;
            status.textContent=sent.status==='sent'?`Thank-you sent ${date(sent.sentAt)}.`:sent.status==='captured'?'Test preview saved. No email was sent.':sent.error||'Review delivery status before retrying.';
            if(sent.status==='sent'){
              send.textContent='Thank-you sent';
              person.status='sent';
              if(personId||entry.gifts.every(g=>g.status==='sent')){source.disabled=true;source.textContent='Thank-you sent';source.title=`Sent ${date(sent.sentAt)}`;}
            }else{send.textContent=sent.status==='uncertain'?'Retry safely':result.testMode?'Save test preview':'Retry thank-you';send.disabled=false;}
          }catch(error){status.textContent=error.message;send.disabled=false;}
        };
        preview.append(from,to,subject,frame,send);
      }catch(error){status.textContent=error.message;}
    }
    try{
      const {result}=await api(path(id));entry=result;
      if(!result.gifts.length){status.textContent='Link this charitable gift to a donor contact before sending a thank-you.';return;}
      const selected=personId?result.gifts.find(g=>g.personId===personId):result.gifts[0];
      if(result.gifts.length>1){
        const label=el('label','Donor '),select=el('select');select.setAttribute('aria-label','Choose a donor for this gift');
        result.gifts.forEach(g=>{const o=el('option',g.name+(g.status==='sent'?' — thank-you sent':''));o.value=g.personId;select.append(o);});
        select.value=selected?.personId||'';select.onchange=()=>show(result.gifts.find(g=>g.personId===select.value));label.append(select);recipients.append(label);
      }
      if(selected)await show(selected);else status.textContent='This donor is no longer linked to the gift.';
    }catch(error){status.textContent=error.message;}
  }
  async function settings(api){
    const host=document.getElementById('gift-thanks-settings');if(!host)return;
    try{
      const {result}=await api('/ledger/gift-thanks/settings');host.replaceChildren(el('h3','Gift thank-you emails'));
      const label=el('label'),input=el('input');input.type='checkbox';input.checked=result.automatic;input.disabled=!editable();
      label.append(input,document.createTextNode(' Automatically thank donors when gifts are approved or manually added'));
      const help=el('p','Uses the donor’s contact email. Existing gifts and spreadsheet imports can be thanked individually. Annual giving letters are separate.','admin-reply-help');
      const status=el('p',result.testMode?'Test mode: previews only; donors will not receive emails.':!result.ready?'Email delivery needs configuration.':'','admin-form-status');status.setAttribute('role','status');
      input.onchange=async()=>{input.disabled=true;try{await api('/ledger/gift-thanks/settings',{method:'PUT',body:{automatic:input.checked}});status.textContent=input.checked?'Automatic thank-you emails enabled for new gifts.':'Automatic thank-you emails turned off.';}catch(error){input.checked=!input.checked;status.textContent=error.message;}finally{input.disabled=!editable();}};
      host.append(label,help,status);
    }catch(error){host.textContent=error.message;}
  }
  window.HsGiftThanks={button,settings,summary};
})();
