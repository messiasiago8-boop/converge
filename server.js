require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
let yts = null;
try {
  yts = require('yt-search');
} catch (e) {
  console.warn('yt-search não carregado');
}

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// Hardening de Segurança: Oculta identificação do servidor
app.disable('x-powered-by');

// Middleware Global de Cabeçalhos de Segurança HTTP (compatível com YouTube Player, CDNs e Iframes internos)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // CSP configurada para suportar scripts essenciais (Tailwind, FontAwesome, Chart.js, YouTube API, Google Fonts)
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data: https:; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://cdn.tailwindcss.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://www.youtube.com https://s.ytimg.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; " +
    "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com; " +
    "img-src 'self' data: blob: https://* http://*; " +
    "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com http://localhost:* http://127.0.0.1:*; " +
    "connect-src 'self' https://* http://localhost:* http://127.0.0.1:* ws://* wss://*;"
  );
  next();
});

// Middleware de Autenticação JWT do Portal (valida token do usuário)
const jwt = (() => {
  try {
    return require('../finance-tracker/node_modules/jsonwebtoken');
  } catch (e) {
    return null;
  }
})();
const JWT_SECRET = process.env.JWT_SECRET || 'financas-inteligente-jwt-secret-key-2026';

function autenticarTokenPortal(req, res, next) {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1];
  if (!token && req.query.token) token = req.query.token;

  if (!token || !jwt) {
    req.usuarioId = 1; // Fallback seguro
    return next();
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      req.usuarioId = 1;
    } else {
      req.usuarioId = user.id;
      req.usuarioNome = user.nome;
      req.usuarioEmail = user.email;
    }
    next();
  });
}

// Middlewares essenciais
app.use(express.json());

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

// Rate Limiter em memória por IP para rotas de IA
const rateLimitStore = new Map();
function criarRateLimiter({ janelaMs = 60000, maxRequisicoes = 30, mensagem = 'Muitas requisições. Aguarde um momento.' } = {}) {
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

const aiRateLimiter = criarRateLimiter({
  janelaMs: 60000,
  maxRequisicoes: 30,
  mensagem: 'Limite de consultas à IA atingido temporariamente. Por favor, aguarde 1 minuto.'
});

app.use(autenticarTokenPortal);
app.use(express.static(path.join(__dirname, 'public')));
let FINANCAS_PUBLIC = path.join(__dirname, 'finance-tracker', 'public');
if (!fs.existsSync(FINANCAS_PUBLIC)) {
  FINANCAS_PUBLIC = path.join(__dirname, '..', 'finance-tracker', 'public');
}
if (fs.existsSync(FINANCAS_PUBLIC)) {
  app.use('/financas-app', express.static(FINANCAS_PUBLIC));
  // Servir rotas diretas caso o frontend do Finanças busque na raiz
  app.get('/login.html', (req, res) => res.sendFile(path.join(FINANCAS_PUBLIC, 'login.html')));
  app.get('/logo.jpg', (req, res) => res.sendFile(path.join(FINANCAS_PUBLIC, 'logo.jpg')));
}

// Proxy transparente para as APIs do Finanças (porta 3001) para que o iframe funcione perfeitamente na porta 3000
const { createProxyMiddleware } = (() => {
  try {
    return require('http-proxy-middleware');
  } catch (e) {
    return { createProxyMiddleware: null };
  }
})();

// Redirecionamento/Proxy de APIs do Finanças para a porta 3001
const FINANCE_API_PORT = 3001;
['/api/auth', '/api/dados', '/api/potes', '/api/entradas', '/api/despesas', '/api/limites', '/api/projetos', '/api/analyze', '/api/simulate', '/api/invest-advice', '/api/investimentos'].forEach(route => {
  app.all(route + '*', async (req, res) => {
    try {
      const targetUrl = `http://localhost:${FINANCE_API_PORT}${req.originalUrl}`;
      const headers = { ...req.headers, host: `localhost:${FINANCE_API_PORT}` };
      
      const options = {
        method: req.method,
        headers
      };
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.body && Object.keys(req.body).length > 0) {
        options.headers['content-type'] = 'application/json';
        options.body = JSON.stringify(req.body);
      }

      const response = await fetch(targetUrl, options);
      const data = await response.text();
      res.status(response.status);
      response.headers.forEach((val, key) => {
        if (!['content-encoding', 'content-length'].includes(key.toLowerCase())) {
          res.setHeader(key, val);
        }
      });
      res.send(data);
    } catch (err) {
      console.error(`Erro no proxy reverso do Finanças (${route}):`, err.message);
      res.status(502).json({ error: 'Falha ao conectar com o backend de Finanças na porta 3001.' });
    }
  });
});

// ================= BANCO DE DADOS PERSISTENTE EM ARQUIVO JSON ================= //
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DADOS_PADRAO = {
  topicos: [
    { id: 1, nome: "Vendas" },
    { id: 2, nome: "Desenvolvimento Pessoal" }
  ],
  videos: [
    {
      id: 1,
      titulo: "Técnicas Modernas de Negociação e Fechamento Comercial",
      url_youtube: "https://www.youtube.com/watch?v=M7lc1UVf-VE",
      id_topico: 1
    },
    {
      id: 2,
      titulo: "Prospecção B2B de Alta Performance para Executivos",
      url_youtube: "https://www.youtube.com/watch?v=M7lc1UVf-VE",
      id_topico: 1
    },
    {
      id: 3,
      titulo: "Foco, Disciplina e Gestão de Tempo no Ambiente Corporativo",
      url_youtube: "https://www.youtube.com/watch?v=M7lc1UVf-VE",
      id_topico: 2
    }
  ],
  agendamentos: [
    { id: 1, dia_semana: "Segunda", id_video: 1 },
    { id: 2, dia_semana: "Quarta", id_video: 2 },
    { id: 3, dia_semana: "Sexta", id_video: 3 }
  ],
  notas: [
    {
      id: 1,
      id_video: 1,
      segundos: 12,
      tempo_formatado: "00:12",
      texto: "Abertura do framework de qualificação de leads.",
      criado_em: new Date().toISOString()
    },
    {
      id: 2,
      id_video: 1,
      segundos: 35,
      tempo_formatado: "00:35",
      texto: "Critérios essenciais para superar objeções de preço.",
      criado_em: new Date().toISOString()
    }
  ]
};

