import postgres from '../postgres.js';

export async function abrirFinancasPostgres() {
  const { criarPool, prepararSchema, transacao } = postgres;
  const pool = criarPool();
  pool.on('error', () => console.warn('[Finanças PostgreSQL] Conexão ociosa interrompida.'));
  await prepararSchema(pool);

  function executar(query, params, callback, operacao) {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    const ignorarConflito = /^INSERT OR IGNORE INTO/i.test(query.trim());
    let numero = 0;
    let sql = query.trim().replace(/^INSERT OR IGNORE INTO/i, 'INSERT INTO').replace(/\?/g, () => `$${++numero}`);
    if (operacao === 'run' && /^INSERT INTO/i.test(sql)) {
      if (ignorarConflito) sql += ' ON CONFLICT DO NOTHING';
      sql += ' RETURNING id';
    }
    pool.query(sql, params || []).then(resultado => {
      if (operacao === 'run') callback?.call({ lastID: resultado.rows[0]?.id, changes: resultado.rowCount }, null);
      else callback?.(null, operacao === 'get' ? resultado.rows[0] : resultado.rows);
    }, erro => {
      if (callback) callback(erro);
      else console.error('[Finanças PostgreSQL] Falha ao executar operação:', erro.code);
    });
  }

  return {
    all(query, params, callback) { executar(query, params, callback, 'all'); },
    get(query, params, callback) { executar(query, params, callback, 'get'); },
    run(query, params, callback) { executar(query, params, callback, 'run'); },
    salvarLimites(usuarioId, limites) {
      return transacao(pool, async cliente => {
        for (const [categoria, valor] of Object.entries(limites).sort()) {
          await cliente.query(
            'INSERT INTO limites (usuario_id, categoria, valor_maximo) VALUES ($1, $2, $3) ON CONFLICT (usuario_id, categoria) DO UPDATE SET valor_maximo = EXCLUDED.valor_maximo',
            [usuarioId, categoria, Number(valor) || 0]
          );
        }
      });
    }
  };
}
