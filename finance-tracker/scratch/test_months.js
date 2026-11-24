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

async function verifyMonths() {
  const rNov = await fetch('http://127.0.0.1:3000/api/dados?mes=2026-11', { headers });
  const dNov = await rNov.json();

  const rDez = await fetch('http://127.0.0.1:3000/api/dados?mes=2026-12', { headers });
  const dDez = await rDez.json();

  console.log('Novembro/2026 despesas:', dNov.despesas.map(d => `${d.descricao} (R$ ${d.valor})`));
  console.log('Dezembro/2026 despesas:', dDez.despesas.map(d => `${d.descricao} (R$ ${d.valor})`));
}

verifyMonths().catch(console.error);
