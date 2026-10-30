export const profileGenders=['','male','female','another','undisclosed'];
export function validBirthDate(value,today=new Date()) {
 if(value==='') return true;
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
 const parsed=new Date(`${value}T00:00:00Z`);
 return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10)===value && value<=today.toISOString().slice(0,10) && parsed.getUTCFullYear()>=today.getUTCFullYear()-120;
}
export function ageInYears(birthDate,today=new Date()) {
 if(!birthDate || !validBirthDate(birthDate,today)) return null;
 const year=Number(birthDate.slice(0,4));
 return today.getUTCFullYear()-year-(today.toISOString().slice(5,10)<birthDate.slice(5)?1:0);
}
// Used for every library discovery query and image read. Admin review bypasses
// demographic restrictions, but member metadata and image access never do.
export function resourceAccess(user) {
 if(user.role==='admin') return {sql:'1=1',args:[]};
 const age=ageInYears(user.birth_date);
 return {sql:`r.visible=1 AND r.review_status='approved'
  AND (r.genders='' OR instr(','||r.genders||',',','||?||',')>0)
  AND ((r.min_age IS NULL AND r.max_age IS NULL) OR
   (? IS NOT NULL AND (r.min_age IS NULL OR ?>=r.min_age) AND (r.max_age IS NULL OR ?<=r.max_age)))`,args:[user.gender||'',age,age,age]};
}
