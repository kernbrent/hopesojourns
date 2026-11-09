let devotionalManaging=false,devotionalOffset=0,devotionalGeneration=0,editingDevotional=null,deletingDevotional=null,devotionalDay='';
const $ = selector => document.querySelector(selector);
let user, csrf, people = [], groups = [], activeGroup = null, currentView = 'feed', olderThan, pendingDelete;
let site = {allowMemberGroups:true,organizationName:'Hope Sojourns'}, sessionGeneration = 0;
let authMode='login',pendingRequestReview=null,pendingGlobal=null;
let pendingResources=0,pendingRequests=0;
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
  const local = [...document.querySelectorAll('dialog[open] .dialog-message, .auth-card form:not([hidden]) .auth-message')].at(-1);
  if (local) { local.textContent = message; local.hidden = !error || !message; }
}
function applySite(config) {
  site = config;
  $('#recovery-test-notice').hidden=config.environment==='production';
  $('#environment-banner').hidden = config.environment === 'production';
  $('#environment-banner').textContent = config.environment === 'test' ? 'Test prayer portal — separate accounts and prayer data' : 'Local preview — sample data only';
  for (const id of ['community-name','community-eyebrow']) $(`#${id}`).textContent = config.communityName;
  $('#welcome-title').textContent = config.welcomeTitle; $('#welcome-message').textContent = config.welcomeMessage;
  document.title = `Prayer Portal | ${config.organizationName}`;
  $('.prayer-brand').setAttribute('aria-label',`${config.organizationName} prayer portal home`);
  $('.prayer-brand img').src=config.logoPath;
  $('.prayer-brand img').alt=`${config.organizationName} Prayer Portal`;
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
  hidePasswords();restoreRememberedLogin();
  $('#welcome').classList.toggle('access-request-open',authMode==='access');
  $('#login-form').hidden = authMode!=='login' || !!inviteToken || !!resetToken;
  $('#access-form').hidden=authMode!=='access' || !!inviteToken || !!resetToken;
  $('#password-help-form').hidden=authMode!=='recovery' || !!inviteToken || !!resetToken;
  $('#auth-options').hidden=authMode!=='login' || !!inviteToken || !!resetToken;
  $('#back-sign-in').hidden=authMode==='login' && !inviteToken && !resetToken; $('#accept-form').hidden = !inviteToken || !!resetToken; $('#reset-form').hidden=!resetToken;
  $('#auth-title').textContent = authMode==='access'?'Request access.':authMode==='recovery'?'Reset your password.':resetToken?'Choose a new password.':inviteToken ? 'You’re invited.' : 'Come on in.';
  $('#auth-description').textContent = authMode==='access'?'Only portal admins can review your request.':authMode==='recovery'?'We will email a private password-reset link to your account address.':resetToken?'Use this private reset link to restore access.':inviteToken ? 'Set up your own prayer portal account.' : 'Sign in with your prayer portal account.';
}
function signedOut() { devotionalGeneration++;devotionalManaging=false;editingDevotional=null;deletingDevotional=null;$('#devotional-today').replaceChildren();$('#devotional-items').replaceChildren();$('#help-topics').replaceChildren();$('#help-topic-links').replaceChildren();$('#help-access').replaceChildren();$('#help-search').value='';$('#devotional-form').reset();$('#devotional-search').reset();pendingResources=0;pendingRequests=0;$("#admin-attention-items").replaceChildren();sessionGeneration++; user = null; csrf = null; people = []; groups = []; activeGroup = null; $('#community').hidden = true; $('#welcome').hidden = false; $('#logout').hidden = true;
  for (const id of ['posts','people','notifications','invites','recipients','groups','group-overview','group-members','group-actions','group-preferences','group-member-invite','admin-items']) $(`#${id}`).replaceChildren();
  clearResources();applyListView('expanded');
  $('#profile-form').reset();
  adminLoadGeneration++;$('#admin-private-link').value='';$('#admin-link-result').hidden=true;pendingAdminAction=null;
  $('#invite-link').value = ''; $('#invite-result').hidden = true; document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close()); setupAuth(); }
