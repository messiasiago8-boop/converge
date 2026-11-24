import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('[Render Start] Iniciando serviços unificados do CONVERGE...');

// 1. Inicia backend de Finanças na porta 3001
const financeProcess = spawn('node', ['server.js'], {
  cwd: path.join(__dirname, 'finance-tracker'),
  stdio: 'inherit',
  env: { ...process.env, PORT: '3001' }
});

financeProcess.on('error', (err) => {
  console.error('[Finance Process Error]', err);
});

// 2. Inicia backend principal na porta definida pelo Render (ou 3000)
setTimeout(() => {
  const mainProcess = spawn('node', ['server.js'], {
    cwd: __dirname,
    stdio: 'inherit',
    env: { ...process.env }
  });

  mainProcess.on('error', (err) => {
    console.error('[Main Process Error]', err);
  });
}, 2000);
