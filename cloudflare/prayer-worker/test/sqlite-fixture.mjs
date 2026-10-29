export function storageFor(database) {
 return {
  sql:{exec(query,...args) {
   let rows=[];
   if(query.includes(';') && !args.length) database.exec(query);
   else {const statement=database.prepare(query); if(statement.columns().length) rows=statement.all(...args); else statement.run(...args);}
   return {toArray:()=>rows};
  }},
  transactionSync(callback) {
   database.exec('BEGIN');
   try {const result=callback();database.exec('COMMIT');return result;}
   catch(error) {database.exec('ROLLBACK');throw error;}
  }
 };
}
