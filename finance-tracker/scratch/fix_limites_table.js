import db from '../database.js';

db.serialize(() => {
  console.log('Recriando tabela limites com chave primária composta (usuario_id, categoria)...');
  db.run(`CREATE TABLE IF NOT EXISTS limites_new (
    usuario_id INTEGER NOT NULL,
    categoria TEXT NOT NULL,
    valor_maximo REAL NOT NULL DEFAULT 0,
    PRIMARY KEY(usuario_id, categoria),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
  )`);

  db.run(`INSERT OR IGNORE INTO limites_new (usuario_id, categoria, valor_maximo)
          SELECT COALESCE(usuario_id, 2), categoria, valor_maximo FROM limites`);

  db.run(`DROP TABLE limites`);
  db.run(`ALTER TABLE limites_new RENAME TO limites`);
  console.log('Tabela limites migrada com sucesso!');
});
