require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { initPushService } = require('./push-service');
const { processarMensagemGroq } = require('./groq-assistant');
const { abrirPortalPostgres } = require('./portal-postgres');
const { randomBytes, randomUUID, timingSafeEqual } = require('node:crypto');
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
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || randomBytes(32).toString('hex');

function autenticarTokenPortal(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.match(/^Bearer (\S+)$/i)?.[1];

  if (!token) {
    return res.status(401).json({ success: false, error: 'Entre para acessar sua conta.' });
  }

  jwt.verify(token, JWT_SECRET, async (err, user) => {
    if (err || !Number.isSafeInteger(user?.id) || user.id < 1) {
      return res.status(401).json({ success: false, error: 'Sessão inválida ou expirada.' });
    }
    req.usuarioId = user.id;
    req.usuarioNome = user.nome;
    req.usuarioEmail = user.email;
    if (portalPostgres) {
      try {
        if (!await portalPostgres.contaExiste(user.id)) {
          return res.status(401).json({ success: false, error: 'Conta indisponível.' });
        }
      } catch {
        return res.status(503).json({ success: false, error: 'Não foi possível consultar a conta.' });
      }
    }
    next();
  });
}

// Middlewares essenciais
app.use(express.json({ limit: '2mb' }));

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

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
let FINANCAS_PUBLIC = path.join(__dirname, 'finance-tracker', 'public');
if (!fs.existsSync(FINANCAS_PUBLIC)) {
  FINANCAS_PUBLIC = path.join(__dirname, '..', 'finance-tracker', 'public');
}
if (fs.existsSync(FINANCAS_PUBLIC)) {
  app.use('/financas-app', express.static(FINANCAS_PUBLIC));
  // Servir rotas diretas caso o frontend do Finanças busque na raiz
  app.get('/login.html', (req, res) => res.sendFile(path.join(FINANCAS_PUBLIC, 'login.html')));
  app.get('/layout.css', (req, res) => res.sendFile(path.join(FINANCAS_PUBLIC, 'layout.css')));
  app.get('/logo.jpg', (req, res) => res.sendFile(path.join(FINANCAS_PUBLIC, 'logo.jpg')));
  app.get('/investimentos-dashboard.js', (req, res) => {
    res.sendFile(path.join(FINANCAS_PUBLIC, 'investimentos-dashboard.js'));
  });
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
app.get('/api/health', async (req, res) => {
  try {
    const finance = await fetch(`http://127.0.0.1:${FINANCE_API_PORT}/api/health`, {
      signal: AbortSignal.timeout(3000)
    });
    await finance.body?.cancel();
    if (finance.ok) return res.json({ status: 'ok' });
  } catch (error) {
    console.warn('[Health] Backend de Finanças indisponível:', error.message);
  }
  return res.status(503).json({ status: 'unavailable' });
});

['/api/auth', '/api/dados', '/api/potes', '/api/entradas', '/api/despesas', '/api/limites', '/api/projetos', '/api/analyze', '/api/simulate', '/api/chat', '/api/invest-advice', '/api/investimentos'].forEach(route => {
  app.all(route + '*', async (req, res) => {
    try {
      const targetUrl = `http://127.0.0.1:${FINANCE_API_PORT}${req.originalUrl}`;
      const headers = { ...req.headers };
      // O fetch calcula o tamanho do JSON serializado pelo proxy.
      delete headers.host;
      delete headers['content-length'];
      delete headers['transfer-encoding'];
      
      const options = {
        method: req.method,
        headers
      };
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.is('application/json') && req.body !== undefined) {
        options.headers['content-type'] = 'application/json';
        delete options.headers['content-encoding'];
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

// ================= ROTAS PÚBLICAS DE WEB PUSH (CHAVE VAPID & CRON CHECK) ================= //
let pushService = null;

app.get('/api/push/public-key', (req, res) => {
  if (!pushService || !pushService.isEnabled()) {
    return res.json({ success: true, enabled: false, publicKey: null });
  }
  res.json({ success: true, enabled: true, publicKey: pushService.getPublicKey() });
});

app.get('/api/push/check', async (req, res) => {
  const esperado = Buffer.from(process.env.PUSH_CRON_SECRET || '');
  if (esperado.length > 0) {
    const recebido = Buffer.from(req.get('Authorization') || '');
    const autorizacao = Buffer.concat([Buffer.from('Bearer '), esperado]);
    if (recebido.length !== autorizacao.length || !timingSafeEqual(recebido, autorizacao)) {
      return res.status(401).json({ success: false, error: 'Verificação de alertas não autorizada.' });
    }
  }
  try {
    if (!pushService || !pushService.isEnabled()) {
      return res.json({ success: true, enabled: false, checkedUsers: 0, sent: 0 });
    }
    const result = await pushService.checkAndDispatchDueNotifications();
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[WebPush Check Error]', err.message);
    res.status(500).json({ success: false, error: 'Erro ao verificar notificações pendentes.' });
  }
});

function rotaPortal(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
}

app.use('/api', autenticarTokenPortal);

app.get('/api/meus-dados', rotaPortal(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const portal = await obterBancoUsuario(req.usuarioId);
    const resposta = await fetch(`http://127.0.0.1:${FINANCE_API_PORT}/api/dados/exportacao`, {
      headers: { Authorization: req.headers.authorization },
      signal: AbortSignal.timeout(15000)
    });
    if (!resposta.ok) {
      await resposta.body?.cancel();
      return res.status(503).json({ success: false, error: 'Finanças indisponível. Tente exportar novamente.' });
    }
    const { dados: financas } = await resposta.json();
    if (!financas || typeof financas !== 'object') throw new Error('Resposta de exportação inválida.');
    const campos = ['topicos', 'videos', 'notas', 'agendamentos', 'prioridades_dia', 'historico_tarefas', 'habitos', 'compromissos', 'metas'];
    const estudosRotina = Object.fromEntries(campos.map(campo => [campo, portal[campo] || []]));
    estudosRotina.planos_semanais = Object.values(portal.planos_semanais || {});
    estudosRotina.perfil = portal.perfil || {};
    estudosRotina.estudos_os = garantirEstruturaEstudosOS(portal);
    res.attachment('converge-meus-dados.json');
    res.json({ versao: 1, exportado_em: new Date().toISOString(), portal: estudosRotina, financas });
  } catch (erro) {
    console.error('[Exportação da conta]', erro.message);
    res.status(503).json({ success: false, error: 'Não foi possível exportar seus dados. Tente novamente.' });
  }
}));

app.get('/api/perfil-portal', rotaPortal(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const dados = await obterBancoUsuario(req.usuarioId);
  res.json({ data: dados.perfil || {} });
}));

app.patch('/api/perfil-portal', rotaPortal(async (req, res) => {
  const { foco, foto, meta, aba, semana, sugestaoDispensada } = req.body || {};
  const dados = await obterBancoUsuario(req.usuarioId);
  const perfil = { ...dados.perfil };
  const fotoValida = typeof foto === 'string' && foto.length <= 80000 &&
    /^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(foto);
  if ((foco !== undefined && (typeof foco !== 'string' || foco.length > 160)) ||
      (foto !== undefined && foto !== null && !fotoValida) ||
      (meta !== undefined && meta !== null && !dados.metas.some(item => item.id === meta)) ||
      (aba !== undefined && !['inicio', 'checklist', 'agenda', 'metas', 'perfil'].includes(aba)) ||
      (semana !== undefined && ![0, 1].includes(semana)) ||
      (sugestaoDispensada !== undefined && !dataAgendaValida(sugestaoDispensada))) {
    return res.status(400).json({ error: 'Confira os dados do perfil e tente novamente.' });
  }
  for (const [chave, valor] of Object.entries({ foco, foto, meta, aba, semana, sugestaoDispensada })) {
    if (valor !== undefined) perfil[chave] = valor;
  }
  dados.perfil = perfil;
  await salvarBancoUsuario(dados, req.usuarioId);
  res.json({ data: perfil });
}));

// ================= ROTAS AUTENTICADAS DE WEB PUSH ================= //
app.post('/api/push/convite', rotaPortal(async (req, res) => {
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const dados = await obterBancoUsuario(req.usuarioId);
    if (dados.convite_push_exibido) return res.json({ exibir: false });
    dados.convite_push_exibido = true;
    try {
      await salvarBancoUsuario(dados, req.usuarioId);
      return res.json({ exibir: true });
    } catch (erro) {
      if (erro.status !== 409 || tentativa === 2) throw erro;
    }
  }
}));

app.get('/api/push/status', rotaPortal(async (req, res) => {
  if (!pushService) {
    return res.json({ success: true, enabled: false, subscribedCount: 0 });
  }
  res.json({ success: true, ...await pushService.getStatusForUser(req.usuarioId) });
}));

app.post('/api/push/subscribe', rotaPortal(async (req, res) => {
  try {
    if (!pushService || !pushService.isEnabled()) {
      return res.status(503).json({ success: false, error: 'Web Push indisponível no servidor.' });
    }
    const { subscription, timezone, device } = req.body || {};
    const result = await pushService.subscribeUser(req.usuarioId, subscription, { timezone, device });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
}));

app.post('/api/push/unsubscribe', rotaPortal(async (req, res) => {
  try {
    if (!pushService) return res.json({ success: true, subscribedCount: 0 });
    const { endpoint } = req.body || {};
    const result = await pushService.unsubscribeUser(req.usuarioId, endpoint);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
}));

// ================= CONVERGE IA UNIFICADA (GROQ FUNCTION CALLING) ================= //
app.post('/api/groq-ia', aiRateLimiter, rotaPortal(async (req, res) => {
  const { mensagem, historico } = req.body || {};
  if (!mensagem || !String(mensagem).trim()) {
    return res.status(400).json({ success: false, error: 'Digite uma mensagem para a CONVERGE IA.' });
  }
  const resultado = await processarMensagemGroq({
    mensagem,
    historico: Array.isArray(historico) ? historico : [],
    contexto: {
      usuarioId: req.usuarioId,
      authHeader: req.headers.authorization,
      financePort: FINANCE_API_PORT,
      obterBancoUsuario,
      salvarBancoUsuario,
      adicionarPrioridade
    }
  });
  if (!resultado.success) {
    return res.status(400).json(resultado);
  }
  res.json(resultado);
}));

app.post('/api/push/test', async (req, res) => {
  try {
    if (!pushService || !pushService.isEnabled()) {
      return res.status(503).json({ success: false, error: 'Web Push indisponível no servidor.' });
    }
    const result = await pushService.sendPushToUser(req.usuarioId, {
      title: '🔔 CONVERGE Conectado!',
      body: 'Notificações Push ativas no seu celular (iOS/Android) mesmo com o site fechado.',
      tag: 'converge-push-test',
      url: '/'
    }, req.body?.endpoint);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ================= BANCO DE DADOS PERSISTENTE EM ARQUIVO JSON ================= //
const DATA_DIR = process.env.CONVERGE_DATA_DIR
  ? path.resolve(process.env.CONVERGE_DATA_DIR, 'portal')
  : path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

if (!process.env.DATABASE_URL && !fs.existsSync(DATA_DIR)) {
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

let portalPostgres = null;

function garantirEstruturaEstudosOS(dados) {
  if (!dados.estudos_os || typeof dados.estudos_os !== 'object' || Array.isArray(dados.estudos_os)) {
    dados.estudos_os = {};
  }
  const os = dados.estudos_os;
  for (const col of ['materias', 'paginas', 'flashcards', 'erros', 'provas', 'leituras', 'sessoes_foco']) {
    if (!Array.isArray(os[col])) os[col] = [];
  }
  if (!os.synced_blocks || typeof os.synced_blocks !== 'object' || Array.isArray(os.synced_blocks)) {
    os.synced_blocks = {};
  }
  return os;
}

async function obterBancoUsuario(usuarioId) {
  const dados = portalPostgres ? await portalPostgres.carregar(usuarioId) : obterBancoLocal(usuarioId);
  for (const campo of ['topicos', 'videos', 'agendamentos', 'notas', 'prioridades_dia', 'historico_tarefas', 'habitos', 'compromissos', 'metas', 'push_subscriptions']) {
    if (!Array.isArray(dados[campo])) dados[campo] = [];
  }
  if (!dados.push_notificados || typeof dados.push_notificados !== 'object') dados.push_notificados = {};
  garantirEstruturaEstudosOS(dados);
  return dados;
}

async function salvarBancoUsuario(dados, usuarioId, anterior = dados) {
  if (portalPostgres) return portalPostgres.salvar(dados, usuarioId, anterior);
  salvarBancoLocal(dados, usuarioId);
}

function obterBancoLocal(usuarioId) {
  const uid = usuarioId;
  const userFile = path.join(DATA_DIR, `database_user_${uid}.json`);

  // Se o arquivo do usuário ainda não existir
  if (!fs.existsSync(userFile)) {
    // O arquivo legado só pode ser importado para um titular confirmado no ambiente.
    if (String(uid) === process.env.LEGACY_PORTAL_USER_ID && fs.existsSync(DB_FILE)) {
      const dados = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
      salvarBancoLocal(dados, uid);
    } else {
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
      salvarBancoLocal(dadosZerados, uid);
      return dadosZerados;
    }
  }

  try {
    const conteudo = fs.readFileSync(userFile, 'utf-8');
    const dados = JSON.parse(conteudo);
    if (!Array.isArray(dados.prioridades_dia)) dados.prioridades_dia = [];
    if (!Array.isArray(dados.habitos)) dados.habitos = [];
    if (!Array.isArray(dados.compromissos)) dados.compromissos = [];
    if (!Array.isArray(dados.metas)) dados.metas = [];
    if (!Array.isArray(dados.push_subscriptions)) dados.push_subscriptions = [];
    if (!dados.push_notificados || typeof dados.push_notificados !== 'object') dados.push_notificados = {};
    return dados;
  } catch (err) {
    console.error(`[Database Error] Falha ao ler banco do usuario ${uid}:`, err);
    throw err;
  }
}

function salvarBancoLocal(dados, usuarioId) {
  const uid = usuarioId;
  const userFile = path.join(DATA_DIR, `database_user_${uid}.json`);
  const tempFile = `${userFile}.tmp`;
  try {
    fs.writeFileSync(tempFile, JSON.stringify(dados, null, 2), 'utf-8');
    fs.renameSync(tempFile, userFile);
  } catch (error) {
    console.error(`[Database Error] Falha ao persistir dados do usuario ${uid}:`, error);
    throw error;
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

const db = process.env.DATABASE_URL ? null : lerBanco();
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

app.get('/api/topicos', rotaPortal(async (req, res) => {
  const dbUser = await obterBancoUsuario(req.usuarioId);
  res.json({ success: true, data: dbUser.topicos });
}));

app.post('/api/topicos', rotaPortal(async (req, res) => {
  const { nome } = req.body;
  if (!nome || !nome.trim()) {
    return res.status(400).json({ success: false, message: 'O nome do tópico é obrigatório.' });
  }

  const dbUser = await obterBancoUsuario(req.usuarioId);
  const novoTopico = {
    id: dbUser.topicos.length > 0 ? Math.max(...dbUser.topicos.map(t => t.id)) + 1 : 1,
    nome: nome.trim()
  };

  dbUser.topicos.push(novoTopico);
  await salvarBancoUsuario(dbUser, req.usuarioId);
  res.status(201).json({ success: true, data: novoTopico });
}));

app.put('/api/topicos/:id', rotaPortal(async (req, res) => {
  const { id } = req.params;
  const { nome } = req.body;
  const idNum = parseInt(id, 10);

  if (!nome || !nome.trim()) {
    return res.status(400).json({ success: false, message: 'O nome do tópico é obrigatório.' });
  }

  const dbUser = await obterBancoUsuario(req.usuarioId);
  const topico = dbUser.topicos.find(t => t.id === idNum);
  if (!topico) {
    return res.status(404).json({ success: false, message: 'Tópico não encontrado.' });
  }

  topico.nome = nome.trim();
  await salvarBancoUsuario(dbUser, req.usuarioId);
  res.json({ success: true, data: topico });
}));

app.delete('/api/topicos/:id', rotaPortal(async (req, res) => {
  const { id } = req.params;
  const idNum = parseInt(id, 10);

  const dbUser = await obterBancoUsuario(req.usuarioId);
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

  await salvarBancoUsuario(dbUser, req.usuarioId);
  res.json({ success: true, message: 'Tópico e aulas vinculadas excluídos com sucesso.' });
}));

// ================= ROTAS DE VÍDEOS ================= //

app.get('/api/videos', rotaPortal(async (req, res) => {
  const { id_topico } = req.query;
  const dbUser = await obterBancoUsuario(req.usuarioId);
  let resultado = dbUser.videos;

  if (id_topico) {
    const topicoIdNum = parseInt(id_topico, 10);
    resultado = dbUser.videos.filter(v => v.id_topico === topicoIdNum);
  }

  res.json({ success: true, data: resultado });
}));

app.post('/api/videos', rotaPortal(async (req, res) => {
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

  const dbUser = await obterBancoUsuario(req.usuarioId);
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
  await salvarBancoUsuario(dbUser, req.usuarioId);
  res.status(201).json({ success: true, data: novoVideo });
}));

app.delete('/api/videos/:id', rotaPortal(async (req, res) => {
  const { id } = req.params;
  const idNum = parseInt(id, 10);

  const dbUser = await obterBancoUsuario(req.usuarioId);
  const index = dbUser.videos.findIndex(v => v.id === idNum);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Vídeo não encontrado.' });
  }

  dbUser.videos.splice(index, 1);
  dbUser.notas = dbUser.notas.filter(n => n.id_video !== idNum);
  dbUser.agendamentos = dbUser.agendamentos.filter(a => a.id_video !== idNum);

  await salvarBancoUsuario(dbUser, req.usuarioId);
  res.json({ success: true, message: 'Vídeo, anotações e agendamentos vinculados excluídos com sucesso do banco de dados.' });
}));

// Atualizar progresso do vídeo (segundo atual e status de conclusão)
app.patch('/api/videos/:id/progresso', rotaPortal(async (req, res) => {
  const { id } = req.params;
  const { segundo_atual, concluido } = req.body;
  const idNum = parseInt(id, 10);

  const dbUser = await obterBancoUsuario(req.usuarioId);
  const video = dbUser.videos.find(v => v.id === idNum);
  if (!video) {
    return res.status(404).json({ success: false, message: 'Vídeo não encontrado.' });
  }

  if (segundo_atual !== undefined) {
    video.segundo_atual = Math.max(0, parseInt(segundo_atual, 10));
    video.progresso_atualizado_em = new Date().toISOString();
  }
  if (concluido !== undefined) {
    if (concluido && !video.concluido) video.concluido_em = new Date().toISOString();
    if (!concluido) delete video.concluido_em;
    video.concluido = Boolean(concluido);
  }

  await salvarBancoUsuario(dbUser, req.usuarioId);
  res.json({ success: true, data: video });
}));

// ================= ROTAS DE AGENDAMENTOS ================= //

app.get('/api/agendamentos', rotaPortal(async (req, res) => {
  const dbUser = await obterBancoUsuario(req.usuarioId);
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
}));

app.post('/api/agendamentos', rotaPortal(async (req, res) => {
  const { dia_semana, id_video } = req.body;
  const diasValidos = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

  if (!dia_semana || !diasValidos.includes(dia_semana)) {
    return res.status(400).json({ success: false, message: 'dia_semana inválido.' });
  }

  const videoIdNum = parseInt(id_video, 10);
  const dbUser = await obterBancoUsuario(req.usuarioId);
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
  await salvarBancoUsuario(dbUser, req.usuarioId);

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
}));

app.delete('/api/agendamentos/:id', rotaPortal(async (req, res) => {
  const { id } = req.params;
  const idNum = parseInt(id, 10);
  const dbUser = await obterBancoUsuario(req.usuarioId);
  const index = dbUser.agendamentos.findIndex(a => a.id === idNum);

  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Agendamento não encontrado.' });
  }

  dbUser.agendamentos.splice(index, 1);
  await salvarBancoUsuario(dbUser, req.usuarioId);
  res.json({ success: true, message: 'Agendamento removido com sucesso.' });
}));

// ================= ROTAS DO STUDY OS (EDUCAÇÃO AVANÇADA) ================= //

function proximoIdLista(lista) {
  return lista.length > 0 ? Math.max(...lista.map(i => Number(i.id) || 0)) + 1 : 1;
}

app.get('/api/estudos-os', rotaPortal(async (req, res) => {
  const dbUser = await obterBancoUsuario(req.usuarioId);
  const os = garantirEstruturaEstudosOS(dbUser);
  res.json({ success: true, data: os });
}));

app.post('/api/estudos-os/materias', rotaPortal(async (req, res) => {
  const { nome, cor, meta_horas, capa } = req.body || {};
  if (!nome || !String(nome).trim()) {
    return res.status(400).json({ success: false, message: 'O nome da matéria é obrigatório.' });
  }
  const dbUser = await obterBancoUsuario(req.usuarioId);
  const os = garantirEstruturaEstudosOS(dbUser);
  const novaMateria = {
    id: proximoIdLista(os.materias),
    nome: String(nome).trim().slice(0, 120),
    cor: ['sage', 'dusk', 'honey', 'clay'].includes(cor) ? cor : 'sage',
    meta_horas: Math.max(0, Number(meta_horas) || 0),
    capa: typeof capa === 'string' ? capa.trim().slice(0, 300) : '',
    criada_em: new Date().toISOString()
  };
  os.materias.push(novaMateria);
  await salvarBancoUsuario(dbUser, req.usuarioId);
  res.status(201).json({ success: true, data: novaMateria });
}));

app.patch('/api/estudos-os/materias/:id', rotaPortal(async (req, res) => {
  const idNum = parseInt(req.params.id, 10);
  const dbUser = await obterBancoUsuario(req.usuarioId);
  const os = garantirEstruturaEstudosOS(dbUser);
  const mat = os.materias.find(m => m.id === idNum);
  if (!mat) return res.status(404).json({ success: false, message: 'Matéria não encontrada.' });

  const { nome, cor, meta_horas, capa } = req.body || {};
  if (typeof nome === 'string' && nome.trim()) mat.nome = nome.trim().slice(0, 120);
  if (['sage', 'dusk', 'honey', 'clay'].includes(cor)) mat.cor = cor;
  if (meta_horas !== undefined) mat.meta_horas = Math.max(0, Number(meta_horas) || 0);
  if (typeof capa === 'string') mat.capa = capa.trim().slice(0, 300);

  await salvarBancoUsuario(dbUser, req.usuarioId);
  res.json({ success: true, data: mat });
}));

app.delete('/api/estudos-os/materias/:id', rotaPortal(async (req, res) => {
  const idNum = parseInt(req.params.id, 10);
  const dbUser = await obterBancoUsuario(req.usuarioId);
  const os = garantirEstruturaEstudosOS(dbUser);
  const idx = os.materias.findIndex(m => m.id === idNum);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Matéria não encontrada.' });

  os.materias.splice(idx, 1);
  for (const lista of [os.paginas, os.flashcards, os.erros, os.provas, os.leituras, os.sessoes_foco]) {
    for (const item of lista) {
      if (item.materia_id === idNum) item.materia_id = null;
    }
  }
  await salvarBancoUsuario(dbUser, req.usuarioId);
  res.json({ success: true, message: 'Matéria removida com sucesso.' });
}));

app.post('/api/estudos-os/paginas', rotaPortal(async (req, res) => {
  const { titulo, materia_id, parent_id, status, prioridade, dificuldade, tags, template, blocos } = req.body || {};
  if (!titulo || !String(titulo).trim()) {
    return res.status(400).json({ success: false, message: 'O título da página é obrigatório.' });
  }
  const dbUser = await obterBancoUsuario(req.usuarioId);
  const os = garantirEstruturaEstudosOS(dbUser);
  const agora = new Date().toISOString();
  const statusValidos = ['a_estudar', 'estudando', 'revisar', 'dominado'];
  const blocosIniciais = Array.isArray(blocos) ? blocos : (
    template === 'aula'
      ? [
          { id: 'b1', type: 'h2', content: 'Resumo da Aula' },
          { id: 'b2', type: 'paragraph', content: '' },
          { id: 'b3', type: 'toggle', content: 'Questões de Active Recall', children: [] },
          { id: 'b4', type: 'callout', content: 'Pontos de atenção / Dúvidas', props: { tone: 'honey' } }
        ]
      : [{ id: 'b1', type: 'paragraph', content: '' }]
  );

  const novaPagina = {
    id: proximoIdLista(os.paginas),
    titulo: String(titulo).trim().slice(0, 160),
    materia_id: materia_id ? parseInt(materia_id, 10) : null,
    parent_id: parent_id ? parseInt(parent_id, 10) : null,
    status: statusValidos.includes(status) ? status : 'a_estudar',
    prioridade: ['baixa', 'media', 'alta'].includes(prioridade) ? prioridade : 'media',
    dificuldade: ['facil', 'medio', 'dificil'].includes(dificuldade) ? dificuldade : 'medio',
    tags: Array.isArray(tags) ? tags.map(t => String(t).trim()).filter(Boolean).slice(0, 12) : [],
    blocos: blocosIniciais,
    ultima_revisao: null,
    proxima_revisao: null,
    repeticoes: 0,
    fator_ease: 2.5,
    criada_em: agora,
    atualizada_em: agora
  };
  os.paginas.push(novaPagina);
  await salvarBancoUsuario(dbUser, req.usuarioId);
  res.status(201).json({ success: true, data: novaPagina });
}));

app.patch('/api/estudos-os/paginas/:id', rotaPortal(async (req, res) => {
  const idNum = parseInt(req.params.id, 10);
  const dbUser = await obterBancoUsuario(req.usuarioId);
  const os = garantirEstruturaEstudosOS(dbUser);
  const pag = os.paginas.find(p => p.id === idNum);
  if (!pag) return res.status(404).json({ success: false, message: 'Página não encontrada.' });

  const { titulo, materia_id, parent_id, status, prioridade, dificuldade, tags, blocos, ultima_revisao, proxima_revisao, repeticoes, fator_ease } = req.body || {};
  const statusValidos = ['a_estudar', 'estudando', 'revisar', 'dominado'];
  if (typeof titulo === 'string' && titulo.trim()) pag.titulo = titulo.trim().slice(0, 160);
  if (materia_id !== undefined) pag.materia_id = materia_id ? parseInt(materia_id, 10) : null;
  if (parent_id !== undefined) pag.parent_id = parent_id ? parseInt(parent_id, 10) : null;
  if (statusValidos.includes(status)) pag.status = status;
  if (['baixa', 'media', 'alta'].includes(prioridade)) pag.prioridade = prioridade;
  if (['facil', 'medio', 'dificil'].includes(dificuldade)) pag.dificuldade = dificuldade;
  if (Array.isArray(tags)) pag.tags = tags.map(t => String(t).trim()).filter(Boolean).slice(0, 12);
  if (Array.isArray(blocos)) pag.blocos = blocos;
  if (ultima_revisao !== undefined) pag.ultima_revisao = ultima_revisao;
  if (proxima_revisao !== undefined) pag.proxima_revisao = proxima_revisao;
  if (repeticoes !== undefined) pag.repeticoes = Math.max(0, Number(repeticoes) || 0);
  if (fator_ease !== undefined) pag.fator_ease = Math.max(1.3, Number(fator_ease) || 2.5);
  pag.atualizada_em = new Date().toISOString();

  await salvarBancoUsuario(dbUser, req.usuarioId);
  res.json({ success: true, data: pag });
}));

app.delete('/api/estudos-os/paginas/:id', rotaPortal(async (req, res) => {
  const idNum = parseInt(req.params.id, 10);
  const dbUser = await obterBancoUsuario(req.usuarioId);
  const os = garantirEstruturaEstudosOS(dbUser);
  const idx = os.paginas.findIndex(p => p.id === idNum);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Página não encontrada.' });

  os.paginas.splice(idx, 1);
  // Promove subpáginas para raiz em vez de perdê-las
  os.paginas.forEach(p => { if (p.parent_id === idNum) p.parent_id = null; });
  for (const lista of [os.flashcards, os.erros]) {
    for (const item of lista) {
      if (item.pagina_id === idNum) item.pagina_id = null;
    }
  }
  await salvarBancoUsuario(dbUser, req.usuarioId);
  res.json({ success: true, message: 'Página removida com sucesso.' });
}));

app.put('/api/estudos-os/synced-blocks/:syncId', rotaPortal(async (req, res) => {
  const syncId = String(req.params.syncId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  if (!syncId) return res.status(400).json({ success: false, message: 'syncId inválido.' });

  const { content, title } = req.body || {};
  const dbUser = await obterBancoUsuario(req.usuarioId);
  const os = garantirEstruturaEstudosOS(dbUser);
  os.synced_blocks[syncId] = {
    sync_id: syncId,
    title: typeof title === 'string' && title.trim() ? title.trim().slice(0, 80) : (os.synced_blocks[syncId]?.title || 'Bloco Sincronizado'),
    content: typeof content === 'string' ? content : '',
    atualizado_em: new Date().toISOString()
  };
  await salvarBancoUsuario(dbUser, req.usuarioId);
  res.json({ success: true, data: os.synced_blocks[syncId] });
}));

function aplicarSM2(item, nivel) {
  const q = nivel === 'facil' ? 5 : (nivel === 'medio' ? 3 : 1);
  let rep = Number(item.repeticoes) || 0;
  let ef = Number(item.fator_ease) || 2.5;
  let intervalo = 1;

  if (q < 3) {
    rep = 0;
    intervalo = 1;
  } else {
    if (rep === 0) intervalo = 1;
    else if (rep === 1) intervalo = 6;
    else intervalo = Math.round((Number(item.intervalo_dias) || 6) * ef);
    rep += 1;
  }
  ef = Math.max(1.3, Number((ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))).toFixed(2)));
  const hoje = new Date();
  const prox = new Date(hoje.getTime() + intervalo * 86400000);
  item.repeticoes = rep;
  item.fator_ease = ef;
  item.intervalo_dias = intervalo;
  item.nivel_confianca = nivel;
  item.ultima_revisao = hoje.toISOString().slice(0, 10);
  item.proxima_revisao = prox.toISOString().slice(0, 10);
  return item;
}

app.post('/api/estudos-os/paginas/:id/revisar', rotaPortal(async (req, res) => {
  const idNum = parseInt(req.params.id, 10);
  const { nivel } = req.body || {};
  if (!['facil', 'medio', 'dificil'].includes(nivel)) {
    return res.status(400).json({ success: false, message: 'Nível deve ser facil, medio ou dificil.' });
  }
  const dbUser = await obterBancoUsuario(req.usuarioId);
  const os = garantirEstruturaEstudosOS(dbUser);
  const pag = os.paginas.find(p => p.id === idNum);
  if (!pag) return res.status(404).json({ success: false, message: 'Página não encontrada.' });

  aplicarSM2(pag, nivel);
  pag.atualizada_em = new Date().toISOString();
  await salvarBancoUsuario(dbUser, req.usuarioId);
  res.json({ success: true, data: pag });
}));

app.post('/api/estudos-os/flashcards', rotaPortal(async (req, res) => {
  const { frente, verso, materia_id, pagina_id } = req.body || {};
  if (!frente || !String(frente).trim() || !verso || !String(verso).trim()) {
    return res.status(400).json({ success: false, message: 'Frente e verso do flashcard são obrigatórios.' });
  }
  const dbUser = await obterBancoUsuario(req.usuarioId);
  const os = garantirEstruturaEstudosOS(dbUser);
  const hojeIso = new Date().toISOString().slice(0, 10);
  const novo = {
    id: proximoIdLista(os.flashcards),
    materia_id: materia_id ? parseInt(materia_id, 10) : null,
    pagina_id: pagina_id ? parseInt(pagina_id, 10) : null,
    frente: String(frente).trim().slice(0, 500),
    verso: String(verso).trim().slice(0, 1500),
    nivel_confianca: 'medio',
    repeticoes: 0,
    fator_ease: 2.5,
    intervalo_dias: 0,
    ultima_revisao: null,
    proxima_revisao: hojeIso,
    criado_em: new Date().toISOString()
  };
  os.flashcards.push(novo);
  await salvarBancoUsuario(dbUser, req.usuarioId);
  res.status(201).json({ success: true, data: novo });
}));

app.post('/api/estudos-os/flashcards/:id/revisar', rotaPortal(async (req, res) => {
  const idNum = parseInt(req.params.id, 10);
  const { nivel } = req.body || {};
  if (!['facil', 'medio', 'dificil'].includes(nivel)) {
    return res.status(400).json({ success: false, message: 'Nível inválido.' });
  }
  const dbUser = await obterBancoUsuario(req.usuarioId);
  const os = garantirEstruturaEstudosOS(dbUser);
  const fc = os.flashcards.find(f => f.id === idNum);
  if (!fc) return res.status(404).json({ success: false, message: 'Flashcard não encontrado.' });

  aplicarSM2(fc, nivel);
  await salvarBancoUsuario(dbUser, req.usuarioId);
  res.json({ success: true, data: fc });
}));

app.delete('/api/estudos-os/flashcards/:id', rotaPortal(async (req, res) => {
  const idNum = parseInt(req.params.id, 10);
  const dbUser = await obterBancoUsuario(req.usuarioId);
  const os = garantirEstruturaEstudosOS(dbUser);
  const idx = os.flashcards.findIndex(f => f.id === idNum);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Flashcard não encontrado.' });

  os.flashcards.splice(idx, 1);
  await salvarBancoUsuario(dbUser, req.usuarioId);
  res.json({ success: true, message: 'Flashcard removido.' });
}));

app.post('/api/estudos-os/erros', rotaPortal(async (req, res) => {
  const { enunciado, motivo_erro, resolucao, materia_id } = req.body || {};
  if (!enunciado || !String(enunciado).trim()) {
    return res.status(400).json({ success: false, message: 'O enunciado da questão é obrigatório.' });
  }
  const dbUser = await obterBancoUsuario(req.usuarioId);
  const os = garantirEstruturaEstudosOS(dbUser);
  const novo = {
    id: proximoIdLista(os.erros),
    materia_id: materia_id ? parseInt(materia_id, 10) : null,
    enunciado: String(enunciado).trim().slice(0, 800),
    motivo_erro: typeof motivo_erro === 'string' && motivo_erro.trim() ? motivo_erro.trim().slice(0, 200) : 'Lacuna conceitual',
    resolucao: typeof resolucao === 'string' ? resolucao.trim().slice(0, 1200) : '',
    acertos: 0,
    tentativas: 1,
    criado_em: new Date().toISOString()
  };
  os.erros.push(novo);
  await salvarBancoUsuario(dbUser, req.usuarioId);
  res.status(201).json({ success: true, data: novo });
}));

app.patch('/api/estudos-os/erros/:id', rotaPortal(async (req, res) => {
  const idNum = parseInt(req.params.id, 10);
  const dbUser = await obterBancoUsuario(req.usuarioId);
  const os = garantirEstruturaEstudosOS(dbUser);
  const errItem = os.erros.find(e => e.id === idNum);
  if (!errItem) return res.status(404).json({ success: false, message: 'Registro de erro não encontrado.' });

  const { acertou } = req.body || {};
  if (typeof acertou === 'boolean') {
    errItem.tentativas = (Number(errItem.tentativas) || 0) + 1;
    if (acertou) errItem.acertos = (Number(errItem.acertos) || 0) + 1;
  }
  await salvarBancoUsuario(dbUser, req.usuarioId);
  res.json({ success: true, data: errItem });
}));

app.delete('/api/estudos-os/erros/:id', rotaPortal(async (req, res) => {
  const idNum = parseInt(req.params.id, 10);
  const dbUser = await obterBancoUsuario(req.usuarioId);
  const os = garantirEstruturaEstudosOS(dbUser);
  const idx = os.erros.findIndex(e => e.id === idNum);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Registro não encontrado.' });

  os.erros.splice(idx, 1);
  await salvarBancoUsuario(dbUser, req.usuarioId);
  res.json({ success: true, message: 'Registro removido.' });
}));

app.post('/api/estudos-os/provas', rotaPortal(async (req, res) => {
  const { titulo, materia_id, data, nota, peso } = req.body || {};
  if (!titulo || !String(titulo).trim()) {
    return res.status(400).json({ success: false, message: 'O título da prova é obrigatório.' });
  }
  const dbUser = await obterBancoUsuario(req.usuarioId);
  const os = garantirEstruturaEstudosOS(dbUser);
  const nova = {
    id: proximoIdLista(os.provas),
    materia_id: materia_id ? parseInt(materia_id, 10) : null,
    titulo: String(titulo).trim().slice(0, 140),
    data: typeof data === 'string' ? data.slice(0, 10) : '',
    nota: nota !== '' && nota !== null && nota !== undefined ? Math.max(0, Math.min(100, Number(nota))) : null,
    peso: Math.max(0.1, Number(peso) || 1),
    criada_em: new Date().toISOString()
  };
  os.provas.push(nova);
  await salvarBancoUsuario(dbUser, req.usuarioId);
  res.status(201).json({ success: true, data: nova });
}));

app.patch('/api/estudos-os/provas/:id', rotaPortal(async (req, res) => {
  const idNum = parseInt(req.params.id, 10);
  const dbUser = await obterBancoUsuario(req.usuarioId);
  const os = garantirEstruturaEstudosOS(dbUser);
  const prova = os.provas.find(p => p.id === idNum);
  if (!prova) return res.status(404).json({ success: false, message: 'Prova não encontrada.' });

  const { nota, peso, data, titulo } = req.body || {};
  if (typeof titulo === 'string' && titulo.trim()) prova.titulo = titulo.trim().slice(0, 140);
  if (typeof data === 'string') prova.data = data.slice(0, 10);
  if (nota !== undefined) prova.nota = nota === null || nota === '' ? null : Math.max(0, Math.min(100, Number(nota)));
  if (peso !== undefined) prova.peso = Math.max(0.1, Number(peso) || 1);
  await salvarBancoUsuario(dbUser, req.usuarioId);
  res.json({ success: true, data: prova });
}));

app.delete('/api/estudos-os/provas/:id', rotaPortal(async (req, res) => {
  const idNum = parseInt(req.params.id, 10);
  const dbUser = await obterBancoUsuario(req.usuarioId);
  const os = garantirEstruturaEstudosOS(dbUser);
  const idx = os.provas.findIndex(p => p.id === idNum);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Prova não encontrada.' });

  os.provas.splice(idx, 1);
  await salvarBancoUsuario(dbUser, req.usuarioId);
  res.json({ success: true, message: 'Prova removida.' });
}));

app.post('/api/estudos-os/leituras', rotaPortal(async (req, res) => {
  const { titulo, autor, tipo, materia_id, total_paginas, paginas_lidas, status } = req.body || {};
  if (!titulo || !String(titulo).trim()) {
    return res.status(400).json({ success: false, message: 'O título da leitura é obrigatório.' });
  }
  const dbUser = await obterBancoUsuario(req.usuarioId);
  const os = garantirEstruturaEstudosOS(dbUser);
  const total = Math.max(1, parseInt(total_paginas, 10) || 100);
  const lidas = Math.max(0, Math.min(total, parseInt(paginas_lidas, 10) || 0));
  const nova = {
    id: proximoIdLista(os.leituras),
    materia_id: materia_id ? parseInt(materia_id, 10) : null,
    titulo: String(titulo).trim().slice(0, 160),
    autor: typeof autor === 'string' ? autor.trim().slice(0, 100) : '',
    tipo: ['livro', 'artigo', 'pdf'].includes(tipo) ? tipo : 'livro',
    status: ['quero_ler', 'lendo', 'concluido'].includes(status) ? status : (lidas >= total ? 'concluido' : (lidas > 0 ? 'lendo' : 'quero_ler')),
    paginas_lidas: lidas,
    total_paginas: total,
    criada_em: new Date().toISOString()
  };
  os.leituras.push(nova);
  await salvarBancoUsuario(dbUser, req.usuarioId);
  res.status(201).json({ success: true, data: nova });
}));

app.patch('/api/estudos-os/leituras/:id', rotaPortal(async (req, res) => {
  const idNum = parseInt(req.params.id, 10);
  const dbUser = await obterBancoUsuario(req.usuarioId);
  const os = garantirEstruturaEstudosOS(dbUser);
  const leit = os.leituras.find(l => l.id === idNum);
  if (!leit) return res.status(404).json({ success: false, message: 'Leitura não encontrada.' });

  const { paginas_lidas, status } = req.body || {};
  if (paginas_lidas !== undefined) {
    leit.paginas_lidas = Math.max(0, Math.min(leit.total_paginas || 100, parseInt(paginas_lidas, 10) || 0));
    if (leit.paginas_lidas >= leit.total_paginas) leit.status = 'concluido';
    else if (leit.paginas_lidas > 0 && leit.status === 'quero_ler') leit.status = 'lendo';
  }
  if (['quero_ler', 'lendo', 'concluido'].includes(status)) leit.status = status;
  await salvarBancoUsuario(dbUser, req.usuarioId);
  res.json({ success: true, data: leit });
}));

app.delete('/api/estudos-os/leituras/:id', rotaPortal(async (req, res) => {
  const idNum = parseInt(req.params.id, 10);
  const dbUser = await obterBancoUsuario(req.usuarioId);
  const os = garantirEstruturaEstudosOS(dbUser);
  const idx = os.leituras.findIndex(l => l.id === idNum);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Leitura não encontrada.' });

  os.leituras.splice(idx, 1);
  await salvarBancoUsuario(dbUser, req.usuarioId);
  res.json({ success: true, message: 'Leitura removida.' });
}));

app.post('/api/estudos-os/sessoes-foco', rotaPortal(async (req, res) => {
  const { materia_id, duracao_min, chave } = req.body || {};
  const dbUser = await obterBancoUsuario(req.usuarioId);
  const os = garantirEstruturaEstudosOS(dbUser);
  const chaveValida = typeof chave === 'string' && /^[a-f0-9-]{36}$/i.test(chave) ? chave : null;
  if (chaveValida) {
    const anterior = os.sessoes_foco.find(item => item.chave === chaveValida);
    if (anterior) return res.json({ success: true, data: anterior });
  }
  const sessao = {
    ...(chaveValida ? { chave: chaveValida } : {}),
    id: proximoIdLista(os.sessoes_foco),
    materia_id: os.materias.find(materia => materia.id === Number(materia_id))?.id ?? null,
    duracao_min: Math.max(1, Math.min(240, parseInt(duracao_min, 10) || 25)),
    data: new Date().toISOString().slice(0, 10)
  };
  os.sessoes_foco.push(sessao);
  await salvarBancoUsuario(dbUser, req.usuarioId);
  res.status(201).json({ success: true, data: sessao });
}));

app.post('/api/estudos-os/ia', aiRateLimiter, rotaPortal(async (req, res) => {
  const groqKey = process.env.GROQ_API_KEY || '';
  if (!groqKey) {
    return res.status(503).json({ success: false, message: 'GROQ_API_KEY não configurada no servidor.' });
  }
  const { acao, texto, pergunta } = req.body || {};
  const dbUser = await obterBancoUsuario(req.usuarioId);
  const os = garantirEstruturaEstudosOS(dbUser);

  let systemPrompt = 'Você é o Tutor de Estudos do CONVERGE Study OS. Responda sempre em português do Brasil, de forma clara e objetiva.';
  let userPrompt = '';
  let expectJson = false;

  if (acao === 'estruturar') {
    expectJson = true;
    systemPrompt += ' Retorne APENAS JSON válido no formato {"blocos":[{"type":"h2|paragraph|callout|toggle","content":"...","props":{"body":"..."}}]}.';
    userPrompt = `Estruture as seguintes anotações bagunçadas em blocos organizados (títulos h2, parágrafos, callouts de destaque e toggles de revisão):\n\n${String(texto || '').slice(0, 6000)}`;
  } else if (acao === 'gerar_questoes') {
    expectJson = true;
    systemPrompt += ' Retorne APENAS JSON válido no formato {"flashcards":[{"frente":"...","verso":"..."}]}. Crie de 3 a 5 flashcards objetivos baseados exclusivamente nas anotações fornecidas.';
    userPrompt = `Crie questões práticas de Active Recall (frente e verso) baseadas nestas anotações:\n\n${String(texto || '').slice(0, 6000)}`;
  } else {
    const contexto = {
      hoje: new Date().toISOString().slice(0, 10),
      materias: os.materias.map(m => ({ id: m.id, nome: m.nome })),
      paginas: os.paginas.map(p => ({ titulo: p.titulo, materia_id: p.materia_id, status: p.status, ultima_revisao: p.ultima_revisao, proxima_revisao: p.proxima_revisao, atualizada_em: p.atualizada_em })),
      provas: os.provas,
      leituras: os.leituras,
      erros_count: os.erros.length,
      flashcards_count: os.flashcards.length
    };
    userPrompt = `Contexto real do aluno:\n${JSON.stringify(contexto)}\n\nPergunta do aluno: ${String(pergunta || '').slice(0, 800)}`;
  }

  try {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        temperature: 0.3,
        ...(expectJson ? { response_format: { type: 'json_object' } } : {}),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    });
    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content || '';
    if (!resp.ok || !content) {
      return res.status(502).json({ success: false, message: data?.error?.message || 'Erro ao consultar Groq IA.' });
    }
    res.json({ success: true, data: expectJson ? JSON.parse(content) : { resposta: content } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Falha na integração com Groq IA: ' + err.message });
  }
}));

// ================= ROTAS DE ANOTAÇÕES ================= //

app.get('/api/notas', rotaPortal(async (req, res) => {
  const { id_video } = req.query;
  if (!id_video) {
    return res.status(400).json({ success: false, message: 'id_video é obrigatório.' });
  }

  const videoIdNum = parseInt(id_video, 10);
  const dbUser = await obterBancoUsuario(req.usuarioId);
  const notasDoVideo = dbUser.notas
    .filter(n => n.id_video === videoIdNum)
    .sort((a, b) => a.segundos - b.segundos);

  res.json({ success: true, data: notasDoVideo });
}));

app.post('/api/notas', rotaPortal(async (req, res) => {
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

  const dbUser = await obterBancoUsuario(req.usuarioId);
  const novaNota = {
    id: dbUser.notas.length > 0 ? Math.max(...dbUser.notas.map(n => n.id)) + 1 : 1,
    id_video: parseInt(id_video, 10),
    segundos: seg,
    tempo_formatado,
    texto: texto.trim(),
    criado_em: new Date().toISOString()
  };

  dbUser.notas.push(novaNota);
  await salvarBancoUsuario(dbUser, req.usuarioId);
  res.status(201).json({ success: true, data: novaNota });
}));

app.delete('/api/notas/:id', rotaPortal(async (req, res) => {
  const { id } = req.params;
  const idNum = parseInt(id, 10);
  const dbUser = await obterBancoUsuario(req.usuarioId);
  const index = dbUser.notas.findIndex(n => n.id === idNum);

  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Anotação não encontrada.' });
  }

  dbUser.notas.splice(index, 1);
  await salvarBancoUsuario(dbUser, req.usuarioId);
  res.json({ success: true, message: 'Anotação excluída com sucesso.' });
}));

// ============================================================================== //
// ================= NOVOS PILARES LIFE OS: ROTINA & AGENDA + METAS ============= //
// ============================================================================== //

// --- 1. PRIORIDADES DO DIA (TOP 3 & CAIXA DE ENTRADA) ---
app.get('/api/rotina/prioridades', rotaPortal(async (req, res) => {
  const dbUser = await obterBancoUsuario(req.usuarioId);
  res.json({ success: true, data: dbUser.prioridades_dia || [] });
}));

function adicionarPrioridade(dados, texto, top3 = false, data = null, horario = null, duracaoMin = null, energia = null) {
  const maioresIds = [dados.prioridades_dia, dados.historico_tarefas || []].map(lista =>
    lista.reduce((maior, item) => Math.max(maior, item.id), 0));
  const dataLimpa = typeof data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.trim()) ? data.trim() : null;
  const horarioLimpo = typeof horario === 'string' && /^\d{2}:\d{2}$/.test(horario.trim()) ? horario.trim() : null;
  const durLimpa = duracaoMin !== null && duracaoMin !== undefined && !isNaN(Number(duracaoMin))
    ? Math.max(5, Math.min(480, Math.round(Number(duracaoMin))))
    : 30;
  const energiaLimpa = ['alto', 'medio', 'baixo'].includes(energia) ? energia : 'medio';
  const tarefa = {
    id: Math.max(...maioresIds) + 1,
    texto,
    concluida: false,
    top3,
    data: dataLimpa,
    horario: horarioLimpo,
    duracao_min: durLimpa,
    energia: energiaLimpa,
    criado_em: new Date().toISOString()
  };
  dados.prioridades_dia.push(tarefa);
  return tarefa;
}

app.post('/api/rotina/prioridades', rotaPortal(async (req, res) => {
  const { texto, top3, data, horario, duracao_min, energia } = req.body;
  if (typeof texto !== 'string' || !texto.trim()) {
    return res.status(400).json({ success: false, message: 'Texto da tarefa é obrigatório.' });
  }

  const dbUser = await obterBancoUsuario(req.usuarioId);
  const novaTarefa = adicionarPrioridade(dbUser, texto.trim(), !!top3, data, horario, duracao_min, energia);
  await salvarBancoUsuario(dbUser, req.usuarioId);
  res.status(201).json({ success: true, data: novaTarefa });
}));

app.patch('/api/rotina/prioridades/:id', rotaPortal(async (req, res) => {
  const idNum = parseInt(req.params.id, 10);
  const { concluida, top3, texto, adiar_ate, data, horario, duracao_min, energia } = req.body;
  const dbUser = await obterBancoUsuario(req.usuarioId);

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
      const jaExiste = dbUser.historico_tarefas.some(h => h.id === tarefa.id && h.criado_em === tarefa.criado_em);
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
  if (adiar_ate === null && tarefa.adiada_ate) {
    delete tarefa.adiada_ate;
    if (dataAgendaValida(data)) tarefa.data = data;
  }
  if (typeof adiar_ate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(adiar_ate) && !tarefa.concluida) {
    tarefa.adiada_ate = adiar_ate;
    tarefa.top3 = false;
  }
  if (dataAgendaValida(data) && adiar_ate === undefined) tarefa.data = data;
  if (horario === null || horario === '') tarefa.horario = null;
  else if (typeof horario === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(horario.trim())) tarefa.horario = horario.trim();
  if (duracao_min !== undefined && !isNaN(Number(duracao_min))) {
    tarefa.duracao_min = Math.max(5, Math.min(480, Math.round(Number(duracao_min))));
  }
  if (['alto', 'medio', 'baixo'].includes(energia)) tarefa.energia = energia;

  await salvarBancoUsuario(dbUser, req.usuarioId);
  res.json({ success: true, data: tarefa });
}));

app.delete('/api/rotina/prioridades/:id', rotaPortal(async (req, res) => {
  const idNum = parseInt(req.params.id, 10);
  const dbUser = await obterBancoUsuario(req.usuarioId);
  const idx = (dbUser.prioridades_dia || []).findIndex(t => t.id === idNum);

  if (idx === -1) {
    return res.status(404).json({ success: false, message: 'Tarefa não encontrada.' });
  }

  const [tarefaRemovida] = dbUser.prioridades_dia.splice(idx, 1);

  // Arquiva no histórico como 'excluida' para manter a rastreabilidade
  if (!Array.isArray(dbUser.historico_tarefas)) dbUser.historico_tarefas = [];
  dbUser.historico_tarefas = dbUser.historico_tarefas.filter(h =>
    h.id !== tarefaRemovida.id || h.criado_em !== tarefaRemovida.criado_em);
  dbUser.historico_tarefas.unshift({
    id: tarefaRemovida.id,
    texto: tarefaRemovida.texto,
    top3: !!tarefaRemovida.top3,
    criado_em: tarefaRemovida.criado_em,
    concluida_em: tarefaRemovida.concluida_em,
    excluida_em: new Date().toISOString(),
    status: tarefaRemovida.concluida ? 'concluida' : 'excluida'
  });

  await salvarBancoUsuario(dbUser, req.usuarioId);
  res.json({ success: true, message: 'Tarefa removida com sucesso.', data: tarefaRemovida });
}));

// GET /api/rotina/historico-tarefas - Retorna todo o histórico de tarefas concluídas e arquivadas
app.get('/api/rotina/historico-tarefas', rotaPortal(async (req, res) => {
  const dbUser = await obterBancoUsuario(req.usuarioId);
  if (!Array.isArray(dbUser.historico_tarefas)) dbUser.historico_tarefas = [];
  res.json({ success: true, data: dbUser.historico_tarefas });
}));

app.post('/api/rotina/historico-tarefas/:id/restaurar', rotaPortal(async (req, res) => {
  const id = Number(req.params.id);
  const criadoEm = req.body?.criado_em;
  const dados = await obterBancoUsuario(req.usuarioId);
  const historico = dados.historico_tarefas || [];
  const item = historico.find(tarefa => tarefa.id === id && (tarefa.criado_em || null) === criadoEm);
  if (!item) return res.status(404).json({ success: false, message: 'Esta tarefa já não está no histórico.' });

  let tarefa = dados.prioridades_dia.find(prioridade =>
    prioridade.id === item.id && (prioridade.criado_em || null) === criadoEm);
  if (tarefa) {
    tarefa.concluida = false;
    tarefa.top3 = false;
    delete tarefa.concluida_em;
    delete tarefa.adiada_ate;
  } else {
    tarefa = adicionarPrioridade(dados, item.texto);
  }

  dados.historico_tarefas = historico.filter(registro =>
    registro.id !== item.id || (registro.criado_em || null) !== criadoEm);
  await salvarBancoUsuario(dados, req.usuarioId);
  res.json({ success: true, data: tarefa });
}));

// DELETE /api/rotina/historico-tarefas/:id - Limpa item individual do histórico
app.delete('/api/rotina/historico-tarefas/:id', rotaPortal(async (req, res) => {
  const idNum = parseInt(req.params.id, 10);
  const criadoEm = req.query.criado_em;
  const dbUser = await obterBancoUsuario(req.usuarioId);
  if (!Array.isArray(dbUser.historico_tarefas)) dbUser.historico_tarefas = [];
  const idx = dbUser.historico_tarefas.findIndex(h => h.id === idNum &&
    (criadoEm === undefined || (h.criado_em || '') === criadoEm));
  if (idx !== -1) {
    dbUser.historico_tarefas.splice(idx, 1);
    await salvarBancoUsuario(dbUser, req.usuarioId);
  }
  res.json({ success: true, message: 'Item do histórico removido.' });
}));

// DELETE /api/rotina/historico-tarefas - Limpa todo o histórico de tarefas
app.delete('/api/rotina/historico-tarefas', rotaPortal(async (req, res) => {
  const dbUser = await obterBancoUsuario(req.usuarioId);
  dbUser.historico_tarefas = [];
  await salvarBancoUsuario(dbUser, req.usuarioId);
  res.json({ success: true, message: 'Histórico de tarefas limpo com sucesso.' });
}));

// DELETE /api/rotina/limpar-selecao - Exclusão seletiva por item ou total (Foco de Hoje / Agenda / Histórico)
app.delete('/api/rotina/limpar-selecao', rotaPortal(async (req, res) => {
  const { foco, agenda, historico, focoIds, agendaIds, historicoIds } = req.body || {};
  const temIds = (Array.isArray(focoIds) && focoIds.length > 0) ||
                 (Array.isArray(agendaIds) && agendaIds.length > 0) ||
                 (Array.isArray(historicoIds) && historicoIds.length > 0);

  if (!foco && !agenda && !historico && !temIds) {
    return res.status(400).json({ success: false, message: 'Selecione ao menos um item para excluir.' });
  }

  const dbUser = await obterBancoUsuario(req.usuarioId);
  if (foco) {
    dbUser.prioridades_dia = [];
  } else if (Array.isArray(focoIds) && focoIds.length > 0) {
    const setFoco = new Set(focoIds.map(String));
    dbUser.prioridades_dia = (dbUser.prioridades_dia || []).filter(item => !setFoco.has(String(item.id)));
  }

  if (agenda) {
    dbUser.compromissos = [];
  } else if (Array.isArray(agendaIds) && agendaIds.length > 0) {
    const setAgenda = new Set(agendaIds.map(String));
    dbUser.compromissos = (dbUser.compromissos || []).filter(item => !setAgenda.has(String(item.id)));
  }

  if (historico) {
    dbUser.historico_tarefas = [];
  } else if (Array.isArray(historicoIds) && historicoIds.length > 0) {
    const setHist = new Set(historicoIds.map(String));
    dbUser.historico_tarefas = (dbUser.historico_tarefas || []).filter(item => !setHist.has(String(item.id)));
  }

  await salvarBancoUsuario(dbUser, req.usuarioId);
  res.json({
    success: true,
    message: 'Itens selecionados excluídos com sucesso.'
  });
}));

// --- 2. RASTREADOR DE HÁBITOS (HABIT TRACKER & STREAK) ---
app.get('/api/rotina/habitos', rotaPortal(async (req, res) => {
  const dbUser = await obterBancoUsuario(req.usuarioId);
  res.json({ success: true, data: dbUser.habitos || [] });
}));

app.post('/api/rotina/habitos', rotaPortal(async (req, res) => {
  const { nome, icone, periodo, duracao_min, horario_ideal, horario_limite } = req.body;
  if (typeof nome !== 'string' || !nome.trim()) {
    return res.status(400).json({ success: false, message: 'Nome do hábito é obrigatório.' });
  }

  const periodosValidos = ['manha', 'pos_trabalho', 'noite', 'livre'];
  const periodoNorm = periodosValidos.includes(periodo) ? periodo : 'manha';
  const duracaoNorm = Number.isFinite(Number(duracao_min))
    ? Math.max(1, Math.min(180, Math.round(Number(duracao_min))))
    : 15;
  const regexHora = /^([01]\d|2[0-3]):[0-5]\d$/;
  const idealNorm = typeof horario_ideal === 'string' && regexHora.test(horario_ideal.trim()) ? horario_ideal.trim() : '';
  const limiteNorm = typeof horario_limite === 'string' && regexHora.test(horario_limite.trim()) ? horario_limite.trim() : '';

  const dbUser = await obterBancoUsuario(req.usuarioId);
  if (!Array.isArray(dbUser.habitos)) dbUser.habitos = [];

  const novoHabito = {
    id: dbUser.habitos.length > 0 ? Math.max(...dbUser.habitos.map(h => h.id)) + 1 : 1,
    nome: nome.trim(),
    icone: icone || '⚡',
    periodo: periodoNorm,
    duracao_min: duracaoNorm,
    horario_ideal: idealNorm,
    horario_limite: limiteNorm,
    dias_concluidos: [], // lista de datas 'YYYY-MM-DD'
    streak: 0,
    criado_em: new Date().toISOString()
  };

  dbUser.habitos.push(novoHabito);
  await salvarBancoUsuario(dbUser, req.usuarioId);
  res.status(201).json({ success: true, data: novoHabito });
}));

app.patch('/api/rotina/habitos/:id', rotaPortal(async (req, res) => {
  const idNum = parseInt(req.params.id, 10);
  const dbUser = await obterBancoUsuario(req.usuarioId);
  const habito = (dbUser.habitos || []).find(h => h.id === idNum);
  if (!habito) {
    return res.status(404).json({ success: false, message: 'Hábito não encontrado.' });
  }

  const { nome, icone, periodo, duracao_min, horario_ideal, horario_limite } = req.body;
  if (typeof nome === 'string' && nome.trim()) habito.nome = nome.trim();
  if (typeof icone === 'string' && icone.trim()) habito.icone = icone.trim();

  const periodosValidos = ['manha', 'pos_trabalho', 'noite', 'livre'];
  if (periodosValidos.includes(periodo)) habito.periodo = periodo;

  if (duracao_min !== undefined && Number.isFinite(Number(duracao_min))) {
    habito.duracao_min = Math.max(1, Math.min(180, Math.round(Number(duracao_min))));
  }

  const regexHora = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (horario_ideal !== undefined) {
    habito.horario_ideal = typeof horario_ideal === 'string' && regexHora.test(horario_ideal.trim()) ? horario_ideal.trim() : '';
  }
  if (horario_limite !== undefined) {
    habito.horario_limite = typeof horario_limite === 'string' && regexHora.test(horario_limite.trim()) ? horario_limite.trim() : '';
  }

  await salvarBancoUsuario(dbUser, req.usuarioId);
  res.json({ success: true, data: habito });
}));

app.post('/api/rotina/habitos/:id/checkin', rotaPortal(async (req, res) => {
  const idNum = parseInt(req.params.id, 10);
  const { data } = req.body; // 'YYYY-MM-DD' opcional, padrão hoje
  if (data && !dataAgendaValida(data)) {
    return res.status(400).json({ success: false, message: 'Informe uma data válida para o hábito.' });
  }
  const dbUser = await obterBancoUsuario(req.usuarioId);

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

  await salvarBancoUsuario(dbUser, req.usuarioId);
  res.json({ success: true, data: habito });
}));

app.delete('/api/rotina/habitos/:id', rotaPortal(async (req, res) => {
  const idNum = parseInt(req.params.id, 10);
  const dbUser = await obterBancoUsuario(req.usuarioId);
  const idx = (dbUser.habitos || []).findIndex(h => h.id === idNum);

  if (idx === -1) {
    return res.status(404).json({ success: false, message: 'Hábito não encontrado.' });
  }

  dbUser.habitos.splice(idx, 1);
  await salvarBancoUsuario(dbUser, req.usuarioId);
  res.json({ success: true, message: 'Hábito removido com sucesso.' });
}));

// --- 3. AGENDA & COMPROMISSOS MANUAIS ---
app.get('/api/agenda/compromissos', rotaPortal(async (req, res) => {
  const dbUser = await obterBancoUsuario(req.usuarioId);
  res.json({ success: true, data: dbUser.compromissos || [] });
}));

function dataAgendaValida(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const data = new Date(`${valor}T12:00:00Z`);
  return Number.isFinite(data.getTime()) && data.toISOString().slice(0, 10) === valor;
}

app.post('/api/agenda/compromissos', rotaPortal(async (req, res) => {
  const { titulo, data, horario = '09:00', categoria, local, duracao_min, energia } = req.body;
  if (typeof titulo !== 'string' || !titulo.trim() || !dataAgendaValida(data) ||
      typeof horario !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(horario)) {
    return res.status(400).json({ success: false, message: 'Informe um título, uma data e um horário válidos.' });
  }

  const dbUser = await obterBancoUsuario(req.usuarioId);
  if (!Array.isArray(dbUser.compromissos)) dbUser.compromissos = [];

  const novoComp = {
    id: dbUser.compromissos.length > 0 ? Math.max(...dbUser.compromissos.map(c => c.id)) + 1 : 1,
    titulo: titulo.trim(),
    data,
    horario,
    duracao_min: duracao_min !== undefined && !isNaN(Number(duracao_min)) ? Math.max(5, Math.min(480, Math.round(Number(duracao_min)))) : 60,
    energia: ['alto', 'medio', 'baixo'].includes(energia) ? energia : 'medio',
    categoria: categoria || 'pessoal', // 'pessoal' | 'financas' | 'estudos' | 'trabalho'
    local: local || '',
    criado_em: new Date().toISOString()
  };

  dbUser.compromissos.push(novoComp);
  await salvarBancoUsuario(dbUser, req.usuarioId);
  res.status(201).json({ success: true, data: novoComp });
}));

app.delete('/api/agenda/compromissos/:id', rotaPortal(async (req, res) => {
  const idNum = parseInt(req.params.id, 10);
  const dbUser = await obterBancoUsuario(req.usuarioId);
  const idx = (dbUser.compromissos || []).findIndex(c => c.id === idNum);

  if (idx === -1) {
    return res.status(404).json({ success: false, message: 'Compromisso não encontrado.' });
  }

  dbUser.compromissos.splice(idx, 1);
  await salvarBancoUsuario(dbUser, req.usuarioId);
  res.json({ success: true, message: 'Compromisso removido com sucesso.' });
}));

// --- 4. AGENDA DE HOJE INTEGRADA (MANUAL + FINANÇAS + EDUCAÇÃO) ---
app.get('/api/agenda/hoje-integrado', rotaPortal(async (req, res) => {
  try {
    const data = req.query.data;
    if (data !== undefined && !dataAgendaValida(data)) {
      return res.status(400).json({ success: false, message: 'Data da agenda inválida.' });
    }
    const hojeIso = data || new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
    const hoje = new Date(`${hojeIso}T12:00:00Z`);
    const diasSemanaNomes = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const diaHojeNome = diasSemanaNomes[hoje.getUTCDay()];

    const dbUser = await obterBancoUsuario(req.usuarioId);

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
      const respFin = await fetch(`http://127.0.0.1:${FINANCE_API_PORT}/api/dados?mes=${mesAtual}`, {
        headers: authHeader ? { 'Authorization': authHeader } : {}
      });
      if (respFin.ok) {
        const dadosFin = await respFin.json();
        const diaAtualNum = hoje.getUTCDate();
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
}));

// --- 5. METAS (FINANCEIRAS, ESTUDOS E PESSOAIS) ---
async function listarProjetosDaConta(req) {
  const resposta = await fetch(`http://127.0.0.1:${FINANCE_API_PORT}/api/projetos`, {
    headers: { Authorization: req.headers.authorization },
    signal: AbortSignal.timeout(4000)
  });
  if (!resposta.ok) throw new Error('Projetos financeiros indisponíveis.');
  return (await resposta.json()).projetos || [];
}

app.get('/api/metas', rotaPortal(async (req, res) => {
  try {
    const dbUser = await obterBancoUsuario(req.usuarioId);
    let metas = dbUser.metas || [];

    // Calcula progresso dinâmico para metas de Estudos e Finanças
    const totalAulas = (dbUser.videos || []).length;
    const aulasConcluidas = (dbUser.videos || []).filter(v => v.concluido).length;

    let projetos = null;
    if (metas.some(meta => meta.projeto_id)) {
      try {
        projetos = await listarProjetosDaConta(req);
      } catch (error) {
        console.warn('[Metas]', error.message);
      }
    }
    metas = metas.map(meta => {
      const m = { ...meta };
      let progresso = Number(m.progresso || 0);

      if (m.tipo === 'financeira' && m.projeto_id) {
        const projeto = projetos?.find(p => p.id === m.projeto_id);
        m.projeto_status = projeto ? 'vinculado' : (projetos ? 'removido' : 'indisponivel');
        if (projeto) {
          m.valor_atual = Number(projeto.valor_acumulado);
          m.valor_alvo = Number(projeto.valor_objetivo);
          progresso = m.valor_alvo > 0 ? Math.round((m.valor_atual / m.valor_alvo) * 100) : 0;
        }
      } else if (m.tipo === 'estudos') {
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
}));

app.post('/api/metas', rotaPortal(async (req, res) => {
  const { titulo, tipo, valor_alvo, valor_atual, prazo, checklist, projeto_id, sugestao_semana } = req.body;
  if (!titulo || !titulo.trim()) {
    return res.status(400).json({ success: false, message: 'Título da meta é obrigatório.' });
  }

  let projetoId = null;
  if (tipo === 'financeira' && projeto_id) {
    try {
      const projeto = (await listarProjetosDaConta(req)).find(p => p.id === Number(projeto_id));
      if (!projeto) return res.status(404).json({ success: false, message: 'Projeto financeiro não encontrado.' });
      projetoId = projeto.id;
    } catch {
      return res.status(503).json({ success: false, message: 'Não foi possível consultar os projetos financeiros.' });
    }
  }
  const dbUser = await obterBancoUsuario(req.usuarioId);
  if (!Array.isArray(dbUser.metas)) dbUser.metas = [];
  if (sugestao_semana !== undefined && (!dataAgendaValida(sugestao_semana) ||
      dbUser.metas.some(item => item.sugestao_semana === sugestao_semana))) {
    return res.status(409).json({ success: false, message: 'Já existe uma meta sugerida para este período ou a data é inválida.' });
  }

  const novaMeta = {
    id: dbUser.metas.length > 0 ? Math.max(...dbUser.metas.map(m => m.id)) + 1 : 1,
    titulo: titulo.trim(),
    tipo: tipo || 'pessoal', // 'financeira' | 'estudos' | 'pessoal'
    ...(sugestao_semana ? { sugestao_semana } : {}),
    ...(projetoId ? { projeto_id: projetoId } : {}),
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
  await salvarBancoUsuario(dbUser, req.usuarioId);
  res.status(201).json({ success: true, data: novaMeta });
}));

app.patch('/api/metas/:id', rotaPortal(async (req, res) => {
  const idNum = parseInt(req.params.id, 10);
  const { titulo, valor_atual, checklist, prazo } = req.body;
  const dbUser = await obterBancoUsuario(req.usuarioId);

  const meta = (dbUser.metas || []).find(m => m.id === idNum);
  if (!meta) {
    return res.status(404).json({ success: false, message: 'Meta não encontrada.' });
  }

  const progressoAnterior = Number(meta.progresso || 0);
  if (typeof titulo === 'string' && titulo.trim()) meta.titulo = titulo.trim();
  if (prazo !== undefined) meta.prazo = prazo;
  if (meta.projeto_id && valor_atual !== undefined) {
    return res.status(409).json({ success: false, message: 'Registre o aporte no projeto financeiro vinculado.' });
  }
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
  if (meta.progresso > progressoAnterior) {
    meta.avancos = [...(meta.avancos || []).slice(-49), {
      data: new Date().toISOString(), de: progressoAnterior, para: meta.progresso
    }];
  }

  await salvarBancoUsuario(dbUser, req.usuarioId);
  res.json({ success: true, data: meta });
}));

app.get('/api/revisao-semanal/planos', rotaPortal(async (req, res) => {
  const dados = await obterBancoUsuario(req.usuarioId);
  res.json({ success: true, data: Object.values(dados.planos_semanais || {}) });
}));

app.put('/api/revisao-semanal/planos/:semana', rotaPortal(async (req, res) => {
  const { semana } = req.params;
  const data = new Date(`${semana}T12:00:00Z`);
  const { tarefas, aulas } = req.body;
  const idsValidos = (ids, maximo) => Array.isArray(ids) && ids.length <= maximo
    && ids.every(id => Number.isSafeInteger(id) && id > 0) && new Set(ids).size === ids.length;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(semana) || data.getUTCDay() !== 1 ||
      data.toISOString().slice(0, 10) !== semana || !idsValidos(tarefas, 3) || !idsValidos(aulas, 7)) {
    return res.status(400).json({ success: false, message: 'Use uma segunda-feira e selecione até três tarefas e sete aulas.' });
  }

  const dados = await obterBancoUsuario(req.usuarioId);
  const prioridades = tarefas.map(id => (dados.prioridades_dia || []).find(tarefa => tarefa.id === id && !tarefa.concluida));
  const estudos = aulas.map(id => (dados.videos || []).find(aula => aula.id === id && !aula.concluido));
  if (prioridades.some(tarefa => !tarefa) || estudos.some(aula => !aula)) {
    return res.status(409).json({ success: false, message: 'Uma tarefa ou aula já não está disponível. Atualize a revisão e tente novamente.' });
  }
  const plano = {
    semana,
    tarefas: prioridades.map(({ id, texto }) => ({ id, texto })),
    aulas: estudos.map(({ id, titulo }) => ({ id, titulo }))
  };
  dados.planos_semanais ||= {};
  if (tarefas.length || aulas.length) dados.planos_semanais[semana] = plano;
  else delete dados.planos_semanais[semana];
  await salvarBancoUsuario(dados, req.usuarioId);
  res.json({ success: true, data: plano });
}));

app.delete('/api/metas/limpar-selecao', rotaPortal(async (req, res) => {
  const { todas, ids } = req.body || {};
  if (!todas && (!Array.isArray(ids) || ids.length === 0)) {
    return res.status(400).json({ success: false, message: 'Selecione ao menos uma meta para excluir.' });
  }
  const dbUser = await obterBancoUsuario(req.usuarioId);
  if (!Array.isArray(dbUser.metas)) dbUser.metas = [];
  if (todas) {
    dbUser.metas = [];
  } else {
    const setIds = new Set(ids.map(String));
    dbUser.metas = dbUser.metas.filter(m => !setIds.has(String(m.id)));
  }
  await salvarBancoUsuario(dbUser, req.usuarioId);
  res.json({ success: true, message: 'Metas excluídas com sucesso.' });
}));

app.delete('/api/metas/:id', rotaPortal(async (req, res) => {
  const idNum = parseInt(req.params.id, 10);
  const dbUser = await obterBancoUsuario(req.usuarioId);
  const idx = (dbUser.metas || []).findIndex(m => m.id === idNum);

  if (idx === -1) {
    return res.status(404).json({ success: false, message: 'Meta não encontrada.' });
  }

  dbUser.metas.splice(idx, 1);
  await salvarBancoUsuario(dbUser, req.usuarioId);
  res.json({ success: true, message: 'Meta removida com sucesso.' });
}));

// ================= ROTA DE CONFIRMAÇÃO DIRETA DE VÍDEO (OPÇÃO 2) ================= //

app.post('/api/ai/confirmar-video', aiRateLimiter, rotaPortal(async (req, res) => {
  const { videoSelecionado, diasAlvo } = req.body;

  if (!videoSelecionado || !videoSelecionado.url_youtube || !videoSelecionado.titulo) {
    return res.status(400).json({ success: false, message: 'Dados do vídeo inválidos.' });
  }

  const dbUser = await obterBancoUsuario(req.usuarioId);
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

  await salvarBancoUsuario(dbUser, req.usuarioId);

  res.json({
    success: true,
    mensagem: `Excelente escolha! O vídeo "${videoFinal.titulo}" foi confirmado e agendado com sucesso para ${dias.join(', ')}.`,
    acoesExecutadas: acoes
  });
}));

// ================= MOTOR DE IA COM PRÉVIAS INTERATIVAS ================= //

const propostasEstudo = new Map();
app.post('/api/ai/chat', aiRateLimiter, rotaPortal(async (req, res) => {
  const { prompt, propostaId } = req.body;

  if (!propostaId && (typeof prompt !== 'string' || !prompt.trim())) {
    return res.status(400).json({ success: false, message: 'Mensagem vazia.' });
  }

  try {
    const dbUser = await obterBancoUsuario(req.usuarioId);
    const atual = JSON.stringify(dbUser);
    if (propostaId) {
      const proposta = propostasEstudo.get(req.usuarioId);
      if (!proposta || proposta.id !== propostaId || proposta.expira < Date.now() || proposta.anterior !== atual) {
        return res.status(409).json({ success: false, message: 'A proposta expirou ou os dados mudaram. Solicite uma nova prévia.' });
      }
      await salvarBancoUsuario(proposta.dados, req.usuarioId, dbUser);
      propostasEstudo.delete(req.usuarioId);
      return res.json({ success: true, mensagem: proposta.resultado.mensagem, acoesExecutadas: proposta.resultado.acoesExecutadas });
    }
    const proposto = JSON.parse(atual);
    const resultado = await processarComandoInteligente(prompt.trim(), proposto);
    let previa = null;
    if (JSON.stringify(proposto) !== atual) {
      for (const [id, proposta] of propostasEstudo) {
        if (proposta.expira <= Date.now()) propostasEstudo.delete(id);
      }
      previa = randomUUID();
      propostasEstudo.set(req.usuarioId, {
        id: previa, expira: Date.now() + 300000, anterior: atual, dados: proposto, resultado
      });
    }

    res.json({
      success: true,
      mensagem: previa ? 'Confira a proposta antes de aplicar.' : resultado.mensagem,
      acoesExecutadas: previa ? [] : resultado.acoesExecutadas,
      previa: previa ? { id: previa, acoes: resultado.acoesExecutadas } : null,
      opcoesSugeridas: resultado.opcoesSugeridas || null,
      diasAlvo: resultado.diasAlvo || []
    });
  } catch (error) {
    console.error('[AI Error]', error);
    res.status(500).json({ success: false, message: 'Erro ao processar comando de IA.' });
  }
}));

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

app.use((erro, req, res, next) => {
  if (res.headersSent) return next(erro);
  if (!req.path.startsWith('/api/')) return next(erro);
  const status = [400, 409, 413].includes(erro.status) ? erro.status : 500;
  if (status === 500) console.error('[API do portal]', erro.code || erro.name);
  res.status(status).json({
    success: false,
    message: status === 409 ? erro.message : 'Não foi possível concluir a operação.'
  });
});

async function iniciarPortal() {
  if (process.env.DATABASE_URL) portalPostgres = await abrirPortalPostgres();
  pushService = await initPushService({
    dataDir: DATA_DIR,
    obterBancoUsuario,
    salvarBancoUsuario,
    listarUsuariosComAlertas: portalPostgres?.listarUsuariosComAlertas,
    obterOuCriarVapid: portalPostgres?.obterOuCriarVapid
  });
  app.listen(PORT, '0.0.0.0', () => {
  console.log('[Portal Nexus Corporativo] Servidor ativo na porta ' + PORT);
  console.log('[Database] Armazenamento do portal:', portalPostgres ? 'PostgreSQL' : DB_FILE);
  console.log('[Finanças Integrado] Aplicação de Finanças disponível em /financas-app');

  // Verifica ao acordar e a cada minuto enquanto o serviço estiver ativo.
  function verificarAlertas() {
    if (pushService && pushService.isEnabled()) {
      pushService.checkAndDispatchDueNotifications().catch(err => {
        console.warn('[WebPush Loop]', err.message);
      });
    }
  }
  verificarAlertas();
  setInterval(verificarAlertas, 60 * 1000);
  });
}
iniciarPortal().catch(erro => {
  console.error('[Portal] Não foi possível inicializar o armazenamento:', erro.code || erro.name);
  process.exit(1);
});
