export interface Answer {name:string;points:number;ref:string;note:string;aliases:string[]}
export interface Question {id:string;category:string;prompt:string;scope:string;hint:string;answers:Answer[];kind:'general'|'focused';difficulty:'easy'|'medium'|'hard';topic:string;active:boolean;starter?:string;acceptPhrases?:boolean}
export const QUESTIONS:Question[];
export const BANK_VERSION:string;
export const LEGACY_BANK_VERSION:string;
export const PREVIOUS_BANK_VERSION:string;
export const SUPPORTED_BANKS:string[];
export const scriptureURL:(ref:string)=>string;
export const tierFor:(points:number)=>{min:number;name:string;mark:string;description:string};

export const PLAYABLE_QUESTIONS:Question[];
export const BALANCED_BANK_VERSION:string;
export const REWARD_BANKS:string[];

export const PREVIOUS_COMMON_BANK_VERSION:string;
export const COMMON_BANKS:string[];
