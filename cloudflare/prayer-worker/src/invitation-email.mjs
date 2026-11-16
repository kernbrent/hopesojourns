// Only production sends mail. Persist delivery state, never the raw invitation.
export async function deliverInvitationEmail(env,address,link,id,inviter) {
 if(env.ENVIRONMENT!=='production') return 'captured';
 if(env.PRAYER_EMAIL_DELIVERY_MODE!=='live' || !env.PRAYER_RESEND_API_KEY) return 'failed';
 const sender=env.PRAYER_EMAIL_FROM || 'prayer@hopesojourns.com';
 if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(sender)) return 'failed';
 const escape=value=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const organization=env.PORTAL_ORGANIZATION_NAME || 'Hope Sojourns';
 const title=`You're invited to the ${organization} Prayer Portal`;
 const intro=`${inviter} has invited you to join the ${organization} Prayer Portal, a Christ-centered community for prayer, encouragement, and spiritual growth.`;
 const text=`${intro}\n\nAccept your invitation and choose your own username and password:\n${link}\n\nThis private link expires in seven days and works once. It is intended only for ${address}; please do not forward it. You'll join as a regular member. Your Prayer Portal account is separate from MMT.\n\nQuestions? Reply to this email. If you weren't expecting this invitation, you can ignore it.`;
 try {
  const response=await fetch('https://api.resend.com/emails',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${env.PRAYER_RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`prayer-invite-${id}`},body:JSON.stringify({from:`${organization.replace(/[<>\r\n"]/g,'')} Prayer Portal <${sender}>`,to:[address],reply_to:sender,subject:title,text,html:`<h1>You're invited</h1><p>${escape(intro)}</p><p><a href="${escape(link)}">Join the Prayer Portal</a></p><p>Choose your own username and password. This private invitation expires in seven days and works once. It is intended only for ${escape(address)}; please do not forward it.</p><p>You will join as a regular member. Your Prayer Portal account is separate from MMT.</p><p>Questions? Reply to this email. If you weren't expecting this invitation, you can ignore it.</p>`})});
  if(!response.ok) return 'failed';
  const result=await response.json();return typeof result.id==='string'&&result.id?'sent':'failed';
 } catch {return 'failed';}
}
