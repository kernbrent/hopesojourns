import {AsyncLocalStorage} from 'node:async_hooks';
export type Portal='hs'|'csm';
export const actorContext=new AsyncLocalStorage<{userId?:string;portal?:Portal}>();
export const currentPortal=():Portal=>actorContext.getStore()?.portal||'hs';
export const csmSections=['giving','finances'] as const;
export const sections=['contacts','trips','destinations','finances','documents','inbox'] as const;
export type Section=typeof sections[number];
export type MmtIdentity={id:string;username:string;first_name:string;last_name:string;email:string;phone:string;country:string;is_admin:number;permissions_json:string;status:string;must_change_password:number;registered_at:string;last_login_at?:string|null;revision:number;is_org_admin?:number;hs_access?:number;csm_access?:number;csm_is_admin?:number;csm_permissions_json?:string;deleted_at?:string|null};
export function hasPortal(u:MmtIdentity,p:Portal){return u.status==='active'&&!u.deleted_at&&(p==='hs'?u.hs_access!==0:u.csm_access===1);}
export function effectiveUser(u:MmtIdentity,p=currentPortal()):MmtIdentity{return {...u,is_admin:u.is_org_admin|| (p==='hs'?u.is_admin:u.csm_is_admin)||0,permissions_json:p==='hs'?u.permissions_json:u.csm_permissions_json||'{}'};}
export function permissions(user:MmtIdentity):Record<string,string>{
 if(user.is_admin)return Object.fromEntries((currentPortal()==='hs'?sections:csmSections).map(s=>[s,'edit']));
 try{return JSON.parse(user.permissions_json);}catch{return {};}
}
export function can(user:MmtIdentity,section:Section,edit=false){const p=permissions(user)[section];return !!user.is_admin||p==='edit'||(!edit&&p==='read');}
// Contacts covers people, requests, ministries and teams. Trip operations includes
// budgets and participant details; bulk import/export also requires contact access.
export function routeSection(path:string):Section|'self'|'admin'{
 if(['/admin/session','/admin/logout','/admin/password','/admin/account/profile','/admin/switch/issue','/admin/user-guide'].includes(path))return 'self';
 if(path.startsWith('/admin/interest-reviews/'))return 'contacts';
 if(path.startsWith('/admin/planning/'))return 'self'; // Each planning record enforces linked workspace permissions.
 if(path.startsWith('/admin/account/'))return 'admin';
 if(path.startsWith('/admin/destinations'))return 'destinations';
 if(path.startsWith('/admin/ministry/documents'))return 'documents';
 if(path==='/admin/ministry/inbox')return 'inbox';
 if(path.startsWith('/admin/finance')||path.startsWith('/admin/ledger')||path.startsWith('/admin/csm-inbox')||path==='/admin/ministry/travel-reserve')return 'finances';
 if(path.startsWith('/admin/trip')||path.startsWith('/admin/ministry/accounts')||path.startsWith('/admin/ministry/trips'))return 'trips';
 if(/^\/admin\/(people|ministries|teams|submissions|registrations|replies|export\.csv|contact-imports|contacts)(\/|$)/.test(path))return 'contacts';
 return 'admin';
}
