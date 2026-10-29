import app from './index.mjs';
import {sqliteDatabase,initializeDatabase} from './sqlite-database.mjs';

export class PrayerStore {
  constructor(ctx,env) {
    initializeDatabase(ctx.storage,env);
    this.env={...env,DB:sqliteDatabase(ctx.storage)};
  }
  async fetch(request) {return app.fetch(request,this.env);}
}
