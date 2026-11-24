require('dotenv').config();
const fs = require('node:fs/promises');
const path = require('node:path');
const { criarPool, prepararSchema, transacao } = require('./postgres');

const tabelas = {
  usuarios: ['id', 'nome', 'email', 'senha', 'data_criacao'],
  entradas: ['id', 'usuario_id', 'descricao', 'valor', 'data'],
  despesas: ['id', 'usuario_id', 'descricao', 'valor', 'categoria', 'data'],
  limites: ['id', 'usuario_id', 'categoria', 'valor_maximo'],
  potes: ['id', 'usuario_id', 'nome', 'tipo', 'categoria_ativo', 'taxa_anual_pct', 'rendimento_mensal_pct', 'instituicao', 'vencimento', 'valor', 'data'],
  projetos_compras: ['id', 'usuario_id', 'nome', 'tipo', 'valor_objetivo', 'valor_acumulado', 'data_criacao'],
  aportes_projetos: ['id', 'usuario_id', 'projeto_id', 'valor', 'data'],
  investimentos_mensais: ['id', 'usuario_id', 'mes', 'tipo_ativo', 'valor_aplicado', 'rendimento_atual']
};
const camposPortal = ['topicos', 'videos', 'agendamentos', 'notas', 'prioridades_dia', 'historico_tarefas', 'habitos', 'compromissos', 'metas'];
const lerJson = async arquivo => JSON.parse(await fs.readFile(arquivo, 'utf8'));

async function lerFinanceiro(diretorio, formato) {
  if (formato === 'json') return lerJson(path.join(diretorio, 'financas_data.json'));
  const sqlite = require('sqlite3');
  const arquivo = path.join(diretorio, 'financas.sqlite');
  const banco = await new Promise((resolve, reject) => {
    const conexao = new sqlite.Database(arquivo, sqlite.OPEN_READONLY, erro => erro ? reject(erro) : resolve(conexao));
  });
  try {
    const all = sql => new Promise((resolve, reject) => banco.all(sql, (erro, rows) => erro ? reject(erro) : resolve(rows)));
    const existentes = new Set((await all("SELECT name FROM sqlite_master WHERE type = 'table'")).map(row => row.name));
    const dados = {};
    for (const tabela of Object.keys(tabelas)) dados[tabela] = existentes.has(tabela) ? await all(`SELECT * FROM ${tabela}`) : [];
    return dados;
  } finally {
    await new Promise((resolve, reject) => banco.close(erro => erro ? reject(erro) : resolve()));
  }
}

async function inserir(cliente, tabela, linha, preservarId) {
  // O modo JSON antigo representava alguns limites iniciais sem valor como null.
  if (tabela === 'limites' && linha.valor_maximo === null) linha = { ...linha, valor_maximo: 0 };
  const colunas = tabelas[tabela].filter(coluna => (preservarId || coluna !== 'id') && linha[coluna] !== undefined);
  const params = colunas.map(coluna => linha[coluna]);
  const { rows } = await cliente.query(
    `INSERT INTO ${tabela} (${colunas.join(', ')}) VALUES (${params.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`, params
  );
  return rows[0].id;
}

async function copiarBackup(cliente, dados, diretorioPortal) {
  for (const tabela of [...Object.keys(tabelas), 'portal_dados', 'portal_config']) {
    if ((await cliente.query(`SELECT 1 FROM ${tabela} LIMIT 1`)).rowCount) {
      throw new Error('O backup completo precisa de um banco PostgreSQL de destino vazio.');
    }
  }
  if (!Array.isArray(dados.usuarios) || !dados.usuarios.length) throw new Error('O backup de Finanças não contém contas.');
  for (const tabela of Object.keys(tabelas)) {
    for (const registro of dados[tabela] || []) await inserir(cliente, tabela, registro, true);
    await cliente.query(`SELECT setval(pg_get_serial_sequence($1, 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM ${tabela}`, [tabela]);
  }
  // O gatilho soma os aportes importados. Repõe o saldo original do backup.
  for (const projeto of dados.projetos_compras || []) {
    await cliente.query('UPDATE projetos_compras SET valor_acumulado = $1 WHERE id = $2', [projeto.valor_acumulado, projeto.id]);
  }
  const arquivos = await fs.readdir(diretorioPortal);
  for (const arquivo of arquivos) {
    const match = arquivo.match(/^database_user_(\d+)\.json$/);
    if (!match) continue;
    const estado = await lerJson(path.join(diretorioPortal, arquivo));
    await cliente.query('INSERT INTO portal_dados (usuario_id, dados) VALUES ($1, $2)', [Number(match[1]), JSON.stringify(estado)]);
  }
  if (arquivos.includes('vapid-keys.json')) {
    const chaves = await lerJson(path.join(diretorioPortal, 'vapid-keys.json'));
    if (chaves.publicKey && chaves.privateKey) {
      await cliente.query('INSERT INTO portal_config (chave, dados) VALUES ($1, $2)', ['vapid', JSON.stringify(chaves)]);
    }
  }
}

