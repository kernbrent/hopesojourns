import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {initializeDatabase,sqliteDatabase} from '../src/sqlite-database.mjs';
import {storageFor} from './sqlite-fixture.mjs';
import {schema} from '../src/schema.mjs';
test('hosted SQLite migrations are idempotent, isolated, and protect initial-admin claims',()=>{
 const sql=new DatabaseSync(':memory:'),storage=storageFor(sql);
 const setup={email:'initial@example.com',tokenHash:'a'.repeat(64),expiresAt:Date.now()+60000};
 initializeDatabase(storage,{INITIAL_ADMIN_SETUP:JSON.stringify(setup)});
 initializeDatabase(storage,{INITIAL_ADMIN_SETUP:JSON.stringify(setup)});
 assert.equal(sql.prepare('SELECT count(*) n FROM _prayer_migrations').get().n,schema.length);
 assert.equal(sql.prepare('SELECT token_hash FROM initial_admin_setup').get().token_hash,setup.tokenHash);
 sql.prepare('INSERT INTO users (id,email,name,password,role,created_at) VALUES (?,?,?,?,?,?)').run('admin',setup.email,'Admin','unused','admin',Date.now());
 initializeDatabase(storage,{INITIAL_ADMIN_SETUP:JSON.stringify({...setup,tokenHash:'b'.repeat(64)})});
 assert.equal(sql.prepare('SELECT token_hash FROM initial_admin_setup').get().token_hash,setup.tokenHash);
 const other=new DatabaseSync(':memory:');initializeDatabase(storageFor(other),{});
 assert.equal(other.prepare('SELECT count(*) n FROM users').get().n,0);
});
test('hosted SQL batches roll back all writes when a statement fails',async()=>{
 const sql=new DatabaseSync(':memory:'),storage=storageFor(sql);initializeDatabase(storage,{});
 const db=sqliteDatabase(storage);
 await assert.rejects(db.batch([
  db.prepare('INSERT INTO users (id,email,name,password,role,created_at) VALUES (?,?,?,?,?,?)').bind('one','one@example.com','One','unused','member',Date.now()),
  db.prepare('INSERT INTO users (id,email,name,password,role,created_at) VALUES (?,?,?,?,?,?)').bind('one','two@example.com','Two','unused','member',Date.now())
 ]));
 assert.equal(sql.prepare('SELECT count(*) n FROM users').get().n,0);
});
test('upgrading an existing owner preserves password and email while assigning admin username',()=>{
 const sql=new DatabaseSync(':memory:');
 sql.exec('CREATE TABLE _prayer_migrations(name TEXT PRIMARY KEY,applied_at INTEGER NOT NULL)');
 for(const migration of schema.slice(0,3)) {sql.exec(migration.sql);sql.prepare('INSERT INTO _prayer_migrations VALUES (?,?)').run(migration.name,Date.now());}
 sql.prepare('INSERT INTO users VALUES (?,?,?,?,?,?)').run('owner','kernbrent@gmail.com','Brent','preserved-password-hash','admin',Date.now());
 sql.prepare('INSERT INTO initial_admin_setup VALUES (1,?,?,?,?)').run('kernbrent@gmail.com','a'.repeat(64),Date.now()+1000,Date.now());
 initializeDatabase(storageFor(sql),{});
 const owner=sql.prepare('SELECT * FROM users').get();assert.equal(owner.username,'admin');assert.equal(owner.email,'kernbrent@gmail.com');assert.equal(owner.password,'preserved-password-hash');assert.equal(owner.is_owner,1);assert.equal(owner.role,'admin');
});
