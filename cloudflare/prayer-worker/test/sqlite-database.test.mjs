import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {initializeDatabase,sqliteDatabase} from '../src/sqlite-database.mjs';
import {storageFor} from './sqlite-fixture.mjs';
test('hosted SQLite migrations are idempotent, isolated, and protect initial-admin claims',()=>{
 const sql=new DatabaseSync(':memory:'),storage=storageFor(sql);
 const setup={email:'initial@example.com',tokenHash:'a'.repeat(64),expiresAt:Date.now()+60000};
 initializeDatabase(storage,{INITIAL_ADMIN_SETUP:JSON.stringify(setup)});
 initializeDatabase(storage,{INITIAL_ADMIN_SETUP:JSON.stringify(setup)});
 assert.equal(sql.prepare('SELECT count(*) n FROM _prayer_migrations').get().n,3);
 assert.equal(sql.prepare('SELECT token_hash FROM initial_admin_setup').get().token_hash,setup.tokenHash);
 sql.prepare('INSERT INTO users VALUES (?,?,?,?,?,?)').run('admin',setup.email,'Admin','unused','admin',Date.now());
 initializeDatabase(storage,{INITIAL_ADMIN_SETUP:JSON.stringify({...setup,tokenHash:'b'.repeat(64)})});
 assert.equal(sql.prepare('SELECT token_hash FROM initial_admin_setup').get().token_hash,setup.tokenHash);
 const other=new DatabaseSync(':memory:');initializeDatabase(storageFor(other),{});
 assert.equal(other.prepare('SELECT count(*) n FROM users').get().n,0);
});
test('hosted SQL batches roll back all writes when a statement fails',async()=>{
 const sql=new DatabaseSync(':memory:'),storage=storageFor(sql);initializeDatabase(storage,{});
 const db=sqliteDatabase(storage);
 await assert.rejects(db.batch([
  db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?)').bind('one','one@example.com','One','unused','member',Date.now()),
  db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?)').bind('one','two@example.com','Two','unused','member',Date.now())
 ]));
 assert.equal(sql.prepare('SELECT count(*) n FROM users').get().n,0);
});
