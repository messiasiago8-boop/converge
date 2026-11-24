const { readFileSync } = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

function criarPool(connectionString = process.env.DATABASE_URL) {
  return new Pool({ connectionString, max: 4, connectionTimeoutMillis: 10000, idleTimeoutMillis: 15000 });
}

async function transacao(pool, executar) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await executar(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (erro) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw erro;
  } finally {
    cliente.release();
  }
}

function prepararSchema(pool) {
  const sql = readFileSync(path.join(__dirname, 'postgres-schema.sql'), 'utf8');
  return transacao(pool, async cliente => {
    await cliente.query('SELECT pg_advisory_xact_lock(385931, 1)');
    await cliente.query(sql);
  });
}

module.exports = { criarPool, prepararSchema, transacao };