function obterBancoUsuario(usuarioId) {
  const uid = usuarioId || 1;
  const userFile = path.join(DATA_DIR, `database_user_${uid}.json`);

  // Se o arquivo do usuário ainda não existir
  if (!fs.existsSync(userFile)) {
    // Para o usuário principal (ID 1 e ID 2 que é o Iago), se existir database.json clássico, reaproveita
    if ((uid === 1 || uid === 2) && fs.existsSync(DB_FILE)) {
      try {
        const conteudo = fs.readFileSync(DB_FILE, 'utf-8');
        fs.writeFileSync(userFile, conteudo, 'utf-8');
        return JSON.parse(conteudo);
      } catch (e) {
        console.error('Erro ao migrar dados de usuário antigo:', e);
      }
    }

    // Para NOVOS USUÁRIOS: TUDO TOTALMENTE ZERADO
    const dadosZerados = {
      topicos: [],
      videos: [],
      agendamentos: [],
      notas: [],
      prioridades_dia: [],
      habitos: [],
      compromissos: [],
      metas: []
    };
    salvarBancoUsuario(dadosZerados, uid);
    return dadosZerados;
  }

  try {
    const conteudo = fs.readFileSync(userFile, 'utf-8');
    const dados = JSON.parse(conteudo);
    if (!Array.isArray(dados.prioridades_dia)) dados.prioridades_dia = [];
    if (!Array.isArray(dados.habitos)) dados.habitos = [];
    if (!Array.isArray(dados.compromissos)) dados.compromissos = [];
    if (!Array.isArray(dados.metas)) dados.metas = [];
    return dados;
  } catch (err) {
    console.error(`[Database Error] Falha ao ler banco do usuario ${uid}:`, err);
    return { topicos: [], videos: [], agendamentos: [], notas: [], prioridades_dia: [], habitos: [], compromissos: [], metas: [] };
  }
}

function salvarBancoUsuario(dados, usuarioId) {
  const uid = usuarioId || 1;
  const userFile = path.join(DATA_DIR, `database_user_${uid}.json`);
  try {
    fs.writeFileSync(userFile, JSON.stringify(dados, null, 2), 'utf-8');
    if (uid === 1 || uid === 2) {
      // Mantém sincronizado o database.json global para retrocompatibilidade
      fs.writeFileSync(DB_FILE, JSON.stringify(dados, null, 2), 'utf-8');
    }
  } catch (error) {
    console.error(`[Database Error] Falha ao persistir dados do usuario ${uid}:`, error);
  }
}

function lerBanco() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      salvarBanco(DADOS_PADRAO);
      return JSON.parse(JSON.stringify(DADOS_PADRAO));
    }
    const conteudo = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(conteudo);
  } catch (error) {
    console.error('[Database Error] Falha ao ler banco de dados. Recuperando padrão:', error);
    return JSON.parse(JSON.stringify(DADOS_PADRAO));
  }
}

function salvarBanco(dados) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(dados, null, 2), 'utf-8');
  } catch (error) {
    console.error('[Database Error] Falha ao persistir dados:', error);
  }
}

let db = lerBanco();
let previasAtivas = [];

function extrairYouTubeId(url) {
  if (!url) return null;
  const regExp = /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/;
  const match = url.match(regExp);
  if (match && match[1]) return match[1];
  if (url.trim().length === 11 && !url.includes('/')) return url.trim();
  return null;
}

async function buscarNoYouTube(termoBusca, palavrasChaveFiltro = []) {
  if (!yts) return null;
  try {
    const resultado = await yts(termoBusca);
    if (resultado && resultado.videos && resultado.videos.length > 0) {
      let lista = resultado.videos.map(v => ({
        titulo: v.title,
        url_youtube: v.url,
        youtubeId: v.videoId,
        duracao: v.timestamp || '',
        canal: v.author ? v.author.name : '',
        views: v.views || 0
      }));

      if (palavrasChaveFiltro.length > 0) {
        lista.sort((a, b) => {
          const scoreA = palavrasChaveFiltro.filter(kw => a.titulo.toLowerCase().includes(kw)).length;
          const scoreB = palavrasChaveFiltro.filter(kw => b.titulo.toLowerCase().includes(kw)).length;
          return scoreB - scoreA;
        });
      }

      return lista.slice(0, 4);
    }
  } catch (err) {
    console.error('[YouTube Search Error]', err.message);
  }
  return null;
}

// ================= ROTAS DE TÓPICOS ================= //

app.get('/api/topicos', (req, res) => {
  const dbUser = obterBancoUsuario(req.usuarioId);
  res.json({ success: true, data: dbUser.topicos });
});

app.post('/api/topicos', (req, res) => {
  const { nome } = req.body;
  if (!nome || !nome.trim()) {
    return res.status(400).json({ success: false, message: 'O nome do tópico é obrigatório.' });
  }

  const dbUser = obterBancoUsuario(req.usuarioId);
  const novoTopico = {
    id: dbUser.topicos.length > 0 ? Math.max(...dbUser.topicos.map(t => t.id)) + 1 : 1,
    nome: nome.trim()
  };

  dbUser.topicos.push(novoTopico);
  salvarBancoUsuario(dbUser, req.usuarioId);
  res.status(201).json({ success: true, data: novoTopico });
});

app.put('/api/topicos/:id', (req, res) => {
  const { id } = req.params;
  const { nome } = req.body;
  const idNum = parseInt(id, 10);

  if (!nome || !nome.trim()) {
    return res.status(400).json({ success: false, message: 'O nome do tópico é obrigatório.' });
  }

  const dbUser = obterBancoUsuario(req.usuarioId);
  const topico = dbUser.topicos.find(t => t.id === idNum);
  if (!topico) {
    return res.status(404).json({ success: false, message: 'Tópico não encontrado.' });
  }

  topico.nome = nome.trim();
  salvarBancoUsuario(dbUser, req.usuarioId);
  res.json({ success: true, data: topico });
});

app.delete('/api/topicos/:id', (req, res) => {
  const { id } = req.params;
  const idNum = parseInt(id, 10);

  const dbUser = obterBancoUsuario(req.usuarioId);
  const index = dbUser.topicos.findIndex(t => t.id === idNum);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Tópico não encontrado.' });
  }

  // Remove o tópico
  dbUser.topicos.splice(index, 1);

  // Remove ou desvincula vídeos desse tópico
  const videosRemovidos = dbUser.videos.filter(v => v.id_topico === idNum);
  const idsVideosRemovidos = videosRemovidos.map(v => v.id);

  dbUser.videos = dbUser.videos.filter(v => v.id_topico !== idNum);
  dbUser.notas = dbUser.notas.filter(n => !idsVideosRemovidos.includes(n.id_video));
  dbUser.agendamentos = dbUser.agendamentos.filter(a => !idsVideosRemovidos.includes(a.id_video));

  salvarBancoUsuario(dbUser, req.usuarioId);
  res.json({ success: true, message: 'Tópico e aulas vinculadas excluídos com sucesso.' });
});

