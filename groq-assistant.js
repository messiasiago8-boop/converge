/**
 * groq-assistant.js - Copiloto Unificado CONVERGE IA via Groq com Function Calling completo
 * Controla TODOS os módulos do CONVERGE Life OS:
 * - Finanças (Entradas/Salários por mês, Despesas 50/30/20, Limites, Investimentos/Potes, Projetos & Compras)
 * - Rotina & Agenda (Checklist do Dia com data/horário, Top 3, Concluir/Editar/Excluir tarefas, Compromissos, Hábitos)
 * - Metas & Objetivos (Criar, atualizar progresso, concluir, excluir, listar)
 * - Educação (Trilhas/Tópicos, Vídeos do YouTube, Cronograma semanal)
 */

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODELS = [
  ...(process.env.GROQ_MODEL ? [process.env.GROQ_MODEL.trim()] : []),
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b',
  'qwen/qwen3.8-27b'
];

function getAgoraBrasil() {
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
    const hoje = `${parts.year}-${parts.month}-${parts.day}`;
    return {
      hoje,
      ano: parseInt(parts.year, 10),
      mesAtual: `${parts.year}-${parts.month}`,
      agora: `${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`
    };
  } catch (e) {
    const d = new Date();
    const hoje = d.toISOString().slice(0, 10);
    return { hoje, ano: d.getFullYear(), mesAtual: hoje.slice(0, 7), agora: '12:00' };
  }
}

