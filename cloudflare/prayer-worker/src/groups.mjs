export async function handleGroups(request, db, auth, url, helpers, config) {
  const { json, body, text, requireValue, rateLimit } = helpers;
  const path = url.pathname, method = request.method;
  if (path === '/api/groups' && method === 'GET') {
    const rows = await db.prepare(`SELECT g.*,u.name AS owner_name,m.status AS membership,
      m.requests,m.updates,m.answered,
      CASE WHEN g.owner_id=? OR ?='admin' THEN
        (SELECT count(*) FROM group_members r WHERE r.group_id=g.id AND r.status='pending') ELSE 0 END AS pending_count
      FROM groups g JOIN users u ON u.id=g.owner_id
      LEFT JOIN group_members m ON m.group_id=g.id AND m.user_id=?
      WHERE g.discoverable=1 OR g.owner_id=? OR ?='admin' OR m.status IN ('approved','pending','invited')
      ORDER BY g.name,g.id`).bind(auth.id,auth.role,auth.id,auth.id,auth.role).all();
    return json(rows.results);
  }
  if (path === '/api/groups' && method === 'POST') {
    requireValue(config.allowMemberGroups || auth.role === 'admin', 'Only portal admins can create groups here.',403);
    await rateLimit(db,`group-create:${auth.id}`,10);
    const data = await body(request), id = crypto.randomUUID(), time = Date.now();
    const name = text(data.name,100,'Group name'), description = text(data.description,1000,'Group description');
    requireValue(['accountability','prayer','partners','other'].includes(data.category), 'Choose a group type.');
    requireValue(typeof data.discoverable === 'boolean','Choose whether people can discover this group.');
    await db.batch([
      db.prepare('INSERT INTO groups VALUES (?,?,?,?,?,?,?)').bind(id,name,description,data.category,+data.discoverable,auth.id,time),
      db.prepare("INSERT INTO group_members (group_id,user_id,status,requested_at,decided_at,decided_by) VALUES (?,?,'approved',?,?,?)").bind(id,auth.id,time,time,auth.id)
    ]);
    return json({id},201);
  }
  const match = /^\/api\/groups\/([^/]+)(?:\/(join|leave|preferences|members)(?:\/([^/]+))?)?$/.exec(path);
  if (!match) return null;
  const [,id,action,target] = match;
  const group = await db.prepare(`SELECT g.*,u.name AS owner_name,m.status AS membership,m.requests,m.updates,m.answered
    FROM groups g JOIN users u ON u.id=g.owner_id LEFT JOIN group_members m ON m.group_id=g.id AND m.user_id=? WHERE g.id=?`).bind(auth.id,id).first();
  const manager = group && (group.owner_id === auth.id || auth.role === 'admin');
  // Conceal unlisted groups from non-members, even if their ID is guessed.
  requireValue(group && (group.discoverable || manager || ['approved','pending','invited'].includes(group.membership)), 'Group unavailable.',404);
  if (!action && method === 'GET') {
    let members = [];
    if (manager || group.membership === 'approved') {
      members = (await db.prepare(`SELECT m.user_id,u.name,m.status,m.requested_at,u.status AS account_status FROM group_members m JOIN users u ON u.id=m.user_id
        WHERE m.group_id=? AND (?=1 OR m.status='approved') ORDER BY m.requested_at`).bind(id,+manager).all()).results;
    }
    return json({ ...group,canManage:manager,members });
  }
  if (action === 'join' && !target && method === 'POST') {
    requireValue(group.discoverable || group.membership === 'invited','This group is unlisted. Contact its leader.',403);
    requireValue(!['removed','declined'].includes(group.membership),'Contact the group leader before requesting to join again.',403);
    requireValue(group.membership !== 'approved','You already belong to this group.',409);
    await rateLimit(db,`group-join:${auth.id}`,20);
    if (group.membership === 'invited') {
      const result = await db.prepare("UPDATE group_members SET status='approved',decided_at=?,decided_by=? WHERE group_id=? AND user_id=? AND status='invited'").bind(Date.now(),auth.id,id,auth.id).run();
      requireValue(result.meta.changes,'The invitation changed. Refresh this group.',409);
      return json({status:'approved'});
    }
    await db.prepare(`INSERT INTO group_members (group_id,user_id,status,requested_at) VALUES (?,?,'pending',?)
      ON CONFLICT(group_id,user_id) DO UPDATE SET status='pending',requested_at=excluded.requested_at,decided_at=NULL,decided_by=NULL
      WHERE group_members.status='left'`).bind(id,auth.id,Date.now()).run();
    return json({status:'pending'});
  }
  if (action === 'leave' && !target && method === 'POST') {
    requireValue(group.owner_id !== auth.id,'The group leader cannot leave their own group.',409);
    await db.prepare("UPDATE group_members SET status='left',decided_at=?,decided_by=? WHERE group_id=? AND user_id=? AND status IN ('approved','pending','invited')").bind(Date.now(),auth.id,id,auth.id).run();
    return json({ok:true});
  }
  if (action === 'preferences' && !target && method === 'POST') {
    requireValue(group.membership === 'approved','Join this group before choosing notifications.',403);
    const data = await body(request);
    for (const key of ['requests','updates','answered']) requireValue(typeof data[key] === 'boolean','Choose notification types.');
    await db.prepare("UPDATE group_members SET requests=?,updates=?,answered=? WHERE group_id=? AND user_id=? AND status='approved'").bind(+data.requests,+data.updates,+data.answered,id,auth.id).run();
    return json({ok:true});
  }
  if (action === 'members' && !target && method === 'POST') {
    requireValue(manager,'Only the group leader or a portal admin can invite members.',403);
    const data = await body(request), person = text(data.userId,80,'Member');
    requireValue(person !== group.owner_id && await db.prepare("SELECT id FROM users WHERE id=? AND status='active'").bind(person).first(),'Choose another active portal member.');
    await rateLimit(db,`group-invite:${auth.id}`,30);
    const result = await db.prepare(`INSERT INTO group_members (group_id,user_id,status,requested_at,decided_by) VALUES (?,?,'invited',?,?)
      ON CONFLICT(group_id,user_id) DO UPDATE SET status='invited',requested_at=excluded.requested_at,decided_at=NULL,decided_by=excluded.decided_by
      WHERE group_members.status IN ('left','removed','declined')`).bind(id,person,Date.now(),auth.id).run();
    requireValue(result.meta.changes,'This person is already a member or has a pending request/invitation.',409);
    return json({ok:true});
  }
  if (action === 'members' && target && method === 'POST') {
    requireValue(manager,'Only the group leader or a portal admin can manage membership.',403);
    requireValue(target !== group.owner_id,'The group leader must remain a member.',409);
    const data = await body(request);
    const status = {approve:'approved',decline:'declined',remove:'removed'}[data.decision];
    requireValue(status,'Choose approve, decline, or remove.');
    if(status==='approved') requireValue(await db.prepare("SELECT id FROM users WHERE id=? AND status='active'").bind(target).first(),'This account is not active.');
    const result = await db.prepare(`UPDATE group_members SET status=?,decided_at=?,decided_by=? WHERE group_id=? AND user_id=?
      AND ((?='approved' AND status='pending') OR (?='declined' AND status='pending') OR (?='removed' AND status IN ('approved','invited')))` ).bind(status,Date.now(),auth.id,id,target,status,status,status).run();
    requireValue(result.meta.changes,'Membership changed. Refresh the group and try again.',409);
    return json({ok:true});
  }
  return null;
}
