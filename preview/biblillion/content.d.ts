export interface Answer {name:string;points:number;ref:string;note:string;aliases:string[]}
export interface Question {id:string;category:string;prompt:string;scope:string;hint:string;answers:Answer[]}
export const QUESTIONS:Question[];
export const BANK_VERSION:string;
export const LEGACY_BANK_VERSION:string;
export const scriptureURL:(ref:string)=>string;
export const tierFor:(points:number)=>{min:number;name:string;mark:string;description:string};