async function signedIn(data) {
  sessionGeneration++;
  user = data.user; csrf = data.csrf; inviteToken = null; applyListView(user.list_view||'expanded');
  $('#invites-nav').hidden = user.role !== 'admin';
  $('#admin-nav').hidden = user.role !== 'admin';
  $('#greeting').textContent = `Welcome, ${user.name}.${user.role==='admin'?user.owner?' You are the portal owner.':' You have portal admin access.':' There is room for your story here.'}`;
  const provisional=user.access_level==='provisional';
  $('#compose-button').hidden=provisional;$('#provisional-notice').hidden=!provisional;$('#refresh-access').hidden=!provisional;
  document.querySelectorAll('[data-view]').forEach(button=>{button.hidden=provisional?!['feed','resources','devotionals','help','profile'].includes(button.dataset.view):(['invites','admin'].includes(button.dataset.view)&&user.role!=='admin');});
  if(provisional) {people=[];groups=[];} else [people,groups]=await Promise.all([api('people'),api('groups')]);
  await showView('feed'); if(!provisional) await refreshNotifications();
  $('#welcome').hidden = true; $('#community').hidden = false; $('#logout').hidden = false;
}
function empty(container, message) { container.replaceChildren(element('div', message, 'empty')); }
function postCard(post, notification = false) {
  const card = element('article', undefined, 'post');
  const meta = element('div', undefined, 'post-meta');
  meta.append(element('span', post.author_name.slice(0, 1).toUpperCase(), 'avatar'), element('strong', post.author_name), element('span', displayTime(post.created_at)), element('span', labels[post.kind], `badge ${post.kind}`));
  if (notification && !post.read_at) meta.append(element('span', 'New', 'badge'));
  const audience = post.is_global ? 'Global · everyone signed in, including provisional users' : post.group_id ? {members:'Group members + portal admins',selected:'Selected group members + portal admins',admins:'Only the author + portal admins'}[post.audience] : audiences[post.audience];
  const footer = element('div', undefined, 'post-bottom'); footer.append(element('span', `${post.group_name ? `${post.group_name} · ` : ''}${audience}`));
  if (!notification && (post.author_id === user.id || user.role === 'admin')) {
    const button = element('button', 'Remove'); button.addEventListener('click', () => {
      if(user.role==='admin' && post.author_id!==user.id) openAdminAction('posts',post.id,'delete',post.title);
      else {pendingDelete = post.id; $('#delete-dialog').showModal();}
    }); footer.append(button);
    const globalButton=element('button',post.is_global?'Limit to members':'Make Global');globalButton.addEventListener('click',()=>openGlobal(post));footer.append(globalButton);
  }
  card.dataset.listPreview=`${post.author_name} · ${labels[post.kind]} · ${audience}`;
  card.append(meta, element('h3', post.title), element('div', post.body, 'post-body'), reactionButton('posts',post),footer); return card;
}
async function loadPosts(append = false) {
  const params = new URLSearchParams({ global:$('#global-filter').checked?'1':'0', kind: $('#kind-filter').value, following: currentView === 'following' ? '1' : '0' });
  if (currentView === 'group' && activeGroup) params.set('group',activeGroup.id);
  if (append && olderThan) params.set('before', olderThan);
  const result = await api(`posts?${params}`);
  if (!append) $('#posts').replaceChildren();
  if (!result.posts.length && !append) empty($('#posts'), currentView === 'following' ? 'Follow someone in the People directory to see their shared prayers here.' : user.access_level==='provisional'?'No Global prayers have been shared yet. You can browse Resources while awaiting approval.':'A quiet beginning. Share the first prayer with your chosen audience.');
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
    form.dataset.listPreview=[person.username?`@${person.username}`:'',person.bio].filter(Boolean).join(' · ');$('#people').append(form);
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
    card.dataset.listPreview=`${categoryLabels[g.category]} · Led by ${g.owner_name}${g.membership?' · '+statusLabels[g.membership]:''}`;card.append(actions); $('#groups').append(card);
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
  await refreshRequestCount();
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
  if(user.access_level==='provisional' && !['feed','resources','devotionals','help','profile'].includes(view)) return;
  currentView = view; notice('');
  if(view!=='group') activeGroup=null;
  for (const name of ['feed','people','notifications','invites','groups','group-detail','admin','profile','resources','devotionals','help']) $(`#${name}-view`).hidden = !(name === view || (name === 'feed' && view === 'following') || (name==='groups' && view==='discover') || (name==='group-detail' && view==='group') || (name==='feed' && view==='group' && (activeGroup?.membership==='approved' || user.role==='admin')));
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
  if(view==='admin' && user.role==='admin') { $('#admin-attention-items').textContent='Checking pending reviews…';await Promise.all([refreshResourceReviewCount(),refreshRequestCount(),loadAdmin()]); }
  if(view==='resources') await loadResources();
  if(view==='devotionals') await loadDevotionals();
  if(view==='help') renderHelp();
  if(view==='profile') {const current=await api('me');user=current.user;renderProfile();}
}
$('#login-form').addEventListener('submit',event => { event.preventDefault(); action(async () => {
  const form = event.currentTarget; const data = {identifier:form.elements.identifier.value,password:form.elements.password.value}; const result = await api('login',data); rememberLogin(form,data); form.reset(); notice(''); await signedIn(result);
})(event); });
$('#accept-form').addEventListener('submit',event => { event.preventDefault(); action(async () => {
  const form = event.currentTarget; const data = Object.fromEntries(new FormData(form)); const result = await api('accept',{ ...data, token: inviteToken }); form.reset(); notice(''); await signedIn(result);
})(event); });
$('#logout').addEventListener('click',action(async () => { await api('logout',{}); signedOut(); notice('You have signed out.'); }));
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click',action(() => showView(button.dataset.view))));
$('#refresh-access').addEventListener('click',action(async()=>signedIn(await api('me'))));
$('#global-filter').addEventListener('change',action(()=>loadPosts()));
$('#kind-filter').addEventListener('change',action(() => loadPosts()));
$('#load-more').addEventListener('click',action(() => loadPosts(true)));
async function composerAudience() {
  const groupId=$('#post-group').value;
  let candidates=people.filter(person=>person.id!==user.id);
  if(groupId && groupId!=='__global') {
    const group=await api(`groups/${encodeURIComponent(groupId)}`);
    candidates=group.members.filter(person=>person.status==='approved' && person.account_status==='active' && person.user_id!==user.id).map(person=>({id:person.user_id,name:person.name}));
  }
  // Late responses from a previously selected group must not replace the choices.
  if($('#post-group').value!==groupId) return;
  $('#recipients').replaceChildren();
  candidates.forEach(person=>{const label=element('label'),check=element('input'); check.type='checkbox'; check.name='recipient'; check.value=person.id; label.append(check,document.createTextNode(` ${person.name}`)); $('#recipients').append(label);});
  if(!candidates.length) $('#recipients').append(element('p','No other members are available. Choose admins only for now.'));
  const globalPost=groupId==='__global';$('#audience').disabled=globalPost;
  if(globalPost) {$('#audience').options[2].textContent='Everyone signed in, including provisional users';$('#audience').value='members';$('#recipient-options').hidden=true;$('#post-privacy').textContent='Global prayers are visible to every signed-in user, including provisional accounts, with no group or demographic restrictions. Do not include details meant for a private audience.';return;}
  $('#audience').options[1].textContent=groupId ? 'Selected group members and portal admins' : 'Selected people and portal admins';
  $('#audience').options[2].textContent=groupId ? 'This group’s members and portal admins' : 'All portal members and admins';
  $('#post-privacy').textContent=groupId ? 'Portal admins can see every post. Group leaders only see restricted posts when included. Approved members, including those who join later, can see group-shared prayers. Selected-person prayers require current group membership. Following never grants access.' : 'Portal admins can see every post. Following does not grant access. Choose an audience for every new post.';
}
async function openComposer(groupId='') {
  [people,groups]=await Promise.all([api('people'),api('groups')]);
  $('#post-form').reset(); $('#recipient-options').hidden=true; $('#post-group').replaceChildren();
  const community=element('option','The prayer community'); community.value=''; $('#post-group').append(community);const globalOption=element('option','Global — including provisional users');globalOption.value='__global';$('#post-group').append(globalOption);
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
  data.global=data.groupId==='__global';if(data.global) {data.groupId='';data.audience='members';data.recipients=[];}
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
  if(mode==='portal-requests') params.set('status',$('#request-status').value);
  if(append && adminCursor) params.set('before',adminCursor);
  const result=await api(`admin/${mode}?${params}`);
  if(generation!==adminLoadGeneration || currentView!=='admin' || !user || user.role!=='admin') return;
  document.querySelectorAll('[data-admin-tab]').forEach(node=>node.setAttribute('aria-pressed',String(node.dataset.adminTab===mode)));
  $('#admin-search-form').hidden=mode==='audit';
  $('#request-status-label').hidden=mode!=='portal-requests';
  if(!append) $('#admin-items').replaceChildren();
  const items=mode==='audit'?result:result.items;
  if(mode==='audit' && items.length) $('#admin-items').append(auditTable(items));
  if(!items.length && !append) empty($('#admin-items'),mode==='audit'?'No administrative actions have been recorded. The most recent 100 actions will appear here.':'No matching accounts or content.');
  for(const item of items) {
    if(mode==='portal-requests') $('#admin-items').append(requestCard(item));
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
  }
  adminCursor=result.cursor;$('#admin-more').hidden=mode==='audit' || !result.more;
}
function auditTable(items) {
  const region=element('div',undefined,'audit-grid');
  region.tabIndex=0;region.setAttribute('role','region');region.setAttribute('aria-label','Audit report. Scroll to view all columns and rows.');
  const table=element('table');
  table.append(element('caption',`${items.length} most recent administrative ${items.length===1?'action':'actions'} · newest first`));
  const head=element('thead'),heading=element('tr');
  for(const label of ['Date / time','Admin','Action','Item type','Item','Reason']) {const cell=element('th',label);cell.scope='col';heading.append(cell);}
  head.append(heading);const body=element('tbody');
  for(const item of items) {
    const row=element('tr'),date=element('td'),time=element('time',displayTime(item.created_at));time.dateTime=new Date(item.created_at).toISOString();date.append(time);row.append(date);
    for(const value of [item.actor_name,item.action,item.target_type,item.target_id,item.reason]) row.append(element('td',value));
    body.append(row);
  }
  table.append(head,body);region.append(table);return region;
}
function adminAccount(person) {
  const card=element('article',undefined,'panel account-card');
  card.append(element('h3',person.name),element('p',`Username: ${person.username||person.email}`),element('p',person.email));
  if(person.gender || person.birth_date) card.append(element('p',`Gender: ${person.gender||'Not provided'} · Birth date: ${person.birth_date||'Not provided'}`,'hint'));
  if(person.phone || person.timezone) card.append(element('p',`${person.phone||'No phone'} · ${person.timezone||'No time zone'}`,'hint'));
  if(person.bio) card.append(element('p',person.bio));
  const state=element('div',undefined,'account-state');
  state.append(element('span',person.is_owner?'Primary owner':person.role==='admin'?'Portal admin':person.access_level==='provisional'?'Provisional access':'Regular member','badge'),element('span',person.status,'badge'));
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
      if(person.access_level!=='provisional') actions.append(button(person.role==='admin'?'Make regular member':'Grant admin access',()=>openAdminAction('users',person.id,'role',person.name,person.role==='admin'?'member':'admin')));
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
  if(result.link) {$('#admin-link-label').textContent='Private password-reset link';$('#admin-link-help').textContent='Share privately with the account owner. Expires after one hour; works once. It is not emailed automatically.';$('#admin-private-link').value=result.link;$('#admin-link-result').hidden=false;notice('Private password-reset link created. Share it only with that account owner.');}
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
// Opening or reloading the portal always requires an explicit Sign in submission.
api('site').then(applySite).catch(error=>notice(error.message,true));
setInterval(() => { if (user && user.access_level!=='provisional' && !document.hidden) refreshNotifications().catch(error => notice(error.message,true)); },60000);
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
 $('#recommend-resource').hidden=isAdmin || user.access_level==='provisional';
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
 card.dataset.listPreview=[resource.creator,resource.category_name,resource.visible?'':'Hidden',resource.review_status==='approved'?'':resource.review_status].filter(Boolean).join(' · ');
 card.append(reactionButton('resources',resource));
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
 pendingResources=pending;renderAdminAttention();
 for(const id of ['resource-pending-count','admin-resource-count']) $(`#${id}`).textContent=pending?`(${pending} to review)`:'';
 $('#resource-review-banner').hidden=!pending;
 $('#resource-review-summary').textContent=`${pending} resource ${pending===1?'recommendation needs':'recommendations need'} your review. `;
}
$('#review-recommendations').addEventListener('click',action(async()=>{
 $('#resource-search').reset();$('#resource-search').elements.review_status.value='pending';$('#resource-search').elements.visibility.value='all';await loadResources();
}));
function openResourceReview(resource,decision) {
 pendingResourceReview={resource,decision};$('#resource-review-form').reset();$('#resource-review .dialog-message').hidden=true;
 $('#resource-review-title').textContent=`${decision!=='decline'?'Approve':'Decline'}: ${resource.title}`;
 $('#resource-review-help').textContent=decision!=='decline'?'This adds the resource to the member library for the genders and ages selected on it. Review or edit its content, image, link, and audience before approving.':'This keeps the recommendation out of the member library and clears it from the pending queue.';
 $('#confirm-resource-review').textContent=decision!=='decline'?'Approve for the library':'Decline recommendation';$('#resource-review').showModal();
}
$('#resource-review-form').addEventListener('submit',event=>{event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget)),target=pendingResourceReview;action(async()=>{
 values.revision=target.resource.revision;await api(`admin/resources/${encodeURIComponent(target.resource.id)}/${target.decision}`,values);$('#resource-review').close();await loadResources();notice(target.decision!=='decline'?'Resource approved and available to its audience.':'Recommendation declined.');
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

function chooseAuth(mode) {authMode=mode;inviteToken=null;resetToken=null;notice('');setupAuth();$('#auth-title').tabIndex=-1;$('#auth-title').focus();}
$('#request-access').addEventListener('click',()=>chooseAuth('access'));
$('#forgot-password').addEventListener('click',()=>chooseAuth('recovery'));
$('#back-sign-in').addEventListener('click',()=>chooseAuth('login'));
$('#access-form').addEventListener('submit',event=>{event.preventDefault();const form=event.currentTarget,data=Object.fromEntries(new FormData(form));for(const key of ['notify_requests','notify_updates','notify_answered']) data[key]=form.elements[key].checked;action(async()=>{const result=await api('access-requests',data);form.reset();chooseAuth('login');if(result.user) {await signedIn(result);notice('Your request is pending. You have provisional access to Global prayers, daily devotionals, and eligible resources.');} else notice(result.message);})(event);});
$('#password-help-form').addEventListener('submit',event=>{event.preventDefault();const form=event.currentTarget,data=Object.fromEntries(new FormData(form));action(async()=>{const result=await api('password-help',data);form.reset();chooseAuth('login');notice(result.message);})(event);});
if(inviteToken) api('invitation-details',{token:inviteToken}).then(result=>{if(result.profile) for(const key of ['name','username']) $('#accept-form').elements[key].value=result.profile[key];}).catch(error=>notice(error.message,true));
async function refreshRequestCount() {
 const pending=user?.role==='admin'?(await api('admin/portal-requests/count')).pending:0;
 pendingRequests=pending;renderAdminAttention();
 for(const id of ['admin-request-count','request-tab-count']) $(`#${id}`).textContent=pending?`${pending} pending ${pending===1?'request':'requests'}`:'';
}
function requestCard(item) {
 const card=element('article',undefined,'panel'),profile=item.profile;
 card.append(element('h3',item.kind==='access'?profile.name:'Password recovery'),element('p',`${item.email} · ${item.status} · ${displayTime(item.created_at)}`));
 if(item.kind==='password') card.append(element('p',`Reset email: ${item.email_status==='sent'?'Accepted by email provider':item.email_status==='captured'?'Captured in test; no email sent':item.email_status==='failed'?'Delivery failed — contact the verified account owner':item.email_status==='sending'?'Sending':'Not sent'}`,'hint'));
 if(item.kind==='access') {
  const details=element('dl',undefined,'request-profile');
  for(const [label,value] of [['Requested username',profile.username],['Phone',profile.phone],['Time zone',profile.timezone],['Gender',profile.gender],['Birth date',profile.birth_date],['Introduction (public after joining)',profile.bio],['Prayer-request alerts',profile.notify_requests?'On':'Off'],['Update alerts',profile.notify_updates?'On':'Off'],['Answered-prayer alerts',profile.notify_answered?'On':'Off']]) details.append(element('dt',label),element('dd',value||'Not provided'));
  card.append(details);
 }
 if(item.status==='pending') {
  const actions=element('div',undefined,'actions');
  if(!item.is_owner || item.user_id===user.id) actions.append(button(item.kind==='access'?(item.user_id?'Approve membership':'Approve & create invitation'):'Verify & create reset link',()=>openRequestReview(item,'approve')));
  else card.append(element('p','Primary-owner recovery requires the owner’s signed-in session or help from the site operator. Another admin cannot reset the owner’s password.','hint'));
  actions.append(button('Decline request',()=>openRequestReview(item,'decline')));card.append(actions);
 } else if(item.status==='approved') {card.append(element('p','A private link was issued. A replacement invalidates the earlier link.','hint'));if(!item.is_owner || item.user_id===user.id) card.append(button('Create replacement link',()=>openRequestReview(item,'reissue')));}
 return card;
}
function openRequestReview(item,decision) {
 pendingRequestReview={item,decision};$('#request-review-form').reset();
 $('#request-review-title').textContent=decision!=='decline'?`Approve ${item.kind==='access'?'access':'password recovery'} request`:'Decline request';
 $('#request-review-help').textContent=decision==='decline'?`Record why this request from ${item.email} is being declined. Declining a provisional account suspends access and signs it out.`:item.kind==='access' && item.user_id?`Verify ${item.email} belongs to the requester. Approval unlocks normal membership on their existing provisional account. No setup link or new password is needed.`:item.kind==='access'?`Verify ${item.email} belongs to the requester. This creates a seven-day invitation for a regular member. Their submitted profile will be applied when they set their password. Share the private link only with that email owner.`:`Verify the identity of the account owner at ${item.email}. This creates a one-hour reset link; sessions end only when it is used. It is not emailed automatically.`;
 $('#request-verify-label').hidden=decision!=='approve';$('#request-review-form').elements.verified.required=decision!=='decline';
 $('#request-review-submit').textContent=decision==='decline'?'Decline request':item.kind==='access' && item.user_id?'Approve membership':'Approve & create private link';$('#request-review-dialog .dialog-message').hidden=true;$('#request-review-dialog').showModal();
}
$('#close-request-review').addEventListener('click',()=>$('#request-review-dialog').close());
$('#request-status').addEventListener('change',action(()=>loadAdmin()));
$('#request-review-form').addEventListener('submit',event=>{event.preventDefault();const form=event.currentTarget,{item,decision}=pendingRequestReview;action(async()=>{
 const result=await api(`admin/portal-requests/${encodeURIComponent(item.id)}/${decision}`,{revision:item.revision,reason:form.elements.reason.value,verified:form.elements.verified.checked});
 $('#request-review-dialog').close();await loadAdmin();await refreshRequestCount();
 if(result.link) {$('#admin-link-label').textContent=result.kind==='access'?'Private account-setup link':'Private password-reset link';$('#admin-link-help').textContent=`Share only with the verified email owner. Works once; expires after ${result.kind==='access'?'seven days':'one hour'}. It is not emailed automatically.`;$('#admin-private-link').value=result.link;$('#admin-link-result').hidden=false;}
 notice(result.link?'Private link created. Copy it now and share only with the verified email owner.':decision==='decline'?'Request declined and recorded in the audit log.':'Membership approved and recorded in the audit log.');
})(event);});

function openGlobal(post) {
 pendingGlobal={post,global:!post.is_global};$('#global-form').reset();
 $('#global-title').textContent=post.is_global?'Limit prayer to full members':'Make this prayer Global';
 $('#global-help').textContent=post.is_global?'This will hide the prayer from provisional users. It remains visible to all full members and admins; previous group or selected-person restrictions are not restored.':'This will make the prayer visible to every signed-in user, including provisional accounts. It removes its group and selected-person restrictions. There are no gender or age restrictions on Global prayers.';
 $('#global-dialog .dialog-message').hidden=true;$('#global-dialog').showModal();
}
$('#close-global').addEventListener('click',()=>$('#global-dialog').close());
$('#global-form').addEventListener('submit',event=>{event.preventDefault();action(async()=>{
 const form=event.currentTarget,target=pendingGlobal;
 await api(`posts/${encodeURIComponent(target.post.id)}/global`,{global:target.global,reason:form.elements.reason.value,confirmed:form.elements.confirmed.checked});
 $('#global-dialog').close();if(currentView==='admin') await loadAdmin();else await loadPosts();notice('Prayer audience updated and recorded.');
})(event);});


// One saved account preference controls every card list, including later pages.
function applyListView(value) {
 const mode=value==='collapsed'?'collapsed':'expanded';$('#community').dataset.listView=mode;
 document.querySelectorAll('[data-list-view]').forEach(control=>{if(control.tagName==='BUTTON')control.setAttribute('aria-pressed',String(control.dataset.listView===mode));});
 document.querySelectorAll('details.list-item').forEach(item=>{item.open=mode==='expanded';});
}
for(const control of document.querySelectorAll('button[data-list-view]')) control.addEventListener('click',action(async()=>{
 const controls=[...document.querySelectorAll('button[data-list-view]')];controls.forEach(node=>node.disabled=true);
 try {const result=await api('preferences',{list_view:control.dataset.listView});user.list_view=result.list_view;applyListView(result.list_view);}
 finally {controls.forEach(node=>node.disabled=false);}
}));
function reactionButton(type,row) {
 const prayer=type==='posts',count=Number(row[prayer?'heart_count':'thumb_count'])||0,active=!!row[prayer?'hearted':'thumbed'];
 const control=element('button',undefined,'reaction-button');control.type='button';control.dataset.reactionType=type;control.dataset.reactionId=row.post_id||row.id;
 control.disabled=user?.access_level==='provisional';
 function paint(total,mine) {control.dataset.reactionActive=String(mine);control.setAttribute('aria-pressed',String(mine));control.textContent=`${prayer?'♥':'👍'} ${total}`;control.setAttribute('aria-label',`${mine?'Remove':'Add'} ${prayer?'heart':'thumbs up'}: ${row.title}. ${total} ${prayer?'hearts':'thumbs up'}`);control.title=user?.access_level==='provisional'?'Full membership is required to react.':`${mine?'Remove':'Add'} your ${prayer?'heart':'thumbs up'}`;}
 paint(count,active);
 control.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();action(async()=>{
  const result=await api(`${type}/${encodeURIComponent(control.dataset.reactionId)}/${prayer?'heart':'thumb'}`,{active:control.dataset.reactionActive!=='true'});
  for(const node of document.querySelectorAll('.reaction-button')) if(node.dataset.reactionType===type && node.dataset.reactionId===control.dataset.reactionId) node.updateReaction(result.count,result.active);
 })(event);});
 control.updateReaction=paint;return control;
}
function enhanceList(container) {
 for(const card of [...container.children]) {
  if(!card.matches('.post,.person,.group-card,.resource-card,.panel,.member-row')) continue;
  const heading=card.querySelector('h3,h2')||card.querySelector('strong');if(!heading) continue;
  const title=heading.textContent,item=element('details',undefined,'list-item'),summary=element('summary'),copy=element('span',undefined,'list-summary-copy');
  const preview=card.dataset.listPreview||card.querySelector('p')?.textContent||'';
  copy.append(element('span',title,'list-summary-title'),element('span',preview,'list-summary-preview'));
  const state=element('span','Expand','list-disclosure');summary.append(copy,state);
  const reaction=card.querySelector('.reaction-button');if(reaction) {
   const type=reaction.dataset.reactionType,prayer=type==='posts',row={id:reaction.dataset.reactionId,title};row[prayer?'heart_count':'thumb_count']=Number(reaction.textContent.replace(/[^0-9]/g,''));row[prayer?'hearted':'thumbed']=reaction.dataset.reactionActive==='true';
   summary.append(reactionButton(type,row));
  }
  item.open=(user?.list_view||'expanded')==='expanded';
  const label=()=>{state.textContent=item.open?'Collapse':'Expand';summary.setAttribute('aria-label',`${item.open?'Collapse':'Expand'} ${title}`);};item.addEventListener('toggle',label);label();
  container.insertBefore(item,card);item.append(summary,card);
 }
}
for(const id of ['posts','people','groups','notifications','invites','admin-items','group-members','resource-items','resource-category-items','devotional-items','devotional-today']) {
 const container=$(`#${id}`);new MutationObserver(()=>enhanceList(container)).observe(container,{childList:true});enhanceList(container);
}

