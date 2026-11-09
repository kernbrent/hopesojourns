(() => {
  const node = (tag, text, className = '') => {
    const result = document.createElement(tag);
    result.className = className;
    if (text != null) result.textContent = text;
    return result;
  };
  const button = (text, action, className = 'admin-button admin-button-outline') => {
    const result = node('button', text, className);
    result.type = 'button';
    result.addEventListener('click', action);
    return result;
  };
  const editable = () => !window.MmtUser || window.MmtUser.is_admin || window.MmtUser.permissions?.contacts === 'edit';
  const description = mail => mail.status === 'sent' ? 'Accepted for delivery' : mail.status === 'captured' ? 'Test capture only — no email sent' : mail.status;
  function emailPreview(url) {
    const frame = node('iframe', null, 'admin-newsletter-preview');
    frame.title = 'Newsletter preview including the standard footer';
    frame.setAttribute('sandbox', '');
    frame.referrerPolicy = 'no-referrer';
    // A separate authenticated document has its own restrictive CSP. srcdoc
    // would inherit the portal's inline-style prohibition and break email CSS.
    frame.src = url;
    return frame;
  }
  function modal(title, trigger) {
    const dialog = node('dialog', null, 'admin-detail-dialog admin-contact-email-dialog');
    const content = node('div', null, 'admin-detail-card');
    const heading = node('h2', title);
    heading.id = `contact-email-${crypto.randomUUID()}`;
    dialog.setAttribute('aria-labelledby', heading.id);
    let mayClose = () => true;
    const close = button('Close', () => { if (mayClose()) dialog.close(); });
    const status = node('p', '', 'admin-form-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const header = node('header', null, 'admin-contact-email-header');
    header.append(heading, close);
    content.append(header, status);
    dialog.append(content);
    document.body.append(dialog);
    dialog.addEventListener('close', () => { dialog.remove(); if (trigger?.isConnected) trigger.focus(); });
    dialog.addEventListener('cancel', event => { if (!mayClose()) event.preventDefault(); });
    dialog.showModal();
    return { dialog, content, status, setCloseGuard: guard => { mayClose = guard; } };
  }
  function attachmentLinks(parent,mail){
    for(const file of mail.attachments||[]){const link=node('a',`${file.filename} (${Math.ceil(file.size/1024)} KB)`);link.href=file.url;link.download=file.filename;const row=node('p');row.append(link);parent.append(row);}
  }
  async function history(api, trigger, personId) {
    const { content, status } = modal('Contact email history', trigger);
    const list = node('div', null, 'admin-contact-email-history');
    content.append(list);
    let page = 1;
    const load = async () => {
      status.textContent = 'Loading saved emails…';
      try {
        const params=new URLSearchParams({page:String(page)});if(personId)params.set('personId',personId);
        const result = await api('/contacts/emails?'+params);
        list.replaceChildren();
        if (!result.emails.length) list.append(node('p', 'No contact emails have been saved yet.'));
        result.emails.forEach(mail => {
          const details = node('details');
          details.append(node('summary', `${mail.subject} — ${description(mail)}`), node('p', `From: ${mail.from}`), node('p', `To: ${(mail.visibleTo || mail.to).join(', ')}`), node('p', `${mail.privateRecipients ? 'BCC (hidden recipients)' : 'Original visible recipients'}: ${mail.to.join(', ')}`), node('p', `Created: ${new Date(mail.createdAt).toLocaleString()}`), node('pre', mail.message, 'admin-contact-email-message'));
          attachmentLinks(details,mail);
          if (mail.format === 'html') details.append(button('View newsletter', async event => {
            const control = event.target;
            control.disabled = true;
            try {
              control.replaceWith(emailPreview(`/api/interest/admin/contacts/emails/${mail.id}/preview?document=1`));
            } catch (error) { status.textContent = error.message; control.disabled = false; }
          }));
          if(mail.sentAt)details.append(node('p',`Accepted for delivery: ${new Date(mail.sentAt).toLocaleString()}`));
          if (mail.retryAllowed === false && !['sent', 'captured'].includes(mail.status)) details.append(node('p', 'This older email used visible recipients. Ask an administrator to verify delivery before preparing a private replacement. Retrying it is blocked.'));
          if (mail.error) details.append(node('p', mail.error));
          if (editable() && mail.retryAllowed !== false && ['queued', 'failed', 'uncertain', 'sending'].includes(mail.status)) {
            details.append(button('Retry saved email', async event => {
              event.target.disabled = true;
              try {
                const result = await api(`/contacts/emails/${mail.id}/retry`, { method: 'POST', body: {} });
                await load();
                status.textContent = description(result.email) + (result.email.error ? `. ${result.email.error}` : '.');
                window.dispatchEvent(new CustomEvent('hs-contact-email-saved',{detail:{personIds:personId?[personId]:[],email:result.email}}));
              } catch (error) { status.textContent = error.message; event.target.disabled = false; }
            }));
          }
          list.append(details);
        });
        const pages=result.pagination?.pages||1;
        const previous=button('Previous emails',()=>{page--;load();}),next=button('Next emails',()=>{page++;load();});
        previous.disabled=page<=1;next.disabled=page>=pages;list.append(previous,next);
        status.textContent = `Page ${page} of ${pages}. ${personId?'Emails for this contact. ':''}Accepted for delivery does not confirm receipt.`;
      } catch (error) { status.textContent = error.message; }
    };
    await load();
  }
  async function open(api, personIds, trigger) {
    const { dialog, content, status, setCloseGuard } = modal('Email selected contacts', trigger);
    status.textContent = 'Loading selected email addresses…';
    try {
      const preview = await api('/contacts/emails/preview', { method: 'POST', body: { personIds } });
      if (!dialog.isConnected) return;
      const form = node('form', null, 'admin-contact-email-form');
      const field = (label, tag, name, value, maxLength) => {
        const wrap = node('label');
        const input = node(tag);
        input.name = name;
        input.value = value;
        input.required = true;
        input.maxLength = maxLength;
        wrap.append(node('span', label), input);
        form.append(wrap);
        return input;
      };
      form.append(node('p', `From: Hope Sojourns <${preview.from}>`));
      form.append(node('p', `To: ${preview.from}`));
      const to = field('BCC (hidden recipients)', 'textarea', 'to', preview.to.join(', '), 13000);
      to.rows = 3;
      to.autocomplete = 'off';
      const help = node('p', 'Add or remove email addresses, separated by commas, semicolons, or new lines. Up to 50 different addresses. These recipients are sent as BCC and cannot see each other’s addresses. Only admin@hopesojourns.com appears in To.');
      help.id = `contact-recipients-${crypto.randomUUID()}`;
      to.setAttribute('aria-describedby', help.id);
      form.append(help);
      if (preview.skipped.length) form.append(node('p', `No valid email address: ${preview.skipped.join(', ')}. Add an address manually or continue without these contacts.`));
      const subject = field('Subject', 'input', 'subject', '', 160);
      const format = field('Email format', 'select', 'format', '', 0);
      for (const [value, text] of [['text', 'Plain text'], ['html', 'HTML newsletter']]) {
        const option = node('option', text); option.value = value; format.append(option);
      }
      format.value = 'text';
      const message = field('Message', 'textarea', 'message', '', 10000);
      message.rows = 12;
      const newsletter = node('section', null, 'admin-newsletter-editor');
      newsletter.hidden = true;
      const htmlLabel = node('label', 'Newsletter HTML');
      const html = node('textarea'); html.name = 'html'; html.maxLength = 80000; html.rows = 10;
      htmlLabel.append(html);
      const importLabel = node('label', 'Load newsletter HTML');
      const importFile = node('input'); importFile.type = 'file'; importFile.accept = '.html,.htm'; importLabel.append(importFile);
      const rendered = node('div');
      let reviewedHtml = null, previewSequence = 0;
      const invalidate = () => {
        reviewedHtml = null; previewSequence++; rendered.replaceChildren();
        send.disabled = !preview.ready || !editable() || format.value === 'html';
      };
      importFile.addEventListener('change', async () => {
        const file = importFile.files[0]; if (!file) return;
        invalidate();
        if (file.size > 80000) { status.textContent = 'Choose an HTML file of up to 80 KB, or paste up to 80,000 characters.'; return; }
        try { html.value = await file.text(); invalidate(); status.textContent = 'Newsletter loaded. Add a plain-text alternative, then preview before sending.'; }
        catch { status.textContent = 'The HTML file could not be read.'; }
      });
      const previewButton = button('Preview newsletter', async () => {
        const source = html.value, sequence = ++previewSequence;
        previewButton.disabled = true; status.textContent = 'Preparing newsletter preview…';
        try {
          const result = await api('/contacts/emails/render', {method:'POST', body:{html:source}});
          if (sequence !== previewSequence || source !== html.value || format.value !== 'html') return;
          rendered.replaceChildren(emailPreview(result.previewUrl)); reviewedHtml = source;
          send.disabled = !preview.ready || !editable(); status.textContent = 'Preview ready. Review the layout and links before sending. The standard ministry footer is included.';
        } catch (error) { status.textContent = error.message; }
        finally { previewButton.disabled = false; }
      });
      html.addEventListener('input', invalidate);
      format.addEventListener('change', () => {
        newsletter.hidden = format.value !== 'html'; html.required = format.value === 'html';
        message.parentElement.querySelector('span').textContent = format.value === 'html' ? 'Plain-text alternative' : 'Message';
        invalidate();
      });
      newsletter.append(importLabel, htmlLabel, node('p', 'Load an email-ready HTML file or paste its source. Use public HTTPS image URLs. Scripts and forms are removed. Enter the same message and links in Plain-text alternative. Preview again after any HTML edit.'), previewButton, rendered);
      form.append(newsletter);
      const attachmentLabel=node('label','Attach files (optional)');
      const picker=node('input');picker.type='file';picker.multiple=true;picker.setAttribute('aria-label','Attach files to this email');picker.accept='.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.txt,.csv,.rtf,.jpg,.jpeg,.png,.webp';
      attachmentLabel.append(picker);form.append(attachmentLabel,node('p','Choose up to 5 files: 5 MB per file, 10 MB total. PDF, Word, Excel, PowerPoint, OpenDocument, text, CSV, RTF, or images.'));
      const attachmentList=node('ul',null,'admin-contact-email-attachments');form.append(attachmentList);let attachments=[];
      const showFiles=()=>{attachmentList.replaceChildren();for(const file of attachments){const row=node('li',`${file.name} (${Math.ceil(file.size/1024)} KB) `);row.append(button('Remove '+file.name,()=>{attachments=attachments.filter(f=>f!==file);showFiles();}));attachmentList.append(row);}};
      picker.addEventListener('change',()=>{const next=[...attachments,...picker.files];picker.value='';if(next.length>5||next.some(f=>!f.size||f.size>5*1024*1024)||next.reduce((sum,f)=>sum+f.size,0)>10*1024*1024){status.textContent='Choose up to 5 nonempty files, no more than 5 MB each and 10 MB total.';return;}attachments=next;showFiles();status.textContent='';});
      const footer = node('section', null, 'admin-contact-email-footer');
      footer.setAttribute('aria-label', 'Standard Hope Sojourns email footer');
      footer.append(node('strong', 'Included automatically with every email'));
      const footerPreview = node('div', null, 'admin-standard-email-footer');
      // The server supplies only the fixed ministry footer and its stored signature.
      footerPreview.innerHTML = preview.footerHtml;
      // Email clients use inline styling; the portal uses its shared stylesheet and CSP.
      footerPreview.querySelectorAll('[style]').forEach(item => item.removeAttribute('style'));
      const logo = footerPreview.querySelector('img[alt="Hope Sojourns oval logo"]');
      if (logo) logo.src = '/assets/hope-sojourns-oval-icon.png';
      footer.append(footerPreview);
      form.append(footer);
      const send = node('button', preview.testMode ? 'Capture test email' : 'Send email', 'admin-button admin-button-primary');
      send.type = 'submit';
      send.disabled = !preview.ready || !editable();
      const historyButton = button('Email history', event => history(api, event.target));
      const actions = node('div', null, 'admin-contact-email-actions');
      actions.append(send, historyButton);
      form.append(actions);
      content.append(form);
      status.textContent = preview.testMode ? 'Test mode: this saves a preview without delivering an email.' : preview.ready ? '' : 'Live email delivery is not configured. Ask an administrator to check the sender settings.';
      const sendId = crypto.randomUUID();
      let started = false;
      const dirty = () => to.value !== preview.to.join(', ') || subject.value || message.value || html.value || attachments.length;
      setCloseGuard(() => started || !dirty() || window.confirm('Discard this unsent email?'));
      // Keep the draft fixed after submission so every retry uses the saved payload.
      form.addEventListener('submit', async event => {
        event.preventDefault();
        if (started || !form.reportValidity()) return;
        if (format.value === 'html' && reviewedHtml !== html.value) { status.textContent = 'Preview the current newsletter HTML before sending.'; return; }
        const recipients = to.value.split(/[,;\n]+/).map(v => v.trim()).filter(Boolean);
        started = true;
        [to, subject, message, format, html, importFile, previewButton, picker, send,...attachmentList.querySelectorAll('button')].forEach(input => { input.disabled = true; });
        status.textContent = preview.testMode ? 'Saving test capture…' : 'Sending email…';
        try {
          const body={sendId,personIds,to:recipients,subject:subject.value,message:message.value};
          if (format.value === 'html') Object.assign(body, {format:'html', html:html.value});
          let outgoing=body;if(attachments.length){outgoing=new FormData();outgoing.set('email',JSON.stringify(body));for(const file of attachments)outgoing.append('files',file);}
          const result = await api('/contacts/emails', { method: 'POST', body: outgoing });
          status.textContent = description(result.email) + (result.email.error ? `. ${result.email.error}` : '.');
          window.dispatchEvent(new CustomEvent('hs-contact-email-saved',{detail:{personIds,email:result.email}}));
        } catch (error) {
          status.textContent = error.message;
          if (error.status >= 400 && error.status < 500 && error.status !== 409) {
            started = false;
            [to, subject, message, format, html, importFile, previewButton, picker, send,...attachmentList.querySelectorAll('button')].forEach(input => { input.disabled = false; });
          } else {
            status.textContent += ' Open Email history to check the saved message before retrying.';
          }
        }
      });
      to.focus({ preventScroll: true });
      content.scrollTop = 0;
    } catch (error) { status.textContent = error.message; }
  }
  window.HSContactEmail = { open, history, attachmentLinks };
})();
