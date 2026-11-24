import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = process.env.CONVERGE_DATA_DIR
  ? path.resolve(process.env.CONVERGE_DATA_DIR, 'finance')
  : __dirname;
fs.mkdirSync(dataDir, { recursive: true });

let sqlite3Pkg = null;
let sqliteAvailable = false;

try {
  const mod = await import('sqlite3');
  sqlite3Pkg = mod.default || mod;
  if (sqlite3Pkg && typeof sqlite3Pkg.verbose === 'function') {
    sqliteAvailable = true;
  }
} catch (e) {
  console.warn('[CONVERGE Data Engine] Native sqlite3 failed (ERR_DLOPEN_FAILED). Ativando Storage JSON nativo 100% puro...');
}

let dbInstance = null;

if (sqliteAvailable) {
  try {
    const sqlite3 = sqlite3Pkg.verbose();
    const dbPath = path.join(dataDir, 'financas.sqlite');
    dbInstance = new sqlite3.Database(dbPath, (err) => {
      if (err) console.error('Erro ao conectar ao banco SQLite:', err.message);
      else console.log('Conectado ao banco SQLite local:', dbPath);
    });
  } catch (errInit) {
    sqliteAvailable = false;
  }
}

if (!sqliteAvailable || !dbInstance) {
  // Pure JavaScript JSON Database Engine - Zero dependências nativas
  const jsonPath = path.join(dataDir, 'financas_data.json');
  let store = {
    usuarios: [
      {
        id: 1,
        nome: 'Messias Iago',
        email: 'messiasiago8@gmail.com',
        senha: '$2a$10$Y83Q1H7zC78p7G7G3Wz1ee9K4fWfR.b4tMv9Fj5Qo0r0OqCgqR7lC',
        data_criacao: new Date().toISOString()
      }
    ],
    entradas: [],
    despesas: [],
    limites: [
      { id: 1, usuario_id: 1, categoria: '50', valor_maximo: 0 },
      { id: 2, usuario_id: 1, categoria: '30', valor_maximo: 0 },
      { id: 3, usuario_id: 1, categoria: '20', valor_maximo: 0 }
    ],
    potes: [],
    projetos_compras: [],
    aportes_projetos: []
  };

  const existingStore = fs.existsSync(jsonPath);
  if (existingStore) {
    store = { ...store, ...JSON.parse(fs.readFileSync(jsonPath, 'utf8')) };
  }
  let committedStore = JSON.stringify(store);

  function persist() {
    const tempPath = `${jsonPath}.tmp`;
    try {
      const nextStore = JSON.stringify(store, null, 2);
      fs.writeFileSync(tempPath, nextStore, 'utf8');
      fs.renameSync(tempPath, jsonPath);
      committedStore = nextStore;
    } catch (error) {
      store = JSON.parse(committedStore);
      throw error;
    }
  }
  if (!existingStore) persist();

  dbInstance = {
    serialize(fn) { if (fn) fn(); },
    run(query, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      params = params || [];
      const q = (query || '').trim();
      const ctx = { lastID: Date.now(), changes: 1 };

      try {
        if (/^CREATE TABLE/i.test(q) || /^ALTER TABLE/i.test(q) || /^PRAGMA/i.test(q)) {
          if (cb) cb.call(ctx, null);
          return;
        }

        if (/^INSERT INTO usuarios/i.test(q)) {
          const id = store.usuarios.length ? Math.max(...store.usuarios.map(u => u.id)) + 1 : 1;
          store.usuarios.push({ id, nome: params[0], email: params[1], senha: params[2], data_criacao: new Date().toISOString() });
          persist();
          ctx.lastID = id;
          if (cb) cb.call(ctx, null);
          return;
        }

        if (/^INSERT INTO entradas/i.test(q)) {
          const id = store.entradas.length ? Math.max(...store.entradas.map(x => x.id)) + 1 : 1;
          store.entradas.push({ id, usuario_id: params[0], descricao: params[1], valor: Number(params[2]), data: params[3] || new Date().toISOString() });
          persist();
          ctx.lastID = id;
          if (cb) cb.call(ctx, null);
          return;
        }

        if (/^INSERT INTO despesas/i.test(q)) {
          const id = store.despesas.length ? Math.max(...store.despesas.map(x => x.id)) + 1 : 1;
          store.despesas.push({ id, usuario_id: params[0], descricao: params[1], valor: Number(params[2]), categoria: String(params[3]), data: params[4] || new Date().toISOString() });
          persist();
          ctx.lastID = id;
          if (cb) cb.call(ctx, null);
          return;
        }

        if (/^INSERT INTO potes/i.test(q)) {
          const id = store.potes.length ? Math.max(...store.potes.map(x => x.id)) + 1 : 1;
          store.potes.push({
            id, usuario_id: params[0], nome: params[1], tipo: params[2], categoria_ativo: params[3] || 'CDB',
            taxa_anual_pct: Number(params[4]) || 10.75, rendimento_mensal_pct: Number(params[5]) || 0.85,
            instituicao: params[6] || '', vencimento: params[7] || '', valor: Number(params[8]), data: new Date().toISOString()
          });
          persist();
          ctx.lastID = id;
          if (cb) cb.call(ctx, null);
          return;
        }

        if (/^INSERT INTO limites/i.test(q)) {
          const uid = params[0], cat = String(params[1]), val = Number(params[2]);
          const ex = store.limites.find(l => l.usuario_id === uid && l.categoria === cat);
          if (ex) ex.valor_maximo = val;
          else store.limites.push({ id: store.limites.length + 1, usuario_id: uid, categoria: cat, valor_maximo: val });
          persist();
          if (cb) cb.call(ctx, null);
          return;
        }

        if (/^INSERT INTO projetos_compras/i.test(q)) {
          const id = store.projetos_compras.length ? Math.max(...store.projetos_compras.map(x => x.id)) + 1 : 1;
          store.projetos_compras.push({ id, usuario_id: params[0], nome: params[1], tipo: params[2], valor_objetivo: Number(params[3]), valor_acumulado: 0, data_criacao: new Date().toISOString() });
          persist();
          ctx.lastID = id;
          if (cb) cb.call(ctx, null);
          return;
        }

        if (/^INSERT INTO aportes_projetos/i.test(q)) {
          const id = store.aportes_projetos.length ? Math.max(...store.aportes_projetos.map(x => x.id)) + 1 : 1;
          store.aportes_projetos.push({ id, usuario_id: params[0], projeto_id: params[1], valor: Number(params[2]), data: new Date().toISOString() });
          persist();
          ctx.lastID = id;
          if (cb) cb.call(ctx, null);
          return;
        }

        if (/^DELETE FROM entradas/i.test(q)) {
          store.entradas = store.entradas.filter(e => !(e.id === params[0] && e.usuario_id === params[1]));
          persist();
          if (cb) cb.call(ctx, null);
          return;
        }

        if (/^DELETE FROM despesas/i.test(q)) {
          store.despesas = store.despesas.filter(d => !(d.id === params[0] && d.usuario_id === params[1]));
          persist();
          if (cb) cb.call(ctx, null);
          return;
        }

        if (/^DELETE FROM potes/i.test(q)) {
          store.potes = store.potes.filter(p => !(p.id === params[0] && p.usuario_id === params[1]));
          persist();
          if (cb) cb.call(ctx, null);
          return;
        }

        if (/^DELETE FROM limites/i.test(q)) {
          store.limites = store.limites.filter(l => !(l.usuario_id === params[0] && l.categoria === String(params[1])));
          persist();
          if (cb) cb.call(ctx, null);
          return;
        }

        if (/^DELETE FROM projetos_compras/i.test(q)) {
          store.projetos_compras = store.projetos_compras.filter(p => !(p.id === params[0] && p.usuario_id === params[1]));
          persist();
          if (cb) cb.call(ctx, null);
          return;
        }

        if (/^DELETE FROM aportes_projetos/i.test(q)) {
          store.aportes_projetos = store.aportes_projetos.filter(a => !(a.projeto_id === params[0] && a.usuario_id === params[1]));
          persist();
          if (cb) cb.call(ctx, null);
          return;
        }

        if (/^UPDATE potes/i.test(q)) {
          const item = store.potes.find(p => p.id === params[9] && p.usuario_id === params[10]);
          if (item) {
            item.nome = params[0]; item.tipo = params[1]; item.categoria_ativo = params[2];
            item.taxa_anual_pct = Number(params[3]); item.rendimento_mensal_pct = Number(params[4]);
            item.instituicao = params[5]; item.vencimento = params[6]; item.valor = Number(params[7]); item.data = params[8];
            persist();
          }
          if (cb) cb.call(ctx, null);
          return;
        }

        if (/^UPDATE projetos_compras/i.test(q)) {
          const item = store.projetos_compras.find(p => p.id === params[1] && p.usuario_id === params[2]);
          if (item) {
            item.valor_acumulado = Number(params[0]);
            persist();
          }
          if (cb) cb.call(ctx, null);
          return;
        }

        if (cb) cb.call(ctx, null);
      } catch (err) {
        if (cb) cb.call(ctx, err);
        else console.error('[Database] Falha ao gravar dados de Finanças:', err.message);
      }
    },
    all(query, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      params = params || [];
      const q = (query || '').trim();

      try {
        if (/^PRAGMA table_info/i.test(q)) {
          if (cb) cb(null, [
            { name: 'id' }, { name: 'usuario_id' }, { name: 'categoria_ativo' },
            { name: 'taxa_anual_pct' }, { name: 'rendimento_mensal_pct' },
            { name: 'instituicao' }, { name: 'vencimento' }
          ]);
          return;
        }

        if (/FROM entradas/i.test(q)) {
          const uid = params[0];
          let res = store.entradas.filter(e => e.usuario_id === uid);
          if (params[1]) {
            const prefix = String(params[1]).replace('%', '');
            res = res.filter(e => (e.data || '').startsWith(prefix));
          }
          if (cb) cb(null, res);
          return;
        }

        if (/FROM despesas/i.test(q)) {
          const uid = params[0];
          let res = store.despesas.filter(d => d.usuario_id === uid);
          if (q.includes('categoria = "50"') || q.includes("categoria = '50'")) {
            res = res.filter(d => String(d.categoria) === '50');
          }
          if (params[1]) {
            const prefix = String(params[1]).replace('%', '');
            res = res.filter(d => (d.data || '').startsWith(prefix));
          }
          if (cb) cb(null, res);
          return;
        }

        if (/FROM limites/i.test(q)) {
          const uid = params[0];
          const res = store.limites.filter(l => l.usuario_id === uid);
          if (cb) cb(null, res);
          return;
        }

        if (/FROM potes/i.test(q)) {
          const uid = params[0];
          const res = store.potes.filter(p => p.usuario_id === uid);
          if (cb) cb(null, res);
          return;
        }

        if (/FROM projetos_compras/i.test(q)) {
          const uid = params[0];
          const res = store.projetos_compras.filter(p => p.usuario_id === uid);
          if (cb) cb(null, res);
          return;
        }

        if (cb) cb(null, []);
      } catch (err) {
        if (cb) cb(err, []);
      }
    },
    get(query, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      params = params || [];
      const q = (query || '').trim();

      try {
        if (/FROM usuarios/i.test(q)) {
          const email = String(params[0]).toLowerCase();
          const u = store.usuarios.find(x => (x.email || '').toLowerCase() === email);
          if (cb) cb(null, u || null);
          return;
        }

        if (/COUNT\(\*\) as qtd/i.test(q)) {
          const uid = params[0];
          const prefix = params[1] ? String(params[1]).replace('%', '') : '';
          const isEntrada = /FROM entradas/i.test(q);
          const list = isEntrada ? store.entradas : store.despesas;
          const qtd = list.filter(x => x.usuario_id === uid && (!prefix || (x.data || '').startsWith(prefix))).length;
          if (cb) cb(null, { qtd });
          return;
        }

        if (/FROM projetos_compras/i.test(q)) {
          const id = params[0], uid = params[1];
          const p = store.projetos_compras.find(x => x.id === id && x.usuario_id === uid);
          if (cb) cb(null, p || null);
          return;
        }

        if (cb) cb(null, null);
      } catch (err) {
        if (cb) cb(err, null);
      }
    },
    prepare(stmt) {
      return {
        run(params, cb) {
          dbInstance.run(stmt, params, cb);
        },
        finalize(cb) {
          if (cb) cb();
        }
      };
    }
  };
}

