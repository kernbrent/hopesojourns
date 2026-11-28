export type PersonalGiftDetails = {
 contactId:string; receivedBy:string; method:string; reference:string; designation:string;
 reviewOverride?:{reason:string;actor:string;recordedAt:string;unsettledCents:number;missingEvidence:boolean};
 movements:{id:string;kind:'transfer'|'expense'|'fee';date:string;amountCents:number;reference:string;description:string;clearedDate:string|null}[];
};
export function validatePersonalGift(value:unknown,gross:number,fee:number,net:number):PersonalGiftDetails {
 const b=value as PersonalGiftDetails;
 const date=(v:string)=>typeof v==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
 const text=(v:unknown,max=500)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
 if(!b||!text(b.contactId,64)||!text(b.receivedBy,160)||!['Personal Venmo','Personal Zelle','Personal PayPal','Check','Cash'].includes(b.method)||!text(b.reference,160)||!text(b.designation,200)||!Array.isArray(b.movements)||b.movements.length>100)throw new Error('Invalid personal gift details');
 const override=b.reviewOverride;
 if(override!==undefined&&(!override||!text(override.reason,1000)||!text(override.actor,160)||!text(override.recordedAt,40)||!Number.isFinite(Date.parse(override.recordedAt))||!Number.isSafeInteger(override.unsettledCents)||override.unsettledCents<0||typeof override.missingEvidence!=='boolean'||(!override.unsettledCents&&!override.missingEvidence)))throw new Error('Invalid personal gift override');
 let total=0,fees=0;const ids=new Set<string>();
 for(const m of b.movements){
  if(!text(m.id,64)||ids.has(m.id)||!['transfer','expense','fee'].includes(m.kind)||!date(m.date)||!Number.isSafeInteger(m.amountCents)||m.amountCents<=0||!text(m.reference,160)||!text(m.description,500)||m.kind==='transfer'&&(!m.clearedDate||!date(m.clearedDate)||m.clearedDate<m.date))throw new Error('Invalid personal gift settlement');
  ids.add(m.id);total+=m.amountCents;if(m.kind==='fee')fees+=m.amountCents;
 }
 if(total+(override?.unsettledCents||0)!==Math.round(gross*100)||Math.round(fee*100)!==-fees||Math.round(net*100)!==Math.round(gross*100)-fees)throw new Error('Personal gift settlement does not reconcile');
 return b;
}
