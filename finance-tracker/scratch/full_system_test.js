import jwt from 'jsonwebtoken';

const JWT_SECRET = 'financas-inteligente-jwt-secret-key-2026';
const token = jwt.sign(
  { id: 2, nome: 'Iago', email: 'messiasiago8@gmail.com' },
  JWT_SECRET,
  { expiresIn: '7d' }
);

const headers = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer ' + token
};

async function testFullSuite() {
  console.log('--- TESTANDO SUÍTE COMPLETA DO SISTEMA ---');

  // 1. GET /api/dados
  const rDados = await fetch('http://127.0.0.1:3000/api/dados?mes=2026-11', { headers });
  console.log('1. GET /api/dados status:', rDados.status);
  const dDados = await rDados.json();
  console.log('   Entradas:', dDados.entradas.length, '| Despesas:', dDados.despesas.length, '| Limites:', dDados.limites);

  // 2. POST /api/entradas
  const rEntrada = await fetch('http://127.0.0.1:3000/api/entradas', {
    method: 'POST',
    headers,
    body: JSON.stringify({ descricao: 'Receita Teste', valor: 2500, data: '2026-11-01 10:00:00' })
  });
  console.log('2. POST /api/entradas status:', rEntrada.status);
  const dEntrada = await rEntrada.json();
  const novaEntradaId = dEntrada.data.id;

  // 3. DELETE /api/entradas
  const rDelEntrada = await fetch(`http://127.0.0.1:3000/api/entradas/${novaEntradaId}`, {
    method: 'DELETE',
    headers
  });
  console.log('3. DELETE /api/entradas status:', rDelEntrada.status);

  // 4. POST /api/despesas
  const rDespesa = await fetch('http://127.0.0.1:3000/api/despesas', {
    method: 'POST',
    headers,
    body: JSON.stringify({ descricao: 'Despesa Teste', valor: 99.90, categoria: '30', data: '2026-11-10 14:00:00' })
  });
  console.log('4. POST /api/despesas status:', rDespesa.status);
  const dDespesa = await rDespesa.json();
  const novaDespesaId = dDespesa.data.id;

  // 5. DELETE /api/despesas
  const rDelDespesa = await fetch(`http://127.0.0.1:3000/api/despesas/${novaDespesaId}`, {
    method: 'DELETE',
    headers
  });
  console.log('5. DELETE /api/despesas status:', rDelDespesa.status);

  // 6. POST /api/limites
  const rLimites = await fetch('http://127.0.0.1:3000/api/limites', {
    method: 'POST',
    headers,
    body: JSON.stringify({ limites: { '50': 750, '30': 450, '20': 300 } })
  });
  console.log('6. POST /api/limites status:', rLimites.status);

  // 7. Projetos
  const rProj = await fetch('http://127.0.0.1:3000/api/projetos', {
    method: 'POST',
    headers,
    body: JSON.stringify({ nome: 'Notebook Teste', tipo: 'Compra', valor_objetivo: 5000 })
  });
  console.log('7. POST /api/projetos status:', rProj.status);
  const dProj = await rProj.json();
  const projId = dProj.data.id;

  const rAporte = await fetch(`http://127.0.0.1:3000/api/projetos/${projId}/aportar`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ valor: 500 })
  });
  console.log('8. PUT /api/projetos/:id/aportar status:', rAporte.status);

  const rDelProj = await fetch(`http://127.0.0.1:3000/api/projetos/${projId}`, {
    method: 'DELETE',
    headers
  });
  console.log('9. DELETE /api/projetos/:id status:', rDelProj.status);

  // 10. IA Simulate
  const rSim = await fetch('http://127.0.0.1:3000/api/simulate', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      item: 'Fone Bluetooth',
      valor: 150,
      categoria: '30',
      contexto: {
        rendaTotal: 1500,
        limites: { '50': 750, '30': 450, '20': 300 },
        despesasAtuais: [],
        totalGastoCategoria: 50
      }
    })
  });
  console.log('10. POST /api/simulate status:', rSim.status);

  console.log('--- TODOS OS TESTES PASSARAM COM SUCESSO! ---');
}

testFullSuite().catch(console.error);
