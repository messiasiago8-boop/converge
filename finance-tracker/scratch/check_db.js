import db from '../database.js';

db.all('SELECT id, usuario_id, descricao, valor FROM despesas', (err, rows) => {
  console.log('Total despesas:', rows ? rows.length : 0);
  console.log('Despesas:', rows);
  db.all('SELECT id, usuario_id, descricao, valor FROM entradas', (errE, rowsE) => {
    console.log('Total entradas:', rowsE ? rowsE.length : 0);
    console.log('Entradas:', rowsE);
  });
});
