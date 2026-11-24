import 'dotenv/config';
import { spawn } from 'child_process';
import { randomBytes } from 'node:crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = { ...process.env, JWT_SECRET: process.env.JWT_SECRET || randomBytes(32).toString('hex') };
if (!process.env.JWT_SECRET) {
  console.warn('[CONVERGE Bootstrap] JWT_SECRET ausente. As sessões expiram ao reiniciar o serviço.');
}

console.log('[CONVERGE Bootstrap] Iniciando arquitetura unificada...');

// 1. Inicia o backend de Finanças na porta 3001
const finDir = path.join(__dirname, 'finance-tracker');
const financeProcess = spawn(process.execPath, ['server.js'], {
  cwd: finDir,
  stdio: 'inherit',
  env: { ...env, PORT: '3001' }
});

// 2. Inicia o backend principal
const mainProcess = spawn(process.execPath, ['server.js'], {
  cwd: __dirname,
  stdio: 'inherit',
  env
});

let encerrando = false;
function encerrar(codigo) {
  if (encerrando) return;
  encerrando = true;
  process.exitCode = codigo;
  for (const filho of [financeProcess, mainProcess]) {
    if (filho.exitCode === null && filho.signalCode === null) filho.kill();
  }
}

for (const [nome, filho] of [['Finanças', financeProcess], ['Portal', mainProcess]]) {
  filho.on('error', erro => {
    if (!encerrando) console.error(`[CONVERGE Bootstrap] Falha em ${nome}:`, erro.message);
    encerrar(1);
  });
  filho.on('exit', (codigo, sinal) => {
    if (!encerrando) console.error(`[CONVERGE Bootstrap] ${nome} encerrou:`, codigo ?? sinal);
    encerrar(1);
  });
}
process.on('SIGTERM', () => encerrar(0));
process.on('SIGINT', () => encerrar(0));
