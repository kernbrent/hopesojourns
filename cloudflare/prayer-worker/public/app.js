const $ = selector => document.querySelector(selector);
let user, csrf, people = [], groups = [], activeGroup = null, currentView = 'feed', olderThan, pendingDelete;
let site = {allowMemberGroups:true,organizationName:'Hope Sojourns'}, sessionGeneration = 0;
let adminTab='users',adminCursor=null,pendingAdminAction=null,adminLoadGeneration=0;
let resourceImageChange,resourceImageGeneration=0,pendingResourceReview=null;
let resourceCategories=[],resourceOffset=0,resourceGeneration=0,editingResource=null,editingCategory=null,deletingResource=null;
let inviteToken = new URLSearchParams(location.hash.slice(1)).get('invite');
let resetToken = new URLSearchParams(location.hash.slice(1)).get('reset');
// A fragment keeps the bearer invitation out of HTTP logs and Referer headers.
if (inviteToken || resetToken) history.replaceState(null, '', '/');
const labels = { request: 'Prayer request', update: 'Update', answered: 'Answered prayer' };
const audiences = { members: 'All portal members + admins', selected: 'Selected people + admins', admins: 'Only the author + admins' };
function element(tag, content, className) {
  const node = document.createElement(tag); if (content !== undefined) node.textContent = content;
  if (className) node.className = className; return node;
}
function displayTime(value) {return new Date(value).toLocaleString(undefined,user?.timezone?{timeZone:user.timezone}:undefined);}
function notice(message, error = false) {
  $('#message').textContent = message; $('#message').className = error ? 'error' : ''; $('#message').hidden = !message;
  const local = [...document.querySelectorAll('dialog[open] .dialog-message')].at(-1);
  if (local) { local.textContent = message; local.hidden = !error || !message; }
}
function applySite(config) {
  site = config;
  $('#environment-banner').hidden = config.environment === 'production';
  $('#environment-banner').textContent = config.environment === 'test' ? 'Test prayer portal — separate accounts and prayer data' : 'Local preview — sample data only';
  for (const id of ['community-name','community-eyebrow']) $(`#${id}`).textContent = config.communityName;
  $('#welcome-title').textContent = config.welcomeTitle; $('#welcome-message').textContent = config.welcomeMessage;
  document.title = `Prayer Portal | ${config.organizationName}`;
  $('.prayer-brand').setAttribute('aria-label',`${config.organizationName} prayer portal home`);
  $('.prayer-brand img').src=config.logoPath;
  $('.prayer-brand img').alt=`${config.organizationName} — ${config.organizationTagline}`;
  $('#footer-organization').textContent=config.organizationName;
  $('#footer-tagline').textContent=config.organizationTagline;
  $('#invite-help').textContent = `Need an invitation or help signing in? Contact your ${config.organizationName} portal admin. This account is separate from MMT.`;
}
async function api(path, data, method) {
  const generation = sessionGeneration;
  const response = await fetch(`/api/${path}`, { method: method || (data ? 'POST' : 'GET'), credentials: 'same-origin',
    headers: data || method ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf || '' } : {}, body: data ? JSON.stringify(data) : undefined });
  const result = await response.json();
  if (generation !== sessionGeneration) throw new Error('Your session changed. Please try again.');
  if (!response.ok) { if (response.status === 401 && user) signedOut(); throw new Error(result.error || 'Please try again.'); } return result;
}
function action(fn) { return async event => { const button = event?.submitter || (event?.currentTarget?.tagName === 'BUTTON' ? event.currentTarget : null); if (button) button.disabled = true;
  try { await fn(event); } catch (error) { notice(error.message, true); } finally { if (button) button.disabled = false; } }; }
function setupAuth() {
  $('#login-form').hidden = !!inviteToken || !!resetToken; $('#accept-form').hidden = !inviteToken || !!resetToken; $('#reset-form').hidden=!resetToken;
  $('#auth-title').textContent = resetToken?'Choose a new password.':inviteToken ? 'You’re invited.' : 'Come on in.';
  $('#auth-description').textContent = resetToken?'Use this private reset link to restore access.':inviteToken ? 'Set up your own prayer portal account.' : 'Sign in with your prayer portal account.';
}
function signedOut() { sessionGeneration++; user = null; csrf = null; people = []; groups = []; activeGroup = null; $('#community').hidden = true; $('#welcome').hidden = false; $('#logout').hidden = true;
  for (const id of ['posts','people','notifications','invites','recipients','groups','group-overview','group-members','group-actions','group-preferences','group-member-invite','admin-items']) $(`#${id}`).replaceChildren();
  clearResources();
  $('#profile-form').reset();
  adminLoadGeneration++;$('#admin-private-link').value='';$('#admin-link-result').hidden=true;pendingAdminAction=null;
  $('#invite-link').value = ''; $('#invite-result').hidden = true; document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close()); setupAuth(); }
