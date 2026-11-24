import sqlite3Pkg from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const sqlite3 = sqlite3Pkg.verbose();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, 'financas.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Erro ao conectar ao banco SQLite:', err.message);
  } else {
    console.log('Conectado ao banco de dados SQLite local:', dbPath);
  }
});

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

        // Migração de colunas adicionais para potes (investimentos detalhados)
        if (tabela === 'potes') {
          const colunasNecessarias = [
            { name: 'categoria_ativo', def: 'TEXT DEFAULT "CDB"' },
            { name: 'taxa_anual_pct', def: 'REAL DEFAULT 10.75' },
            { name: 'rendimento_mensal_pct', def: 'REAL DEFAULT 0.85' },
            { name: 'instituicao', def: 'TEXT DEFAULT "Banco"' },
            { name: 'vencimento', def: 'TEXT' }
          ];
          colunasNecessarias.forEach(c => {
            const existe = colunas.some(col => col.name === c.name);
            if (!existe) {
              db.run(`ALTER TABLE potes ADD COLUMN ${c.name} ${c.def}`, (e) => {
                if (!e) console.log(`Coluna ${c.name} adicionada à tabela potes`);
              });
            }
          });
        }
      }
    });
  });

  // Migração da tabela limites para suportar usuario_id
  db.all(`PRAGMA table_info(limites)`, (err, colunas) => {
    if (!err && colunas) {
      const temUsuarioId = colunas.some(c => c.name === 'usuario_id');
      if (!temUsuarioId) {
        db.run(`ALTER TABLE limites ADD COLUMN usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE`, (errAlter) => {
          if (!errAlter) {
            console.log('Coluna usuario_id adicionada na tabela limites');
          }
        });
      }
    }
  });
});

// Funções de Consulta Filtradas por Mês (YYYY-MM) e Usuario_ID
export const buscarDadosPorMes = (mes, usuarioId) => {
  return new Promise(async (resolve, reject) => {
    const temFiltroMes = mes && typeof mes === 'string' && /^\d{4}-\d{2}$/.test(mes.trim());
    const mesAlvo = temFiltroMes ? mes.trim() : null;
    const queryMes = mesAlvo ? `${mesAlvo}%` : null;

    // Regra Inteligente: Se o mês solicitado não tiver nenhuma despesa cadastrada ainda,
    // verifica se o mês imediatamente anterior tem despesas essenciais (gastos fixos da categoria "50")
    // e replica automaticamente como cópias independentes no novo mês.
    // Variáveis ("30") e Investimentos ("20") sempre iniciam zerados (R$ 0,00).
    if (mesAlvo) {
      try {
        await new Promise((resSync) => {
          // 1. Verifica se já existem despesas registradas no mês alvo
          db.get('SELECT COUNT(*) as qtd FROM despesas WHERE usuario_id = ? AND data LIKE ?', [usuarioId, queryMes], (errCount, rowCount) => {
            if (errCount || (rowCount && rowCount.qtd > 0)) {
              return resSync(); // Já existem dados ou erro, não duplica
            }

            // 2. Calcula o mês anterior (ex: '2026-12' -> anterior '2026-11')
            const [anoStr, mesStr] = mesAlvo.split('-');
            let anoNum = parseInt(anoStr, 10);
            let mesNum = parseInt(mesStr, 10) - 1;
            if (mesNum < 1) {
              mesNum = 12;
              anoNum -= 1;
            }
            const mesAnterior = `${anoNum}-${String(mesNum).padStart(2, '0')}`;
            const queryMesAnterior = `${mesAnterior}%`;

            // 3. Busca apenas despesas essenciais (gastos fixos da categoria "50") do mês anterior
            db.all(
              'SELECT descricao, valor, categoria FROM despesas WHERE usuario_id = ? AND categoria = "50" AND data LIKE ? ORDER BY id ASC',
              [usuarioId, queryMesAnterior],
              (errAnt, despesasFixasAntigas) => {
                if (errAnt || !despesasFixasAntigas || despesasFixasAntigas.length === 0) {
                  return resSync();
                }

                // 4. Copia também a Receita Bruta base do mês anterior se o novo mês estiver sem receita
                db.get('SELECT COUNT(*) as qtdEnt FROM entradas WHERE usuario_id = ? AND data LIKE ?', [usuarioId, queryMes], (errEntCount, rowEntCount) => {
                  const precisaCopiarEntrada = !errEntCount && (!rowEntCount || rowEntCount.qtd === 0);

                  const clonarDespesas = () => {
                    const stmt = db.prepare('INSERT INTO despesas (usuario_id, descricao, valor, categoria, data) VALUES (?, ?, ?, ?, ?)');
                    despesasFixasAntigas.forEach((d, idx) => {
                      const diaPadrao = String(idx + 1).padStart(2, '0');
                      const dataNova = `${mesAlvo}-${diaPadrao} 10:00:00`;
                      stmt.run([usuarioId, d.descricao, d.valor, d.categoria, dataNova]);
                    });
                    stmt.finalize(() => {
                      console.log(`[Auto-Cópia Inteligente] ${despesasFixasAntigas.length} gastos fixos copiados de ${mesAnterior} para ${mesAlvo}.`);
                      resSync();
                    });
                  };

                  if (precisaCopiarEntrada) {
                    db.get('SELECT descricao, valor FROM entradas WHERE usuario_id = ? AND data LIKE ? ORDER BY id ASC LIMIT 1', [usuarioId, queryMesAnterior], (errEntAnt, entAnt) => {
                      if (!errEntAnt && entAnt) {
                        const dataEntradaNova = `${mesAlvo}-01 12:00:00`;
                        db.run(
                          'INSERT INTO entradas (usuario_id, descricao, valor, data) VALUES (?, ?, ?, ?)',
                          [usuarioId, entAnt.descricao, entAnt.valor, dataEntradaNova],
                          () => clonarDespesas()
                        );
                      } else {
                        clonarDespesas();
                      }
                    });
                  } else {
                    clonarDespesas();
                  }
                });
              }
            );
          });
        });
      } catch (errSync) {
        console.warn('Aviso ao sincronizar cópia de gastos fixos:', errSync.message);
      }
    }

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