function normalizarTexto(str) {
  return String(str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function resolverMesParaData(mes, data, hoje) {
  if (typeof data === 'string' && /^\d{4}-\d{2}-\d{2}/.test(data.trim())) {
    const d = data.trim().slice(0, 10);
    return { mesIso: d.slice(0, 7), dataSql: `${d} 12:00:00` };
  }
  if (typeof mes === 'string' && /^\d{4}-\d{2}$/.test(mes.trim())) {
    const m = mes.trim();
    return { mesIso: m, dataSql: `${m}-01 12:00:00` };
  }
  return { mesIso: hoje.slice(0, 7), dataSql: `${hoje} 12:00:00` };
}

function extrairYouTubeId(url) {
  if (!url) return null;
  const s = String(url).trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  const match = s.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

const TOOLS = [
  // ===== FINANÇAS =====
  {
    type: 'function',
    function: {
      name: 'consultar_financas',
      description: 'Consulta entradas (receitas/salários), despesas (50/30/20), limites, saldo disponível, investimentos (potes) e projetos de compra de um mês específico.',
      parameters: {
        type: 'object',
        properties: {
          mes: { type: 'string', description: 'Mês no formato YYYY-MM (ex: 2026-12 para dezembro de 2026). Se omitido, usa o mês atual.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'registrar_ou_atualizar_entrada',
      description: 'Adiciona uma nova receita/salário ou atualiza o valor de uma entrada existente (ex: "Coloque meu salário de dezembro para 1500 reais").',
      parameters: {
        type: 'object',
        properties: {
          descricao: { type: 'string', description: 'Nome da receita (ex: Salário, Freelance, Comissão)' },
          valor: { type: 'number', description: 'Valor em reais (número positivo)' },
          mes: { type: 'string', description: 'Mês de referência no formato YYYY-MM (ex: 2026-12)' },
          data: { type: 'string', description: 'Data exata YYYY-MM-DD (opcional)' },
          substituir_existente: { type: 'boolean', description: 'true para atualizar entrada com nome parecido no mesmo mês (ex: alterar salário), false para criar uma nova.' }
        },
        required: ['descricao', 'valor']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'registrar_despesa',
      description: 'Registra um gasto/despesa no módulo Finanças (categoria 50=Essencial, 30=Estilo de Vida/Lazer, 20=Investimentos/Futuro).',
      parameters: {
        type: 'object',
        properties: {
          descricao: { type: 'string', description: 'Descrição da despesa (ex: Mercado, Aluguel, Uber, Academia)' },
          valor: { type: 'number', description: 'Valor em reais (número positivo)' },
          categoria: { type: 'string', enum: ['50', '30', '20'], description: '50=Essencial/Fixo, 30=Estilo de Vida/Variável, 20=Investimento/Reserva' },
          mes: { type: 'string', description: 'Mês YYYY-MM (opcional, padrão mês atual)' },
          data: { type: 'string', description: 'Data YYYY-MM-DD (opcional)' }
        },
        required: ['descricao', 'valor', 'categoria']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'excluir_movimentacao_financeira',
      description: 'Exclui uma entrada ou despesa do mês informado, buscando pelo ID ou pelo nome/descrição.',
      parameters: {
        type: 'object',
        properties: {
          tipo: { type: 'string', enum: ['entrada', 'despesa'] },
          termo_ou_id: { type: 'string', description: 'ID numérico ou parte do nome da entrada/despesa' },
          mes: { type: 'string', description: 'Mês YYYY-MM (opcional, padrão mês atual)' }
        },
        required: ['tipo', 'termo_ou_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'definir_limites_orcamento',
      description: 'Define os limites mensais de gastos das categorias 50 (Essenciais), 30 (Estilo de Vida) e 20 (Investimentos).',
      parameters: {
        type: 'object',
        properties: {
          limite_50: { type: 'number', description: 'Limite em reais para Essenciais (50%)' },
          limite_30: { type: 'number', description: 'Limite em reais para Estilo de Vida (30%)' },
          limite_20: { type: 'number', description: 'Limite em reais para Investimentos (20%)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'gerenciar_investimento',
      description: 'Cria, atualiza ou exclui um ativo/pote na aba Investimentos (CDB, Tesouro Selic, LCI/LCA, Ações, FIIs, Reserva).',
      parameters: {
        type: 'object',
        properties: {
          acao: { type: 'string', enum: ['criar', 'atualizar', 'excluir'] },
          nome: { type: 'string', description: 'Nome do investimento ou termo/ID para buscar' },
          valor: { type: 'number', description: 'Valor aplicado em reais' },
          categoria_ativo: { type: 'string', description: 'Tipo do ativo: CDB, Tesouro Selic, LCI/LCA, Ações, FIIs, Outros' },
          instituicao: { type: 'string', description: 'Banco ou corretora (ex: Nubank, Inter, XP)' }
        },
        required: ['acao', 'nome']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'gerenciar_projeto_compra',
      description: 'Cria um projeto/grande compra, faz um aporte em um projeto existente ou exclui um projeto na aba Projetos & Compras.',
      parameters: {
        type: 'object',
        properties: {
          acao: { type: 'string', enum: ['criar', 'aportar', 'excluir'] },
          nome: { type: 'string', description: 'Nome do projeto (ex: Trocar Notebook, Viagem)' },
          tipo: { type: 'string', enum: ['Projeto', 'Compra'], description: 'Para criar: Projeto ou Compra' },
          valor_objetivo: { type: 'number', description: 'Para criar: valor total objetivo em reais' },
          valor_aporte: { type: 'number', description: 'Para aportar: valor a adicionar ao projeto em reais' }
        },
        required: ['acao', 'nome']
      }
    }
  },

  // ===== ROTINA & AGENDA =====
  {
    type: 'function',
    function: {
      name: 'consultar_rotina_e_agenda',
      description: 'Consulta tarefas do Checklist do Dia, prioridades Top 3, compromissos da Agenda e hábitos do usuário.',
      parameters: {
        type: 'object',
        properties: {
          data: { type: 'string', description: 'Data YYYY-MM-DD (opcional, padrão hoje)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'criar_tarefa_rotina',
      description: 'Adiciona uma nova tarefa no Checklist do Dia (com data e horário) ou nas prioridades Top 3 da Rotina.',
      parameters: {
        type: 'object',
        properties: {
          texto: { type: 'string', description: 'Descrição da tarefa' },
          data: { type: 'string', description: 'Data YYYY-MM-DD (padrão hoje)' },
          horario: { type: 'string', description: 'Horário HH:MM (ex: 09:00, 19:30)' },
          top3: { type: 'boolean', description: 'true para prioridade máxima Top 3, false para Checklist do Dia' }
        },
        required: ['texto']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'gerenciar_tarefa_rotina',
      description: 'Conclui, desmarca, promove para Top 3, renomeia ou exclui uma tarefa existente da Rotina.',
      parameters: {
        type: 'object',
        properties: {
          acao: { type: 'string', enum: ['concluir', 'desmarcar', 'promover_top3', 'excluir', 'renomear'] },
          termo_ou_id: { type: 'string', description: 'ID ou parte do texto da tarefa' },
          novo_texto: { type: 'string', description: 'Apenas se acao=renomear' }
        },
        required: ['acao', 'termo_ou_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'criar_compromisso_agenda',
      description: 'Agenda um novo compromisso na Agenda (gera notificações automáticas 10 min antes e na hora exata).',
      parameters: {
        type: 'object',
        properties: {
          titulo: { type: 'string', description: 'Título do compromisso' },
          data: { type: 'string', description: 'Data YYYY-MM-DD' },
          horario: { type: 'string', description: 'Horário HH:MM' },
          categoria: { type: 'string', enum: ['pessoal', 'trabalho', 'estudos', 'financas'] },
          local: { type: 'string', description: 'Local ou observação (opcional)' }
        },
        required: ['titulo', 'data', 'horario']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'excluir_compromisso_agenda',
      description: 'Remove um compromisso da Agenda pelo ID ou título.',
      parameters: {
        type: 'object',
        properties: {
          termo_ou_id: { type: 'string', description: 'ID ou parte do título do compromisso' }
        },
        required: ['termo_ou_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'gerenciar_habito',
      description: 'Cria um hábito semanal, marca o check-in de hoje ou exclui um hábito existente.',
      parameters: {
        type: 'object',
        properties: {
          acao: { type: 'string', enum: ['criar', 'checkin_hoje', 'excluir'] },
          nome_ou_id: { type: 'string', description: 'Nome do hábito (ou ID para check-in/excluir)' }
        },
        required: ['acao', 'nome_ou_id']
      }
    }
  },

  // ===== METAS =====
  {
    type: 'function',
    function: {
      name: 'consultar_metas',
      description: 'Lista todas as metas e objetivos cadastrados pelo usuário com progresso atual.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'gerenciar_meta',
      description: 'Cria, atualiza o valor/progresso, conclui ou exclui uma meta no módulo Metas.',
      parameters: {
        type: 'object',
        properties: {
          acao: { type: 'string', enum: ['criar', 'atualizar', 'concluir', 'excluir'] },
          titulo_ou_id: { type: 'string', description: 'Título da meta (ou ID para atualizar/concluir/excluir)' },
          categoria: { type: 'string', enum: ['financeira', 'estudos', 'pessoal'] },
          valor_alvo: { type: 'number', description: 'Valor objetivo numérico' },
          valor_atual: { type: 'number', description: 'Progresso/valor atual acumulado' },
          prazo: { type: 'string', description: 'Data limite YYYY-MM-DD (opcional)' }
        },
        required: ['acao', 'titulo_ou_id']
      }
    }
  },

  // ===== EDUCAÇÃO =====
  {
    type: 'function',
    function: {
      name: 'consultar_estudos',
      description: 'Lista trilhas/tópicos de estudo, aulas cadastradas e o cronograma semanal do módulo Educação.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'gerenciar_trilha_estudo',
      description: 'Cria ou exclui uma trilha/tópico de estudo no módulo Educação.',
      parameters: {
        type: 'object',
        properties: {
          acao: { type: 'string', enum: ['criar', 'excluir'] },
          nome_ou_id: { type: 'string', description: 'Nome da trilha/tópico' }
        },
        required: ['acao', 'nome_ou_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'adicionar_ou_agendar_video',
      description: 'Adiciona um vídeo do YouTube a uma trilha de estudo e/ou agenda no cronograma semanal (Segunda a Domingo).',
      parameters: {
        type: 'object',
        properties: {
          titulo: { type: 'string', description: 'Título da aula' },
          url_youtube: { type: 'string', description: 'Link ou ID do vídeo no YouTube (opcional se o vídeo já existir)' },
          nome_trilha: { type: 'string', description: 'Nome da trilha (cria automaticamente se não existir)' },
          dia_semana: { type: 'string', enum: ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'], description: 'Dia da semana para agendar no cronograma (opcional)' }
        },
        required: ['titulo']
      }
    }
  }
];

async function finFetch(financePort, authHeader, urlPath, options = {}) {
  const resp = await fetch(`http://127.0.0.1:${financePort}${urlPath}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(authHeader ? { Authorization: authHeader } : {}),
      ...(options.headers || {})
    },
    signal: AbortSignal.timeout(10000)
  });
  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, data };
}

async function executarFerramenta(nome, args, ctx) {
  const { usuarioId, authHeader, financePort, obterBancoUsuario, salvarBancoUsuario, adicionarPrioridade } = ctx;
  const { hoje, mesAtual } = getAgoraBrasil();

  // ----- FINANÇAS -----
  if (nome === 'consultar_financas') {
    const mes = (args.mes && /^\d{4}-\d{2}$/.test(args.mes.trim())) ? args.mes.trim() : mesAtual;
    const [rDados, rProj] = await Promise.all([
      finFetch(financePort, authHeader, `/api/dados?mes=${mes}`),
      finFetch(financePort, authHeader, '/api/projetos')
    ]);
    if (!rDados.ok) return { ok: false, error: rDados.data.error || 'Erro ao consultar finanças.' };
    const entradas = rDados.data.entradas || [];
    const despesas = rDados.data.despesas || [];
    const potes = rDados.data.potes || [];
    const projetos = rProj.ok ? (rProj.data.projetos || []) : [];
    const totalEnt = entradas.reduce((s, e) => s + Number(e.valor || 0), 0);
    const totalDesp = despesas.reduce((s, d) => s + Number(d.valor || 0), 0);
    return {
      ok: true,
      dados: {
        mes,
        totalEntradas: Number(totalEnt.toFixed(2)),
        totalDespesas: Number(totalDesp.toFixed(2)),
        saldoDisponivel: Number((totalEnt - totalDesp).toFixed(2)),
        entradas: entradas.map(e => ({ id: e.id, descricao: e.descricao, valor: e.valor, data: e.data })),
        despesas: despesas.map(d => ({ id: d.id, descricao: d.descricao, valor: d.valor, categoria: d.categoria, data: d.data })),
        limites: rDados.data.limites || {},
        investimentos: potes.map(p => ({ id: p.id, nome: p.nome, categoria: p.categoria_ativo, valor: p.valor })),
        projetos: projetos.map(p => ({ id: p.id, nome: p.nome, objetivo: p.valor_objetivo, acumulado: p.valor_acumulado }))
      }
    };
  }

  if (nome === 'registrar_ou_atualizar_entrada') {
    const { mesIso, dataSql } = resolverMesParaData(args.mes, args.data, hoje);
    const desc = String(args.descricao || 'Receita').trim();
    const valor = Number(args.valor);
    if (!Number.isFinite(valor) || valor <= 0) return { ok: false, error: 'Valor inválido.' };

    // Se substituir_existente (ou se parecer atualização de salário), procura entrada equivalente no mês alvo
    if (args.substituir_existente !== false) {
      const rAtual = await finFetch(financePort, authHeader, `/api/dados?mes=${mesIso}`);
      if (rAtual.ok && Array.isArray(rAtual.data.entradas)) {
        const alvoNorm = normalizarTexto(desc);
        const existente = rAtual.data.entradas.find(e => {
          const en = normalizarTexto(e.descricao);
          return en === alvoNorm || en.includes(alvoNorm) || alvoNorm.includes(en);
        });
        if (existente) {
          const rUpd = await finFetch(financePort, authHeader, `/api/entradas/${existente.id}`, {
            method: 'PUT',
            body: JSON.stringify({ descricao: desc, valor })
          });
          if (!rUpd.ok) return { ok: false, error: rUpd.data.error || 'Falha ao atualizar entrada.' };
          return {
            ok: true,
            modulo: 'financas',
            mesAfetado: mesIso,
            resumoAcao: `Entrada atualizada (${mesIso}): ${desc} → R$ ${valor.toFixed(2)}`,
            dados: rUpd.data
          };
        }
      }
    }

    const rAdd = await finFetch(financePort, authHeader, '/api/entradas', {
      method: 'POST',
      body: JSON.stringify({ descricao: desc, valor, data: dataSql })
    });
    if (!rAdd.ok) return { ok: false, error: rAdd.data.error || 'Falha ao cadastrar entrada.' };
    return {
      ok: true,
      modulo: 'financas',
      mesAfetado: mesIso,
      resumoAcao: `Entrada registrada (${mesIso}): ${desc} — R$ ${valor.toFixed(2)}`,
      dados: rAdd.data
    };
  }

  if (nome === 'registrar_despesa') {
    const { mesIso, dataSql } = resolverMesParaData(args.mes, args.data, hoje);
    const desc = String(args.descricao || 'Despesa').trim();
    const valor = Number(args.valor);
    const categoria = ['50', '30', '20'].includes(String(args.categoria)) ? String(args.categoria) : '30';
    const rAdd = await finFetch(financePort, authHeader, '/api/despesas', {
      method: 'POST',
      body: JSON.stringify({ descricao: desc, valor, categoria, data: dataSql })
    });
    if (!rAdd.ok) return { ok: false, error: rAdd.data.error || 'Falha ao cadastrar despesa.' };
    return {
      ok: true,
      modulo: 'financas',
      mesAfetado: mesIso,
      resumoAcao: `Despesa registrada (${mesIso}): ${desc} — R$ ${valor.toFixed(2)} (${categoria}%)`,
      dados: rAdd.data
    };
  }

  if (nome === 'excluir_movimentacao_financeira') {
    const mes = (args.mes && /^\d{4}-\d{2}$/.test(args.mes.trim())) ? args.mes.trim() : mesAtual;
    const isEntrada = args.tipo === 'entrada';
    let targetId = /^\d+$/.test(String(args.termo_ou_id).trim()) ? Number(args.termo_ou_id) : null;
    let label = String(args.termo_ou_id);

    if (!targetId) {
      const rDados = await finFetch(financePort, authHeader, `/api/dados?mes=${mes}`);
      const lista = isEntrada ? (rDados.data.entradas || []) : (rDados.data.despesas || []);
      const termo = normalizarTexto(args.termo_ou_id);
      const item = lista.find(x => normalizarTexto(x.descricao).includes(termo));
      if (!item) return { ok: false, error: `Não encontrei ${args.tipo} com "${args.termo_ou_id}" em ${mes}.` };
      targetId = item.id;
      label = item.descricao;
    }

    const rDel = await finFetch(financePort, authHeader, `${isEntrada ? '/api/entradas' : '/api/despesas'}/${targetId}`, { method: 'DELETE' });
    if (!rDel.ok) return { ok: false, error: rDel.data.error || 'Falha ao excluir movimentação.' };
    return {
      ok: true,
      modulo: 'financas',
      mesAfetado: mes,
      resumoAcao: `${isEntrada ? 'Entrada' : 'Despesa'} excluída: ${label}`
    };
  }

  if (nome === 'definir_limites_orcamento') {
    const body = {};
    if (args.limite_50 !== undefined) body['50'] = Number(args.limite_50);
    if (args.limite_30 !== undefined) body['30'] = Number(args.limite_30);
    if (args.limite_20 !== undefined) body['20'] = Number(args.limite_20);
    const rLim = await finFetch(financePort, authHeader, '/api/limites', {
      method: 'POST',
      body: JSON.stringify(body)
    });
    if (!rLim.ok) return { ok: false, error: rLim.data.error || 'Falha ao salvar limites.' };
    return { ok: true, modulo: 'financas', resumoAcao: 'Limites 50/30/20 atualizados' };
  }

  if (nome === 'gerenciar_investimento') {
    if (args.acao === 'criar') {
      const r = await finFetch(financePort, authHeader, '/api/potes', {
        method: 'POST',
        body: JSON.stringify({
          nome: args.nome,
          valor: Number(args.valor) || 0,
          categoria_ativo: args.categoria_ativo || 'CDB',
          instituicao: args.instituicao || 'Banco / Corretora'
        })
      });
      if (!r.ok) return { ok: false, error: r.data.error || 'Falha ao criar investimento.' };
      return { ok: true, modulo: 'financas', resumoAcao: `Investimento criado: ${args.nome} (R$ ${(Number(args.valor) || 0).toFixed(2)})` };
    }
    const rList = await finFetch(financePort, authHeader, '/api/potes');
    const potes = rList.data.potes || [];
    const termo = normalizarTexto(args.nome);
    const pote = potes.find(p => String(p.id) === String(args.nome) || normalizarTexto(p.nome).includes(termo));
    if (!pote) return { ok: false, error: `Investimento "${args.nome}" não encontrado.` };

    if (args.acao === 'atualizar') {
      const r = await finFetch(financePort, authHeader, `/api/potes/${pote.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...(args.valor !== undefined ? { valor: Number(args.valor) } : {}),
          ...(args.categoria_ativo ? { categoria_ativo: args.categoria_ativo } : {})
        })
      });
      if (!r.ok) return { ok: false, error: r.data.error || 'Falha ao atualizar investimento.' };
      return { ok: true, modulo: 'financas', resumoAcao: `Investimento atualizado: ${pote.nome}` };
    }
    if (args.acao === 'excluir') {
      const r = await finFetch(financePort, authHeader, `/api/potes/${pote.id}`, { method: 'DELETE' });
      if (!r.ok) return { ok: false, error: r.data.error || 'Falha ao excluir investimento.' };
      return { ok: true, modulo: 'financas', resumoAcao: `Investimento excluído: ${pote.nome}` };
    }
  }

  if (nome === 'gerenciar_projeto_compra') {
    if (args.acao === 'criar') {
      const r = await finFetch(financePort, authHeader, '/api/projetos', {
        method: 'POST',
        body: JSON.stringify({ nome: args.nome, tipo: args.tipo || 'Compra', valor_objetivo: Number(args.valor_objetivo) || 1000 })
      });
      if (!r.ok) return { ok: false, error: r.data.error || 'Falha ao criar projeto.' };
      return { ok: true, modulo: 'financas', resumoAcao: `Projeto criado: ${args.nome} (R$ ${Number(args.valor_objetivo || 1000).toFixed(2)})` };
    }
    const rList = await finFetch(financePort, authHeader, '/api/projetos');
    const projetos = rList.data.projetos || [];
    const termo = normalizarTexto(args.nome);
    const proj = projetos.find(p => String(p.id) === String(args.nome) || normalizarTexto(p.nome).includes(termo));
    if (!proj) return { ok: false, error: `Projeto "${args.nome}" não encontrado.` };

    if (args.acao === 'aportar') {
      const r = await finFetch(financePort, authHeader, `/api/projetos/${proj.id}/aportar`, {
        method: 'PUT',
        body: JSON.stringify({ valor: Number(args.valor_aporte) })
      });
      if (!r.ok) return { ok: false, error: r.data.error || 'Falha ao registrar aporte.' };
      return { ok: true, modulo: 'financas', resumoAcao: `Aporte de R$ ${Number(args.valor_aporte).toFixed(2)} em "${proj.nome}"` };
    }
    if (args.acao === 'excluir') {
      const r = await finFetch(financePort, authHeader, `/api/projetos/${proj.id}`, { method: 'DELETE' });
      if (!r.ok) return { ok: false, error: r.data.error || 'Falha ao excluir projeto.' };
      return { ok: true, modulo: 'financas', resumoAcao: `Projeto excluído: ${proj.nome}` };
    }
  }

  // ----- ROTINA & AGENDA -----
  if (nome === 'consultar_rotina_e_agenda') {
    const dataAlvo = (args.data && /^\d{4}-\d{2}-\d{2}$/.test(args.data)) ? args.data : hoje;
    const dbUser = await obterBancoUsuario(usuarioId);
    return {
      ok: true,
      dados: {
        dataConsultada: dataAlvo,
        tarefas: (dbUser.prioridades_dia || []).filter(p => p.top3 || !p.data || p.data === dataAlvo),
        compromissos: (dbUser.compromissos || []).filter(c => !args.data || c.data === dataAlvo),
        habitos: (dbUser.habitos || []).map(h => ({ id: h.id, nome: h.nome, dias: h.dias_concluidos || [] }))
      }
    };
  }

  if (nome === 'criar_tarefa_rotina') {
    const dbUser = await obterBancoUsuario(usuarioId);
    const dataAlvo = args.data || hoje;
    const nova = adicionarPrioridade(dbUser, String(args.texto || '').trim(), Boolean(args.top3), dataAlvo, args.horario || null);
    await salvarBancoUsuario(dbUser, usuarioId);
    return {
      ok: true,
      modulo: 'rotina',
      resumoAcao: `Tarefa criada (${nova.top3 ? 'Top 3' : 'Checklist'}): "${nova.texto}"${nova.horario ? ' às ' + nova.horario : ''}`,
      dados: nova
    };
  }

  if (nome === 'gerenciar_tarefa_rotina') {
    const dbUser = await obterBancoUsuario(usuarioId);
    const termo = normalizarTexto(args.termo_ou_id);
    const idx = (dbUser.prioridades_dia || []).findIndex(t => String(t.id) === String(args.termo_ou_id) || normalizarTexto(t.texto).includes(termo));
    if (idx === -1) return { ok: false, error: `Tarefa "${args.termo_ou_id}" não encontrada.` };
    const tarefa = dbUser.prioridades_dia[idx];

    if (args.acao === 'concluir') { tarefa.concluida = true; tarefa.concluida_em = new Date().toISOString(); }
    else if (args.acao === 'desmarcar') { tarefa.concluida = false; }
    else if (args.acao === 'promover_top3') { tarefa.top3 = true; }
    else if (args.acao === 'renomear' && args.novo_texto) { tarefa.texto = String(args.novo_texto).trim(); }
    else if (args.acao === 'excluir') { dbUser.prioridades_dia.splice(idx, 1); }

    await salvarBancoUsuario(dbUser, usuarioId);
    return { ok: true, modulo: 'rotina', resumoAcao: `Tarefa (${args.acao}): "${tarefa.texto}"` };
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
      resumoAcao: `Compromisso agendado: "${novoComp.titulo}" (${novoComp.data} às ${novoComp.horario})`
    };
  }

  if (nome === 'excluir_compromisso_agenda') {
    const dbUser = await obterBancoUsuario(usuarioId);
    const termo = normalizarTexto(args.termo_ou_id);
    const idx = (dbUser.compromissos || []).findIndex(c => String(c.id) === String(args.termo_ou_id) || normalizarTexto(c.titulo).includes(termo));
    if (idx === -1) return { ok: false, error: `Compromisso "${args.termo_ou_id}" não encontrado.` };
    const [rem] = dbUser.compromissos.splice(idx, 1);
    await salvarBancoUsuario(dbUser, usuarioId);
    return { ok: true, modulo: 'rotina', resumoAcao: `Compromisso excluído: "${rem.titulo}"` };
  }

  if (nome === 'gerenciar_habito') {
    const dbUser = await obterBancoUsuario(usuarioId);
    if (!Array.isArray(dbUser.habitos)) dbUser.habitos = [];
    if (args.acao === 'criar') {
      const novo = { id: dbUser.habitos.length ? Math.max(...dbUser.habitos.map(h => h.id || 0)) + 1 : 1, nome: String(args.nome_ou_id).trim(), dias_concluidos: [], criado_em: new Date().toISOString() };
      dbUser.habitos.push(novo);
      await salvarBancoUsuario(dbUser, usuarioId);
      return { ok: true, modulo: 'rotina', resumoAcao: `Hábito criado: "${novo.nome}"` };
    }
    const termo = normalizarTexto(args.nome_ou_id);
    const idx = dbUser.habitos.findIndex(h => String(h.id) === String(args.nome_ou_id) || normalizarTexto(h.nome).includes(termo));
    if (idx === -1) return { ok: false, error: `Hábito "${args.nome_ou_id}" não encontrado.` };
    if (args.acao === 'checkin_hoje') {
      if (!Array.isArray(dbUser.habitos[idx].dias_concluidos)) dbUser.habitos[idx].dias_concluidos = [];
      if (!dbUser.habitos[idx].dias_concluidos.includes(hoje)) dbUser.habitos[idx].dias_concluidos.push(hoje);
      await salvarBancoUsuario(dbUser, usuarioId);
      return { ok: true, modulo: 'rotina', resumoAcao: `Check-in hoje: "${dbUser.habitos[idx].nome}"` };
    }
    if (args.acao === 'excluir') {
      const [rem] = dbUser.habitos.splice(idx, 1);
      await salvarBancoUsuario(dbUser, usuarioId);
      return { ok: true, modulo: 'rotina', resumoAcao: `Hábito excluído: "${rem.nome}"` };
    }
  }

  // ----- METAS -----
  if (nome === 'consultar_metas') {
    const dbUser = await obterBancoUsuario(usuarioId);
    return { ok: true, dados: dbUser.metas || [] };
  }

  if (nome === 'gerenciar_meta') {
    const dbUser = await obterBancoUsuario(usuarioId);
    if (!Array.isArray(dbUser.metas)) dbUser.metas = [];
    if (args.acao === 'criar') {
      const nova = {
        id: dbUser.metas.length ? Math.max(...dbUser.metas.map(m => m.id || 0)) + 1 : 1,
        titulo: String(args.titulo_ou_id).trim(),
        tipo: args.categoria || 'pessoal',
        categoria: args.categoria || 'pessoal',
        valor_alvo: Number(args.valor_alvo) || 100,
        valor_atual: Number(args.valor_atual) || 0,
        prazo: args.prazo || '',
        concluida: false,
        criado_em: new Date().toISOString()
      };
      dbUser.metas.push(nova);
      await salvarBancoUsuario(dbUser, usuarioId);
      return { ok: true, modulo: 'metas', resumoAcao: `Meta criada: "${nova.titulo}"` };
    }
    const termo = normalizarTexto(args.titulo_ou_id);
    const idx = dbUser.metas.findIndex(m => String(m.id) === String(args.titulo_ou_id) || normalizarTexto(m.titulo).includes(termo));
    if (idx === -1) return { ok: false, error: `Meta "${args.titulo_ou_id}" não encontrada.` };
    const meta = dbUser.metas[idx];
    if (args.acao === 'atualizar') {
      if (args.valor_atual !== undefined) meta.valor_atual = Number(args.valor_atual);
      if (args.valor_alvo !== undefined) meta.valor_alvo = Number(args.valor_alvo);
      if (args.prazo !== undefined) meta.prazo = args.prazo;
    } else if (args.acao === 'concluir') {
      meta.concluida = true;
      if (meta.valor_alvo) meta.valor_atual = meta.valor_alvo;
    } else if (args.acao === 'excluir') {
      dbUser.metas.splice(idx, 1);
    }
    await salvarBancoUsuario(dbUser, usuarioId);
    return { ok: true, modulo: 'metas', resumoAcao: `Meta (${args.acao}): "${meta.titulo}"` };
  }

  // ----- EDUCAÇÃO -----
  if (nome === 'consultar_estudos') {
    const dbUser = await obterBancoUsuario(usuarioId);
    return {
      ok: true,
      dados: {
        topicos: dbUser.topicos || [],
        videos: (dbUser.videos || []).map(v => ({ id: v.id, titulo: v.titulo, id_topico: v.id_topico, concluido: !!v.concluido })),
        agendamentos: dbUser.agendamentos || []
      }
    };
  }

  if (nome === 'gerenciar_trilha_estudo') {
    const dbUser = await obterBancoUsuario(usuarioId);
    if (!Array.isArray(dbUser.topicos)) dbUser.topicos = [];
    if (args.acao === 'criar') {
      const novo = { id: dbUser.topicos.length ? Math.max(...dbUser.topicos.map(t => t.id || 0)) + 1 : 1, nome: String(args.nome_ou_id).trim() };
      dbUser.topicos.push(novo);
      await salvarBancoUsuario(dbUser, usuarioId);
      return { ok: true, modulo: 'educacao', resumoAcao: `Trilha criada: "${novo.nome}"` };
    }
    const termo = normalizarTexto(args.nome_ou_id);
    const idx = dbUser.topicos.findIndex(t => String(t.id) === String(args.nome_ou_id) || normalizarTexto(t.nome).includes(termo));
    if (idx === -1) return { ok: false, error: `Trilha "${args.nome_ou_id}" não encontrada.` };
    const [rem] = dbUser.topicos.splice(idx, 1);
    await salvarBancoUsuario(dbUser, usuarioId);
    return { ok: true, modulo: 'educacao', resumoAcao: `Trilha excluída: "${rem.nome}"` };
  }

  if (nome === 'adicionar_ou_agendar_video') {
    const dbUser = await obterBancoUsuario(usuarioId);
    if (!Array.isArray(dbUser.topicos)) dbUser.topicos = [];
    if (!Array.isArray(dbUser.videos)) dbUser.videos = [];
    if (!Array.isArray(dbUser.agendamentos)) dbUser.agendamentos = [];

    let video = dbUser.videos.find(v => normalizarTexto(v.titulo).includes(normalizarTexto(args.titulo)));
    if (!video) {
      if (!args.url_youtube || !extrairYouTubeId(args.url_youtube)) {
        return { ok: false, error: 'Para adicionar uma aula nova, informe também o link do YouTube.' };
      }
      let trilha = args.nome_trilha
        ? dbUser.topicos.find(t => normalizarTexto(t.nome).includes(normalizarTexto(args.nome_trilha)))
        : dbUser.topicos[0];
      if (!trilha) {
        trilha = { id: dbUser.topicos.length ? Math.max(...dbUser.topicos.map(t => t.id || 0)) + 1 : 1, nome: args.nome_trilha || 'Geral' };
        dbUser.topicos.push(trilha);
      }
      video = {
        id: dbUser.videos.length ? Math.max(...dbUser.videos.map(v => v.id || 0)) + 1 : 1,
        titulo: String(args.titulo).trim(),
        url_youtube: String(args.url_youtube).trim(),
        id_topico: trilha.id
      };
      dbUser.videos.push(video);
    }

    if (args.dia_semana) {
      dbUser.agendamentos.push({
        id: dbUser.agendamentos.length ? Math.max(...dbUser.agendamentos.map(a => a.id || 0)) + 1 : 1,
        dia_semana: args.dia_semana,
        id_video: video.id
      });
    }

    await salvarBancoUsuario(dbUser, usuarioId);
    return {
      ok: true,
      modulo: 'educacao',
      resumoAcao: args.dia_semana
        ? `Aula "${video.titulo}" agendada para ${args.dia_semana}`
        : `Aula adicionada: "${video.titulo}"`
    };
  }

  return { ok: false, error: `Ferramenta "${nome}" não reconhecida.` };
}

async function chamarGroqComFallback(apiKey, bodyBase) {
  let ultimoErro = null;
  for (const model of GROQ_MODELS) {
    const resp = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({ ...bodyBase, model }),
      signal: AbortSignal.timeout(25000)
    });
    const data = await resp.json().catch(() => ({}));
    if (resp.ok) return { data, model };

    const msg = data.error?.message || `HTTP ${resp.status}`;
    ultimoErro = new Error(msg);
    // Se o modelo não existe ou atingiu limite, tenta o próximo modelo automaticamente
    if (resp.status === 404 || resp.status === 429 || /does not exist|decommissioned|not found|access/i.test(msg)) {
      console.warn(`[Groq Fallback] Modelo ${model} indisponível (${msg}), tentando próximo...`);
      continue;
    }
    throw ultimoErro;
  }
  throw ultimoErro || new Error('Nenhum modelo Groq disponível no momento.');
}

async function processarMensagemGroq({ mensagem, historico = [], contexto }) {
  const apiKey = (process.env.GROQ_API_KEY || '').trim();
  if (!apiKey) {
    return {
      success: false,
      error: 'Chave GROQ_API_KEY não configurada no servidor. Adicione em Environment no Render.'
    };
  }

  const { hoje, ano, mesAtual, agora } = getAgoraBrasil();
  const systemPrompt = `Você é a CONVERGE IA, assistente pessoal completa integrada ao CONVERGE Life OS.
Data de hoje: ${hoje} (ano ${ano}, mês atual ${mesAtual}), hora atual: ${agora} (Brasília).

Você TEM CONTROLE REAL sobre TODOS os módulos do CONVERGE através das ferramentas:
1. FINANÇAS: consultar mês, criar/atualizar salários e entradas em qualquer mês (ex: dezembro = "${ano}-12"), registrar/excluir despesas (50=Essencial, 30=Estilo de Vida/Lazer, 20=Investimento), definir limites 50/30/20, gerenciar investimentos (potes) e projetos/grandes compras (criar, aportar, excluir).
2. ROTINA & AGENDA: criar tarefas no Checklist do Dia (com data e horário) ou no Top 3, concluir/desmarcar/promover/excluir tarefas, agendar/excluir compromissos na Agenda, criar/fazer check-in/excluir hábitos.
3. METAS: consultar, criar, atualizar progresso, concluir e excluir metas.
4. EDUCAÇÃO: consultar, criar/excluir trilhas, adicionar aulas do YouTube e agendar no cronograma semanal.

REGRAS IMPORTANTES DE EXECUÇÃO:
- Quando o usuário mencionar um mês por nome (ex: "dezembro", "janeiro"), converta para YYYY-MM usando o ano correto (ex: dezembro deste ano = "${ano}-12", janeiro próximo = "${ano + 1}-01").
- Quando o usuário disser "coloque meu salário de X para Y" ou "mude meu salário para Y", use registrar_ou_atualizar_entrada com substituir_existente=true.
- Sempre EXECUTE as ferramentas necessárias em vez de apenas explicar como fazer.
- Após executar, confirme de forma clara, curta e objetiva em português do Brasil o que foi feito.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...historico.slice(-10).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') })),
    { role: 'user', content: String(mensagem || '').trim() }
  ];

  const acoesExecutadas = [];
  const modulosAfetados = new Set();
  let mesFinancasAfetado = null;

  for (let step = 0; step < 4; step++) {
    const { data } = await chamarGroqComFallback(apiKey, {
      messages,
      tools: TOOLS,
      tool_choice: 'auto',
      temperature: 0.2,
      max_tokens: 900
    });

    const choice = data.choices?.[0]?.message;
    if (!choice) throw new Error('Resposta vazia da Groq.');

    messages.push({
      role: 'assistant',
      content: choice.content || '',
      ...(choice.tool_calls ? { tool_calls: choice.tool_calls } : {})
    });

    if (Array.isArray(choice.tool_calls) && choice.tool_calls.length > 0) {
      for (const tc of choice.tool_calls) {
        let parsedArgs = {};
        try { parsedArgs = JSON.parse(tc.function.arguments || '{}'); } catch (e) {}
        const result = await executarFerramenta(tc.function.name, parsedArgs, contexto);
        if (result.resumoAcao) acoesExecutadas.push(result.resumoAcao);
        if (result.modulo) modulosAfetados.add(result.modulo);
        if (result.mesAfetado) mesFinancasAfetado = result.mesAfetado;

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
      modulosAfetados: Array.from(modulosAfetados),
      mesFinancasAfetado
    };
  }

  return {
    success: true,
    resposta: 'Ações concluídas com sucesso!',
    acoesExecutadas,
    modulosAfetados: Array.from(modulosAfetados),
    mesFinancasAfetado
  };
}

module.exports = { processarMensagemGroq };
