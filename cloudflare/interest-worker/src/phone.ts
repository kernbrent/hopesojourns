// Preserve explicit international numbers and extensions. Never truncate digits.
export function storedPhone(value:string|null|undefined,country?:string|null):string|null{
 if(!value)return null;const v=value.trim(),c=(country||'').trim().toUpperCase();
 if(c&&!['US','USA','UNITED STATES','UNITED STATES OF AMERICA'].includes(c))return v;
 if(!/^[+\d().\s-]+$/.test(v)||v.startsWith('+')&&!v.startsWith('+1'))return v;
 let digits=v.replace(/\D/g,'');if(digits.length===11&&digits.startsWith('1'))digits=digits.slice(1);
 return /^[2-9]\d{2}[2-9]\d{6}$/.test(digits)?digits:v;
}
export function matchPhone(value:string|null|undefined,country?:string|null):string|null{const v=storedPhone(value,country);if(!v)return null;const d=v.replace(/\D/g,'');return d.length>=7&&d.length<=18?d:null;}
