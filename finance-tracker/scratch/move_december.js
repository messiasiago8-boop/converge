import db from '../database.js';

// Transfere os lançamentos que o usuário acabou de criar em Dezembro (ID 28 e 30) para 2026-12 e para o usuario_id 2
db.run("UPDATE despesas SET data = '2026-12-01 12:00:00', usuario_id = 2 WHERE id IN (28, 30)", function(err) {
  console.log('Gastos ajustados para Dezembro/2026:', this.changes);
});