// ================= ROTAS DE VÍDEOS ================= //

app.get('/api/videos', (req, res) => {
  const { id_topico } = req.query;
  const dbUser = obterBancoUsuario(req.usuarioId);
  let resultado = dbUser.videos;

  if (id_topico) {
    const topicoIdNum = parseInt(id_topico, 10);
    resultado = dbUser.videos.filter(v => v.id_topico === topicoIdNum);
  }

  res.json({ success: true, data: resultado });
});

app.post('/api/videos', (req, res) => {
  const { titulo, url_youtube, id_topico } = req.body;

  if (!titulo || !titulo.trim() || !url_youtube || !url_youtube.trim() || !id_topico) {
    return res.status(400).json({
      success: false,
      message: 'Todos os campos (titulo, url_youtube e id_topico) são obrigatórios.'
    });
  }

  const youtubeId = extrairYouTubeId(url_youtube);
  if (!youtubeId) {
    return res.status(400).json({
      success: false,
      message: 'URL do YouTube inválida. Forneça uma URL válida ou o ID de 11 caracteres.'
    });
  }

  const dbUser = obterBancoUsuario(req.usuarioId);
  const topicoExiste = dbUser.topicos.some(t => t.id === parseInt(id_topico, 10));
  if (!topicoExiste) {
    return res.status(400).json({ success: false, message: 'Tópico selecionado não existe.' });
  }

  const novoVideo = {
    id: dbUser.videos.length > 0 ? Math.max(...dbUser.videos.map(v => v.id)) + 1 : 1,
    titulo: titulo.trim(),
    url_youtube: url_youtube.trim(),
    id_topico: parseInt(id_topico, 10)
  };

  dbUser.videos.push(novoVideo);
  salvarBancoUsuario(dbUser, req.usuarioId);
  res.status(201).json({ success: true, data: novoVideo });
});

app.delete('/api/videos/:id', (req, res) => {
  const { id } = req.params;
  const idNum = parseInt(id, 10);

  const dbUser = obterBancoUsuario(req.usuarioId);
  const index = dbUser.videos.findIndex(v => v.id === idNum);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Vídeo não encontrado.' });
  }

  dbUser.videos.splice(index, 1);
  dbUser.notas = dbUser.notas.filter(n => n.id_video !== idNum);
  dbUser.agendamentos = dbUser.agendamentos.filter(a => a.id_video !== idNum);

  salvarBancoUsuario(dbUser, req.usuarioId);
  res.json({ success: true, message: 'Vídeo, anotações e agendamentos vinculados excluídos com sucesso do banco de dados.' });
});

// Atualizar progresso do vídeo (segundo atual e status de conclusão)
app.patch('/api/videos/:id/progresso', (req, res) => {
  const { id } = req.params;
  const { segundo_atual, concluido } = req.body;
  const idNum = parseInt(id, 10);

  const dbUser = obterBancoUsuario(req.usuarioId);
  const video = dbUser.videos.find(v => v.id === idNum);
  if (!video) {
    return res.status(404).json({ success: false, message: 'Vídeo não encontrado.' });
  }

  if (segundo_atual !== undefined) {
    video.segundo_atual = Math.max(0, parseInt(segundo_atual, 10));
  }
  if (concluido !== undefined) {
    video.concluido = Boolean(concluido);
  }

  salvarBancoUsuario(dbUser, req.usuarioId);
  res.json({ success: true, data: video });
});

// ================= ROTAS DE AGENDAMENTOS ================= //

app.get('/api/agendamentos', (req, res) => {
  const dbUser = obterBancoUsuario(req.usuarioId);
  const resultado = dbUser.agendamentos.map(ag => {
    const video = dbUser.videos.find(v => v.id === ag.id_video);
    const topico = video ? dbUser.topicos.find(t => t.id === video.id_topico) : null;
    return {
      ...ag,
      video: video || null,
      topico: topico ? topico.nome : 'Sem tópico'
    };
  });
  res.json({ success: true, data: resultado });
});

app.post('/api/agendamentos', (req, res) => {
  const { dia_semana, id_video } = req.body;
  const diasValidos = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

  if (!dia_semana || !diasValidos.includes(dia_semana)) {
    return res.status(400).json({ success: false, message: 'dia_semana inválido.' });
  }

  const videoIdNum = parseInt(id_video, 10);
  const dbUser = obterBancoUsuario(req.usuarioId);
  const videoExiste = dbUser.videos.some(v => v.id === videoIdNum);
  if (!videoExiste) {
    return res.status(400).json({ success: false, message: 'Vídeo selecionado não existe.' });
  }

  const novoAgendamento = {
    id: dbUser.agendamentos.length > 0 ? Math.max(...dbUser.agendamentos.map(a => a.id)) + 1 : 1,
    dia_semana,
    id_video: videoIdNum
  };

  dbUser.agendamentos.push(novoAgendamento);
  salvarBancoUsuario(dbUser, req.usuarioId);

  const video = dbUser.videos.find(v => v.id === videoIdNum);
  const topico = video ? dbUser.topicos.find(t => t.id === video.id_topico) : null;

  res.status(201).json({
    success: true,
    data: {
      ...novoAgendamento,
      video,
      topico: topico ? topico.nome : 'Sem tópico'
    }
  });
});

app.delete('/api/agendamentos/:id', (req, res) => {
  const { id } = req.params;
  const idNum = parseInt(id, 10);
  const dbUser = obterBancoUsuario(req.usuarioId);
  const index = dbUser.agendamentos.findIndex(a => a.id === idNum);

  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Agendamento não encontrado.' });
  }

  dbUser.agendamentos.splice(index, 1);
  salvarBancoUsuario(dbUser, req.usuarioId);
  res.json({ success: true, message: 'Agendamento removido com sucesso.' });
});

// ================= ROTAS DE ANOTAÇÕES ================= //

