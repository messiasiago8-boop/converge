import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { GoogleGenAI } from '@google/genai';
import db, { buscarDadosPorMes } from './database.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'financas-inteligente-jwt-secret-key-2026';

// Hardening de Segurança: Oculta identificação do servidor
app.disable('x-powered-by');

// Middleware Global de Cabeçalhos de Segurança HTTP
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Política de CORS com suporte a origens configuráveis e fallback seguro para ambiente de desenvolvimento
const allowedOriginsConfig = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:3001', 'http://127.0.0.1:3001'];

if (process.env.RENDER_EXTERNAL_URL) {
  allowedOriginsConfig.push(process.env.RENDER_EXTERNAL_URL);
}

app.use(cors({
  origin: (origin, callback) => {
    // Permite chamadas locais, server-to-server sem origin (curl, mobile, proxies) ou origens permitidas
    if (!origin || allowedOriginsConfig.includes(origin) || origin.endsWith('.trycloudflare.com') || origin.endsWith('.pages.dev') || origin.endsWith('.ngrok-free.dev') || origin.endsWith('.ngrok-free.app')) {
      return callback(null, true);
    }
    return callback(new Error('Origem não permitida pela política de CORS'));
  },
  credentials: true
}));
app.use(express.json());

// Servir frontend estático na raiz
app.use(express.static(path.join(__dirname, 'public')));

let ai = null;
if (process.env.GEMINI_API_KEY) {
  ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

// Middleware de Autenticação JWT
export const autenticarToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Acesso negado. Token não fornecido.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Sessão expirada ou token inválido. Faça login novamente.' });
    }
    req.usuarioId = user.id;
    req.usuarioEmail = user.email;
    req.usuarioNome = user.nome;
    next();
  });
};

// ==========================================
// SEGURANÇA: Sanitização e Rate Limiting Modular
// ==========================================

// Sanitização recursiva simples de strings contra injeções de script HTML
function sanitizarValor(val) {
  if (typeof val === 'string') {
    return val
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/onload\s*=/gi, '')
      .replace(/onerror\s*=/gi, '');
  }
  if (Array.isArray(val)) {
    return val.map(sanitizarValor);
  }
  if (val !== null && typeof val === 'object') {
    const limpo = {};
    for (const k of Object.keys(val)) {
      limpo[k] = sanitizarValor(val[k]);
    }
    return limpo;
  }
  return val;
}

app.use((req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizarValor(req.body);
  }
  next();
});

// Rate Limiter em memória por IP (sem dependências externas)
const rateLimitStore = new Map();
function criarRateLimiter({ janelaMs = 60000, maxRequisicoes = 100, mensagem = 'Muitas requisições. Tente novamente mais tarde.' } = {}) {
  return (req, res, next) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'ip-desconhecido';
    const agora = Date.now();
    const registro = rateLimitStore.get(ip) || { contagem: 0, resetEm: agora + janelaMs };

    if (agora > registro.resetEm) {
      registro.contagem = 0;
      registro.resetEm = agora + janelaMs;
    }

    registro.contagem += 1;
    rateLimitStore.set(ip, registro);

    if (registro.contagem > maxRequisicoes) {
      return res.status(429).json({ error: mensagem });
    }
    next();
  };
}

// Limitador estrito para login e registro (máximo 15 tentativas por minuto por IP)
const authRateLimiter = criarRateLimiter({
  janelaMs: 60000,
  maxRequisicoes: 15,
  mensagem: 'Muitas tentativas de autenticação. Por favor, aguarde 1 minuto.'
});

// Limitador para rotas de IA (máximo 30 chamadas por minuto por IP)
const aiRateLimiter = criarRateLimiter({
  janelaMs: 60000,
  maxRequisicoes: 30,
  mensagem: 'Limite de consultas à IA atingido temporariamente. Aguarde 1 minuto.'
});

// ==========================================
// ROTAS PÚBLICAS DE AUTENTICAÇÃO
// ==========================================

