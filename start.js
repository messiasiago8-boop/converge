import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('[CONVERGE Bootstrap] Iniciando arquitetura unificada...');

// 1. Inicia o backend de Finanças na porta 3001
const finDir = path.join(__dirname, 'finance-tracker');
const financeProcess = spawn(process.execPath, ['server.js'], {
  cwd: finDir,
  stdio: 'inherit',
  env: { ...process.env, PORT: '3001' }
});

financeProcess.on('error', (err) => {
  console.error('[ERRO FATAL Finanças]', err);
});

financeProcess.on('exit', (code, signal) => {
  console.error('[Finanças Processo Saiu] Code:', code, 'Signal:', signal);
});

// 2. Inicia o backend principal
const mainProcess = spawn(process.execPath, ['server.js'], {
  cwd: __dirname,
  stdio: 'inherit',
  env: { ...process.env }
});

mainProcess.on('error', (err) => {
  console.error('[ERRO FATAL Principal]', err);
});