app.get('/api/notas', (req, res) => {
  const { id_video } = req.query;
  if (!id_video) {
    return res.status(400).json({ success: false, message: 'id_video é obrigatório.' });
  }

  const videoIdNum = parseInt(id_video, 10);
  const dbUser = obterBancoUsuario(req.usuarioId);
  const notasDoVideo = dbUser.notas
    .filter(n => n.id_video === videoIdNum)
    .sort((a, b) => a.segundos - b.segundos);

  res.json({ success: true, data: notasDoVideo });
});

app.post('/api/notas', (req, res) => {
  const { id_video, segundos, texto } = req.body;

  if (!id_video || segundos === undefined || !texto || !texto.trim()) {
    return res.status(400).json({
      success: false,
      message: 'id_video, segundos e texto são obrigatórios.'
    });
  }

  const seg = Math.max(0, Math.floor(Number(segundos)));
  const minutos = Math.floor(seg / 60);
  const segundosRestantes = seg % 60;
  const tempo_formatado = `${String(minutos).padStart(2, '0')}:${String(segundosRestantes).padStart(2, '0')}`;

  const dbUser = obterBancoUsuario(req.usuarioId);
  const novaNota = {
    id: dbUser.notas.length > 0 ? Math.max(...dbUser.notas.map(n => n.id)) + 1 : 1,
    id_video: parseInt(id_video, 10),
    segundos: seg,
    tempo_formatado,
    texto: texto.trim(),
    criado_em: new Date().toISOString()
  };

  dbUser.notas.push(novaNota);
  salvarBancoUsuario(dbUser, req.usuarioId);
  res.status(201).json({ success: true, data: novaNota });
});

app.delete('/api/notas/:id', (req, res) => {
  const { id } = req.params;
  const idNum = parseInt(id, 10);
  const dbUser = obterBancoUsuario(req.usuarioId);
  const index = dbUser.notas.findIndex(n => n.id === idNum);

  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Anotação não encontrada.' });
  }

  dbUser.notas.splice(index, 1);
  salvarBancoUsuario(dbUser, req.usuarioId);
  res.json({ success: true, message: 'Anotação excluída com sucesso.' });
});

// ============================================================================== //
// ================= NOVOS PILARES LIFE OS: ROTINA & AGENDA + METAS ============= //
// ============================================================================== //

// --- 1. PRIORIDADES DO DIA (TOP 3 & CAIXA DE ENTRADA) ---
app.get('/api/rotina/prioridades', (req, res) => {
  const dbUser = obterBancoUsuario(req.usuarioId);
  res.json({ success: true, data: dbUser.prioridades_dia || [] });
});

app.post('/api/rotina/prioridades', (req, res) => {
  const { texto, top3 } = req.body;
  if (!texto || !texto.trim()) {
    return res.status(400).json({ success: false, message: 'Texto da tarefa é obrigatório.' });
  }

  const dbUser = obterBancoUsuario(req.usuarioId);
  if (!Array.isArray(dbUser.prioridades_dia)) dbUser.prioridades_dia = [];

  const novaTarefa = {
    id: dbUser.prioridades_dia.length > 0 ? Math.max(...dbUser.prioridades_dia.map(t => t.id)) + 1 : 1,
    texto: texto.trim(),
    concluida: false,
    top3: !!top3,
    criado_em: new Date().toISOString()
  };

  dbUser.prioridades_dia.push(novaTarefa);
  salvarBancoUsuario(dbUser, req.usuarioId);
  res.status(201).json({ success: true, data: novaTarefa });
});

app.patch('/api/rotina/prioridades/:id', (req, res) => {
  const idNum = parseInt(req.params.id, 10);
  const { concluida, top3, texto } = req.body;
  const dbUser = obterBancoUsuario(req.usuarioId);

  const tarefa = (dbUser.prioridades_dia || []).find(t => t.id === idNum);
  if (!tarefa) {
    return res.status(404).json({ success: false, message: 'Tarefa não encontrada.' });
  }

  if (typeof concluida === 'boolean') {
    tarefa.concluida = concluida;
    if (concluida) {
      tarefa.concluida_em = new Date().toISOString();
      // Registra no histórico de tarefas se ainda não estiver
      if (!Array.isArray(dbUser.historico_tarefas)) dbUser.historico_tarefas = [];
      const jaExiste = dbUser.historico_tarefas.some(h => h.id === tarefa.id);
      if (!jaExiste) {
        dbUser.historico_tarefas.unshift({
          id: tarefa.id,
          texto: tarefa.texto,
          top3: !!tarefa.top3,
          criado_em: tarefa.criado_em,
          concluida_em: tarefa.concluida_em,
          status: 'concluida'
        });
      }
    }
  }
  if (typeof top3 === 'boolean') tarefa.top3 = top3;
  if (typeof texto === 'string' && texto.trim()) tarefa.texto = texto.trim();

  salvarBancoUsuario(dbUser, req.usuarioId);
  res.json({ success: true, data: tarefa });
});

app.delete('/api/rotina/prioridades/:id', (req, res) => {
  const idNum = parseInt(req.params.id, 10);
  const dbUser = obterBancoUsuario(req.usuarioId);
  const idx = (dbUser.prioridades_dia || []).findIndex(t => t.id === idNum);

  if (idx === -1) {
    return res.status(404).json({ success: false, message: 'Tarefa não encontrada.' });
  }

  const [tarefaRemovida] = dbUser.prioridades_dia.splice(idx, 1);

  // Arquiva no histórico como 'excluida' para manter a rastreabilidade
  if (!Array.isArray(dbUser.historico_tarefas)) dbUser.historico_tarefas = [];
  dbUser.historico_tarefas.unshift({
    id: tarefaRemovida.id,
    texto: tarefaRemovida.texto,
    top3: !!tarefaRemovida.top3,
    criado_em: tarefaRemovida.criado_em,
    excluida_em: new Date().toISOString(),
    status: tarefaRemovida.concluida ? 'concluida' : 'excluida'
  });

  salvarBancoUsuario(dbUser, req.usuarioId);
  res.json({ success: true, message: 'Tarefa removida com sucesso.', data: tarefaRemovida });
});

// GET /api/rotina/historico-tarefas - Retorna todo o histórico de tarefas concluídas e arquivadas
app.get('/api/rotina/historico-tarefas', (req, res) => {
  const dbUser = obterBancoUsuario(req.usuarioId);
  if (!Array.isArray(dbUser.historico_tarefas)) dbUser.historico_tarefas = [];
  res.json({ success: true, data: dbUser.historico_tarefas });
});

