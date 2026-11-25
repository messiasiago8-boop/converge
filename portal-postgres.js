const { criarPool, prepararSchema } = require('./postgres');

async function abrirPortalPostgres() {
  const pool = criarPool();
  pool.on('error', () => console.warn('[Portal PostgreSQL] Conexão ociosa interrompida.'));
  await prepararSchema(pool);
  const revisoes = new WeakMap();

  return {
    async contaExiste(usuarioId) {
      const resultado = await pool.query('SELECT 1 FROM usuarios WHERE id = $1', [usuarioId]);
      return resultado.rowCount > 0;
    },
    async carregar(usuarioId) {
      const { rows } = await pool.query('SELECT dados, versao FROM portal_dados WHERE usuario_id = $1', [usuarioId]);
      const estado = rows[0]?.dados || {};
      revisoes.set(estado, { usuarioId, versao: rows[0]?.versao });
      return estado;
    },
    async salvar(dados, usuarioId, anterior = dados) {
      const revisao = revisoes.get(anterior);
      if (!revisao || revisao.usuarioId !== usuarioId) throw new Error('Estado do portal sem revisão válida.');
      const parametros = [usuarioId, JSON.stringify(dados)];
      const resultado = revisao.versao === undefined
        ? await pool.query('INSERT INTO portal_dados (usuario_id, dados) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING versao', parametros)
        : await pool.query(
          'UPDATE portal_dados SET dados = $2, versao = versao + 1 WHERE usuario_id = $1 AND versao = $3 RETURNING versao',
          [...parametros, revisao.versao]
        );
      if (!resultado.rowCount) {
        const erro = new Error('Os dados mudaram em outra operação. Atualize e tente novamente.');
        erro.status = 409;
        throw erro;
      }
      revisoes.set(dados, { usuarioId, versao: resultado.rows[0].versao });
    },
    async listarUsuariosComAlertas() {
      const { rows } = await pool.query(
        "SELECT usuario_id FROM portal_dados WHERE jsonb_array_length(COALESCE(dados->'push_subscriptions', '[]'::jsonb)) > 0"
      );
      return rows.map(linha => linha.usuario_id);
    },
    async obterOuCriarVapid(gerar) {
      const consulta = 'SELECT dados FROM portal_config WHERE chave = $1';
      const existente = await pool.query(consulta, ['vapid']);
      if (existente.rowCount) return existente.rows[0].dados;
      const novas = gerar();
      await pool.query('INSERT INTO portal_config (chave, dados) VALUES ($1, $2) ON CONFLICT DO NOTHING', ['vapid', JSON.stringify(novas)]);
      return (await pool.query(consulta, ['vapid'])).rows[0].dados;
    }
  };
}

module.exports = { abrirPortalPostgres };
