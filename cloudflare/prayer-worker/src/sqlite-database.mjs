import {schema} from './schema.mjs';

// D1-compatible queries over Durable Object SQLite. Cursors are consumed before
// awaiting anything; every batch runs in one synchronous SQL transaction.
export function sqliteDatabase(storage) {
  const sql=storage.sql;
  return {
    prepare(query) {
      let values=[];
      const statement={
        bind(...args) {values=args;return statement;},
        async first() {return sql.exec(query,...values).toArray()[0] || null;},
        async all() {return {results:sql.exec(query,...values).toArray()};},
        execute() {
          sql.exec(query,...values).toArray();
          return {meta:{changes:sql.exec('SELECT changes() AS count').toArray()[0].count}};
        },
        async run() {return statement.execute();}
      };
      return statement;
    },
    async batch(statements) {return storage.transactionSync(()=>statements.map(statement=>statement.execute()));}
  };
}

export function initializeDatabase(storage,env) {
  const sql=storage.sql;
  sql.exec('CREATE TABLE IF NOT EXISTS _prayer_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)').toArray();
  for(const migration of schema) {
    if(sql.exec('SELECT name FROM _prayer_migrations WHERE name=?',migration.name).toArray().length) continue;
    storage.transactionSync(()=>{
      sql.exec(migration.sql).toArray();
      sql.exec('INSERT INTO _prayer_migrations VALUES (?,?)',migration.name,Date.now()).toArray();
    });
  }
  if(env.INITIAL_ADMIN_SETUP) {
    const setup=JSON.parse(env.INITIAL_ADMIN_SETUP);
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(setup.email || '') || !/^[a-f0-9]{64}$/.test(setup.tokenHash || '') || !Number.isSafeInteger(setup.expiresAt)) throw new Error('Invalid initial admin setup configuration.');
    sql.exec(`INSERT INTO initial_admin_setup (id,email,token_hash,expires_at,used_at)
      SELECT 1,?,?,?,NULL WHERE NOT EXISTS(SELECT 1 FROM users)
      ON CONFLICT(id) DO UPDATE SET email=excluded.email,token_hash=excluded.token_hash,expires_at=excluded.expires_at,used_at=NULL
      WHERE NOT EXISTS(SELECT 1 FROM users) AND initial_admin_setup.token_hash<>excluded.token_hash`,setup.email.toLowerCase(),setup.tokenHash,setup.expiresAt).toArray();
  }
}
