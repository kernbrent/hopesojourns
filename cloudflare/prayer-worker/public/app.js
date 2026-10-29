const $ = selector => document.querySelector(selector);
let user, csrf, people = [], groups = [], activeGroup = null, currentView = 'feed', olderThan, pendingDelete;
let site = {allowMemberGroups:true,organizationName:'Hope Sojourns'}, sessionGeneration = 0;
let inviteToken = new URLSearchParams(location.hash.slice(1)).get('invite');
// A fragment keeps the bearer invitation out of HTTP logs and Referer headers.
if (inviteToken) history.replaceState(null, '', '/');
const labels = { request: 'Prayer request', update: 'Update', answered: 'Answered prayer' };
const audiences = { members: 'All portal members + admins', selected: 'Selected people + admins', admins: 'Only the author + admins' };
function element(tag, content, className) {
  const node = document.createElement(tag); if (content !== undefined) node.textContent = content;
  if (className) node.className = className; return node;
}
function notice(message, error = false) {
  $('#message').textContent = message; $('#message').className = error ? 'error' : ''; $('#message').hidden = !message;
  const local = $('dialog[open] .dialog-message');
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
  $('#login-form').hidden = !!inviteToken; $('#accept-form').hidden = !inviteToken;
  $('#auth-title').textContent = inviteToken ? 'You’re invited.' : 'Come on in.';
  $('#auth-description').textContent = inviteToken ? 'Set up your own prayer portal account.' : 'Sign in with your prayer portal account.';
}
function signedOut() { sessionGeneration++; user = null; csrf = null; people = []; groups = []; activeGroup = null; $('#community').hidden = true; $('#welcome').hidden = false; $('#logout').hidden = true;
  for (const id of ['posts','people','notifications','invites','recipients','groups','group-overview','group-members','group-actions','group-preferences','group-member-invite']) $(`#${id}`).replaceChildren();
  $('#invite-link').value = ''; $('#invite-result').hidden = true; $('dialog[open]')?.close(); setupAuth(); }
async function signedIn(data) {
  sessionGeneration++;
  user = data.user; csrf = data.csrf; inviteToken = null;
  $('#invites-nav').hidden = user.role !== 'admin';
  $('#greeting').textContent = `Welcome, ${user.name}. There is room for your story here.`;
  [people,groups] = await Promise.all([api('people'),api('groups')]); await showView('feed'); await refreshNotifications();
  $('#welcome').hidden = true; $('#community').hidden = false; $('#logout').hidden = false;
}
function empty(container, message) { container.replaceChildren(element('div', message, 'empty')); }
function postCard(post, notification = false) {
  const card = element('article', undefined, 'post');
  const meta = element('div', undefined, 'post-meta');
  meta.append(element('span', post.author_name.slice(0, 1).toUpperCase(), 'avatar'), element('strong', post.author_name), element('span', new Date(post.created_at).toLocaleString()), element('span', labels[post.kind], `badge ${post.kind}`));
  if (notification && !post.read_at) meta.append(element('span', 'New', 'badge'));
  const audience = post.group_id ? {members:'Group members + portal admins',selected:'Selected group members + portal admins',admins:'Only the author + portal admins'}[post.audience] : audiences[post.audience];
  const footer = element('div', undefined, 'post-bottom'); footer.append(element('span', `${post.group_name ? `${post.group_name} · ` : ''}${audience}`));
  if (!notification && (post.author_id === user.id || user.role === 'admin')) {
    const button = element('button', 'Remove'); button.addEventListener('click', () => { pendingDelete = post.id; $('#delete-dialog').showModal(); }); footer.append(button);
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
  for (const name of ['feed','people','notifications','invites','groups','group-detail']) $(`#${name}-view`).hidden = !(name === view || (name === 'feed' && view === 'following') || (name==='groups' && view==='discover') || (name==='group-detail' && view==='group') || (name==='feed' && view==='group' && (activeGroup?.membership==='approved' || user.role==='admin')));
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
    candidates=group.members.filter(person=>person.status==='approved' && person.user_id!==user.id).map(person=>({id:person.user_id,name:person.name}));
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
api('site').then(applySite).then(()=>api('me')).then(signedIn).catch(error => { if (error.message !== 'Please sign in to the prayer portal.') notice(error.message,true); });
setInterval(() => { if (user && !document.hidden) refreshNotifications().catch(error => notice(error.message,true)); },60000);