// Password visibility is local to the form; no password is saved in browser storage.
function hidePasswords(form=document) {
 for(const control of form.querySelectorAll('[data-password-toggle]')) {control.previousElementSibling.type='password';control.setAttribute('aria-pressed','false');control.setAttribute('aria-label','Show password');}
}
for(const input of document.querySelectorAll('input[type=password]')) {
 const wrap=element('span',undefined,'password-control');input.before(wrap);wrap.append(input);
 const control=element('button');control.type='button';control.dataset.passwordToggle='';control.setAttribute('aria-label','Show password');control.setAttribute('aria-pressed','false');
 control.innerHTML='<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
 control.addEventListener('click',()=>{const show=input.type==='password';input.type=show?'text':'password';control.setAttribute('aria-pressed',String(show));control.setAttribute('aria-label',show?'Hide password':'Show password');});wrap.append(control);
 input.form.addEventListener('reset',()=>hidePasswords(input.form));
}
function renderAdminAttention() {
 const target=$('#admin-attention-items');target.replaceChildren();if(user?.role!=='admin')return;
 if(pendingResources) {
  const row=element('div',undefined,'admin-attention-row');row.append(element('p',pendingResources+' resource '+(pendingResources===1?'recommendation needs':'recommendations need')+' approval before appearing in the library.'));
  row.append(button('Review resource recommendations',async()=>{await showView('resources');$('#resource-search').reset();$('#resource-search').elements.review_status.value='pending';$('#resource-search').elements.visibility.value='all';await loadResources();}));target.append(row);
 }
 if(pendingRequests) {
  const row=element('div',undefined,'admin-attention-row');row.append(element('p',pendingRequests+' access or password '+(pendingRequests===1?'request needs':'requests need')+' your review.'));
  row.append(button('Review access & password requests',async()=>{adminTab='portal-requests';$('#request-status').value='pending';$('#admin-search').value='';await loadAdmin();}));target.append(row);
 }
 if(!pendingResources&&!pendingRequests)target.append(element('p','No pending resource recommendations or access and password requests. You’re all caught up.'));
}

