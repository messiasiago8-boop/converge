import sqlite3 from 'sqlite3';
const db = new sqlite3.Database('financas.sqlite');
db.all('SELECT id, nome, email FROM usuarios', (err, rows) => {
  console.log('USUARIOS:', JSON.stringify(rows));
  process.exit(0);
});
