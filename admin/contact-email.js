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
    content.append(heading, close, status);
    dialog.append(content);
    document.body.append(dialog);
    dialog.addEventListener('close', () => { dialog.remove(); if (trigger?.isConnected) trigger.focus(); });
    dialog.addEventListener('cancel', event => { if (!mayClose()) event.preventDefault(); });
    dialog.showModal();
    return { dialog, content, status, setCloseGuard: guard => { mayClose = guard; } };
  }
  async function history(api, trigger) {
    const { content, status } = modal('Contact email history', trigger);
    const list = node('div', null, 'admin-contact-email-history');
    content.append(list);
    const load = async () => {
      status.textContent = 'Loading saved emails…';
      try {
        const result = await api('/contacts/emails');
        list.replaceChildren();
        if (!result.emails.length) list.append(node('p', 'No contact emails have been saved yet.'));
        result.emails.forEach(mail => {
          const details = node('details');
          details.append(node('summary', `${mail.subject} — ${description(mail)}`), node('p', `From: ${mail.from}`), node('p', `To: ${(mail.visibleTo || mail.to).join(', ')}`), node('p', `${mail.privateRecipients ? 'BCC (hidden recipients)' : 'Original visible recipients'}: ${mail.to.join(', ')}`), node('p', `Created: ${new Date(mail.createdAt).toLocaleString()}`), node('pre', mail.message, 'admin-contact-email-message'));
          if (mail.retryAllowed === false && !['sent', 'captured'].includes(mail.status)) details.append(node('p', 'This older email used visible recipients. Ask an administrator to verify delivery before preparing a private replacement. Retrying it is blocked.'));
          if (mail.error) details.append(node('p', mail.error));
          if (editable() && mail.retryAllowed !== false && ['queued', 'failed', 'uncertain', 'sending'].includes(mail.status)) {
            details.append(button('Retry saved email', async event => {
              event.target.disabled = true;
              try {
                const result = await api(`/contacts/emails/${mail.id}/retry`, { method: 'POST', body: {} });
                await load();
                status.textContent = description(result.email) + (result.email.error ? `. ${result.email.error}` : '.');
              } catch (error) { status.textContent = error.message; event.target.disabled = false; }
            }));
          }
          list.append(details);
        });
        status.textContent = 'The 30 most recent contact emails are shown. Accepted for delivery does not confirm receipt.';
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
      const message = field('Message', 'textarea', 'message', '', 10000);
      message.rows = 12;
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
      const dirty = () => to.value !== preview.to.join(', ') || subject.value || message.value;
      setCloseGuard(() => started || !dirty() || window.confirm('Discard this unsent email?'));
      // Keep the draft fixed after submission so every retry uses the saved payload.
      form.addEventListener('submit', async event => {
        event.preventDefault();
        if (started || !form.reportValidity()) return;
        const recipients = to.value.split(/[,;\n]+/).map(v => v.trim()).filter(Boolean);
        started = true;
        [to, subject, message, send].forEach(input => { input.disabled = true; });
        status.textContent = preview.testMode ? 'Saving test capture…' : 'Sending email…';
        try {
          const result = await api('/contacts/emails', { method: 'POST', body: { sendId, personIds, to: recipients, subject: subject.value, message: message.value } });
          status.textContent = description(result.email) + (result.email.error ? `. ${result.email.error}` : '.');
        } catch (error) {
          status.textContent = error.message;
          if (error.status >= 400 && error.status < 500 && error.status !== 409) {
            started = false;
            [to, subject, message, send].forEach(input => { input.disabled = false; });
          } else {
            status.textContent += ' Open Email history to check the saved message before retrying.';
          }
        }
      });
      to.focus({ preventScroll: true });
      dialog.scrollTop = 0;
    } catch (error) { status.textContent = error.message; }
  }
  window.HSContactEmail = { open, history };
})();