function restoreRememberedLogin() {
 const form=$('#login-form');
 try {const identifier=localStorage.getItem('hs-prayer-remembered-id')||'';form.elements.remember.checked=!!identifier;if(identifier&&!form.elements.identifier.value)form.elements.identifier.value=identifier;} catch { /* Storage can be disabled; ordinary sign-in still works. */ }
}
function rememberLogin(form,data) {
 const remember=form.elements.remember.checked;
 try {if(remember)localStorage.setItem('hs-prayer-remembered-id',data.identifier);else localStorage.removeItem('hs-prayer-remembered-id');}catch{}
 // The browser password manager owns the password; application storage receives only the ID.
 if(remember&&typeof window.PasswordCredential==='function'&&navigator.credentials?.store) {
  try {navigator.credentials.store(new PasswordCredential({id:data.identifier,password:data.password})).catch(()=>{});}catch{}
 }
}
$('#login-form').elements.remember.addEventListener('change',event=>{
 if(!event.target.checked)try{localStorage.removeItem('hs-prayer-remembered-id');}catch{}
});

function devotionalDate(date) {return new Date(date+'T12:00:00').toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'});}
function devotionalCard(row,today=false) {
 const card=element('article',undefined,'panel devotional-card');
 card.append(element('span',today?(row.publish_date===devotionalDay?'TODAY’S DEVOTIONAL':'LATEST DEVOTIONAL'):devotionalDate(row.publish_date),'eyebrow'),element('h3',row.title));
 card.dataset.listPreview=row.scripture+' · '+devotionalDate(row.publish_date)+(row.read_at?' · Read':' · Unread');
 const meta=element('div',undefined,'devotional-meta');meta.append(element('span',devotionalDate(row.publish_date)));
 if(row.is_sample)meta.append(element('span','Sample devotional · for testing','badge'));
 if(user.role==='admin'&&devotionalManaging)meta.append(element('span',row.status==='published'&&row.publish_date>devotionalDay?'Scheduled':row.status,'badge'));
 card.append(meta);
 const scripture=element('a','Read '+row.scripture);scripture.href='https://www.biblegateway.com/passage/?search='+encodeURIComponent(row.scripture);scripture.target='_blank';scripture.rel='noopener noreferrer';card.append(scripture);
 for(const paragraph of row.body.split(/\n\s*\n/))card.append(element('p',paragraph,'devotional-reading'));
 if(row.reflection)card.append(element('h4','Reflect'),element('p',row.reflection));
 if(row.prayer)card.append(element('h4','Pray'),element('p',row.prayer));
 const actions=element('div',undefined,'actions');
 const read=button(row.read_at?'Mark unread':'Mark as read',async()=>{await api('devotionals/'+encodeURIComponent(row.id)+'/read',{read:!row.read_at});await loadDevotionals();});read.setAttribute('aria-pressed',String(!!row.read_at));actions.append(read);
 if(user.role==='admin') {actions.append(button('Edit devotional',()=>openDevotionalEditor(row)),button('Delete devotional',()=>{deletingDevotional=row;$('#devotional-delete-form').reset();$('#devotional-delete-title').textContent=row.title;$('#devotional-delete').showModal();}));}
 card.append(actions);return card;
}
async function loadDevotionals(append=false) {
 const generation=++devotionalGeneration,form=$('#devotional-search');if(!append)devotionalOffset=0;
 const admin=user.role==='admin';if(!admin)devotionalManaging=false;
 $('#devotional-add').hidden=!admin;$('#devotional-manage').hidden=!admin;$('#devotional-manage').textContent=devotionalManaging?'Back to daily reading':'Manage devotionals';
 $('#devotional-status-label').hidden=!devotionalManaging;$('#devotional-list-heading').textContent=devotionalManaging?'Manage devotionals':'Browse devotionals';
 const params=new URLSearchParams({q:form.elements.q.value,read:form.elements.read.value,offset:devotionalOffset});if(devotionalManaging)params.set('status',form.elements.status.value);
 const [daily,result]=await Promise.all([api('devotionals/today'),api((devotionalManaging?'admin/':'')+'devotionals?'+params)]);
 if(generation!==devotionalGeneration||currentView!=='devotionals')return;
 devotionalDay=result.today;$('#devotional-today').hidden=devotionalManaging;
 if(!devotionalManaging) {$('#devotional-today').replaceChildren();if(daily.item)$('#devotional-today').append(devotionalCard(daily.item,true));else empty($('#devotional-today'),'No daily devotional has been published yet. Please check back soon.');}
 if(!append)$('#devotional-items').replaceChildren();for(const row of result.items)$('#devotional-items').append(devotionalCard(row));
 devotionalOffset+=result.items.length;$('#devotional-more').hidden=!result.more;$('#devotional-results').textContent=result.total+' devotional'+(result.total===1?'':'s')+' found · '+devotionalOffset+' shown';
 if(!result.items.length&&!append)empty($('#devotional-items'),'No devotionals match these filters.');
}
function openDevotionalEditor(row=null) {
 editingDevotional=row;const form=$('#devotional-form');form.reset();$('#devotional-editor .dialog-message').hidden=true;
 $('#devotional-editor-title').textContent=row?'Edit devotional':'Add devotional';
 for(const key of ['title','scripture','body','reflection','prayer','publish_date','status'])if(row)form.elements[key].value=row[key];
 if(!row)form.elements.publish_date.value=devotionalDay;form.elements.is_sample.checked=!!row?.is_sample;$('#devotional-editor').showModal();
}
$('#devotional-add').addEventListener('click',()=>openDevotionalEditor());
$('#devotional-close').addEventListener('click',()=>$('#devotional-editor').close());
$('#devotional-manage').addEventListener('click',action(async()=>{devotionalManaging=!devotionalManaging;$('#devotional-search').reset();await loadDevotionals();}));
$('#devotional-search').addEventListener('submit',event=>{event.preventDefault();action(()=>loadDevotionals())(event);});
$('#devotional-clear').addEventListener('click',action(async()=>{$('#devotional-search').reset();await loadDevotionals();}));
$('#devotional-more').addEventListener('click',action(()=>loadDevotionals(true)));
$('#devotional-form').addEventListener('submit',event=>{event.preventDefault();action(async()=>{const form=event.currentTarget,data=Object.fromEntries(new FormData(form));data.is_sample=form.elements.is_sample.checked;if(editingDevotional)data.revision=editingDevotional.revision;await api('admin/devotionals'+(editingDevotional?'/'+encodeURIComponent(editingDevotional.id):''),data);$('#devotional-editor').close();await loadDevotionals();notice('Devotional saved and recorded.');})(event);});
$('#devotional-delete-cancel').addEventListener('click',()=>$('#devotional-delete').close());
$('#devotional-delete-form').addEventListener('submit',event=>{event.preventDefault();action(async()=>{const data=Object.fromEntries(new FormData(event.currentTarget));data.revision=deletingDevotional.revision;await api('admin/devotionals/'+encodeURIComponent(deletingDevotional.id)+'/delete',data);$('#devotional-delete').close();await loadDevotionals();notice('Devotional deleted and recorded.');})(event);});

function renderHelp() {
 const provisional=user.access_level==='provisional',query=$('#help-search').value.trim().toLowerCase(),target=$('#help-topics'),links=$('#help-topic-links');target.replaceChildren();links.replaceChildren();
 $('#help-access').replaceChildren(element('strong',provisional?'Your access request is awaiting admin review.':'Welcome to the prayer community.'),element('p',provisional?'You can read Global prayers and published devotionals, browse resources available to your profile, use this guide, and update My account. Read “From provisional to full access” below for your next steps.':'Start with the Prayer wall, spend time in Daily devotional, or find encouragement in Resources. Privacy choices apply to each prayer you share.'));
 const topics=[
  {title:'From provisional to full access',keywords:'pending request approval unlock membership invitation access refresh contact admin',paragraphs:['When you submit Request access and choose a password, the portal creates your provisional account and sends your request to the portal admins for review. You already have an account; you do not need to submit another request.','An admin reviews your information and verifies that the email address belongs to you before granting full membership. There is no automatic approval or guaranteed approval time. If you need to follow up, contact the portal admin or the person who invited you through your usual contact method.','While waiting, you can read Global prayers and published daily devotionals, mark devotionals read or unread, browse resources permitted by your profile, open How it Works, and update My account. Group participation, the people directory, following people, posting prayers, recommending resources, and giving hearts or thumbs up require full membership.'],steps:['Check My account for an accurate display name, username, and contact information. Your associated email remains private to you and admins.','Watch for contact from an admin and complete any identity or email verification they request. Approval is handled by an admin; an invitation from another member or following someone does not approve your account.','After an admin approves you, choose Refresh access in the provisional notice, or sign out and sign in again. Keep using the same username or email and password.','Full access unlocks member features. You still need approval to join a group, and each prayer keeps its chosen audience. Full membership does not grant admin access.'],view:'profile',button:'Check My account'},
  {title:'Share a prayer and choose its audience',keywords:'prayer wall share in who can see privacy global request update answered selected heart',paragraphs:['Choose + Share a prayer on the Prayer wall. Select Prayer request, Update, or Answered prayer, and enter a title and your message.','Share in chooses where the post belongs: the prayer community, an approved group, or Global. Who can see this? chooses the audience within that setting: the author and admins, selected people and admins, or all eligible community or group members. A group post stays within the approved group even when its audience is all group members.','Global means every signed-in person, including provisional users, regardless of group or demographics. Global prayers have no narrower group or selected-person audience. Existing prayers do not become Global automatically; changing that audience requires confirmation.','Portal admins can see every prayer. A group leader does not automatically see restricted prayers. Following someone or giving a heart never expands a prayer’s audience. A heart expresses support and counts once per person; select it again to remove it. Hearts do not subscribe you to prayer updates.'],steps:['Choose the post type and enter the prayer.','Review Share in and Who can see this? carefully before posting.','Share only details appropriate for that audience, and respect the privacy of other people mentioned.'],view:'feed',button:'Open Prayer wall'},
  {title:'Find people and follow their posts',keywords:'people directory follow following notifications updates answered',paragraphs:['Full members can browse People directory and choose whom to follow. Choose which post types you want to hear about: prayer requests, updates, or answered prayers. People I follow shows posts from followed people that you are permitted to see.','Following is separate from group membership. It does not let you see private prayers, restricted group posts, or someone’s private account fields.'],view:'people',button:'Open People directory'},
  {title:'Join or create a group',keywords:'accountability circle prayer partners discover invitation leader approve join members',paragraphs:['Discover groups shows listed groups where full members can ask to join. Open a group, read its purpose, and request membership. The group leader or an admin reviews the request. Group members and group prayers stay private until membership is approved.','My groups & invitations shows your groups and group invitations. Accept an invitation before participating. A group invitation is separate from portal account approval.','If + Create a group is available, you can create a group for accountability, prayer, prayer partners, or another purpose. Choose whether it is listed or unlisted. As leader, you manage join requests and invite existing portal members. Group leaders do not become portal admins.'],view:'groups',button:'Open My groups & invitations'},
  {title:'Use the resource library',keywords:'books music sermon articles search filters hashtag tags recommend pending image age gender thumbs',paragraphs:['Resources includes books, music, teaching, prayers, and practical tools. Search by title, creator, topic, or hashtag, and combine category, tag, featured, and sort filters. Resource links open the provider’s website.','A thumbs up shows that a resource was helpful. Each full member can give one thumbs up per resource and select it again to remove it.','Full members can choose Recommend a resource, add details and an optional image, and submit it for admin review. Pending recommendations are visible only to admins, including before the person who recommended them can see the published entry.','Some resources have age or gender audiences. A valid birth date is required for any age-restricted resource; a matching gender is required for gender-restricted resources. Add those optional private details in My account if you want resources matched to your profile. Admins can review every resource.'],view:'resources',button:'Browse Resources'},
  {title:'Read the daily devotional',keywords:'devo scripture bible reflect pray daily reading read unread sample schedule archive',paragraphs:['Daily devotional is available to every signed-in user, including provisional accounts. It shows today’s published reading, or the latest published reading with its date when none is assigned today. Scripture links open the Bible passage; Reflect and Pray offer a question and closing prayer.','Mark as read saves progress privately for your account. Mark unread reverses it. Browse devotionals lets you search earlier readings and filter Read or Unread. Other members and admins do not see your personal reading progress.','Sample devotionals are clearly labeled for testing. Draft, hidden, and future readings are unavailable to members. Reading dates use your profile time zone, or America/Chicago if none is set.'],view:'devotionals',button:'Open Daily devotional'},
  {title:'Understand notifications',keywords:'alerts phone push email preferences follow types group requests updates answered',paragraphs:['Notifications currently appear inside the portal. Phone push alerts and email alerts for prayer posts are not enabled. Following people and group notification preferences determine which eligible new posts create alerts. Hearts and resource thumbs up do not subscribe you to notifications.','My account has master notification choices for prayer requests, updates, and answered prayers. Turning a type off silences new notifications of that type across your subscriptions; existing notifications remain. Privacy checks still apply to every notification.'],view:'profile',button:'Review notification preferences'},
  {title:'Manage your account and sign-in',keywords:'username email password reset remember me eye gender birth date phone timezone introduction sign out',paragraphs:['My account lets you update your display name, username, introduction, optional profile details, and notification preferences. You can sign in with your username or associated email. The associated email stays linked to the account and cannot be changed in this form.','Your introduction appears in the member directory. Email, phone, time zone, gender, and birth date remain private to you and portal admins. Members cannot change their own role or membership approval.','Remember me remembers your ID and lets your browser save and autofill your password when supported. Accept the browser’s save-password prompt if offered. You still click Sign in each time you open or reload the portal. The eye button shows or hides the password while you enter it. Unchecking Remember me clears the portal’s remembered ID; manage saved passwords in your browser.','To reset your password, choose Forgot password? on the sign-in page and enter your username or email. A reset link is sent to the active account’s associated email. The link expires in one hour and works once. Your prayer portal account is separate from your MMT account. Sign out when you finish on a shared device.'],view:'profile',button:'Open My account'},
  {title:'Choose Expanded or Collapsed views',keywords:'list view compact tiles settings expand collapse',paragraphs:['Expanded is the default. Choose Collapsed in the List view toolbar for shorter rows across prayers, people, resources, groups, devotionals, and this guide. The preference is saved to your account.','Open an individual row to read its details without changing your overall preference. Hearts and thumbs up can be used directly from their collapsed rows. The audit log remains a compact table.']},
  ...(user.role==='admin'?[{title:'Admin review and moderation',keywords:'admin approve accounts resource pending needs attention unlock delete hide devotional schedule',paragraphs:['Open Admin and check Needs your attention for pending resource recommendations and access or password requests. Use the direct review buttons to reach the matching queue. Verify a requester’s identity and email before approving full access.','Accounts provides the available account, role, and access controls. New invitees are regular members; admin status must be granted explicitly. All prayers and All groups let admins review content regardless of its audience.','Resources has admin curation and approval controls. In Daily devotional, Manage devotionals and Add devotional support editing, scheduling, publishing, hiding, and deletion. Only one devotional can be published for a date; future published entries become available on that date.','Admin changes require a reason and are recorded in the audit log. Read deletion confirmations carefully: permanent deletion cannot be undone.']}]:[])
 ];
 let count=0;for(const topic of topics) {
  if(query&&![topic.title,topic.keywords,...topic.paragraphs,...(topic.steps||[])].join(' ').toLowerCase().includes(query))continue;
  count++;const item=element('details',undefined,'list-item help-topic'),summary=element('summary'),copy=element('span',undefined,'list-summary-copy');copy.append(element('span',topic.title,'list-summary-title'));const disclosure=element('span','Expand','list-disclosure');summary.append(copy,disclosure);
  item.id='help-topic-'+topics.indexOf(topic);summary.tabIndex=0;const link=element('a',topic.title);link.href='#'+item.id;link.addEventListener('click',event=>{event.preventDefault();item.open=true;item.scrollIntoView({block:'start'});summary.focus({preventScroll:true});});const entry=element('li');entry.append(link);links.append(entry);
  const content=element('div',undefined,'panel');content.append(element('h3',topic.title));for(const paragraph of topic.paragraphs)content.append(element('p',paragraph));
  if(topic.steps){const list=element('ol');for(const step of topic.steps)list.append(element('li',step));content.append(list);}
  if(topic.view&&(!provisional||['feed','resources','devotionals','profile'].includes(topic.view)))content.append(button(topic.button,()=>showView(topic.view)));
  item.open=(user.list_view||'expanded')==='expanded';const label=()=>{disclosure.textContent=item.open?'Collapse':'Expand';summary.setAttribute('aria-label',(item.open?'Collapse ':'Expand ')+topic.title);};item.addEventListener('toggle',label);label();item.append(summary,content);target.append(item);
 }
 $('#help-topic-nav').hidden=!count;
 $('#help-results').textContent=count+' topic'+(count===1?'':'s')+(query?' matching your search':' in this guide');if(!count)empty(target,'No topics match. Try prayer, full access, resources, or password.');
}
$('#help-search').addEventListener('input',()=>{if(user&&currentView==='help')renderHelp();});
