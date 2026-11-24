import db from '../database.js';

db.all('SELECT id, usuario_id, descricao, valor, data FROM despesas', (err, rows) => {
  console.log('Datas das despesas:', rows);
});
