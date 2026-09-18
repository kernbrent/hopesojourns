import {WorkerEntrypoint} from 'cloudflare:workers';
import {csmAuthority,type SharedEnv} from './shared-signin';
// Reachable only through a service binding explicitly naming CsmIdentity.
// The public fetch handler does not dispatch requests to this entrypoint.
export class CsmIdentity extends WorkerEntrypoint<SharedEnv>{
 async fetch(request:Request){return csmAuthority(request,this.env);}
}