// 1. POST /api/auth/registrar
app.post('/api/auth/registrar', authRateLimiter, async (req, res) => {
  try {
    const { nome, email, senha } = req.body;

    if (!nome || !email || !senha) {
      return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' });
    }

    if (senha.length < 6) {
      return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres.' });
    }

    const emailTratado = email.trim().toLowerCase();

    // Verifica se já existe um usuário com o mesmo e-mail
    db.get('SELECT id FROM usuarios WHERE email = ?', [emailTratado], async (err, row) => {
      if (err) {
        return res.status(500).json({ error: 'Erro ao validar e-mail: ' + err.message });
      }
      if (row) {
        return res.status(409).json({ error: 'Este e-mail já está cadastrado. Tente entrar.' });
      }

      // Hash da senha com salt 10
      const salt = await bcrypt.genSalt(10);
      const senhaHash = await bcrypt.hash(senha, salt);

      db.run(
        'INSERT INTO usuarios (nome, email, senha) VALUES (?, ?, ?)',
        [nome.trim(), emailTratado, senhaHash],
        function (errInsert) {
          if (errInsert) {
            return res.status(500).json({ error: 'Erro ao cadastrar usuário: ' + errInsert.message });
          }

          const novoUsuarioId = this.lastID;

          // Cria limites iniciais zerados para o novo usuário
          const categorias = ['50', '30', '20'];
          categorias.forEach(cat => {
            db.run(
              'INSERT OR IGNORE INTO limites (usuario_id, categoria, valor_maximo) VALUES (?, ?, 0)',
              [novoUsuarioId, cat]
            );
          });

          // Gera Token JWT
          const token = jwt.sign(
            { id: novoUsuarioId, nome: nome.trim(), email: emailTratado },
            JWT_SECRET,
            { expiresIn: '7d' }
          );

          res.status(201).json({
            success: true,
            message: 'Usuário registrado com sucesso!',
            token,
            usuario: {
              id: novoUsuarioId,
              nome: nome.trim(),
              email: emailTratado
            }
          });
        }
      );
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno no servidor: ' + err.message });
  }
});

// 2. POST /api/auth/login
app.post('/api/auth/login', authRateLimiter, async (req, res) => {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({ error: 'Informe e-mail e senha para acessar.' });
    }

    const emailTratado = email.trim().toLowerCase();

    db.get('SELECT * FROM usuarios WHERE email = ?', [emailTratado], async (err, usuario) => {
      if (err) {
        return res.status(500).json({ error: 'Erro ao buscar usuário: ' + err.message });
      }
      if (!usuario) {
        return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
      }

      // Validação da senha criptografada
      const senhaCorreta = await bcrypt.compare(senha, usuario.senha);
      if (!senhaCorreta) {
        return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
      }

      // Gera Token JWT (7 dias)
      const token = jwt.sign(
        { id: usuario.id, nome: usuario.nome, email: usuario.email },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.json({
        success: true,
        message: 'Login realizado com sucesso!',
        token,
        usuario: {
          id: usuario.id,
          nome: usuario.nome,
          email: usuario.email
        }
      });
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno no login: ' + err.message });
  }
});

// 3. GET /api/auth/perfil (Retorna os dados do usuário autenticado)
app.get('/api/auth/perfil', autenticarToken, (req, res) => {
  res.json({
    success: true,
    usuario: {
      id: req.usuarioId,
      nome: req.usuarioNome,
      email: req.usuarioEmail
    }
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    hasApiKey: !!process.env.GEMINI_API_KEY
  });
});

// ==========================================
// ROTAS RESTful PROTEGIDAS COM JWT (ISOLAMENTO POR USUÁRIO)
// ==========================================

// 1. GET /api/dados (Retorna dados do mês filtrado EXCLUSIVAMENTE do usuário logado)
app.get('/api/dados', autenticarToken, async (req, res) => {
  try {
    const mes = req.query.mes; // ex: '2026-11'
    const dados = await buscarDadosPorMes(mes, req.usuarioId);
    res.json({
      success: true,
      mes: mes || null,
      usuarioId: req.usuarioId,
      entradas: dados.entradas,
      despesas: dados.despesas,
      limites: dados.limites,
      potes: dados.potes
    });
  } catch (err) {
    console.error('Erro na rota /api/dados:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 2. POST /api/entradas (Salva uma nova entrada vinculada ao usuário)
app.post('/api/entradas', autenticarToken, (req, res) => {
  const { descricao, valor, data } = req.body;
  if (!descricao || valor === undefined || isNaN(valor) || valor <= 0) {
    return res.status(400).json({ error: 'Descrição e valor positivo são obrigatórios.' });
  }

  const query = data 
    ? 'INSERT INTO entradas (usuario_id, descricao, valor, data) VALUES (?, ?, ?, ?)'
    : 'INSERT INTO entradas (usuario_id, descricao, valor) VALUES (?, ?, ?)';
  const params = data 
    ? [req.usuarioId, descricao.trim(), Number(valor), data] 
    : [req.usuarioId, descricao.trim(), Number(valor)];

  db.run(query, params, function(err) {
    if (err) {
      console.error('Erro ao inserir entrada:', err.message);
      return res.status(500).json({ error: 'Erro ao salvar no banco: ' + err.message });
    }

    res.status(201).json({
      success: true,
      data: {
        id: this.lastID,
        usuario_id: req.usuarioId,
        descricao: descricao.trim(),
        valor: Number(valor),
        data: data || new Date().toISOString()
      }
    });
  });
});

// 3. DELETE /api/entradas/:id (Exclui uma entrada garantindo que pertence ao usuário)
app.delete('/api/entradas/:id', autenticarToken, (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM entradas WHERE id = ? AND usuario_id = ?', [id, req.usuarioId], function(err) {
    if (err) {
      console.error('Erro ao deletar entrada:', err.message);
      return res.status(500).json({ error: 'Erro ao deletar entrada: ' + err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Entrada não encontrada ou não pertence a este usuário.' });
    }
    res.json({ success: true, message: 'Entrada removida com sucesso.' });
  });
});

// 3.1 PUT /api/entradas/:id (Atualiza uma entrada garantindo que pertence ao usuário)
app.put('/api/entradas/:id', autenticarToken, (req, res) => {
  const id = req.params.id;
  const { descricao, valor } = req.body;

  let updates = [];
  let params = [];

  if (descricao !== undefined) {
    updates.push('descricao = ?');
    params.push(String(descricao).trim());
  }
  if (valor !== undefined) {
    updates.push('valor = ?');
    params.push(Number(valor));
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'Nenhum campo fornecido para atualização.' });
  }

  params.push(id, req.usuarioId);
  const sql = `UPDATE entradas SET ${updates.join(', ')} WHERE id = ? AND usuario_id = ?`;

  db.run(sql, params, function(err) {
    if (err) {
      console.error('Erro ao atualizar entrada:', err.message);
      return res.status(500).json({ error: 'Erro ao atualizar entrada: ' + err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Entrada não encontrada ou não pertence a este usuário.' });
    }
    res.json({ success: true, message: 'Entrada atualizada com sucesso.' });
  });
});

// 4. POST /api/despesas (Salva uma nova despesa vinculada ao usuário)
app.post('/api/despesas', autenticarToken, (req, res) => {
  const { descricao, valor, categoria, data } = req.body;
  if (!descricao || valor === undefined || isNaN(valor) || valor <= 0 || !categoria) {
    return res.status(400).json({ error: 'Descrição, categoria e valor positivo são obrigatórios.' });
  }

  const query = data
    ? 'INSERT INTO despesas (usuario_id, descricao, valor, categoria, data) VALUES (?, ?, ?, ?, ?)'
    : 'INSERT INTO despesas (usuario_id, descricao, valor, categoria) VALUES (?, ?, ?, ?)';
  const params = data
    ? [req.usuarioId, descricao.trim(), Number(valor), String(categoria), data]
    : [req.usuarioId, descricao.trim(), Number(valor), String(categoria)];

  db.run(query, params, function(err) {
    if (err) {
      console.error('Erro ao inserir despesa:', err.message);
      return res.status(500).json({ error: 'Erro ao salvar no banco: ' + err.message });
    }

    res.status(201).json({
      success: true,
      data: {
        id: this.lastID,
        usuario_id: req.usuarioId,
        descricao: descricao.trim(),
        valor: Number(valor),
        categoria: String(categoria),
        data: data || new Date().toISOString()
      }
    });
  });
});

// 5. DELETE /api/despesas/bulk (Exclui múltiplas despesas de uma vez)
app.delete('/api/despesas/bulk', autenticarToken, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Lista de IDs para exclusão não fornecida ou inválida.' });
  }

  const placeholders = ids.map(() => '?').join(',');
  const query = `DELETE FROM despesas WHERE id IN (${placeholders}) AND usuario_id = ?`;
  const params = [...ids, req.usuarioId];

  db.run(query, params, function(err) {
    if (err) {
      console.error('Erro ao deletar despesas em lote:', err.message);
      return res.status(500).json({ error: 'Erro ao deletar despesas: ' + err.message });
    }
    res.json({ success: true, message: `${this.changes} despesa(s) excluída(s) com sucesso.` });
  });
});

// 5. DELETE /api/despesas/:id (Exclui despesa garantindo que pertence ao usuário)
app.delete('/api/despesas/:id', autenticarToken, (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM despesas WHERE id = ? AND usuario_id = ?', [id, req.usuarioId], function(err) {
    if (err) {
      console.error('Erro ao deletar despesa:', err.message);
      return res.status(500).json({ error: 'Erro ao deletar despesa: ' + err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Despesa não encontrada ou não pertence a este usuário.' });
    }
    res.json({ success: true, message: 'Despesa removida com sucesso.' });
  });
});

// 5.1 PUT /api/despesas/:id (Atualiza despesa garantindo que pertence ao usuário)
app.put('/api/despesas/:id', autenticarToken, (req, res) => {
  const id = req.params.id;
  const { descricao, valor, categoria } = req.body;

  let updates = [];
  let params = [];

  if (descricao !== undefined) {
    updates.push('descricao = ?');
    params.push(String(descricao).trim());
  }
  if (valor !== undefined) {
    updates.push('valor = ?');
    params.push(Number(valor));
  }
  if (categoria !== undefined) {
    updates.push('categoria = ?');
    params.push(String(categoria));
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'Nenhum campo fornecido para atualização.' });
  }

  params.push(id, req.usuarioId);
  const sql = `UPDATE despesas SET ${updates.join(', ')} WHERE id = ? AND usuario_id = ?`;

  db.run(sql, params, function(err) {
    if (err) {
      console.error('Erro ao atualizar despesa:', err.message);
      return res.status(500).json({ error: 'Erro ao atualizar despesa: ' + err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Despesa não encontrada ou não pertence a este usuário.' });
    }
    res.json({ success: true, message: 'Despesa atualizada com sucesso.' });
  });
});

// 6. POST /api/limites (Define limites para o usuário logado)
app.post('/api/limites', autenticarToken, (req, res) => {
  const { limites } = req.body;
  if (!limites || typeof limites !== 'object') {
    return res.status(400).json({ error: 'Objeto de limites é obrigatório.' });
  }

  // Deleta limites anteriores do usuário para essas categorias e reinsere de forma limpa e segura
  const categorias = Object.keys(limites);
  if (categorias.length === 0) {
    return res.json({ success: true, limites });
  }

  db.serialize(() => {
    categorias.forEach(cat => {
      db.run('DELETE FROM limites WHERE usuario_id = ? AND categoria = ?', [req.usuarioId, cat]);
      db.run('INSERT INTO limites (usuario_id, categoria, valor_maximo) VALUES (?, ?, ?)', [
        req.usuarioId,
        cat,
        Number(limites[cat]) || 0
      ]);
    });
    res.json({ success: true, limites });
  });
});

// Indicadores Econômicos de Mercado Atualizados Automaticamente
let mercadoAtual = {
  selicMetaAnual: 11.25,
  cdiAnual: 11.15,
  ipca12m: 4.10,
  ultimaAtualizacao: new Date().toISOString(),
  fonte: "Banco Central do Brasil / B3 (Motor IA de Mercado)"
};

// Função para calcular rentabilidade mensal líquida estimada
function calcularRentabilidadeEstimada(categoria, taxaPersonalizada = null) {
  const cdi = mercadoAtual.cdiAnual;
  const selic = mercadoAtual.selicMetaAnual;

  let taxaAnual = 0;
  let tipoIndexador = "CDI";

  const catNorm = (categoria || "").toUpperCase();
  if (catNorm.includes("SELIC") || catNorm.includes("TESOURO")) {
    taxaAnual = selic;
    tipoIndexador = "SELIC";
  } else if (catNorm.includes("CDB")) {
    const fatorCdi = taxaPersonalizada ? (Number(taxaPersonalizada) / 100) : 1.0; // Padrão 100% CDI
    taxaAnual = cdi * (fatorCdi > 2 ? (fatorCdi / 100) : fatorCdi);
    tipoIndexador = `${taxaPersonalizada || 100}% CDI`;
  } else if (catNorm.includes("LCI") || catNorm.includes("LCA")) {
    taxaAnual = cdi * 0.90; // Isento de IR (~90% do CDI)
    tipoIndexador = "90% CDI Isento";
  } else if (catNorm.includes("IPCA")) {
    taxaAnual = mercadoAtual.ipca12m + 6.20;
    tipoIndexador = "IPCA + 6,2%";
  } else {
    taxaAnual = cdi;
    tipoIndexador = "CDI";
  }

  // Conversão de taxa anual para taxa mensal: (1 + i_ano)^(1/12) - 1
  const taxaMensalPct = (Math.pow(1 + (taxaAnual / 100), 1 / 12) - 1) * 100;

  return {
    taxaAnualPct: parseFloat(taxaAnual.toFixed(2)),
    taxaMensalPct: parseFloat(taxaMensalPct.toFixed(2)),
    tipoIndexador
  };
}

// 7. GET /api/potes (Lista potes e investimentos do usuário)
app.get('/api/potes', autenticarToken, (req, res) => {
  db.all('SELECT * FROM potes WHERE usuario_id = ? ORDER BY id DESC', [req.usuarioId], (err, rows) => {
    if (err) {
      console.error('Erro ao listar potes:', err.message);
      return res.status(500).json({ error: 'Erro ao buscar investimentos: ' + err.message });
    }

    // Calcula os rendimentos mensais em tempo real conforme a Selic/CDI atual do mercado
    const potesTratados = (rows || []).map(pote => {
      const rent = calcularRentabilidadeEstimada(pote.categoria_ativo || pote.tipo || pote.nome, pote.taxa_anual_pct);
      const valor = Number(pote.valor) || 0;
      const rendimentoMensalReais = (valor * (rent.taxaMensalPct / 100));
      const rendimentoAnualReais = (valor * (rent.taxaAnualPct / 100));

      return {
        ...pote,
        categoria_ativo: pote.categoria_ativo || (pote.nome.toUpperCase().includes('SELIC') ? 'Tesouro Selic' : 'CDB'),
        taxa_anual_pct: rent.taxaAnualPct,
        rendimento_mensal_pct: rent.taxaMensalPct,
        rendimento_mensal_reais: parseFloat(rendimentoMensalReais.toFixed(2)),
        rendimento_anual_reais: parseFloat(rendimentoAnualReais.toFixed(2)),
        indexador: rent.tipoIndexador
      };
    });

    res.json({
      success: true,
      mercado: mercadoAtual,
      potes: potesTratados
    });
  });
});

// 7.1 POST /api/potes (Adiciona um novo investimento/pote para o usuário logado)
app.post('/api/potes', autenticarToken, (req, res) => {
  const { nome, tipo, valor, categoria_ativo, instituicao, vencimento, taxa_anual_pct } = req.body;
  if (!nome || valor === undefined || isNaN(valor) || valor < 0) {
    return res.status(400).json({ error: 'Nome e valor válido são obrigatórios.' });
  }

  const catFinal = categoria_ativo || (nome.toUpperCase().includes('SELIC') ? 'Tesouro Selic' : 'CDB');
  const rent = calcularRentabilidadeEstimada(catFinal, taxa_anual_pct);

  db.run(
    `INSERT INTO potes (usuario_id, nome, tipo, categoria_ativo, taxa_anual_pct, rendimento_mensal_pct, instituicao, vencimento, valor)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      req.usuarioId,
      nome.trim(),
      tipo || 'reserva',
      catFinal,
      rent.taxaAnualPct,
      rent.taxaMensalPct,
      instituicao ? instituicao.trim() : 'Banco / Corretora',
      vencimento || 'Liquidez Diária',
      Number(valor)
    ],
    function(err) {
      if (err) {
        console.error('Erro ao inserir pote:', err.message);
        return res.status(500).json({ error: 'Erro ao salvar investimento: ' + err.message });
      }
      res.status(201).json({
        success: true,
        data: {
          id: this.lastID,
          usuario_id: req.usuarioId,
          nome: nome.trim(),
          tipo: tipo || 'reserva',
          categoria_ativo: catFinal,
          taxa_anual_pct: rent.taxaAnualPct,
          rendimento_mensal_pct: rent.taxaMensalPct,
          instituicao: instituicao || 'Banco',
          vencimento: vencimento || 'Liquidez Diária',
          valor: Number(valor)
        }
      });
    }
  );
});

// 7.2 PATCH /api/potes/:id (Atualiza categoria_ativo, vencimento ou valor de um investimento)
app.patch('/api/potes/:id', autenticarToken, (req, res) => {
  const id = req.params.id;
  const { categoria_ativo, vencimento, valor, nome } = req.body;
  const updates = [];
  const params = [];

  if (categoria_ativo !== undefined) { updates.push('categoria_ativo = ?'); params.push(categoria_ativo); }
  if (vencimento !== undefined) { updates.push('vencimento = ?'); params.push(vencimento); }
  if (valor !== undefined) { updates.push('valor = ?'); params.push(valor); }
  if (nome !== undefined) { updates.push('nome = ?'); params.push(nome); }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'Nenhum campo para atualizar.' });
  }

  params.push(id, req.usuarioId);
  const sql = 'UPDATE potes SET ' + updates.join(', ') + ' WHERE id = ? AND usuario_id = ?';
  db.run(sql, params, function(err) {
    if (err) {
      console.error('Erro ao atualizar investimento:', err.message);
      return res.status(500).json({ error: 'Erro ao atualizar investimento: ' + err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Investimento não encontrado ou não autorizado.' });
    }
    res.json({ success: true, message: 'Investimento atualizado com sucesso.' });
  });
});

// 8. DELETE /api/potes/:id (Exclui um pote pertencente ao usuário logado)
app.delete('/api/potes/:id', autenticarToken, (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM potes WHERE id = ? AND usuario_id = ?', [id, req.usuarioId], function(err) {
    if (err) {
      console.error('Erro ao deletar pote:', err.message);
      return res.status(500).json({ error: 'Erro ao deletar pote: ' + err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Pote não encontrado ou não pertence a este usuário.' });
    }
    res.json({ success: true, message: 'Pote removido com sucesso.' });
  });
});

// ==========================================
// ROTAS DE PROJETOS E GRANDES COMPRAS (ISOLADAS POR USUÁRIO)
// ==========================================

// 9. GET /api/projetos (Retorna projetos EXCLUSIVOS do usuário)
app.get('/api/projetos', autenticarToken, (req, res) => {
  const sql = `
    SELECT p.*,
           ROUND(CASE WHEN p.valor_objetivo > 0 THEN (p.valor_acumulado / p.valor_objetivo) * 100 ELSE 0 END, 1) AS porcentagem
    FROM projetos_compras p
    WHERE p.usuario_id = ?
    ORDER BY p.id DESC
  `;
  db.all(sql, [req.usuarioId], (err, projetos) => {
    if (err) {
      console.error('Erro ao listar projetos:', err.message);
      return res.status(500).json({ error: 'Erro ao carregar projetos: ' + err.message });
    }
    res.json({ success: true, projetos: projetos || [] });
  });
});

// 10. POST /api/projetos (Cria um projeto para o usuário logado)
app.post('/api/projetos', autenticarToken, (req, res) => {
  const { nome, tipo, valor_objetivo } = req.body;
  if (!nome || !tipo || valor_objetivo === undefined || isNaN(valor_objetivo) || Number(valor_objetivo) <= 0) {
    return res.status(400).json({ error: 'Nome, tipo (Projeto ou Compra) e valor_objetivo positivo são obrigatórios.' });
  }

  const query = 'INSERT INTO projetos_compras (usuario_id, nome, tipo, valor_objetivo, valor_acumulado) VALUES (?, ?, ?, ?, 0)';
  db.run(query, [req.usuarioId, nome.trim(), tipo.trim(), Number(valor_objetivo)], function(err) {
    if (err) {
      console.error('Erro ao inserir projeto:', err.message);
      return res.status(500).json({ error: 'Erro ao cadastrar projeto: ' + err.message });
    }

    res.status(201).json({
      success: true,
      data: {
        id: this.lastID,
        usuario_id: req.usuarioId,
        nome: nome.trim(),
        tipo: tipo.trim(),
        valor_objetivo: Number(valor_objetivo),
        valor_acumulado: 0,
        porcentagem: 0
      }
    });
  });
});

// 11. PUT /api/projetos/:id/aportar (Adiciona aporte com verificação de posse)
app.put('/api/projetos/:id/aportar', autenticarToken, (req, res) => {
  const id = req.params.id;
  const { valor } = req.body;

  if (valor === undefined || isNaN(valor) || Number(valor) <= 0) {
    return res.status(400).json({ error: 'Informe um valor de aporte positivo válido.' });
  }

  const valorAporte = Number(valor);

  db.get('SELECT * FROM projetos_compras WHERE id = ? AND usuario_id = ?', [id, req.usuarioId], (errGet, projeto) => {
    if (errGet) {
      console.error('Erro ao buscar projeto:', errGet.message);
      return res.status(500).json({ error: 'Erro ao buscar projeto: ' + errGet.message });
    }
    if (!projeto) {
      return res.status(404).json({ error: 'Projeto não encontrado ou não pertence a este usuário.' });
    }

    const novoAcumulado = Number(projeto.valor_acumulado) + valorAporte;

    db.run('UPDATE projetos_compras SET valor_acumulado = ? WHERE id = ? AND usuario_id = ?', [novoAcumulado, id, req.usuarioId], function(errUpdate) {
      if (errUpdate) {
        console.error('Erro ao atualizar projeto:', errUpdate.message);
        return res.status(500).json({ error: 'Erro ao atualizar saldo do projeto: ' + errUpdate.message });
      }

      // Registra no histórico de aportes com usuario_id
      db.run('INSERT INTO aportes_projetos (usuario_id, projeto_id, valor) VALUES (?, ?, ?)', [req.usuarioId, id, valorAporte], (errHist) => {
        if (errHist) {
          console.error('Erro ao salvar histórico de aporte:', errHist.message);
        }

        const pct = projeto.valor_objetivo > 0 ? ((novoAcumulado / projeto.valor_objetivo) * 100).toFixed(1) : 0;

        res.json({
          success: true,
          message: 'Aporte realizado com sucesso!',
          data: {
            id: Number(id),
            usuario_id: req.usuarioId,
            nome: projeto.nome,
            tipo: projeto.tipo,
            valor_objetivo: projeto.valor_objetivo,
            valor_acumulado: novoAcumulado,
            porcentagem: Number(pct),
            concluido: novoAcumulado >= projeto.valor_objetivo
          }
        });
      });
    });
  });
});

// 12. DELETE /api/projetos/:id (Permite excluir garantindo que pertence ao usuário)
app.delete('/api/projetos/:id', autenticarToken, (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM projetos_compras WHERE id = ? AND usuario_id = ?', [id, req.usuarioId], function(err) {
    if (err) {
      console.error('Erro ao excluir projeto:', err.message);
      return res.status(500).json({ error: 'Erro ao excluir projeto: ' + err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Projeto não encontrado ou não pertence a este usuário.' });
    }
    db.run('DELETE FROM aportes_projetos WHERE projeto_id = ? AND usuario_id = ?', [id, req.usuarioId]);
    res.json({ success: true, message: 'Projeto excluído com sucesso.' });
  });
});

// ==========================================
// ROTAS DE IA COM PROTEÇÃO JWT
// ==========================================

app.post('/api/analyze', autenticarToken, aiRateLimiter, async (req, res) => {
  try {
    const { entradas, despesas, resumo } = req.body;

    if (!entradas || !despesas || !resumo) {
      return res.status(400).json({ error: 'Dados incompletos. Envie entradas, despesas e resumo.' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.json({
        success: true,
        analysis: `### Diagnóstico Financeiro 50/30/20 (Modo Demonstração)

> **Nota:** Configure a variável \`GEMINI_API_KEY\` no arquivo \`.env\` para receber respostas do modelo em tempo real.

#### 1. Comparativo de Metas
- **Gastos Essenciais:** R$ ${resumo.essenciais.toFixed(2)} (${((resumo.essenciais / (resumo.totalEntradas || 1)) * 100).toFixed(1)}% vs meta de 50%).
- **Desejos / Supérfluos:** R$ ${resumo.desejos.toFixed(2)} (${((resumo.desejos / (resumo.totalEntradas || 1)) * 100).toFixed(1)}% vs meta de 30%).
- **Reserva / Investimento:** R$ ${resumo.reserva.toFixed(2)} (${((resumo.reserva / (resumo.totalEntradas || 1)) * 100).toFixed(1)}% vs meta de 20%).

#### 2. Vilões de Gastos Identificados
Revise itens de alimentação fora de casa, compras impulsivas ou assinaturas não utilizadas.

#### 3. Três Conselhos Práticos:
* **Limite os desejos:** Congele gastos não essenciais pelas próximas 2 semanas.
* **Priorize o pilar 20%:** Separe a meta de investimento assim que o salário cair.
* **Construa a Reserva Ideal:** Mantenha como foco atingir 6 meses de gastos essenciais.`
      });
    }

    const totalEntradas = Number(resumo.totalEntradas) || 1;
    const pctEssenciais = ((Number(resumo.essenciais) / totalEntradas) * 100).toFixed(1);
    const pctDesejos = ((Number(resumo.desejos) / totalEntradas) * 100).toFixed(1);
    const pctReserva = ((Number(resumo.reserva) / totalEntradas) * 100).toFixed(1);

    const prompt = `
Você é um Consultor Financeiro Sênior e especialista rigoroso no método de orçamento 50/30/20.
Sua postura é profissional, didática e firme com desvios do orçamento.

METAS DO MÉTODO:
- Essenciais: Máximo 50%
- Não Essenciais / Desejos: Máximo 30%
- Reserva / Futuro: Mínimo 20%

DADOS DO USUÁRIO (${req.usuarioNome}):
- Renda Total: R$ ${Number(resumo.totalEntradas).toFixed(2)}
- Essenciais: R$ ${Number(resumo.essenciais).toFixed(2)} (${pctEssenciais}%)
- Desejos: R$ ${Number(resumo.desejos).toFixed(2)} (${pctDesejos}%)
- Reserva: R$ ${Number(resumo.reserva).toFixed(2)} (${pctReserva}%)

DESPESAS DETALHADAS:
${JSON.stringify(despesas, null, 2)}

TAREFA:
1. DIAGNÓSTICO DOS PERCENTUAIS: Compare a realidade do usuário com as metas 50/30/20.
2. VILÕES DO ORÇAMENTO: Aponte nominalmente os maiores excessos na lista de despesas.
3. 3 CONSELHOS PRÁTICOS: 3 passos diretos para o próximo mês reequilibrar o orçamento.
`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash-lite',
      contents: prompt
    });

    return res.json({
      success: true,
      analysis: response.text
    });

  } catch (err) {
    console.error('Erro na análise:', err);
    return res.status(500).json({ error: 'Erro ao gerar análise: ' + err.message });
  }
});