// DELETE /api/rotina/historico-tarefas/:id - Limpa item individual do histórico
app.delete('/api/rotina/historico-tarefas/:id', (req, res) => {
  const idNum = parseInt(req.params.id, 10);
  const dbUser = obterBancoUsuario(req.usuarioId);
  if (!Array.isArray(dbUser.historico_tarefas)) dbUser.historico_tarefas = [];
  const idx = dbUser.historico_tarefas.findIndex(h => h.id === idNum);
  if (idx !== -1) {
    dbUser.historico_tarefas.splice(idx, 1);
    salvarBancoUsuario(dbUser, req.usuarioId);
  }
  res.json({ success: true, message: 'Item do histórico removido.' });
});

// DELETE /api/rotina/historico-tarefas - Limpa todo o histórico de tarefas
app.delete('/api/rotina/historico-tarefas', (req, res) => {
  const dbUser = obterBancoUsuario(req.usuarioId);
  dbUser.historico_tarefas = [];
  salvarBancoUsuario(dbUser, req.usuarioId);
  res.json({ success: true, message: 'Histórico de tarefas limpo com sucesso.' });
});

// --- 2. RASTREADOR DE HÁBITOS (HABIT TRACKER & STREAK) ---
app.get('/api/rotina/habitos', (req, res) => {
  const dbUser = obterBancoUsuario(req.usuarioId);
  res.json({ success: true, data: dbUser.habitos || [] });
});

app.post('/api/rotina/habitos', (req, res) => {
  const { nome, icone } = req.body;
  if (!nome || !nome.trim()) {
    return res.status(400).json({ success: false, message: 'Nome do hábito é obrigatório.' });
  }

  const dbUser = obterBancoUsuario(req.usuarioId);
  if (!Array.isArray(dbUser.habitos)) dbUser.habitos = [];

  const novoHabito = {
    id: dbUser.habitos.length > 0 ? Math.max(...dbUser.habitos.map(h => h.id)) + 1 : 1,
    nome: nome.trim(),
    icone: icone || '⚡',
    dias_concluidos: [], // lista de datas 'YYYY-MM-DD'
    streak: 0,
    criado_em: new Date().toISOString()
  };

  dbUser.habitos.push(novoHabito);
  salvarBancoUsuario(dbUser, req.usuarioId);
  res.status(201).json({ success: true, data: novoHabito });
});

