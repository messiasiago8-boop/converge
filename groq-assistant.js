/**
 * groq-assistant.js - Copiloto Unificado CONVERGE IA via Groq (Llama 3.3 70B) com Function Calling
 * Executa ações reais em todos os 4 módulos: Rotina & Agenda, Finanças, Educação e Metas.
 */

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

function getHojeBrasil() {
  try {
    const parts = {};
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(new Date()).forEach(p => { parts[p.type] = p.value; });
    return {
      hoje: `${parts.year}-${parts.month}-${parts.day}`,
      agora: `${parts.hour}:${parts.minute}`
    };
  } catch (e) {
    const d = new Date();
    return { hoje: d.toISOString().slice(0, 10), agora: '12:00' };
  }
}

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'criar_tarefa_checklist',
      description: 'Adiciona uma tarefa no Checklist do Dia ou no Top 3 de prioridades da Rotina.',
      parameters: {
        type: 'object',
        properties: {
          texto: { type: 'string', description: 'Descrição da tarefa' },
          data: { type: 'string', description: 'Data no formato YYYY-MM-DD (opcional, padrão hoje)' },
          horario: { type: 'string', description: 'Horário no formato HH:MM (opcional)' },
          top3: { type: 'boolean', description: 'true se for prioridade máxima do Top 3, false para Checklist do Dia' }
        },
        required: ['texto']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'criar_compromisso_agenda',
      description: 'Agenda um novo compromisso na Agenda (com data, horário, categoria e local).',
      parameters: {
        type: 'object',
        properties: {
          titulo: { type: 'string', description: 'Título do compromisso' },
          data: { type: 'string', description: 'Data no formato YYYY-MM-DD' },
          horario: { type: 'string', description: 'Horário no formato HH:MM (ex: 14:30)' },
          categoria: { type: 'string', enum: ['pessoal', 'trabalho', 'estudos', 'financas'] },
          local: { type: 'string', description: 'Local ou link (opcional)' }
        },
        required: ['titulo', 'data', 'horario']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'criar_habito',
      description: 'Cria um novo hábito semanal na Rotina.',
      parameters: {
        type: 'object',
        properties: {
          nome: { type: 'string', description: 'Nome do hábito (ex: Beber 2L de água, Ler 20 min)' }
        },
        required: ['nome']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'criar_meta',
      description: 'Cria uma nova meta no módulo de Metas & Objetivos.',
      parameters: {
        type: 'object',
        properties: {
          titulo: { type: 'string', description: 'Título da meta' },
          categoria: { type: 'string', enum: ['financeira', 'estudos', 'pessoal'], description: 'Tipo da meta' },
          valor_alvo: { type: 'number', description: 'Valor numérico alvo (ex: 5000 para R$ 5.000 ou 100 para 100%)' },
          prazo: { type: 'string', description: 'Prazo no formato YYYY-MM-DD (opcional)' }
        },
        required: ['titulo']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'criar_topico_estudo',
      description: 'Cria um novo tópico/trilha de estudos no módulo Educação.',
      parameters: {
        type: 'object',
        properties: {
          nome: { type: 'string', description: 'Nome da trilha/tópico de estudo' }
        },
        required: ['nome']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'registrar_financa',
      description: 'Registra uma nova receita (entrada) ou despesa (gasto) no módulo Finanças.',
      parameters: {
        type: 'object',
        properties: {
          tipo: { type: 'string', enum: ['entrada', 'despesa'], description: 'entrada para receita/salário, despesa para gasto' },
          descricao: { type: 'string', description: 'Descrição da movimentação (ex: Mercado, Salário, Uber)' },
          valor: { type: 'number', description: 'Valor em reais (número positivo)' },
          categoria: { type: 'string', enum: ['50', '30', '20'], description: 'Apenas para despesa: 50=Essencial, 30=Estilo de Vida/Lazer, 20=Investimento/Futuro' }
        },
        required: ['tipo', 'descricao', 'valor']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'consultar_resumo_geral',
      description: 'Consulta o resumo atual de tarefas de hoje, compromissos, metas, trilhas de estudo e finanças do usuário.',
      parameters: { type: 'object', properties: {} }
    }
  }
];

async function executarFerramenta(nome, args, { usuarioId, authHeader, financePort, obterBancoUsuario, salvarBancoUsuario, adicionarPrioridade }) {
  const { hoje } = getHojeBrasil();

  if (nome === 'criar_tarefa_checklist') {
    const dbUser = await obterBancoUsuario(usuarioId);
    const dataAlvo = args.data || hoje;
    const nova = adicionarPrioridade(dbUser, String(args.texto || '').trim(), Boolean(args.top3), dataAlvo, args.horario || null);
    await salvarBancoUsuario(dbUser, usuarioId);
    return {
      ok: true,
      modulo: 'rotina',
      resumoAcao: `Tarefa criada: "${nova.texto}"${nova.horario ? ' às ' + nova.horario : ''}`,
      dados: nova
    };
  }

  if (nome === 'criar_compromisso_agenda') {
    const dbUser = await obterBancoUsuario(usuarioId);
    if (!Array.isArray(dbUser.compromissos)) dbUser.compromissos = [];
    const novoComp = {
      id: dbUser.compromissos.length > 0 ? Math.max(...dbUser.compromissos.map(c => c.id || 0)) + 1 : 1,
      titulo: String(args.titulo || '').trim(),
      data: (args.data || hoje).slice(0, 10),
      horario: args.horario || '09:00',
      categoria: args.categoria || 'pessoal',
      local: args.local || '',
      criado_em: new Date().toISOString()
    };
    dbUser.compromissos.push(novoComp);
    await salvarBancoUsuario(dbUser, usuarioId);
    return {
      ok: true,
      modulo: 'rotina',
      resumoAcao: `Compromisso agendado: "${novoComp.titulo}" (${novoComp.data} às ${novoComp.horario})`,
      dados: novoComp
    };
  }

  if (nome === 'criar_habito') {
    const dbUser = await obterBancoUsuario(usuarioId);
    if (!Array.isArray(dbUser.habitos)) dbUser.habitos = [];
    const novoHab = {
      id: dbUser.habitos.length > 0 ? Math.max(...dbUser.habitos.map(h => h.id || 0)) + 1 : 1,
      nome: String(args.nome || '').trim(),
      dias_concluidos: [],
      criado_em: new Date().toISOString()
    };
    dbUser.habitos.push(novoHab);
    await salvarBancoUsuario(dbUser, usuarioId);
    return {
      ok: true,
      modulo: 'rotina',
      resumoAcao: `Hábito criado: "${novoHab.nome}"`,
      dados: novoHab
    };
  }

  if (nome === 'criar_meta') {
    const dbUser = await obterBancoUsuario(usuarioId);
    if (!Array.isArray(dbUser.metas)) dbUser.metas = [];
    const novaMeta = {
      id: dbUser.metas.length > 0 ? Math.max(...dbUser.metas.map(m => m.id || 0)) + 1 : 1,
      titulo: String(args.titulo || '').trim(),
      tipo: args.categoria || 'pessoal',
      categoria: args.categoria || 'pessoal',
      valor_alvo: Number(args.valor_alvo) || 100,
      valor_atual: 0,
      prazo: args.prazo || '',
      concluida: false,
      criado_em: new Date().toISOString()
    };
    dbUser.metas.push(novaMeta);
    await salvarBancoUsuario(dbUser, usuarioId);
    return {
      ok: true,
      modulo: 'metas',
      resumoAcao: `Meta criada: "${novaMeta.titulo}"`,
      dados: novaMeta
    };
  }

  if (nome === 'criar_topico_estudo') {
    const dbUser = await obterBancoUsuario(usuarioId);
    if (!Array.isArray(dbUser.topicos)) dbUser.topicos = [];
    const novoTop = {
      id: dbUser.topicos.length > 0 ? Math.max(...dbUser.topicos.map(t => t.id || 0)) + 1 : 1,
      nome: String(args.nome || '').trim()
    };
    dbUser.topicos.push(novoTop);
    await salvarBancoUsuario(dbUser, usuarioId);
    return {
      ok: true,
      modulo: 'educacao',
      resumoAcao: `Trilha criada: "${novoTop.nome}"`,
      dados: novoTop
    };
  }

  if (nome === 'registrar_financa') {
    const isEntrada = args.tipo === 'entrada';
    const endpoint = isEntrada ? '/api/entradas' : '/api/despesas';
    const body = isEntrada
      ? { descricao: args.descricao, valor: Number(args.valor) }
      : { descricao: args.descricao, valor: Number(args.valor), categoria: args.categoria || '30' };

    const resp = await fetch(`http://127.0.0.1:${financePort}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader ? { Authorization: authHeader } : {})
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000)
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return { ok: false, error: json.error || 'Falha ao registrar no módulo Finanças.' };
    }
    return {
      ok: true,
      modulo: 'financas',
      resumoAcao: `${isEntrada ? 'Entrada' : 'Despesa'} registrada: ${args.descricao} (R$ ${Number(args.valor).toFixed(2)})`,
      dados: json
    };
  }

  if (nome === 'consultar_resumo_geral') {
    const dbUser = await obterBancoUsuario(usuarioId);
    const tarefasHoje = (dbUser.prioridades_dia || []).filter(p => !p.data || p.data === hoje);
    const compromissosHoje = (dbUser.compromissos || []).filter(c => c.data === hoje);
    let financas = null;
    try {
      const mesAtual = hoje.slice(0, 7);
      const rf = await fetch(`http://127.0.0.1:${financePort}/api/dados?mes=${mesAtual}`, {
        headers: authHeader ? { Authorization: authHeader } : {},
        signal: AbortSignal.timeout(5000)
      });
      if (rf.ok) {
        const df = await rf.json();
        const totalEnt = (df.entradas || []).reduce((s, e) => s + Number(e.valor || 0), 0);
        const totalDesp = (df.despesas || []).reduce((s, d) => s + Number(d.valor || 0), 0);
        financas = { mes: mesAtual, totalEntradas: totalEnt, totalDespesas: totalDesp, saldo: totalEnt - totalDesp };
      }
    } catch (e) {}

    return {
      ok: true,
      dados: {
        dataHoje: hoje,
        tarefasHoje: tarefasHoje.map(t => ({ texto: t.texto, horario: t.horario, concluida: t.concluida, top3: t.top3 })),
        compromissosHoje: compromissosHoje.map(c => ({ titulo: c.titulo, horario: c.horario, categoria: c.categoria })),
        totalMetas: (dbUser.metas || []).length,
        totalTrilhas: (dbUser.topicos || []).length,
        financas
      }
    };
  }

  return { ok: false, error: 'Ferramenta desconhecida.' };
}

async function processarMensagemGroq({ mensagem, historico = [], contexto }) {
  const apiKey = (process.env.GROQ_API_KEY || '').trim();
  if (!apiKey) {
    return {
      success: false,
      error: 'Chave GROQ_API_KEY não configurada no servidor. Crie uma chave gratuita em console.groq.com/keys e adicione em Environment no Render.'
    };
  }

  const { hoje, agora } = getHojeBrasil();
  const systemPrompt = `Você é a CONVERGE IA, assistente executiva integrada ao CONVERGE Life OS.
Hoje é ${hoje} e agora são ${agora} (horário de Brasília).
Você tem ferramentas reais para agir em TODOS os módulos do usuário: Rotina & Agenda (tarefas do checklist, Top 3, compromissos, hábitos), Finanças (entradas, despesas 50/30/20, resumo), Educação (trilhas) e Metas.
Sempre que o usuário pedir para adicionar, agendar, registrar ou consultar algo, CHAME a ferramenta correspondente imediatamente.
Responda sempre em português do Brasil, de forma objetiva, clara e amigável.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...historico.slice(-8).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') })),
    { role: 'user', content: String(mensagem || '').trim() }
  ];

  const acoesExecutadas = [];
  const modulosAfetados = new Set();

  // Até 3 rodadas de tool-calling
  for (let step = 0; step < 3; step++) {
    const resp = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        tools: TOOLS,
        tool_choice: 'auto',
        temperature: 0.3,
        max_tokens: 800
      }),
      signal: AbortSignal.timeout(20000)
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(data.error?.message || `Erro Groq HTTP ${resp.status}`);
    }

    const choice = data.choices?.[0]?.message;
    if (!choice) throw new Error('Resposta vazia da Groq.');

    messages.push(choice);

    if (Array.isArray(choice.tool_calls) && choice.tool_calls.length > 0) {
      for (const tc of choice.tool_calls) {
        let parsedArgs = {};
        try { parsedArgs = JSON.parse(tc.function.arguments || '{}'); } catch (e) {}
        const result = await executarFerramenta(tc.function.name, parsedArgs, contexto);
        if (result.resumoAcao) acoesExecutadas.push(result.resumoAcao);
        if (result.modulo) modulosAfetados.add(result.modulo);

        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(result)
        });
      }
      continue;
    }

    return {
      success: true,
      resposta: choice.content || 'Pronto!',
      acoesExecutadas,
      modulosAfetados: Array.from(modulosAfetados)
    };
  }

  return {
    success: true,
    resposta: 'Ações concluídas com sucesso!',
    acoesExecutadas,
    modulosAfetados: Array.from(modulosAfetados)
  };
}

module.exports = { processarMensagemGroq };