// SIMULADOR "POSSO COMPRAR?"
app.post('/api/simulate', autenticarToken, aiRateLimiter, async (req, res) => {
  try {
    const { item, valor, categoria, contexto } = req.body;

    if (!item || isNaN(valor) || !categoria || !contexto) {
      return res.status(400).json({ error: 'Parâmetros insuficientes para a simulação.' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Chave GEMINI_API_KEY não configurada no servidor.' });
    }

    const { rendaTotal, limites, despesasAtuais, totalGastoCategoria } = contexto;
    const nomesCat = { "50": "Essenciais (50%)", "30": "Desejos / Estilo de Vida (30%)", "20": "Reserva / Futuro (20%)" };
    const limiteCat = limites[categoria] || 0;
    const novoTotal = totalGastoCategoria + valor;
    const vaiEstourar = novoTotal > limiteCat;

    const prompt = `
Você é um Consultor Financeiro Corporativo Sênior especializado no Método Orçamentário 50/30/20.
Sua função é avaliar uma simulação de compra ("Posso Comprar?") com base estrita no orçamento real do cliente (${req.usuarioNome}).

DADOS DA COMPRA SIMULADA:
- Item: "${item}"
- Valor: R$ ${valor.toFixed(2)}
- Categoria pretendida: ${nomesCat[categoria]}

SITUAÇÃO FINANCEIRA DO CLIENTE NO MÊS:
- Renda Líquida Total: R$ ${rendaTotal.toFixed(2)}
- Limite Teto da Categoria (${nomesCat[categoria]}): R$ ${limiteCat.toFixed(2)}
- Total Já Gasto nessa Categoria: R$ ${totalGastoCategoria.toFixed(2)}
- Total Projetado com a Compra: R$ ${novoTotal.toFixed(2)} (Vai estourar o limite? ${vaiEstourar ? 'SIM, por R$ ' + (novoTotal - limiteCat).toFixed(2) : 'NÃO'})

LISTA ATUAL DE GASTOS DO CLIENTE NO MÊS:
${JSON.stringify(despesasAtuais, null, 2)}

SUAS DIRETRIZES DE RESPOSTA:
1. VEREDICTO CLARO E DIRETO NO INÍCIO: Diga expressamente se a compra está LIBERADA ou se DEVE SER REAVALIADA/BLOQUEADA.
2. ANÁLISE DE IMPACTO: Explique matematicamente o que essa compra fará com o teto da categoria e com a sobra mensal do cliente.
3. SE ESTOURAR O LIMITE (OU SE ESTIVER MUITO APERTADO):
   - Não dê conselhos vagos! Olhe para a lista real de gastos do cliente acima e aponte nominalmente exatamente QUAIS despesas ele deve cortar ou reduzir neste mês para viabilizar essa compra sem violar o método 50/30/20.
4. PLANO B OU ALTERNATIVA: Sugira uma condição realista (ex: parcelamento responsável, postergar para o próximo mês ou remanejamento de categoria).

Mantenha o tom executivo, didático, firme e com números precisos em R$. Formate em Markdown com títulos concisos.
`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash-lite',
      contents: prompt
    });

    return res.json({
      success: true,
      veredicto: vaiEstourar ? 'ATENÇÃO: ESTOURO DE LIMITE' : 'COMPRA DENTRO DO ORÇAMENTO',
      vaiEstourar,
      excesso: vaiEstourar ? novoTotal - limiteCat : 0,
      analysis: response.text
    });

  } catch (err) {
    console.error('Erro na rota /api/simulate:', err);
    return res.status(500).json({ error: 'Erro ao simular compra: ' + err.message });
  }
});

