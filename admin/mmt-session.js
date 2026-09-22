/* Navigation reflects server-enforced permissions. API checks remain authoritative. */
(()=>{
 const map=[['/admin/shared-signin/','self'],['/admin/account/','self'],['/admin/destinations/','destinations'],['/admin/finance/','finances'],['/admin/trips/','trips']];
 function section(path,hash){if(path==='/admin/ministry/')return hash==='#documents'?'documents':hash.startsWith('#trip')||hash.startsWith('#account')?'trips':hash==='#finances'?'finances':'inbox';if(path==='/admin/'||path==='/admin/index.html')return ['#ledger','#income','#expenses','#csm-inbox'].includes(hash)?'finances':'contacts';return map.find(([p])=>path.startsWith(p))?.[1];}
 fetch('/api/interest/admin/session',{cache:'no-store'}).then(async r=>{if(!r.ok)return;const data=await r.json(),u=data.user;if(!u)return;window.MmtUser=u;
  const allowed=s=>s==='self'||u.is_admin||['read','edit'].includes(u.permissions[s]);
  if(u.must_change_password&&!location.pathname.startsWith('/admin/account/')){location.replace('/admin/account/#password');return;}
  if(!allowed(section(location.pathname,location.hash))){location.replace('/admin/account/');return;}
  window.HSMmtNav?.mount(u);
  function update(){document.querySelectorAll('a[href^="/admin/"]').forEach(a=>{const url=new URL(a.href),s=section(url.pathname,url.hash);if(s&&!allowed(s))a.hidden=true;});
   const s=section(location.pathname,location.hash),readonly=!u.is_admin&&u.permissions[s]==='read';
   document.querySelectorAll('button').forEach(b=>{if(b.closest('[role=dialog],dialog')&&b.type==='submit'||/^(Add |Create |Save|Delete|Remove|Import|Approve|Reject|Send |Upload|Replace|Mark |Record |Finish budget|Edit$|Photo$)/i.test(b.textContent.trim())){if(readonly){b.disabled=true;b.dataset.mmtReadonly='true';b.title='Read-only access';}else if(b.dataset.mmtReadonly){b.disabled=false;delete b.dataset.mmtReadonly;}}});
  }update();new MutationObserver(update).observe(document.body,{childList:true,subtree:true});window.addEventListener('hashchange',()=>{if(!allowed(section(location.pathname,location.hash)))location.replace('/admin/account/');else update();});
 }).catch(()=>{});
})();
