import {emailColors as colors} from './gift-email-colors';
export const giftSubject='Thank You for your support of Hope Sojourns';
export type ThankYouGift={name:string;date:string;amount:number;currency:string;method:string};
const escape=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function paymentLabel(value:string){
 const method=value.toLowerCase();
 return ['paypal','venmo','check','zelle','cash'].find(v=>method.includes(v))?.replace(/^./,c=>c.toUpperCase()).replace('Paypal','PayPal')||'Other';
}
export function giftEmail(gift:ThankYouGift,signature:string){
 const date=new Intl.DateTimeFormat('en-US',{dateStyle:'long',timeZone:'UTC'}).format(new Date(gift.date.slice(0,10)+'T12:00:00Z'));
 const amount=new Intl.NumberFormat('en-US',{style:'currency',currency:gift.currency}).format(gift.amount);
 const method=paymentLabel(gift.method);
 const intro='Thank you for your generous support of Hope Sojourns. Your gift helps us serve alongside local ministries, encourage communities, and share the hope and love of Christ.';
 const ending='We are thankful for your partnership in this ministry. If you have any questions about your gift, please reply to this email.';
 const text=`Dear ${gift.name},\n\n${intro}\n\nWe gratefully acknowledge your gift:\n\nDate given: ${date}\nAmount: ${amount}\nGiven through: ${method}\n\n${ending}\n\nWitLooL,\nBrent Kern\nHope Sojourns\n972-505-0171\nChristian Steps Ministries\n\nWitLooL™ means “Working in the Light of our Lord.”\nWitLooL is a trademark.\nhttps://hopesojourns.com\nhttps://www.christiansteps.net`;
 const rows=[['Date given',date],['Amount',amount],['Given through',method]].map(([label,value])=>`<tr><td style="padding:10px 16px;color:${colors.muted}">${label}</td><td style="padding:10px 16px;font-weight:bold">${escape(value!)}</td></tr>`).join('');
 // Tables and explicit image dimensions work in email clients without clipping the oval.
 const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:${colors.white};color:${colors.ink};font:15px/1.6 Arial,sans-serif"><div style="max-width:640px;margin:auto;padding:24px"><p>Dear ${escape(gift.name)},</p><p>${intro}</p><p>We gratefully acknowledge your gift:</p><table style="width:100%;border-collapse:collapse;background:${colors['forest-wash']}">${rows}</table><p>${ending}</p><table role="presentation" style="margin-top:24px;border-collapse:collapse;width:100%;max-width:400px;table-layout:fixed"><tr><td style="vertical-align:middle;padding:0 10px 0 0;width:43%"><img src="https://hopesojourns.com/assets/hope-sojourns-oval-icon.png" alt="Hope Sojourns oval logo" width="172" height="172" style="display:block;width:100%;max-width:172px;height:auto"></td><td style="vertical-align:middle;font-size:14px;line-height:1.45">WitLooL,<div><img src="${signature}" alt="Brent Kern’s signature" width="190" style="display:block;width:190px;max-width:100%;height:auto;margin:5px 0 4px"></div><div><strong>Brent Kern</strong></div><strong>Hope Sojourns</strong><br>972-505-0171<br>Christian Steps Ministries</td></tr></table><div style="margin-top:24px;padding-top:15px;border-top:1px solid ${colors['forest-soft']};font-size:11px;color:${colors.muted}">WitLooL™ means “Working in the Light of our Lord.”<br>WitLooL is a trademark.<br><a href="https://hopesojourns.com" style="color:${colors.forest}">https://hopesojourns.com</a><br><a href="https://www.christiansteps.net" style="color:${colors.forest}">https://www.christiansteps.net</a></div></div></body></html>`;
 return {subject:giftSubject,text,html};
}
