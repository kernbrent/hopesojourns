import type {Question} from './content.js';
export const dateKey:(date?:Date)=>string;
export const dailyQuestions:(key:string)=>Question[];
export const roundQuestions:(seed:string)=>Question[];
export const expectedDaily:(key:string,version:string)=>Question[];
export const HISTORY_SELECTION:string;
