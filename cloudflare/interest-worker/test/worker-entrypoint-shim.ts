// Node unit tests do not instantiate Cloudflare entrypoints. Runtime wiring is
// exercised separately with the Workers runtime/service-binding integration test.
export class WorkerEntrypoint<T>{env!:T;}