app.post('/api/rotina/habitos/:id/checkin', (req, res) => {
  const idNum = parseInt(req.params.id, 10);
  const { data } = req.body; // 'YYYY-MM-DD' opcional, padrão hoje
  const dbUser = obterBancoUsuario(req.usuarioId);

  const habito = (dbUser.habitos || []).find(h => h.id === idNum);
  if (!habito) {
    return res.status(404).json({ success: false, message: 'Hábito não encontrado.' });
  }

  const hojeIso = data || new Date().toISOString().slice(0, 10);
  if (!Array.isArray(habito.dias_concluidos)) habito.dias_concluidos = [];

  const idx = habito.dias_concluidos.indexOf(hojeIso);
  if (idx !== -1) {
    // Desmarcar se já estava marcado
    habito.dias_concluidos.splice(idx, 1);
  } else {
    habito.dias_concluidos.push(hojeIso);
  }

  // Recalcula streak simples (dias consecutivos)
  const datasOrdenadas = [...habito.dias_concluidos].sort().reverse();
  let streak = 0;
  let cursor = new Date();
  for (let i = 0; i < 365; i++) {
    const cIso = cursor.toISOString().slice(0, 10);
    if (datasOrdenadas.includes(cIso)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else if (i === 0) {
      // Se não marcou hoje ainda, testa se marcou ontem
      cursor.setDate(cursor.getDate() - 1);
      const ontemIso = cursor.toISOString().slice(0, 10);
      if (datasOrdenadas.includes(ontemIso)) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    } else {
      break;
    }
  }
  habito.streak = streak;

  salvarBancoUsuario(dbUser, req.usuarioId);
  res.json({ success: true, data: habito });
});

app.delete('/api/rotina/habitos/:id', (req, res) => {
  const idNum = parseInt(req.params.id, 10);
  const dbUser = obterBancoUsuario(req.usuarioId);
  const idx = (dbUser.habitos || []).findIndex(h => h.id === idNum);

  if (idx === -1) {
    return res.status(404).json({ success: false, message: 'Hábito não encontrado.' });
  }

  dbUser.habitos.splice(idx, 1);
  salvarBancoUsuario(dbUser, req.usuarioId);
  res.json({ success: true, message: 'Hábito removido com sucesso.' });
});

// --- 3. AGENDA & COMPROMISSOS MANUAIS ---
app.get('/api/agenda/compromissos', (req, res) => {
  const dbUser = obterBancoUsuario(req.usuarioId);
  res.json({ success: true, data: dbUser.compromissos || [] });
});

app.post('/api/agenda/compromissos', (req, res) => {
  const { titulo, data, horario, categoria, local } = req.body;
  if (!titulo || !data) {
    return res.status(400).json({ success: false, message: 'Título e data são obrigatórios.' });
  }

  const dbUser = obterBancoUsuario(req.usuarioId);
  if (!Array.isArray(dbUser.compromissos)) dbUser.compromissos = [];

  const novoComp = {
    id: dbUser.compromissos.length > 0 ? Math.max(...dbUser.compromissos.map(c => c.id)) + 1 : 1,
    titulo: titulo.trim(),
    data: data.slice(0, 10), // 'YYYY-MM-DD'
    horario: horario || '09:00',
    categoria: categoria || 'pessoal', // 'pessoal' | 'financas' | 'estudos' | 'trabalho'
    local: local || '',
    criado_em: new Date().toISOString()
  };

  dbUser.compromissos.push(novoComp);
  salvarBancoUsuario(dbUser, req.usuarioId);
  res.status(201).json({ success: true, data: novoComp });
});

app.delete('/api/agenda/compromissos/:id', (req, res) => {
  const idNum = parseInt(req.params.id, 10);
  const dbUser = obterBancoUsuario(req.usuarioId);
  const idx = (dbUser.compromissos || []).findIndex(c => c.id === idNum);

  if (idx === -1) {
    return res.status(404).json({ success: false, message: 'Compromisso não encontrado.' });
  }

  dbUser.compromissos.splice(idx, 1);
  salvarBancoUsuario(dbUser, req.usuarioId);
  res.json({ success: true, message: 'Compromisso removido com sucesso.' });
});

// --- 4. AGENDA DE HOJE INTEGRADA (MANUAL + FINANÇAS + EDUCAÇÃO) ---
app.get('/api/agenda/hoje-integrado', async (req, res) => {
  try {
    const hoje = new Date();
    const hojeIso = hoje.toISOString().slice(0, 10);
    const diasSemanaNomes = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const diaHojeNome = diasSemanaNomes[hoje.getDay()];

    const dbUser = obterBancoUsuario(req.usuarioId);

    // 1. Compromissos manuais para hoje
    const manuaisHoje = (dbUser.compromissos || [])
      .filter(c => c.data === hojeIso)
      .map(c => ({
        tipo: 'manual',
        categoria: c.categoria || 'pessoal',
        titulo: c.titulo,
        horario: c.horario || '09:00',
        origem: 'Agenda Pessoal'
      }));

    // 2. Aulas de hoje agendadas no cronograma
    const aulasHoje = (dbUser.agendamentos || [])
      .filter(a => a.dia_semana && a.dia_semana.toLowerCase() === diaHojeNome.toLowerCase())
      .map(a => {
        const v = (dbUser.videos || []).find(vid => vid.id === a.id_video);
        return {
          tipo: 'estudo',
          categoria: 'estudos',
          titulo: v ? `Aula: ${v.titulo}` : 'Aula de Estudo Agendada',
          horario: 'Dia de Estudo',
          origem: 'Módulo Educação'
        };
      });

    // 3. Vencimentos de contas para hoje (obtidos da base de Finanças se disponível)
    const contasHoje = [];
    try {
      const mesAtual = hojeIso.slice(0, 7);
      const authHeader = req.headers['authorization'];
      const respFin = await fetch(`http://localhost:3001/api/dados?mes=${mesAtual}`, {
        headers: authHeader ? { 'Authorization': authHeader } : {}
      });
      if (respFin.ok) {
        const dadosFin = await respFin.json();
        const diaAtualNum = hoje.getDate();
        (dadosFin.despesas || []).forEach(d => {
          if (d.data_vencimento === diaAtualNum || d.dia_vencimento === diaAtualNum) {
            contasHoje.push({
              tipo: 'financas',
              categoria: 'financas',
              titulo: `Vencimento: ${d.descricao || 'Despesa'} (R$ ${Number(d.valor || 0).toFixed(2)})`,
              horario: 'Vence Hoje',
              origem: 'Módulo Finanças'
            });
          }
        });
      }
    } catch (e) {
      console.warn('Não foi possível cruzar vencimentos financeiros para hoje:', e.message);
    }

    const agendaHoje = [...manuaisHoje, ...aulasHoje, ...contasHoje];
    res.json({
      success: true,
      data: agendaHoje,
      dataIso: hojeIso,
      diaSemana: diaHojeNome
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// --- 5. METAS (FINANCEIRAS, ESTUDOS E PESSOAIS) ---
app.get('/api/metas', async (req, res) => {
  try {
    const dbUser = obterBancoUsuario(req.usuarioId);
    let metas = dbUser.metas || [];

    // Calcula progresso dinâmico para metas de Estudos e Finanças
    const totalAulas = (dbUser.videos || []).length;
    const aulasConcluidas = (dbUser.videos || []).filter(v => v.concluido).length;

    metas = metas.map(m => {
      let progresso = Number(m.progresso || 0);

      if (m.tipo === 'estudos') {
        progresso = totalAulas > 0 ? Math.round((aulasConcluidas / totalAulas) * 100) : 0;
        m.valor_atual = aulasConcluidas;
        m.valor_alvo = totalAulas;
      } else if (m.tipo === 'pessoal' && Array.isArray(m.checklist) && m.checklist.length > 0) {
        const totalSteps = m.checklist.length;
        const doneSteps = m.checklist.filter(s => s.concluido).length;
        progresso = Math.round((doneSteps / totalSteps) * 100);
      }

      return {
        ...m,
        progresso: Math.min(100, Math.max(0, progresso))
      };
    });

    res.json({ success: true, data: metas });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/metas', (req, res) => {
  const { titulo, tipo, valor_alvo, valor_atual, prazo, checklist } = req.body;
  if (!titulo || !titulo.trim()) {
    return res.status(400).json({ success: false, message: 'Título da meta é obrigatório.' });
  }

  const dbUser = obterBancoUsuario(req.usuarioId);
  if (!Array.isArray(dbUser.metas)) dbUser.metas = [];

  const novaMeta = {
    id: dbUser.metas.length > 0 ? Math.max(...dbUser.metas.map(m => m.id)) + 1 : 1,
    titulo: titulo.trim(),
    tipo: tipo || 'pessoal', // 'financeira' | 'estudos' | 'pessoal'
    valor_alvo: Number(valor_alvo) || 100,
    valor_atual: Number(valor_atual) || 0,
    progresso: 0,
    prazo: prazo || '',
    checklist: Array.isArray(checklist) ? checklist : [],
    criado_em: new Date().toISOString()
  };

  // Cálculo inicial de progresso
  if (novaMeta.tipo === 'financeira' && novaMeta.valor_alvo > 0) {
    novaMeta.progresso = Math.min(100, Math.round((novaMeta.valor_atual / novaMeta.valor_alvo) * 100));
  } else if (novaMeta.tipo === 'pessoal' && novaMeta.checklist.length > 0) {
    const done = novaMeta.checklist.filter(s => s.concluido).length;
    novaMeta.progresso = Math.round((done / novaMeta.checklist.length) * 100);
  }

  dbUser.metas.push(novaMeta);
  salvarBancoUsuario(dbUser, req.usuarioId);
  res.status(201).json({ success: true, data: novaMeta });
});

app.patch('/api/metas/:id', (req, res) => {
  const idNum = parseInt(req.params.id, 10);
  const { titulo, valor_atual, checklist, prazo } = req.body;
  const dbUser = obterBancoUsuario(req.usuarioId);

  const meta = (dbUser.metas || []).find(m => m.id === idNum);
  if (!meta) {
    return res.status(404).json({ success: false, message: 'Meta não encontrada.' });
  }

  if (typeof titulo === 'string' && titulo.trim()) meta.titulo = titulo.trim();
  if (prazo !== undefined) meta.prazo = prazo;
  if (valor_atual !== undefined && !isNaN(Number(valor_atual))) {
    meta.valor_atual = Number(valor_atual);
    if (meta.valor_alvo > 0) {
      meta.progresso = Math.min(100, Math.round((meta.valor_atual / meta.valor_alvo) * 100));
    }
  }
  if (Array.isArray(checklist)) {
    meta.checklist = checklist;
    if (meta.checklist.length > 0) {
      const done = meta.checklist.filter(s => s.concluido).length;
      meta.progresso = Math.round((done / meta.checklist.length) * 100);
    }
  }

  salvarBancoUsuario(dbUser, req.usuarioId);
  res.json({ success: true, data: meta });
});

app.delete('/api/metas/:id', (req, res) => {
  const idNum = parseInt(req.params.id, 10);
  const dbUser = obterBancoUsuario(req.usuarioId);
  const idx = (dbUser.metas || []).findIndex(m => m.id === idNum);

  if (idx === -1) {
    return res.status(404).json({ success: false, message: 'Meta não encontrada.' });
  }

  dbUser.metas.splice(idx, 1);
  salvarBancoUsuario(dbUser, req.usuarioId);
  res.json({ success: true, message: 'Meta removida com sucesso.' });
});

// ================= ROTA DE CONFIRMAÇÃO DIRETA DE VÍDEO (OPÇÃO 2) ================= //

app.post('/api/ai/confirmar-video', aiRateLimiter, (req, res) => {
  const { videoSelecionado, diasAlvo } = req.body;

  if (!videoSelecionado || !videoSelecionado.url_youtube || !videoSelecionado.titulo) {
    return res.status(400).json({ success: false, message: 'Dados do vídeo inválidos.' });
  }

  const dbUser = obterBancoUsuario(req.usuarioId);
  let topicoDestino = dbUser.topicos.find(t => t.nome.toLowerCase().includes('vendas') || t.nome.toLowerCase().includes('conteúdos'));
  if (!topicoDestino) {
    topicoDestino = {
      id: dbUser.topicos.length > 0 ? Math.max(...dbUser.topicos.map(t => t.id)) + 1 : 1,
      nome: "Vendas & Negociação"
    };
    dbUser.topicos.push(topicoDestino);
  }

  let videoFinal = dbUser.videos.find(v => v.url_youtube.includes(videoSelecionado.youtubeId) || v.titulo === videoSelecionado.titulo);
  if (!videoFinal) {
    videoFinal = {
      id: dbUser.videos.length > 0 ? Math.max(...dbUser.videos.map(v => v.id)) + 1 : 1,
      titulo: videoSelecionado.titulo,
      url_youtube: videoSelecionado.url_youtube,
      id_topico: topicoDestino.id
    };
    dbUser.videos.push(videoFinal);
  }

  const dias = Array.isArray(diasAlvo) && diasAlvo.length > 0 ? diasAlvo : ['Segunda'];
  const acoes = [];

  dias.forEach(dia => {
    const novoAg = {
      id: dbUser.agendamentos.length > 0 ? Math.max(...dbUser.agendamentos.map(a => a.id)) + 1 : 1,
      dia_semana: dia,
      id_video: videoFinal.id
    };
    dbUser.agendamentos.push(novoAg);
    acoes.push(`Agendado para ${dia}: "${videoFinal.titulo}"`);
  });

  salvarBancoUsuario(dbUser, req.usuarioId);

  res.json({
    success: true,
    mensagem: `Excelente escolha! O vídeo "${videoFinal.titulo}" foi confirmado e agendado com sucesso para ${dias.join(', ')}.`,
    acoesExecutadas: acoes
  });
});

// ================= MOTOR DE IA COM PRÉVIAS INTERATIVAS ================= //

app.post('/api/ai/chat', aiRateLimiter, async (req, res) => {
  const { prompt } = req.body;

  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ success: false, message: 'Mensagem vazia.' });
  }

  try {
    const dbUser = obterBancoUsuario(req.usuarioId);
    const resultado = await processarComandoInteligente(prompt.trim(), dbUser);
    salvarBancoUsuario(dbUser, req.usuarioId);

    res.json({
      success: true,
      mensagem: resultado.mensagem,
      acoesExecutadas: resultado.acoesExecutadas,
      opcoesSugeridas: resultado.opcoesSugeridas || null,
      diasAlvo: resultado.diasAlvo || []
    });
  } catch (error) {
    console.error('[AI Error]', error);
    res.status(500).json({ success: false, message: 'Erro ao processar comando de IA.' });
  }
});

async function processarComandoInteligente(prompt, dbUser) {
  const dbAlvo = dbUser || db;
  const p = prompt.toLowerCase();
  const acoesExecutadas = [];
  let mensagem = '';
  let opcoesSugeridas = null;

  const DIAS = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];
  const DIAS_CAP = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

  let diasAlvo = [];
  if (p.includes('7') || p.includes('sete') || p.includes('todos') || p.includes('semana') || p.includes('proximos')) {
    diasAlvo = [...DIAS_CAP];
  } else {
    DIAS.forEach((d, idx) => {
      if (p.includes(d)) diasAlvo.push(DIAS_CAP[idx]);
    });
  }

  // 1. Remoção / Limpeza
  const isRemover = p.includes('tire') || p.includes('tira') || p.includes('tirar') ||
                    p.includes('remova') || p.includes('remover') || p.includes('apague') ||
                    p.includes('apagar') || p.includes('limpe') || p.includes('limpar') ||
                    p.includes('exclua') || p.includes('excluir');

  if (isRemover) {
    if (p.includes('todos') || p.includes('tudo') || p.includes('cronograma') || p.includes('que pedi') || p.includes('da semana')) {
      const qtd = dbAlvo.agendamentos.length;
      dbAlvo.agendamentos = [];
      acoesExecutadas.push(`Removidas ${qtd} aulas do cronograma`);

      if (p.includes('videos que pedi') || p.includes('vídeos que pedi') || p.includes('apagar os videos')) {
        const videosRemovidos = dbAlvo.videos.filter(v => v.id_topico > 2 || v.titulo.toLowerCase().includes('matheus'));
        dbAlvo.videos = dbAlvo.videos.filter(v => !videosRemovidos.some(vr => vr.id === v.id));
        if (videosRemovidos.length > 0) {
          acoesExecutadas.push(`Excluídos ${videosRemovidos.length} vídeo(s) do catálogo`);
        }
      }

      mensagem = `Entendido! Limpei o cronograma e removi as aulas que você havia solicitado.`;
      return { mensagem, acoesExecutadas };
    }

    if (diasAlvo.length > 0) {
      diasAlvo.forEach(dia => {
        dbAlvo.agendamentos = dbAlvo.agendamentos.filter(a => a.dia_semana !== dia);
        acoesExecutadas.push(`Aulas desmarcadas de ${dia}`);
      });
      mensagem = `Aulas de ${diasAlvo.join(', ')} removidas com sucesso!`;
      return { mensagem, acoesExecutadas };
    }
  }

  // 2. Busca no YouTube com Prévia e Confirmação
  const isBuscarYouTube = p.includes('youtube') || p.includes('canal') || p.includes('matheus') ||
                          p.includes('procure') || p.includes('pesquise') || p.includes('busque') ||
                          p.includes('vendas') || p.includes('venda');

  if (isBuscarYouTube) {
    let termoBusca = 'Matheus Borges vendas';
    let palavrasChaveFiltro = ['venda', 'vendas', 'negociação', 'comercial', 'fechamento', 'prospecção', 'lead'];

    if (p.includes('vendas') || p.includes('venda')) {
      termoBusca = p.includes('matheus') ? 'Matheus Borges vendas negociação' : 'técnicas de vendas negociação comercial';
    } else if (p.includes('matheus borges')) {
      termoBusca = 'Matheus Borges negócios vendas';
    } else {
      const match = p.match(/(?:canal|do|sobre|de|video de)\s+([a-zA-Z0-9_\sÀ-ÿ]{3,35})/i);
      if (match && match[1]) {
        termoBusca = match[1].replace(/no youtube|durante|os proximos|dias|proximos|coloque|agende|1 video/gi, '').trim();
      }
    }

    const resultados = await buscarNoYouTube(termoBusca, palavrasChaveFiltro);

    if (resultados && resultados.length > 0) {
      previasAtivas = resultados;
      opcoesSugeridas = resultados;

      const diasTexto = diasAlvo.length > 0 ? `para agendar em **${diasAlvo.join(', ')}**` : `para o seu cronograma`;

      mensagem = `Encontrei as melhores opções no YouTube sobre esse tema ${diasTexto}.\n\n` +
                 `**Qual desses vídeos você prefere que eu agende?** Clique no botão do vídeo abaixo para confirmar com 1 clique:`;

      return {
        mensagem,
        acoesExecutadas: [],
        opcoesSugeridas,
        diasAlvo: diasAlvo.length > 0 ? diasAlvo : ['Segunda']
      };
    }
  }

  // 3. Escolha numérica
  const matchNumero = p.match(/(?:o|opção|opcao|video|vídeo|numero|número)?\s*([1-4])/i);
  if (matchNumero && previasAtivas.length > 0) {
    const idx = parseInt(matchNumero[1], 10) - 1;
    const escolhido = previasAtivas[idx];

    if (escolhido) {
      const dias = diasAlvo.length > 0 ? diasAlvo : ['Segunda'];
      let topicoDestino = dbAlvo.topicos.find(t => t.nome.toLowerCase().includes('vendas') || t.nome.toLowerCase().includes('conteúdos')) || dbAlvo.topicos[0];
      if (!topicoDestino) {
        topicoDestino = { id: 1, nome: "Geral" };
        dbAlvo.topicos.push(topicoDestino);
      }
      
      let vExistente = dbAlvo.videos.find(v => v.url_youtube.includes(escolhido.youtubeId));
      if (!vExistente) {
        vExistente = {
          id: dbAlvo.videos.length > 0 ? Math.max(...dbAlvo.videos.map(v => v.id)) + 1 : 1,
          titulo: escolhido.titulo,
          url_youtube: escolhido.url_youtube,
          id_topico: topicoDestino.id
        };
        dbAlvo.videos.push(vExistente);
      }

      dias.forEach(dia => {
        dbAlvo.agendamentos.push({
          id: dbAlvo.agendamentos.length > 0 ? Math.max(...dbAlvo.agendamentos.map(a => a.id)) + 1 : 1,
          dia_semana: dia,
          id_video: vExistente.id
        });
        acoesExecutadas.push(`Agendado para ${dia}: "${vExistente.titulo}"`);
      });

      mensagem = `Confirmado! O vídeo **"${escolhido.titulo}"** foi adicionado e agendado com sucesso para ${dias.join(', ')}.`;
      previasAtivas = [];
      return { mensagem, acoesExecutadas };
    }
  }

  // 4. Agendamento tradicional local
  const isAgendar = p.includes('agend') || p.includes('program') || p.includes('coloc') || p.includes('marque');
  if (isAgendar && diasAlvo.length > 0 && dbAlvo.videos.length > 0) {
    diasAlvo.forEach((dia, idx) => {
      let videoEscolhido = dbAlvo.videos[idx % dbAlvo.videos.length];
      dbAlvo.videos.forEach(v => {
        const tit = v.titulo.toLowerCase();
        tit.split(' ').forEach(w => {
          if (w.length > 4 && p.includes(w)) videoEscolhido = v;
        });
      });

      dbAlvo.agendamentos.push({
        id: dbAlvo.agendamentos.length > 0 ? Math.max(...dbAlvo.agendamentos.map(a => a.id)) + 1 : 1,
        dia_semana: dia,
        id_video: videoEscolhido.id
      });
      acoesExecutadas.push(`Agendado "${videoEscolhido.titulo}" para ${dia}`);
    });

    mensagem = `Aulas agendadas nos dias solicitados (${diasAlvo.join(', ')}).`;
    return { mensagem, acoesExecutadas };
  }

  mensagem = `Posso encontrar vídeos específicos no YouTube com prévia de confirmação ou gerenciar seu cronograma! Experimente pedir:\n` +
             `• **"Coloque 1 vídeo de vendas do canal Matheus Borges durante os próximos 7 dias"**\n` +
             `• **"Tire todos os vídeos do cronograma"**`;

  return { mensagem, acoesExecutadas };
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Portal Nexus Corporativo] Servidor ativo em http://0.0.0.0:${PORT}`);
  console.log(`[Database] Banco de dados persistente conectado: ${DB_FILE}`);
  console.log(`[Finanças Integrado] Aplicação de Finanças disponível em http://localhost:${PORT}/financas-app`);
});