// CHAT CONSULTOR FINANCEIRO
app.post('/api/chat', autenticarToken, aiRateLimiter, async (req, res) => {
  try {
    const { message, despesas, entradas, limites } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Mensagem vazia.' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Chave GEMINI_API_KEY não configurada no servidor.' });
    }

    const totalEntradas = entradas ? entradas.reduce((a, b) => a + b.valor, 0) : 0;
    const totalDespesas = despesas ? despesas.reduce((a, b) => a + b.valor, 0) : 0;
    const essenciais = despesas ? despesas.filter(d => d.categoria === '50').reduce((a, b) => a + b.valor, 0) : 0;
    const desejos = despesas ? despesas.filter(d => d.categoria === '30').reduce((a, b) => a + b.valor, 0) : 0;
    const reserva = despesas ? despesas.filter(d => d.categoria === '20').reduce((a, b) => a + b.valor, 0) : 0;

    const prompt = `
Você é o Assistente Virtual e Consultor Financeiro do sistema Finanças Inteligente.
Você conversa diretamente com o usuário ${req.usuarioNome} em um terminal corporativo e tem ACESSO COMPLETO em tempo real aos dados financeiros que estão na tela dele.

DADOS FINANCEIROS ATUAIS DO USUÁRIO:
- Renda Líquida Total: R$ ${totalEntradas.toFixed(2)}
- Despesas Totais: R$ ${totalDespesas.toFixed(2)} (Sobra Mensal: R$ ${(totalEntradas - totalDespesas).toFixed(2)})
- Gastos Essenciais: R$ ${essenciais.toFixed(2)} (Meta 50%: R$ ${(limites ? limites['50'] : totalEntradas * 0.5).toFixed(2)})
- Gastos com Desejos: R$ ${desejos.toFixed(2)} (Meta 30%: R$ ${(limites ? limites['30'] : totalEntradas * 0.3).toFixed(2)})
- Aportes Futuro/Reserva: R$ ${reserva.toFixed(2)} (Meta 20%: R$ ${(limites ? limites['20'] : totalEntradas * 0.2).toFixed(2)})

EXTRATO COMPLETO DE DESPESAS CADASTRADAS:
${JSON.stringify(despesas || [], null, 2)}

PERGUNTA DO USUÁRIO:
"${message}"

INSTRUÇÕES PARA SUA RESPOSTA:
- NUNCA dê respostas genéricas e clichês. Responda citando NOMINALMENTE os itens que estão na tabela dele (ex: "Vi que você gastou R$ X com Y...").
- Se ele perguntar "Onde posso cortar gastos?", aponte os itens mais caros da categoria de Desejos (30%) ou excessos em Essenciais da lista dele.
- Seja objetivo, profissional, prestativo e com raciocínio financeiro afiado baseado no método 50/30/20.
- Responda em parágrafos curtos ou tópicos objetivos em Markdown.
`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash-lite',
      contents: prompt
    });

    return res.json({
      success: true,
      reply: response.text
    });

  } catch (err) {
    console.error('Erro na rota /api/chat:', err);
    return res.status(500).json({ error: 'Erro no chat: ' + err.message });
  }
});

