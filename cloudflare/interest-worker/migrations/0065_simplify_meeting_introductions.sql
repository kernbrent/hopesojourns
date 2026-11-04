-- Preserve introduction history while moving follow-up into ordinary shared tasks.
ALTER TABLE meeting_introductions ADD COLUMN converted_task_id TEXT REFERENCES ministry_tasks(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX meeting_introduction_task ON meeting_introductions(converted_task_id) WHERE converted_task_id IS NOT NULL;
INSERT INTO ministry_tasks(id,title,notes,person_id,ministry_id,owner_id,status,meeting_id,introduction_id,direction,created_at,updated_at)
SELECT i.id,substr('Introduce: '||COALESCE(NULLIF(trim(p.first_name||' '||p.last_name),''),m.name,NULLIF(i.pending_name,''),'Follow up'),1,180),
 substr('Previous introduction stage: '||i.status||char(10)||
 'Introduced by: '||COALESCE((SELECT group_concat(COALESCE(trim(ip.first_name||' '||ip.last_name),im.name),' / ') FROM meeting_introduction_entities e LEFT JOIN people ip ON ip.id=e.person_id LEFT JOIN ministries im ON im.id=e.ministry_id WHERE e.introduction_id=i.id AND e.role='introducer'),'Not recorded')||char(10)||
 CASE WHEN i.promised_date IS NOT NULL THEN 'Promised: '||i.promised_date||char(10) ELSE '' END||
 CASE WHEN i.made_date IS NOT NULL THEN 'Made: '||i.made_date||char(10) ELSE '' END||
 i.notes||CASE WHEN i.next_action<>'' THEN char(10)||'Next step: '||i.next_action ELSE '' END,1,4000),
 p.id,m.id,mt.created_by,CASE WHEN i.status='canceled' THEN 'canceled' WHEN i.status IN ('connected','closed') THEN 'completed' ELSE 'open' END,
 i.meeting_id,i.id,'mine',i.created_at,i.updated_at
FROM meeting_introductions i JOIN meetings mt ON mt.id=i.meeting_id
LEFT JOIN people p ON p.id=json_extract(i.target_json,'$.id') AND json_extract(i.target_json,'$.kind')='person'
LEFT JOIN ministries m ON m.id=json_extract(i.target_json,'$.id') AND json_extract(i.target_json,'$.kind')='ministry';
UPDATE meeting_introductions SET converted_task_id=id;
