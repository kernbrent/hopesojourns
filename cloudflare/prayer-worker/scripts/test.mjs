import {spawnSync} from 'node:child_process';
for(const storage of ['d1','durable']) {
 console.log(`\nPrayer portal security/behavior suite: ${storage}`);
 const result=spawnSync(process.execPath,['--test','test/portal.test.mjs','test/sqlite-database.test.mjs'],{stdio:'inherit',env:{...process.env,PRAYER_TEST_STORAGE:storage}});
 if(result.status!==0) process.exit(result.status || 1);
}