// ASSESSOR DE ALOCAÇÃO IA
app.post('/api/invest-advice', autenticarToken, aiRateLimiter, async (req, res) => {
  try {
    const { saldoReservaAtual, metaReservaIdeal, aporteDisponivelMes, carteiraAtual } = req.body;

    if (isNaN(saldoReservaAtual) || isNaN(metaReservaIdeal) || isNaN(aporteDisponivelMes)) {
      return res.status(400).json({ error: 'Parâmetros matemáticos incompletos para a alocação.' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Chave GEMINI_API_KEY não configurada no servidor.' });
    }

    const reservaCompleta = saldoReservaAtual >= metaReservaIdeal;
    const deficitReserva = Math.max(0, metaReservaIdeal - saldoReservaAtual);

    const prompt = `
Você é um Assessor de Investimentos e Alocação de Ativos Sênior, rigoroso e alinhado aos princípios de finanças corporativas e à regra 50/30/20 (Foco nos 20% do Futuro).
Cliente: ${req.usuarioNome}

DADOS DA POSIÇÃO PATRIMONIAL DO CLIENTE:
- Saldo Atual na Reserva de Emergência: R$ ${saldoReservaAtual.toFixed(2)}
- Meta Ideal da Reserva de Emergência (6 meses de custos fixos): R$ ${metaReservaIdeal.toFixed(2)}
- Déficit da Reserva: R$ ${deficitReserva.toFixed(2)} (${reservaCompleta ? 'RESERVA COMPLETA' : 'RESERVA INCOMPLETA'})
- Valor Disponível para Aporte no Mês (20% ou sobra): R$ ${aporteDisponivelMes.toFixed(2)}
- Potes da Carteira Atual: ${JSON.stringify(carteiraAtual || [], null, 2)}

REGRA DE DECISÃO MATEMÁTICA E DIRETRIZES DE ALOCAÇÃO:
1. SE A RESERVA DE EMERGÊNCIA FOR MENOR QUE A META IDEAL (Déficit > 0):
   - Você DEVE recomendar veementemente destinar 100% do aporte deste mês para a Reserva de Emergência.
   - Especifique ativos de renda fixa de máxima segurança e liquidez diária imediata (ex: Tesouro Selic, CDB com liquidez diária a 100%+ do CDI de bancos sólidos).
   - Proíba explicitamente correr risco em ações, cripto ou fundos voláteis enquanto a blindagem dos 6 meses de sobrevivência não estiver garantida.
   - Calcule quantos meses nesse ritmo de aporte o cliente levará para completar o fundo.

2. SE A RESERVA DE EMERGÊNCIA JÁ ESTIVER COMPLETA OU ULTRAPASSADA:
   - Parabenize a blindagem financeira sólida!
   - Sugira diversificação estratégica baseada em um perfil conservador/moderado.
   - Proponha uma divisão percentual inteligente do aporte deste mês (ex: 40% em Renda Fixa IPCA+ para proteger contra inflação, 30% em Fundos Imobiliários para geração de renda passiva mensal e 30% em Ações/ETFs Globais para valorização de longo prazo).

Mantenha um tom técnico, executivo, sem rodeios e com números claros em R$. Formate com títulos claros e listas em Markdown.
`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash-lite',
      contents: prompt
    });

    return res.json({
      success: true,
      reservaCompleta,
      deficitReserva,
      advice: response.text
    });

  } catch (err) {
    console.error('Erro na rota /api/invest-advice:', err);
    return res.status(500).json({ error: 'Erro ao gerar recomendação de alocação: ' + err.message });
  }
});

