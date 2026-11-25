export interface Destination {id:string;name:string;country:string;image:string;alt:string;url:string;invitation:string}
export const DESTINATIONS:Destination[];
export const destinationFor:(id:string)=>Destination|null;
