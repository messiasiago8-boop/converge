import sqlite3 from 'sqlite3';
const db = new sqlite3.Database('C:/Users/ADM/.gemini/antigravity/scratch/finance-tracker/financas.sqlite');

db.all('SELECT * FROM despesas WHERE usuario_id = 2 AND data LIKE "2026-11%"', (err, rows) => {
  if (err) console.error(err);
  else console.log('Despesas Nov 2026 User 2:', rows);
});
