import type {AdminEnv} from './admin';

export const interestProfileFields = ['ageRange','occupation','church'] as const;
export const ageRanges = ['5-15','16-17','18-25','26-40','41+'];

// Merge only approved keys in SQL so unrelated details and concurrent edits survive.
export function interestProfileStatement(env:AdminEnv,personId:string,input:Record<string,unknown>,keys:readonly string[],now:string,revision?:number){
 const details:Record<string,string>={};
 for(const key of interestProfileFields)if(keys.includes(key)&&typeof input[key]==='string')details[key]=input[key] as string;
 if(!Object.keys(details).length)return null;
 return env.DB.prepare(`INSERT INTO traveler_profiles(person_id,details_json,revision,updated_at) VALUES(?,?,0,?)
 ON CONFLICT(person_id) DO UPDATE SET details_json=json_patch(traveler_profiles.details_json,excluded.details_json),revision=CASE WHEN ? IS NULL OR traveler_profiles.revision=? THEN traveler_profiles.revision+1 ELSE -1 END,updated_at=excluded.updated_at`).bind(personId,JSON.stringify(details),now,revision??null,revision??null);
}