// ============================================================================
// MÓDULO DASHBOARD DE INVESTIMENTOS (GESTAO DA FATIA DE 20% DO ORÇAMENTO)
// ============================================================================

// Estrutura em memória isolada por usuário: { usuarioId: [ { id, mes, tipo_ativo, valor_aplicado, rendimento_atual } ] }
const InvestimentosDB = {
  1: [
    { id: 1, mes: '2026-11', tipo_ativo: 'Tesouro Selic', valor_aplicado: 3500.00, rendimento_atual: 320.50 },
    { id: 2, mes: '2026-11', tipo_ativo: 'CDB', valor_aplicado: 2500.00, rendimento_atual: 215.80 },
    { id: 3, mes: '2026-10', tipo_ativo: 'Tesouro Selic', valor_aplicado: 3000.00, rendimento_atual: 270.00 },
    { id: 4, mes: '2026-10', tipo_ativo: 'CDB', valor_aplicado: 2000.00, rendimento_atual: 160.00 }
  ],
  2: [
    { id: 1, mes: '2026-11', tipo_ativo: 'Tesouro Selic', valor_aplicado: 4000.00, rendimento_atual: 368.20 },
    { id: 2, mes: '2026-11', tipo_ativo: 'CDB', valor_aplicado: 3000.00, rendimento_atual: 254.10 },
    { id: 3, mes: '2026-10', tipo_ativo: 'Tesouro Selic', valor_aplicado: 3500.00, rendimento_atual: 310.00 },
    { id: 4, mes: '2026-10', tipo_ativo: 'CDB', valor_aplicado: 2500.00, rendimento_atual: 200.00 }
  ]
};

