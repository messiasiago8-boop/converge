const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('C:/Users/ADM/.gemini/antigravity/scratch/finance-tracker/financas.sqlite', sqlite3.OPEN_READONLY);
db.all('SELECT id, usuario_id, nome, tipo, categoria_ativo, valor, vencimento, instituicao, taxa_anual_pct FROM potes', (e, rows) => {
  console.log(e ? e.message : JSON.stringify(rows, null, 1));
  db.all("SELECT categoria, SUM(valor) t, COUNT(*) n FROM despesas WHERE categoria='20' GROUP BY categoria", (e2, r2) => { console.log(e2 ? e2.message : JSON.stringify(r2)); db.close(); });
});