const db = dbInstance;

// Inicialização automática das tabelas com suporte a multiusuário
db.serialize(() => {
  // 1. Tabela de Usuários
  db.run(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      senha TEXT NOT NULL,
      data_criacao TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 2. Tabela de Entradas / Receitas
  db.run(`
    CREATE TABLE IF NOT EXISTS entradas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER,
      descricao TEXT NOT NULL,
      valor REAL NOT NULL,
      data TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    )
  `);

  // 3. Tabela de Despesas
  db.run(`
    CREATE TABLE IF NOT EXISTS despesas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER,
      descricao TEXT NOT NULL,
      valor REAL NOT NULL,
      categoria TEXT NOT NULL,
      data TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    )
  `);

  // 4. Tabela de Limites por Categoria e Usuário (50, 30, 20)
  db.run(`
    CREATE TABLE IF NOT EXISTS limites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      categoria TEXT NOT NULL,
      valor_maximo REAL NOT NULL DEFAULT 0,
      UNIQUE(usuario_id, categoria),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    )
  `);

  // 5. Tabela de Potes / Ativos da Carteira (Investimentos & Futuro)
  db.run(`
    CREATE TABLE IF NOT EXISTS potes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER,
      nome TEXT NOT NULL,
      tipo TEXT NOT NULL,
      categoria_ativo TEXT DEFAULT 'CDB',
      taxa_anual_pct REAL DEFAULT 10.75,
      rendimento_mensal_pct REAL DEFAULT 0.85,
      instituicao TEXT,
      vencimento TEXT,
      valor REAL NOT NULL,
      data TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    )
  `);

  // 6. Tabela de Projetos & Grandes Compras
  db.run(`
    CREATE TABLE IF NOT EXISTS projetos_compras (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER,
      nome TEXT NOT NULL,
      tipo TEXT NOT NULL,
      valor_objetivo REAL NOT NULL,
      valor_acumulado REAL NOT NULL DEFAULT 0,
      data_criacao TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    )
  `);

  // 7. Tabela de Histórico de Aportes nos Projetos
  db.run(`
    CREATE TABLE IF NOT EXISTS aportes_projetos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER,
      projeto_id INTEGER NOT NULL,
      valor REAL NOT NULL,
      data TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (projeto_id) REFERENCES projetos_compras(id) ON DELETE CASCADE,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    )
  `);

  // Migrações dinâmicas seguras (adiciona usuario_id caso as tabelas antigas ainda não tenham)
  const tabelasParaMigrar = ['entradas', 'despesas', 'potes', 'projetos_compras', 'aportes_projetos'];
  tabelasParaMigrar.forEach(tabela => {
    db.all(`PRAGMA table_info(${tabela})`, (err, colunas) => {
      if (!err && colunas) {
        const temUsuarioId = colunas.some(c => c.name === 'usuario_id');
        if (!temUsuarioId) {
          db.run(`ALTER TABLE ${tabela} ADD COLUMN usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE`, (errAlter) => {
            if (!errAlter) {
              console.log(`Coluna usuario_id adicionada com sucesso na tabela ${tabela}`);
            }
          });
        }
      }
    });
  });
});

// Funções de Consulta Filtradas por Mês (YYYY-MM) e Usuario_ID
export const buscarDadosPorMes = (mes, usuarioId) => {
  return new Promise(async (resolve, reject) => {
    const temFiltroMes = mes && typeof mes === 'string' && /^\d{4}-\d{2}$/.test(mes.trim());
    const mesAlvo = temFiltroMes ? mes.trim() : null;
    const queryMes = mesAlvo ? `${mesAlvo}%` : null;

    let sqlEntradas = 'SELECT * FROM entradas WHERE usuario_id = ?';
    let paramsEntradas = [usuarioId];
    if (queryMes) {
      sqlEntradas += ' AND data LIKE ?';
      paramsEntradas.push(queryMes);
    }
    sqlEntradas += ' ORDER BY id ASC';

    db.all(sqlEntradas, paramsEntradas, (errEntradas, entradas) => {
      if (errEntradas) return reject(new Error('Erro ao buscar entradas: ' + errEntradas.message));

      let sqlDespesas = 'SELECT * FROM despesas WHERE usuario_id = ?';
      let paramsDespesas = [usuarioId];
      if (queryMes) {
        sqlDespesas += ' AND data LIKE ?';
        paramsDespesas.push(queryMes);
      }
      sqlDespesas += ' ORDER BY id ASC';

      db.all(sqlDespesas, paramsDespesas, (errDespesas, despesas) => {
        if (errDespesas) return reject(new Error('Erro ao buscar despesas: ' + errDespesas.message));

        db.all('SELECT * FROM limites WHERE usuario_id = ?', [usuarioId], (errLimites, limitesRows) => {
          if (errLimites) return reject(new Error('Erro ao buscar limites: ' + errLimites.message));

          const limites = { "50": 0, "30": 0, "20": 0 };
          (limitesRows || []).forEach(row => {
            limites[row.categoria] = Number(row.valor_maximo) || 0;
          });

          db.all('SELECT * FROM potes WHERE usuario_id = ? ORDER BY id ASC', [usuarioId], (errPotes, potes) => {
            if (errPotes) return reject(new Error('Erro ao buscar potes: ' + errPotes.message));

            resolve({
              entradas: entradas || [],
              despesas: despesas || [],
              limites,
              potes: potes || []
            });
          });
        });
      });
    });
  });
};

export default db;