async function importarConta(cliente, arquivo, email) {
  const exportado = await lerJson(arquivo);
  if (exportado.versao !== 1 || !exportado.financas || !exportado.portal) throw new Error('Exportação do Converge inválida.');
  const conta = await cliente.query('SELECT id FROM usuarios WHERE email = $1 FOR UPDATE', [email.trim().toLowerCase()]);
  const usuarioId = conta.rows[0]?.id;
  if (!usuarioId) throw new Error('Crie a conta de destino antes da importação.');
  const existente = await cliente.query('SELECT dados FROM portal_dados WHERE usuario_id = $1', [usuarioId]);
  const estado = existente.rows[0]?.dados;
  if (estado && (camposPortal.some(campo => estado[campo]?.length) || Object.keys(estado.planos_semanais || {}).length)) {
    throw new Error('A conta de destino já contém dados no portal.');
  }
  const ordem = Object.keys(tabelas).filter(tabela => tabela !== 'usuarios');
  for (const tabela of ordem) {
    if (!Array.isArray(exportado.financas[tabela])) throw new Error('A exportação financeira está incompleta.');
    const filtro = tabela === 'limites' ? ' AND valor_maximo <> 0' : '';
    if ((await cliente.query(`SELECT 1 FROM ${tabela} WHERE usuario_id = $1${filtro} LIMIT 1`, [usuarioId])).rowCount) {
      throw new Error('A conta de destino já contém dados financeiros.');
    }
  }
  await cliente.query('DELETE FROM limites WHERE usuario_id = $1', [usuarioId]);
  const projetos = new Map();
  for (const tabela of ordem) {
    for (const linha of exportado.financas[tabela]) {
      const registro = { ...linha, usuario_id: usuarioId };
      if (tabela === 'aportes_projetos') {
        registro.projeto_id = projetos.get(Number(linha.projeto_id));
        if (!registro.projeto_id) throw new Error('A exportação contém um aporte sem o projeto correspondente.');
      }
      const novoId = await inserir(cliente, tabela, registro, false);
      if (tabela === 'projetos_compras') projetos.set(Number(linha.id), novoId);
    }
  }
  for (const projeto of exportado.financas.projetos_compras) {
    await cliente.query('UPDATE projetos_compras SET valor_acumulado = $1 WHERE id = $2', [projeto.valor_acumulado, projetos.get(Number(projeto.id))]);
  }

  const portal = { ...estado };
  for (const campo of camposPortal) {
    if (!Array.isArray(exportado.portal[campo])) throw new Error('A exportação do portal está incompleta.');
    portal[campo] = exportado.portal[campo];
  }
  portal.metas = portal.metas.map(meta => {
    const { projeto_id, ...dados } = meta;
    const novo = projetos.get(Number(projeto_id));
    return novo ? { ...dados, projeto_id: novo } : dados;
  });
  portal.planos_semanais = Object.fromEntries((exportado.portal.planos_semanais || []).map(plano => [plano.semana, plano]));
  await cliente.query(
    'INSERT INTO portal_dados (usuario_id, dados) VALUES ($1, $2) ON CONFLICT (usuario_id) DO UPDATE SET dados = EXCLUDED.dados, versao = portal_dados.versao + 1',
    [usuarioId, JSON.stringify(portal)]
  );
}

async function principal() {
  const [modo, origem, argumento] = process.argv.slice(2);
  if (!process.env.DATABASE_URL || !origem ||
      !((modo === 'backup' && ['sqlite', 'json'].includes(argumento)) || (modo === 'conta' && argumento))) {
    console.error('Defina DATABASE_URL e use: node migrar-postgres.js backup <diretório> <sqlite|json> ou conta <arquivo.json> <e-mail de destino>.');
    process.exitCode = 1;
    return;
  }
  const pool = criarPool();
  try {
    await prepararSchema(pool);
    if (modo === 'backup') {
      const dados = await lerFinanceiro(path.join(origem, 'finance'), argumento);
      await transacao(pool, async cliente => {
        await cliente.query('SELECT pg_advisory_xact_lock(385931, 2)');
        await copiarBackup(cliente, dados, path.join(origem, 'portal'));
      });
    } else {
      await transacao(pool, cliente => importarConta(cliente, origem, argumento));
    }
    console.log('Importação concluída.');
  } finally {
    await pool.end();
  }
}

principal().catch(erro => {
  console.error('Importação cancelada:', erro.code || erro.message);
  process.exitCode = 1;
});
