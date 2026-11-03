// Password recovery sends only to the canonical email of an active account.
// Capture is mandatory outside production; raw links are never logged/stored.
export async function deliverResetEmail(env,address,link,id) {
 if(env.ENVIRONMENT!=='production') return 'captured';
 if(env.PRAYER_EMAIL_DELIVERY_MODE!=='live' || !env.PRAYER_RESEND_API_KEY) return 'failed';
 const sender=env.PRAYER_EMAIL_FROM || 'admin@hopesojourns.com';
 if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(sender)) return 'failed';
 const escape=value=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const title='Reset your Hope Sojourns prayer portal password';
 const text=`Someone requested a password reset for your Hope Sojourns prayer portal account.\n\nUse this private link within one hour:\n${link}\n\nThe link works once. Your existing password and sessions stay unchanged unless you use it. If you did not request this, you can ignore this email. Your MMT account is separate.\n\nHope Sojourns\nGo with Hope. Serve with Faith.`;
 try {
  const response=await fetch('https://api.resend.com/emails',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${env.PRAYER_RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`prayer-reset-${id}`},body:JSON.stringify({from:`Hope Sojourns Prayer Portal <${sender}>`,to:[address],reply_to:sender,subject:title,text,html:`<h1>${title}</h1><p>Someone requested a password reset for your prayer portal account.</p><p><a href="${escape(link)}">Choose a new password</a></p><p>This private link expires in one hour and works once. If you did not request it, ignore this email. Your current password stays unchanged until you use the link. Your MMT account is separate.</p><p>Hope Sojourns<br>Go with Hope. Serve with Faith.</p>`})});
  if(!response.ok) return 'failed';const result=await response.json();return typeof result.id==='string' && result.id?'sent':'failed';
 } catch {return 'failed';}
}
export async function beginPasswordRecovery(db,account,env,url,h) {
 const time=Date.now(),id=crypto.randomUUID(),raw=h.token(),hash=await h.digest(raw);
 // The request row is the atomic guard; a public request never grants an admin role.
 const result=await db.batch([
  db.prepare("UPDATE portal_requests SET status='declined',revision=revision+1 WHERE kind='password' AND email=? AND status='pending' AND email_status='failed'").bind(account.email),
  db.prepare(`INSERT OR IGNORE INTO portal_requests (id,kind,email,profile,user_id,created_at,email_status) SELECT ?,'password',?,'{}',?,?, 'sending' WHERE EXISTS(SELECT 1 FROM users WHERE id=? AND email=? AND status='active')`).bind(id,account.email,account.id,time,account.id,account.email),
  db.prepare(`INSERT INTO password_resets SELECT ?,?,?,NULL,? WHERE EXISTS(SELECT 1 FROM portal_requests WHERE id=?)`).bind(hash,account.id,time+3600000,account.id,id)
 ]);
 if(result[1].meta.changes!==1) return;
 const delivery=deliverResetEmail(env,account.email,`${url.origin}/#reset=${raw}`,id).then(async status=>{
  // Failed transport never leaves a usable undisclosed token. Admins can follow up.
  await db.batch([
   ...(status==='failed'?[db.prepare('DELETE FROM password_resets WHERE token_hash=?').bind(hash)]:[]),
   db.prepare("UPDATE portal_requests SET email_status=?,status=?,revision=revision+1 WHERE id=? AND status='pending'").bind(status,status==='failed'?'pending':'approved',id)
  ]);
 }).catch(()=>{});
 if(h.defer) h.defer(delivery);else await delivery;
}