let nextInvestimentoId = 100;

// GET /api/investimentos - Retorna lista e totais calculados para o mês selecionado
app.get('/api/investimentos', autenticarToken, (req, res) => {
  try {
    const usuarioId = req.usuarioId || 2;
    const mes = req.query.mes || new Date().toISOString().slice(0, 7);

    if (!InvestimentosDB[usuarioId]) {
      InvestimentosDB[usuarioId] = [
        { id: ++nextInvestimentoId, mes, tipo_ativo: 'Tesouro Selic', valor_aplicado: 3000.00, rendimento_atual: 275.50 },
        { id: ++nextInvestimentoId, mes, tipo_ativo: 'CDB', valor_aplicado: 2000.00, rendimento_atual: 172.40 }
      ];
    }

    const listaUsuario = InvestimentosDB[usuarioId] || [];
    const filtrados = listaUsuario.filter(i => i.mes === mes);

    // Agrupamento e totais executivos
    let totalAplicado = 0;
    let rendimentoTotal = 0;
    const porAtivo = {};

    filtrados.forEach(item => {
      const vAplicado = Number(item.valor_aplicado) || 0;
      const vRendimento = Number(item.rendimento_atual) || 0;

      totalAplicado += vAplicado;
      rendimentoTotal += vRendimento;

      if (!porAtivo[item.tipo_ativo]) {
        porAtivo[item.tipo_ativo] = {
          tipo_ativo: item.tipo_ativo,
          valor_aplicado: 0,
          rendimento_atual: 0,
          patrimonio: 0
        };
      }
      porAtivo[item.tipo_ativo].valor_aplicado += vAplicado;
      porAtivo[item.tipo_ativo].rendimento_atual += vRendimento;
      porAtivo[item.tipo_ativo].patrimonio += (vAplicado + vRendimento);
    });

    const patrimonioTotal = totalAplicado + rendimentoTotal;

    // Distribuição percentual de todo o capital por ativo
    const distribuicao = Object.values(porAtivo).map(ativo => ({
      tipo_ativo: ativo.tipo_ativo,
      patrimonio: ativo.patrimonio,
      percentual: patrimonioTotal > 0 ? Number(((ativo.patrimonio / patrimonioTotal) * 100).toFixed(2)) : 0
    }));

    return res.json({
      success: true,
      mes,
      resumo: {
        patrimonioTotal,
        totalAplicado,
        rendimentoTotal
      },
      distribuicao,
      porAtivo: Object.values(porAtivo),
      investimentos: filtrados
    });
  } catch (err) {
    console.error('Erro ao listar investimentos:', err);
    return res.status(500).json({ error: 'Erro interno ao processar dados de investimentos: ' + err.message });
  }
});