async function signedIn(data) {
  sessionGeneration++;
  user = data.user; csrf = data.csrf; inviteToken = null;
  $('#invites-nav').hidden = user.role !== 'admin';
  $('#admin-nav').hidden = user.role !== 'admin';
  $('#greeting').textContent = `Welcome, ${user.name}.${user.role==='admin'?user.owner?' You are the portal owner.':' You have portal admin access.':' There is room for your story here.'}`;
  [people,groups] = await Promise.all([api('people'),api('groups')]); await showView('feed'); await refreshNotifications();
  $('#welcome').hidden = true; $('#community').hidden = false; $('#logout').hidden = false;
}
function empty(container, message) { container.replaceChildren(element('div', message, 'empty')); }
function postCard(post, notification = false) {
  const card = element('article', undefined, 'post');
  const meta = element('div', undefined, 'post-meta');
  meta.append(element('span', post.author_name.slice(0, 1).toUpperCase(), 'avatar'), element('strong', post.author_name), element('span', displayTime(post.created_at)), element('span', labels[post.kind], `badge ${post.kind}`));
  if (notification && !post.read_at) meta.append(element('span', 'New', 'badge'));
  const audience = post.group_id ? {members:'Group members + portal admins',selected:'Selected group members + portal admins',admins:'Only the author + portal admins'}[post.audience] : audiences[post.audience];
  const footer = element('div', undefined, 'post-bottom'); footer.append(element('span', `${post.group_name ? `${post.group_name} · ` : ''}${audience}`));
  if (!notification && (post.author_id === user.id || user.role === 'admin')) {
    const button = element('button', 'Remove'); button.addEventListener('click', () => {
      if(user.role==='admin' && post.author_id!==user.id) openAdminAction('posts',post.id,'delete',post.title);
      else {pendingDelete = post.id; $('#delete-dialog').showModal();}
    }); footer.append(button);
  }
  card.append(meta, element('h3', post.title), element('div', post.body, 'post-body'), footer); return card;
}
async function loadPosts(append = false) {
  const params = new URLSearchParams({ kind: $('#kind-filter').value, following: currentView === 'following' ? '1' : '0' });
  if (currentView === 'group' && activeGroup) params.set('group',activeGroup.id);
  if (append && olderThan) params.set('before', olderThan);
  const result = await api(`posts?${params}`);
  if (!append) $('#posts').replaceChildren();
  if (!result.posts.length && !append) empty($('#posts'), currentView === 'following' ? 'Follow someone in the People directory to see their shared prayers here.' : 'A quiet beginning. Share the first prayer with your chosen audience.');
  for (const post of result.posts) $('#posts').append(postCard(post));
  olderThan = result.cursor; $('#load-more').hidden = !result.more;
}
function renderPeople() {
  $('#people').replaceChildren(); if (!people.length) empty($('#people'), 'Your community will appear here as invited people join.');
  const filtered = people.filter(person => person.name.toLowerCase().includes($('#people-search').value.toLowerCase()));
  if (!filtered.length) empty($('#people'),'No people match your search.');
  for (const person of filtered) {
    const form = element('form', undefined, 'person'); form.append(element('h3', `${person.name}${person.id === user.id ? ' · You' : ''}${person.role === 'admin' ? ' · Portal admin' : ''}`));
    if(person.username) form.append(element('p',`@${person.username}`,'hint'));
    if(person.bio) form.append(element('p',person.bio));
    if (person.id !== user.id) {
    const choices = element('div', undefined, 'choices');
    for (const [key,label] of [['following','Follow this person'],['requests','Prayer requests'],['updates','Updates'],['answered','Answered prayers']]) {
      const wrapper = element('label'), input = element('input'); input.type = 'checkbox'; input.name = key;
      input.checked = key === 'following' ? !!person.following : person[key] == null || !!person[key]; wrapper.append(input, document.createTextNode(` ${label}`)); choices.append(wrapper);
    }
    const save = element('button','Save preferences'); save.type = 'submit'; form.append(choices,save);
    form.addEventListener('submit', event => { event.preventDefault(); action(async () => {
      const data = { userId: person.id }; for (const key of ['following','requests','updates','answered']) data[key] = form.elements[key].checked;
      await api('follow', data); people = await api('people'); notice(`Preferences saved for ${person.name}.`);
    })(event); });
    }
    const led = groups.filter(group => group.owner_id === person.id);
    if (led.length) {
      const links = element('div',undefined,'group-links'); links.append(element('p','Groups they lead','hint'));
      for (const group of led) links.append(button(group.name,() => openGroup(group.id)));
      form.append(links);
    }
    $('#people').append(form);
  }
}
const categoryLabels = {accountability:'Accountability',prayer:'Prayer group',partners:'Prayer partners',other:'Community group'};
const statusLabels = {approved:'Member',pending:'Request pending',invited:'Invitation to join',declined:'Request declined',removed:'Membership removed',left:'Not a member'};
function button(label,fn,className) { const node=element('button',label,className); node.type='button'; node.addEventListener('click',action(fn)); return node; }
function renderGroups() {
  const mine = currentView === 'groups';
  $('#groups-title').textContent = mine ? 'My groups & invitations' : 'Discover groups';
  $('#groups-help').textContent = mine ? 'Your accountability circles, prayer groups, invitations, and pending requests.' : 'Find a circle to grow with. Ask to join; a group leader will review your request.';
  $('#create-group-button').hidden = !site.allowMemberGroups && user.role !== 'admin';
  const search = $('#group-search').value.toLowerCase();
  const matching = groups.filter(g => mine ? ['approved','pending','invited'].includes(g.membership) : !!g.discoverable || user.role==='admin')
    .filter(g => `${g.name} ${g.description} ${g.owner_name} ${categoryLabels[g.category]}`.toLowerCase().includes(search));
  $('#groups').replaceChildren();
  if (!matching.length) empty($('#groups'), mine ? 'Your circle starts here. Create a group, or discover one and ask to join.' : 'No groups match. You can create a group and invite people to join you.');
  matching.forEach(g => {
    const card=element('article',undefined,'group-card');
    const tags=element('div',undefined,'post-meta'); tags.append(element('span',categoryLabels[g.category],'badge'),element('span',g.discoverable ? 'Listed in the portal' : 'Unlisted'));
    card.append(tags,element('h3',g.name),element('p',g.description),element('p',`Led by ${g.owner_name}`,'hint'));
    if(g.membership) card.append(element('p',g.owner_id===user.id ? 'You lead this group' : statusLabels[g.membership],'membership-state'));
    if(g.pending_count) card.append(element('p',`${g.pending_count} join request${g.pending_count===1?'':'s'} to review`,'membership-state'));
    const actions=element('div',undefined,'actions');
    actions.append(button(g.membership==='approved' ? 'Open group' : 'View group',()=>openGroup(g.id)));
    if(g.membership==='invited') actions.append(button('Accept invitation',()=>membershipAction(g.id,'join',{}),'primary'));
    else if((!g.membership || g.membership==='left') && g.discoverable) actions.append(button('Ask to join',()=>membershipAction(g.id,'join',{}),'primary'));
    card.append(actions); $('#groups').append(card);
  });
}
async function membershipAction(id,route,data,message) {
  const result=await api(`groups/${encodeURIComponent(id)}/${route}`,data);
  groups=await api('groups');
  if(route==='leave') await showView('groups'); else if(currentView==='group') await openGroup(id); else await showView(currentView);
  notice(message || (result.status==='approved' ? 'You joined the group. You can now read its shared prayers.' : result.status==='pending' ? 'Your request was sent to the group leader.' : 'Group updated.'));
}
async function openGroup(id) {
  activeGroup=await api(`groups/${encodeURIComponent(id)}`); await showView('group');
}
function renderGroupDetail() {
  const g=activeGroup, approved=g.membership==='approved';
  const overview=$('#group-overview'); overview.replaceChildren(element('span',categoryLabels[g.category],'eyebrow'),element('h2',g.name),element('p',g.description),element('p',`Led by ${g.owner_name} · ${g.discoverable ? 'Listed' : 'Unlisted'}`,'hint'));
  overview.append(element('p',g.owner_id===user.id ? 'You lead this group.' : statusLabels[g.membership] || 'Ask to join this group to see its shared prayers and members.','membership-state'));
  const actions=$('#group-actions'); actions.replaceChildren();
  if(approved) actions.append(button('Share a group prayer',()=>openComposer(g.id),'primary'));
  if(g.membership==='invited') actions.append(button('Accept invitation',()=>membershipAction(g.id,'join',{}),'primary'));
  else if(!g.membership || g.membership==='left') if(g.discoverable) actions.append(button('Ask to join',()=>membershipAction(g.id,'join',{}),'primary'));
  if(['approved','pending','invited'].includes(g.membership) && g.owner_id!==user.id) actions.append(button(approved ? 'Leave group' : g.membership==='invited' ? 'Decline invitation' : 'Cancel request',()=>membershipAction(g.id,'leave',{},'Your group membership or request was withdrawn.')));
  $('#group-manage').hidden = !approved && !g.canManage;
  $('#group-manage').open = g.canManage && g.members.some(m=>m.status==='pending');
  const prefs=$('#group-preferences'); prefs.replaceChildren();
  if(approved) {
    const form=element('form',undefined,'group-alerts'); form.append(element('h3','Notify me about group posts'));
    const choices=element('div',undefined,'choices');
    for(const [key,label] of [['requests','Prayer requests'],['updates','Updates'],['answered','Answered prayers']]) {
      const wrapper=element('label'),input=element('input'); input.type='checkbox'; input.name=key; input.checked=!!g[key]; wrapper.append(input,document.createTextNode(` ${label}`)); choices.append(wrapper);
    }
    const save=element('button','Save group notifications'); save.type='submit'; form.append(choices,save);
    form.addEventListener('submit',event=>{event.preventDefault(); action(async()=>{
      const data={}; for(const key of ['requests','updates','answered']) data[key]=form.elements[key].checked;
      await api(`groups/${g.id}/preferences`,data); notice('Group notification preferences saved. Preferences for people you follow apply separately.');
    })(event);}); prefs.append(form);
  }
  const members=$('#group-members'); members.replaceChildren(element('h3',g.canManage ? 'Members & join requests' : 'Group members'));
  for(const member of g.members) {
    const row=element('div',undefined,'member-row'); row.append(element('strong',member.name),element('span',member.user_id===g.owner_id ? 'Group leader' : statusLabels[member.status],'hint'));
    if(g.canManage && member.user_id!==g.owner_id) {
      const actions=element('div',undefined,'actions');
      if(member.status==='pending') for(const [decision,label] of [['approve','Approve request'],['decline','Decline request']]) actions.append(button(label,()=>membershipAction(g.id,`members/${member.user_id}`,{decision})));
      if(['approved','invited'].includes(member.status)) actions.append(button(member.status==='invited' ? 'Revoke invitation' : 'Remove member',()=>membershipAction(g.id,`members/${member.user_id}`,{decision:'remove'})));
      row.append(actions);
    }
    members.append(row);
  }
  const invite=$('#group-member-invite'); invite.replaceChildren();
  if(g.canManage) {
    const candidates=people.filter(person=>!g.members.some(m=>m.user_id===person.id && ['approved','pending','invited'].includes(m.status)));
    const form=element('form',undefined,'group-invite-form'), label=element('label','Invite a portal member'), select=element('select'); select.name='userId'; select.required=true;
    const placeholder=element('option','Choose a person'); placeholder.value=''; select.append(placeholder);
    for(const person of candidates) {const option=element('option',person.name); option.value=person.id; select.append(option);}
    label.append(select); const submit=element('button','Invite to group'); submit.type='submit'; submit.disabled=!candidates.length;
    form.append(label,element('p','They must accept before seeing group members and shared prayers.','hint'),submit);
    form.addEventListener('submit',event=>{event.preventDefault(); const person=select.value; action(()=>membershipAction(g.id,'members',{userId:person},'Group invitation created. It will appear in their My groups & invitations view.'))(event);}); invite.append(form);
  }
}
async function refreshNotifications() {
  if (!user) return; const rows = await api('notifications'); const unread = rows.filter(x => !x.read_at).length;
  $('#unread').textContent = unread ? `(${unread})` : ''; $('#notifications').replaceChildren();
  if (!rows.length) empty($('#notifications'), 'You’re all caught up. Follow people to receive notifications about their new posts.');
  rows.forEach(row => $('#notifications').append(postCard(row,true)));
  await refreshResourceReviewCount();
}
async function loadInvites() {
  const rows = await api('invites'); $('#invites').replaceChildren();
  if (!rows.length) empty($('#invites'), 'No invitations yet. Invite someone to join you in prayer.');
  for (const row of rows) {
    const item = element('div', undefined, 'panel'); const active = !row.used_at && row.expires_at > Date.now();
    item.append(element('strong',row.email), element('p',`${row.role === 'admin' ? 'Admin' : 'Member'} · ${row.used_at ? 'Accepted' : active ? `Expires ${new Date(row.expires_at).toLocaleDateString()}` : 'Expired or revoked'}`));
    if (active) { const revoke = element('button','Revoke invitation'); revoke.addEventListener('click',action(async () => { await api(`invites/${row.id}`,null,'DELETE'); await loadInvites(); notice('Invitation revoked.'); })); item.append(revoke); }
    $('#invites').append(item);
  }
}
async function showView(view) {
  currentView = view; notice('');
  if(view!=='group') activeGroup=null;
  for (const name of ['feed','people','notifications','invites','groups','group-detail','admin','profile','resources']) $(`#${name}-view`).hidden = !(name === view || (name === 'feed' && view === 'following') || (name==='groups' && view==='discover') || (name==='group-detail' && view==='group') || (name==='feed' && view==='group' && (activeGroup?.membership==='approved' || user.role==='admin')));
  document.querySelectorAll('[data-view]').forEach(button => { const selected = button.dataset.view === view || (view==='group' && button.dataset.view==='groups'); button.classList.toggle('active',selected); if (selected) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current'); });
  if (view === 'feed' || view === 'following') { $('#feed-title').textContent = view === 'feed' ? 'The prayer wall' : 'People I follow'; await loadPosts(); }
  if (view === 'people') { [people,groups]=await Promise.all([api('people'),api('groups')]); renderPeople(); }
  if (view === 'groups' || view === 'discover') { groups=await api('groups'); renderGroups(); }
  if (view === 'group') {
    renderGroupDetail(); $('#posts').replaceChildren(); $('#feed-title').textContent='Prayers in this group';
    if(activeGroup.membership==='approved' || user.role==='admin') await loadPosts();
  }
  if (view === 'notifications') await refreshNotifications();
  if (view === 'invites' && user.role === 'admin') await loadInvites();
  if(view==='admin' && user.role==='admin') await loadAdmin();
  if(view==='resources') await loadResources();
  if(view==='profile') {const current=await api('me');user=current.user;renderProfile();}
}
$('#login-form').addEventListener('submit',event => { event.preventDefault(); action(async () => {
  const form = event.currentTarget; const data = Object.fromEntries(new FormData(form)); const result = await api('login',data); form.reset(); notice(''); await signedIn(result);
})(event); });
$('#accept-form').addEventListener('submit',event => { event.preventDefault(); action(async () => {
  const form = event.currentTarget; const data = Object.fromEntries(new FormData(form)); const result = await api('accept',{ ...data, token: inviteToken }); form.reset(); notice(''); await signedIn(result);
})(event); });
$('#logout').addEventListener('click',action(async () => { await api('logout',{}); signedOut(); notice('You have signed out.'); }));
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click',action(() => showView(button.dataset.view))));
$('#kind-filter').addEventListener('change',action(() => loadPosts()));
$('#load-more').addEventListener('click',action(() => loadPosts(true)));
async function composerAudience() {
  const groupId=$('#post-group').value;
  let candidates=people.filter(person=>person.id!==user.id);
  if(groupId) {
    const group=await api(`groups/${encodeURIComponent(groupId)}`);
    candidates=group.members.filter(person=>person.status==='approved' && person.account_status==='active' && person.user_id!==user.id).map(person=>({id:person.user_id,name:person.name}));
  }
  // Late responses from a previously selected group must not replace the choices.
  if($('#post-group').value!==groupId) return;
  $('#recipients').replaceChildren();
  candidates.forEach(person=>{const label=element('label'),check=element('input'); check.type='checkbox'; check.name='recipient'; check.value=person.id; label.append(check,document.createTextNode(` ${person.name}`)); $('#recipients').append(label);});
  if(!candidates.length) $('#recipients').append(element('p','No other members are available. Choose admins only for now.'));
  $('#audience').options[1].textContent=groupId ? 'Selected group members and portal admins' : 'Selected people and portal admins';
  $('#audience').options[2].textContent=groupId ? 'This group’s members and portal admins' : 'All portal members and admins';
  $('#post-privacy').textContent=groupId ? 'Portal admins can see every post. Group leaders only see restricted posts when included. Approved members, including those who join later, can see group-shared prayers. Selected-person prayers require current group membership. Following never grants access.' : 'Portal admins can see every post. Following does not grant access. Choose an audience for every new post.';
}
async function openComposer(groupId='') {
  [people,groups]=await Promise.all([api('people'),api('groups')]);
  $('#post-form').reset(); $('#recipient-options').hidden=true; $('#post-group').replaceChildren();
  const community=element('option','The prayer community'); community.value=''; $('#post-group').append(community);
  groups.filter(g=>g.membership==='approved').forEach(g=>{const option=element('option',g.name); option.value=g.id; $('#post-group').append(option);});
  $('#post-group').value=groupId; await composerAudience();
  $('#compose .dialog-message').hidden=true; $('#compose').showModal();
}
$('#compose-button').addEventListener('click',action(()=>openComposer(activeGroup?.membership==='approved' ? activeGroup.id : '')));
$('#post-group').addEventListener('change',action(async()=>{ $('#audience').value='admins'; $('#recipient-options').hidden=true; await composerAudience(); }));
$('#close-compose').addEventListener('click',() => $('#compose').close());
$('#audience').addEventListener('change',() => { $('#recipient-options').hidden = $('#audience').value !== 'selected'; });
$('#post-form').addEventListener('submit',event => { event.preventDefault(); action(async () => {
  const data = Object.fromEntries(new FormData(event.currentTarget)); data.recipients = [...document.querySelectorAll('[name=recipient]:checked')].map(input => input.value);
  await api('posts',data); $('#compose').close();
  if(data.groupId) await openGroup(data.groupId); else await showView('feed');
  notice('Your prayer was shared with the audience you chose.');
})(event); });
$('#cancel-delete').addEventListener('click',() => $('#delete-dialog').close());
$('#confirm-delete').addEventListener('click',action(async () => { await api(`posts/${pendingDelete}`,null,'DELETE'); $('#delete-dialog').close(); await loadPosts(); await refreshNotifications(); notice('Post removed.'); }));
$('#read-all').addEventListener('click',action(async () => { await api('notifications/read',{}); await refreshNotifications(); }));
$('#invite-form').addEventListener('submit',event => { event.preventDefault(); action(async () => {
  const result = await api('invites',Object.fromEntries(new FormData(event.currentTarget))); $('#invite-link').value = result.link; $('#invite-result').hidden = false; await loadInvites(); notice('Invitation created. Share its private link directly with the invited person.');
})(event); });
$('#copy-invite').addEventListener('click',action(async () => { await navigator.clipboard.writeText($('#invite-link').value); notice('Invitation link copied.'); }));
async function loadAdmin(append=false) {
  const generation=++adminLoadGeneration,mode=adminTab;
  const params=new URLSearchParams({search:$('#admin-search').value});
  if(append && adminCursor) params.set('before',adminCursor);
  const result=await api(`admin/${mode}?${params}`);
  if(generation!==adminLoadGeneration || currentView!=='admin' || !user || user.role!=='admin') return;
  document.querySelectorAll('[data-admin-tab]').forEach(node=>node.setAttribute('aria-pressed',String(node.dataset.adminTab===mode)));
  $('#admin-search-form').hidden=mode==='audit';
  if(!append) $('#admin-items').replaceChildren();
  const items=mode==='audit'?result:result.items;
  if(!items.length && !append) empty($('#admin-items'),mode==='audit'?'No administrative actions have been recorded. The most recent 100 actions will appear here.':'No matching accounts or content.');
  for(const item of items) {
    if(mode==='users') $('#admin-items').append(adminAccount(item));
    if(mode==='posts') {
      const card=postCard(item,true),actions=element('div',undefined,'actions');
      actions.append(button('Delete prayer',()=>openAdminAction('posts',item.id,'delete',item.title)));card.append(actions);$('#admin-items').append(card);
    }
    if(mode==='groups') {
      const card=element('article',undefined,'group-card');
      card.append(element('h3',item.name),element('p',item.description),element('p',`Led by ${item.owner_name} · ${item.discoverable?'Listed':'Unlisted'} · ${item.member_count} members · ${item.post_count} prayers`,'hint'));
      const actions=element('div',undefined,'actions');actions.append(button('View group',()=>openGroup(item.id)),button('Delete group',()=>openAdminAction('groups',item.id,'delete',item.name)));card.append(actions);$('#admin-items').append(card);
    }
    if(mode==='audit') {
      const card=element('article',undefined,'panel');
      card.append(element('strong',`${item.actor_name} · ${item.action}`),element('p',`${item.target_type} · ${item.target_id}`,'hint'),element('p',item.reason),element('p',displayTime(item.created_at),'hint'));$('#admin-items').append(card);
    }
  }
  adminCursor=result.cursor;$('#admin-more').hidden=mode==='audit' || !result.more;
}
function adminAccount(person) {
  const card=element('article',undefined,'panel account-card');
  card.append(element('h3',person.name),element('p',`Username: ${person.username||person.email}`),element('p',person.email));
  if(person.gender || person.birth_date) card.append(element('p',`Gender: ${person.gender||'Not provided'} · Birth date: ${person.birth_date||'Not provided'}`,'hint'));
  if(person.phone || person.timezone) card.append(element('p',`${person.phone||'No phone'} · ${person.timezone||'No time zone'}`,'hint'));
  if(person.bio) card.append(element('p',person.bio));
  const state=element('div',undefined,'account-state');
  state.append(element('span',person.is_owner?'Primary owner':person.role==='admin'?'Portal admin':'Regular member','badge'),element('span',person.status,'badge'));
  if(person.locked_until) state.append(element('span',`Sign-in locked until ${new Date(person.locked_until).toLocaleTimeString()}`,'badge'));
  card.append(state,element('p',`Joined ${new Date(person.created_at).toLocaleDateString()}`,'hint'));
  if(person.id===user.id) card.append(element('p','Your account — self-suspension, self-deletion, and self-demotion are blocked.','hint'));
  else if(person.status!=='deleted') {
    const actions=element('div',undefined,'actions');
    actions.append(button('Unlock sign-in',()=>openAdminAction('users',person.id,'unlock',person.name)));
    if(!person.is_owner) {
      actions.append(button('Change username',()=>openAdminAction('users',person.id,'username',person.name)));
      if(person.bio) actions.append(button('Clear introduction',()=>openAdminAction('users',person.id,'clear-bio',person.name)));
      actions.append(button(person.status==='active'?'Suspend account':'Reactivate account',()=>openAdminAction('users',person.id,person.status==='active'?'suspend':'reactivate',person.name)));
      if(person.status==='active') actions.append(button('Create password-reset link',()=>openAdminAction('users',person.id,'password-reset',person.name)));
      actions.append(button(person.role==='admin'?'Make regular member':'Grant admin access',()=>openAdminAction('users',person.id,'role',person.name,person.role==='admin'?'member':'admin')));
      actions.append(button('Delete account',()=>openAdminAction('users',person.id,'delete',person.name)));
    } else card.append(element('p','Primary-owner access is protected from suspension, deletion, role changes, and password resets by other admins.','hint'));
    card.append(actions);
  }
  return card;
}
function openAdminAction(type,id,action,name,role) {
  pendingAdminAction={type,id,action,role};$('#admin-action-form').reset();$('#admin-action .dialog-message').hidden=true;
  const titles={'clear-bio':'Clear introduction',username:'Change username',suspend:'Suspend account',reactivate:'Reactivate account',unlock:'Unlock sign-in','password-reset':'Create password-reset link',role:role==='admin'?'Grant admin access':'Make regular member',delete:type==='users'?'Delete account':type==='groups'?'Delete group':'Delete prayer'};
  const descriptions={
    'clear-bio':'This removes the person’s public introduction from the directory while keeping the account and its prayers. The introduction text is not retained in the audit log.',
    username:'This changes the sign-in username and signs the person out. Their email stays attached to the same account and can still be used to sign in.',
    suspend:'This signs the person out immediately and blocks sign-in. Existing prayers and groups remain until separately moderated.',
    reactivate:'This restores account access and clears the temporary email sign-in lock. The person must sign in again.',
    unlock:'This clears the temporary email sign-in lock. It does not reactivate a suspended account. Shared network rate limits remain in effect.',
    'password-reset':'This signs the person out and creates a private, single-use link valid for one hour. Share it directly with the account owner; they choose their own password. No email is sent automatically.',
    role:role==='admin'?'This explicitly grants access to every prayer, including restricted prayers, and to account and content moderation. The person is signed out so their next login uses the new role. Invitations still create regular members.':'This removes admin permissions and signs the person out. They retain regular member access.',
    delete:type==='users'?'This permanently removes their prayers, signs them out, anonymizes their account, and transfers their groups to you. Other members’ prayers remain. The minimal audit record is retained. The account cannot be restored.':type==='groups'?'This permanently removes the group, all its prayers, membership records, and related notifications. This cannot be undone.':'This permanently removes the prayer and its notifications. This cannot be undone.'
  };
  $('#admin-action-title').textContent=`${titles[action]}: ${name}`;$('#admin-action-help').textContent=descriptions[action];
  $('#admin-delete-confirm').hidden=action!=='delete';$('#admin-action-form').elements.confirmation.required=action==='delete';
  $('#admin-username-field').hidden=action!=='username';$('#admin-action-form').elements.username.required=action==='username';
  $('#admin-action-submit').textContent=titles[action];$('#admin-action').showModal();
}
document.querySelectorAll('[data-admin-tab]').forEach(node=>node.addEventListener('click',action(async()=>{adminTab=node.dataset.adminTab;$('#admin-private-link').value='';$('#admin-link-result').hidden=true;await loadAdmin();})));
$('#admin-search-form').addEventListener('submit',event=>{event.preventDefault();action(()=>loadAdmin())(event);});
$('#admin-more').addEventListener('click',action(()=>loadAdmin(true)));
$('#close-admin-action').addEventListener('click',()=>$('#admin-action').close());
$('#admin-action-form').addEventListener('submit',event=>{event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget)),target=pendingAdminAction;action(async()=>{
  const result=await api(`admin/${target.type}/${encodeURIComponent(target.id)}/${target.action}`,{reason:values.reason,confirmation:values.confirmation,username:values.username,role:target.role});
  $('#admin-action').close();if(currentView==='admin') await loadAdmin();else {await loadPosts();await refreshNotifications();}
  if(result.link) {$('#admin-private-link').value=result.link;$('#admin-link-result').hidden=false;notice('Private password-reset link created. Share it only with that account owner.');}
  else notice('Admin action completed and recorded.');
})(event);});
$('#copy-admin-link').addEventListener('click',action(async()=>{await navigator.clipboard.writeText($('#admin-private-link').value);notice('Private reset link copied.');}));
$('#reset-form').addEventListener('submit',event=>{event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget));action(async()=>{
  if(values.password!==values.confirm) throw new Error('The two passwords do not match.');
  await api('reset-password',{token:resetToken,password:values.password});resetToken=null;event.target.reset();setupAuth();notice('Password saved. Sign in with your username or email and new password.');
})(event);});
function renderProfile() {
  const form=$('#profile-form');
  for(const key of ['name','username','email','phone','timezone','bio','gender','birth_date']) form.elements[key].value=user[key]||'';
  for(const key of ['notify_requests','notify_updates','notify_answered']) form.elements[key].checked=user[key];
  $('#profile-role').textContent=`Access: ${user.owner?'Primary owner':user.role==='admin'?'Portal admin':'Regular member'}. Members cannot change their own role, status, or associated email here.`;
}
$('#profile-form').addEventListener('submit',event=>{event.preventDefault();const form=event.currentTarget,data=Object.fromEntries(new FormData(form));for(const key of ['notify_requests','notify_updates','notify_answered']) data[key]=form.elements[key].checked;action(async()=>{
  const result=await api('profile',data);user=result.user;renderProfile();$('#greeting').textContent=`Welcome, ${user.name}.${user.role==='admin'?user.owner?' You are the portal owner.':' You have portal admin access.':''}`;notice('Account details and notification preferences saved.');
})(event);});
$('#group-search').addEventListener('input',renderGroups);
$('#people-search').addEventListener('input',renderPeople);
$('#back-to-groups').addEventListener('click',action(()=>showView('groups')));
$('#create-group-button').addEventListener('click',()=>{ $('#group-form').reset(); $('#create-group .dialog-message').hidden=true; $('#create-group').showModal(); });
$('#close-group-form').addEventListener('click',()=>$('#create-group').close());
$('#group-form').addEventListener('submit',event=>{event.preventDefault(); const data=Object.fromEntries(new FormData(event.currentTarget)); action(async()=>{
  const result=await api('groups',{name:data.name,description:data.description,category:data.category,discoverable:data.discovery==='listed'});
  $('#create-group').close(); groups=await api('groups'); await openGroup(result.id); notice('Your group is ready. Invite people or approve their requests to join.');
})(event);});
setupAuth();
api('site').then(applySite).then(()=>resetToken ? null : api('me')).then(data=>data && signedIn(data)).catch(error => { if (error.message !== 'Please sign in to the prayer portal.') notice(error.message,true); });
setInterval(() => { if (user && !document.hidden) refreshNotifications().catch(error => notice(error.message,true)); },60000);
function clearResources() {
 resourceImageGeneration++;resourceImageChange=undefined;pendingResourceReview=null;
 for(const id of ['resource-pending-count','admin-resource-count']) $(`#${id}`).textContent='';
 $('#resource-review-banner').hidden=true;$('#resource-image-preview').removeAttribute('src');$('#resource-image-preview').hidden=true;
 resourceGeneration++; resourceCategories=[];editingResource=null;editingCategory=null;deletingResource=null;resourceOffset=0;
 for(const id of ['resource-items','resource-category-items']) $(`#${id}`).replaceChildren();
 for(const id of ['resource-form','resource-search','resource-category-form','resource-delete-form']) $(`#${id}`).reset();
 resourceOptions($('#resource-search').elements.category,[],'All categories');
 resourceOptions($('#resource-search').elements.tag,[],'All tags');
 resourceOptions($('#resource-form').elements.category_id,[]);
 $('#resource-count').textContent='';
}
function resourceOptions(select,items,placeholder) {
 const value=select.value;select.replaceChildren();
 if(placeholder) {const option=element('option',placeholder);option.value='';select.append(option);}
 for(const item of items) {const option=element('option',item.name);option.value=item.id;select.append(option);}
 if([...select.options].some(option=>option.value===value)) select.value=value;
}
async function loadResources(append=false) {
 const generation=++resourceGeneration,form=$('#resource-search'),isAdmin=user.role==='admin';
 for(const id of ['add-resource','manage-categories','resource-visibility-label','resource-review-label']) $(`#${id}`).hidden=!isAdmin;
 $('#recommend-resource').hidden=isAdmin;
 const params=new URLSearchParams(new FormData(form));
 if(!isAdmin) {params.set('visibility','visible');params.set('review_status','approved');}
 params.set('offset',append?resourceOffset:0);
 const [result,categories]=await Promise.all([api(`${isAdmin?'admin/':''}resources?${params}`),api('resource-categories')]);
 if(generation!==resourceGeneration || currentView!=='resources') return;
 resourceCategories=categories;
 resourceOptions(form.elements.category,categories,'All categories');
 resourceOptions(form.elements.tag,result.tags.map(tag=>({id:tag,name:`#${tag}`})),'All tags');
 if(!append) $('#resource-items').replaceChildren();
 if(!result.items.length && !append) empty($('#resource-items'),'No resources match these filters. Try another topic or clear your filters.');
 for(const resource of result.items) $('#resource-items').append(resourceCard(resource,isAdmin));
 resourceOffset=result.nextOffset;$('#resource-more').hidden=!result.more;
 await refreshResourceReviewCount();
 $('#resource-count').textContent=`${result.total} ${result.total===1?'resource':'resources'} found · ${Math.min(resourceOffset,result.total)} shown`;
}
function resourceCard(resource,isAdmin) {
 const card=element('article',undefined,`resource-card${resource.featured?' featured-resource':''}`),meta=element('div',undefined,'resource-meta');
 meta.append(element('span',resource.category_name,'badge'));
 if(resource.review_status==='pending') meta.append(element('span','Pending approval','badge'));
 if(resource.review_status==='declined') meta.append(element('span','Declined','badge'));
 if(resource.genders) meta.append(element('span',resource.genders.split(',').map(g=>({male:'Male',female:'Female',another:'Another gender'})[g]).join(', '),'badge'));
 if(resource.min_age!==null || resource.max_age!==null) meta.append(element('span',`Ages ${resource.min_age??0}–${resource.max_age??'up'}`,'badge'));
 if(resource.featured) meta.append(element('span','Featured','badge answered'));
 if(!resource.visible) meta.append(element('span','Hidden · admins only','badge'));
 card.append(meta);
 if(resource.has_image) {const image=element('img',undefined,'resource-cover');image.src=`/api/resources/${encodeURIComponent(resource.id)}/image?v=${resource.revision}`;image.alt=`Image for ${resource.title}`;image.loading='lazy';image.addEventListener('error',()=>{image.hidden=true;});card.append(image);}
 card.append(element('h3',resource.title));
 if(isAdmin && resource.submitted_by) card.append(element('p',`Recommended by ${resource.submitted_name} · ${displayTime(resource.submitted_at)}`,'hint'));
 if(resource.creator) card.append(element('p',resource.creator,'resource-creator'));
 if(resource.description) card.append(element('p',resource.description,'resource-description'));
 const tags=element('div',undefined,'resource-tags');
 for(const tag of resource.tags) {const chip=button(`#${tag}`,async()=>{$('#resource-search').elements.tag.value=tag;await loadResources();});chip.setAttribute('aria-label',`Filter resources tagged ${tag}`);tags.append(chip);}
 card.append(tags);
 if(resource.url) {const link=element('a','Explore resource ↗');link.href=resource.url;link.target='_blank';link.rel='noopener noreferrer';link.setAttribute('aria-label',`Explore ${resource.title} (opens in a new tab)`);card.append(link);}
 if(isAdmin) {
  card.append(element('p',`Display order: ${resource.sort_order}`,'hint'));
  const actions=element('div',undefined,'actions');
  actions.append(button('Edit resource',()=>openResource(resource)));
  if(resource.review_status==='pending') actions.append(button('Approve',()=>openResourceReview(resource,'approve')),button('Decline',()=>openResourceReview(resource,'decline')));
  if(resource.review_status==='approved') actions.append(button(resource.visible?'Hide':'Show',()=>openResource({...resource,visible:!resource.visible})),button(resource.featured?'Remove feature':'Promote to featured',()=>openResource({...resource,featured:!resource.featured})),button('Delete',()=>openResourceDelete('resources',resource)));
  if(resource.review_status!=='approved') actions.append(button('Delete',()=>openResourceDelete('resources',resource)));
  card.append(actions);
 }
 return card;
}
function openResource(resource=null) {
 editingResource=resource;resourceImageChange=undefined;resourceImageError='';resourceImageGeneration++;const form=$('#resource-form');form.reset();
 const recommending=user.role!=='admin';$('#resource-admin-fields').hidden=recommending;$('#recommend-resource-help').hidden=!recommending;form.elements.reason.required=!recommending;
 $('#save-resource').textContent=recommending?'Send recommendation':'Save resource';
 const preview=$('#resource-image-preview');preview.hidden=!resource?.has_image;if(resource?.has_image) preview.src=`/api/resources/${encodeURIComponent(resource.id)}/image?v=${resource.revision}`;else preview.removeAttribute('src');
 resourceOptions(form.elements.category_id,resourceCategories);
 for(const check of form.querySelectorAll('[name=resource_gender]')) check.checked=!!resource?.genders?.split(',').includes(check.value);
 form.elements.min_age.value=resource?.min_age??'';form.elements.max_age.value=resource?.max_age??'';
 for(const key of ['title','creator','description','url','sort_order','category_id']) if(resource) form.elements[key].value=resource[key];
 form.elements.visible.checked=resource?!!resource.visible:true;form.elements.featured.checked=!!resource?.featured;
 form.elements.tags.value=resource?resource.tags.map(tag=>`#${tag}`).join(', '):'';
 $('#resource-editor-title').textContent=recommending?'Recommend a resource':resource?'Edit resource':'Add resource';
 $('#resource-editor .dialog-message').hidden=true;$('#resource-editor').showModal();
}
function renderResourceCategories() {
 $('#resource-category-items').replaceChildren();
 for(const category of resourceCategories) {
  const row=element('div',undefined,'member-row');row.append(element('strong',category.name),element('span',`Order ${category.sort_order}`,'hint'));
  row.append(button('Edit',()=>editResourceCategory(category)),button('Delete',()=>openResourceDelete('resource-categories',category)));$('#resource-category-items').append(row);
 }
}
function editResourceCategory(category=null) {
 editingCategory=category;$('#resource-category-form').reset();$('#category-editor-title').textContent=category?'Edit category':'Add category';
 if(category) {$('#resource-category-form').elements.name.value=category.name;$('#resource-category-form').elements.sort_order.value=category.sort_order;}
}
function openResourceDelete(type,item) {
 deletingResource={type,item};$('#resource-delete-form').reset();$('#resource-delete-title').textContent=`Delete ${type==='resources'?'resource':'category'}: ${item.title||item.name}`;
 $('#resource-delete .dialog-message').hidden=true;$('#resource-delete').showModal();
}
$('#admin-resources').addEventListener('click',action(async()=>{$('#resource-search').elements.visibility.value='all';await showView('resources');}));
$('#resource-search').addEventListener('submit',event=>{event.preventDefault();action(()=>loadResources())(event);});
$('#reset-resources').addEventListener('click',action(async()=>{$('#resource-search').reset();await loadResources();}));
$('#resource-more').addEventListener('click',action(()=>loadResources(true)));
$('#add-resource').addEventListener('click',()=>openResource());
$('#recommend-resource').addEventListener('click',()=>openResource());
$('#manage-categories').addEventListener('click',()=>{editResourceCategory();renderResourceCategories();$('#resource-categories .dialog-message').hidden=true;$('#resource-categories').showModal();});
$('#new-category').addEventListener('click',()=>editResourceCategory());
for(const node of document.querySelectorAll('[data-close-resource]')) node.addEventListener('click',()=>$(`#${node.dataset.closeResource}`).close());
$('#resource-form').addEventListener('submit',event=>{event.preventDefault();const form=event.currentTarget,target=editingResource;action(async()=>{
 const values=Object.fromEntries(new FormData(form));values.tags=values.tags.split(',').map(tag=>tag.trim()).filter(Boolean);values.sort_order=Number(values.sort_order);values.visible=form.elements.visible.checked;values.featured=form.elements.featured.checked;
 values.genders=[...form.querySelectorAll('[name=resource_gender]:checked')].map(check=>check.value);
 values.min_age=values.min_age===''?null:Number(values.min_age);values.max_age=values.max_age===''?null:Number(values.max_age);
 if(form.elements.remove_image.checked) values.image=null;else if(resourceImageChange!==undefined) values.image=resourceImageChange;
 if(resourceImageError && !form.elements.remove_image.checked) throw new Error(resourceImageError);
 if($('#resource-image-file').disabled) throw new Error('Wait for the image to finish processing.');
 if(target) values.revision=target.revision;
 if(user.role!=='admin') {await api('resources/recommend',values);$('#resource-editor').close();await loadResources();notice('Recommendation sent. Only portal admins can see it until approved.');return;}
 await api(`admin/resources${target?`/${encodeURIComponent(target.id)}`:''}`,values);$('#resource-editor').close();await loadResources();notice('Resource saved.');
})(event);});
$('#resource-category-form').addEventListener('submit',event=>{event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget)),target=editingCategory;action(async()=>{
 values.sort_order=Number(values.sort_order);if(target) values.revision=target.revision;
 await api(`admin/resource-categories${target?`/${encodeURIComponent(target.id)}`:''}`,values);await loadResources();renderResourceCategories();editResourceCategory();notice('Category saved.');
})(event);});
$('#resource-delete-form').addEventListener('submit',event=>{event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget)),target=deletingResource;action(async()=>{
 values.revision=target.item.revision;await api(`admin/${target.type}/${encodeURIComponent(target.item.id)}/delete`,values);$('#resource-delete').close();await loadResources();
 if(target.type==='resource-categories') {renderResourceCategories();editResourceCategory();}notice('Item deleted.');
})(event);});
async function refreshResourceReviewCount() {
 if(user?.role!=='admin') return;
 const {pending}=await api('admin/resource-review-count');
 for(const id of ['resource-pending-count','admin-resource-count']) $(`#${id}`).textContent=pending?`(${pending} to review)`:'';
 $('#resource-review-banner').hidden=!pending;
 $('#resource-review-summary').textContent=`${pending} resource ${pending===1?'recommendation needs':'recommendations need'} your review. `;
}
$('#review-recommendations').addEventListener('click',action(async()=>{
 $('#resource-search').reset();$('#resource-search').elements.review_status.value='pending';$('#resource-search').elements.visibility.value='all';await loadResources();
}));
function openResourceReview(resource,decision) {
 pendingResourceReview={resource,decision};$('#resource-review-form').reset();$('#resource-review .dialog-message').hidden=true;
 $('#resource-review-title').textContent=`${decision==='approve'?'Approve':'Decline'}: ${resource.title}`;
 $('#resource-review-help').textContent=decision==='approve'?'This adds the resource to the member library for the genders and ages selected on it. Review or edit its content, image, link, and audience before approving.':'This keeps the recommendation out of the member library and clears it from the pending queue.';
 $('#confirm-resource-review').textContent=decision==='approve'?'Approve for the library':'Decline recommendation';$('#resource-review').showModal();
}
$('#resource-review-form').addEventListener('submit',event=>{event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget)),target=pendingResourceReview;action(async()=>{
 values.revision=target.resource.revision;await api(`admin/resources/${encodeURIComponent(target.resource.id)}/${target.decision}`,values);$('#resource-review').close();await loadResources();notice(target.decision==='approve'?'Resource approved and available to its audience.':'Recommendation declined.');
})(event);});
let resourceImageError='';
$('#resource-image-file').addEventListener('change',action(async()=>{
 const input=$('#resource-image-file'),file=input.files[0],generation=++resourceImageGeneration;resourceImageError='';resourceImageChange=undefined;
 if(!file) {$('#resource-image-preview').hidden=true;return;}
 input.disabled=true;
 try {
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>15*1024*1024) throw new Error('Choose a JPEG, PNG, or WebP image under 15 MB.');
  const bitmap=await createImageBitmap(file),scale=Math.min(1,1024/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const context=canvas.getContext('2d');context.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--paper').trim();context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  let encoded;for(const quality of [.85,.7,.55,.4]) {encoded=canvas.toDataURL('image/jpeg',quality);if(encoded.length<=349550) break;}
  if(encoded.length>349550) throw new Error('This image is still too large. Choose a smaller image.');
  if(generation!==resourceImageGeneration) return;
  resourceImageChange={mime:'image/jpeg',data:encoded.split(',')[1]};$('#resource-form').elements.remove_image.checked=false;$('#resource-image-preview').src=encoded;$('#resource-image-preview').hidden=false;
 } catch(error) {if(generation===resourceImageGeneration) {resourceImageError=error.message;throw error;}}
 finally {input.disabled=false;}
}));
