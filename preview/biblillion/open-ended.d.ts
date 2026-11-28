export const OPEN_ENDED_IDS:Set<string>;
export function canJudge(q:unknown):boolean;
export function answerKey(value:unknown):string;
export function safeAnswer(value:unknown):value is string;
export function validReceipt(q:unknown,r:unknown):boolean;
export function checkPath(q:unknown,value:unknown):'curated'|'input'|'judge';