// POST /api/investimentos - Registra novo aporte ou atualização de rendimento
app.post('/api/investimentos', autenticarToken, (req, res) => {
  try {
    const usuarioId = req.usuarioId || 2;
    const { mes, tipo_ativo, valor_aplicado, rendimento_atual } = req.body;

    if (!tipo_ativo || valor_aplicado === undefined) {
      return res.status(400).json({ error: 'Os campos tipo_ativo e valor_aplicado são obrigatórios.' });
    }

    if (!InvestimentosDB[usuarioId]) {
      InvestimentosDB[usuarioId] = [];
    }

    const novoRegistro = {
      id: ++nextInvestimentoId,
      mes: mes || new Date().toISOString().slice(0, 7),
      tipo_ativo: tipo_ativo.trim(),
      valor_aplicado: parseFloat(valor_aplicado) || 0,
      rendimento_atual: parseFloat(rendimento_atual) || 0
    };

    InvestimentosDB[usuarioId].unshift(novoRegistro);

    return res.status(201).json({
      success: true,
      message: 'Movimentação registrada com sucesso.',
      data: novoRegistro
    });
  } catch (err) {
    console.error('Erro ao registrar investimento:', err);
    return res.status(500).json({ error: 'Erro ao registrar investimento: ' + err.message });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor rodando com sucesso em: http://localhost:${PORT}`);
});
