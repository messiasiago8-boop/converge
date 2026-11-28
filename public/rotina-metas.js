/**
 * rotina-metas.js - Módulos "Rotina & Agenda" e "Metas" para o Life OS CONVERGE
 * 100% isolado por usuário via JWT e integrado com Finanças e Educação.
 */

// Estado global de Rotina e Metas
const rotinaState = {
  prioridades: [],
  habitos: [],
  compromissos: [],
  agendaHoje: [],
  metas: [],
  filtroMetaAtual: 'todas',
  agendaVisualizacao: 'semana', // 'semana' | 'mes'
  pomodoroInterval: null,
  pomodoroSeconds: 25 * 60,
  pomodoroRunning: false,
  pomodoroMode: 'foco' // 'foco' (25m) | 'pausa' (5m)
};

// Requisições autenticadas auxiliares
async function fetchRotinaAuth(url, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(url, { ...options, headers });
}

async function salvarRotina(url, options) {
  const resposta = await fetchRotinaAuth(url, options);
  const dados = await resposta.json().catch(() => null);
  if (resposta.status === 401 || resposta.status === 403) {
    throw new Error('Sua sessão expirou. Entre novamente para fazer a alteração.');
  }
  if (!resposta.ok || !dados?.success) {
    throw new Error(dados?.message || dados?.error || 'Não foi possível confirmar a alteração. Atualize a tela e confira antes de tentar novamente.');
  }
  return dados;
}

function avisarFalhaRotina(erro) {
  alert(erro instanceof TypeError ? 'Sem conexão com o serviço. Confira a lista antes de tentar novamente.' : erro.message);
}

// ========================================================================= //
// 1. CARREGAMENTO E ATUALIZAÇÃO DE DADOS
// ========================================================================= //

async function carregarPrioridades() {
  try {
    const res = await fetchRotinaAuth('/api/rotina/prioridades');
    const json = await res.json();
    if (json.success) {
      rotinaState.prioridades = json.data || [];
      renderizarPrioridades();
      atualizarKpiRotina();
    }
  } catch (e) {
    console.error('Erro ao carregar prioridades:', e);
  }
}

async function carregarHabitos() {
  try {
    const res = await fetchRotinaAuth('/api/rotina/habitos');
    const json = await res.json();
    if (json.success) {
      rotinaState.habitos = json.data || [];
      renderizarHabitos();
      atualizarKpiRotina();
    }
  } catch (e) {
    console.error('Erro ao carregar hábitos:', e);
  }
}

async function carregarAgendaHoje() {
  try {
    const res = await fetchRotinaAuth(`/api/agenda/hoje-integrado?data=${dataLocalRotina(new Date())}`);
    const json = await res.json();
    if (json.success) {
      rotinaState.agendaHoje = json.data || [];
      renderizarAgendaHojeTimeline(json.diaSemana);
    }
  } catch (e) {
    console.error('Erro ao carregar agenda integrada de hoje:', e);
  }
}

async function carregarCompromissos() {
  try {
    const res = await fetchRotinaAuth('/api/agenda/compromissos');
    const json = await res.json();
    if (json.success) {
      rotinaState.compromissos = json.data || [];
      renderizarAgendaAtiva();
    }
  } catch (e) {
    console.error('Erro ao carregar compromissos da agenda:', e);
  }
}

async function carregarMetas() {
  try {
    const res = await fetchRotinaAuth('/api/metas');
    const json = await res.json();
    if (json.success) {
      rotinaState.metas = json.data || [];
      renderizarMetas();
    }
  } catch (e) {
    console.error('Erro ao carregar metas:', e);
  }
}

function atualizarKpiRotina() {
  const top3 = rotinaState.prioridades.filter(p => p.top3);
  const top3Feitas = top3.filter(p => p.concluido || p.concluida).length;
  const lblPrio = document.getElementById('lbl-rotina-kpi-prioridades');
  if (lblPrio) lblPrio.textContent = `${top3Feitas} / ${top3.length || 3} Feitas`;

  const hojeIso = new Date().toISOString().slice(0, 10);
  const habitosFeitosHoje = rotinaState.habitos.filter(h => Array.isArray(h.dias_concluidos) && h.dias_concluidos.includes(hojeIso)).length;
  const lblHab = document.getElementById('lbl-rotina-kpi-habitos');
  if (lblHab) lblHab.textContent = `${habitosFeitosHoje} ${habitosFeitosHoje === 1 ? 'Feito' : 'Feitos'}`;
}

// ========================================================================= //
// 2. RENDERIZAÇÃO: FOCO DO DIA (TOP 3) & CAIXA DE ENTRADA RÁPIDA
// ========================================================================= //

function renderizarPrioridades() {
  const containerTop3 = document.getElementById('container-top3-prioridades');
  const containerQuick = document.getElementById('container-quick-tasks');
  const badgeCount = document.getElementById('badge-top3-count');

  if (!containerTop3 || !containerQuick) return;

  const hojeIso = dataLocalRotina(new Date());
  const top3Items = rotinaState.prioridades.filter(p => p.top3);
  const diaExibido = document.getElementById('checklist-dia')?.value || hojeIso;
  const quickItems = rotinaState.prioridades
    .filter(p => {
      const criada = new Date(p.criado_em);
      const dataCriacao = Number.isFinite(criada.getTime()) ? dataLocalRotina(criada) : hojeIso;
      return !p.top3 && (p.adiada_ate || p.data || dataCriacao) === diaExibido;
    })
    .sort((a, b) => {
      const ha = a.horario || '99:99';
      const hb = b.horario || '99:99';
      if (ha !== hb) return ha.localeCompare(hb);
      return (a.id || 0) - (b.id || 0);
    });

  const badgeChecklistHoje = document.getElementById('badge-checklist-hoje');
  if (badgeChecklistHoje) {
    const feitasQuick = quickItems.filter(p => p.concluida || p.concluido).length;
    badgeChecklistHoje.textContent = `${feitasQuick}/${quickItems.length} concluídas`;
  }

  if (badgeCount) {
    const feitas = top3Items.filter(p => p.concluida || p.concluido).length;
    badgeCount.textContent = `${feitas}/3 concluídas`;
    document.querySelectorAll("#progresso-top3 span").forEach((marca, i) => {
      marca.classList.toggle("reservada", i < top3Items.length);
      marca.classList.toggle("feita", i < feitas);
    });
  }

  // Renderiza Top 3
  containerTop3.innerHTML = '';
  if (top3Items.length === 0) {
    containerTop3.innerHTML = `
      <div class="px-6 py-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-lg bg-slate-50/50">
        Adicione uma prioridade ou traga uma tarefa do checklist para o foco.
      </div>
    `;
  } else {
    top3Items.forEach((item, index) => {
      const isDone = item.concluida || item.concluido;
      const el = document.createElement('div');
      el.className = `p-3 rounded-lg border transition flex items-center justify-between gap-3 ${
        isDone ? 'bg-emerald-50/70 border-emerald-200 text-slate-500' : 'bg-slate-50 hover:bg-white border-slate-200 text-slate-800 shadow-2xs hover:border-emerald-300'
      }`;

      el.dataset.prioId = item.id;
      el.classList.add("rotina-tarefa", "rx-item");
      el.innerHTML = `
        <div class="flex items-center gap-3 min-w-0 flex-1">
          <button type="button" aria-label="Concluir tarefa" aria-pressed="${!!isDone}" class="btn-check-prio w-5 h-5 rounded-md border flex items-center justify-center text-xs transition cursor-pointer shrink-0 ${
            isDone ? 'bg-emerald-600 border-emerald-600 text-white font-bold' : 'border-slate-300 bg-white hover:border-emerald-500'
          }">
            ${isDone ? '✓' : ''}
          </button>
          <div class="flex-1 min-w-0">
            <span class="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 mr-1.5 font-sans tabular-nums">
              #${index + 1}
            </span>
            <span class="text-xs font-semibold ${isDone ? 'line-through opacity-75' : 'text-slate-900'}">${escapeHTML(item.texto)}</span>
          </div>
        </div>
        <div class="rotina-tarefa-acoes flex items-center gap-1">
          <button type="button" class="btn-demover-top3 px-2 py-0.5 rounded-md text-[10px] font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-200/70 border border-slate-200 transition cursor-pointer" title="Remover do Top 3">
            Desmarcar
          </button>
          ${!isDone ? '<button type="button" class="btn-adiar-tarefa text-[10px] font-semibold text-slate-700 underline">Mover para amanhã</button>' : ''}
          <button type="button" class="btn-delete-prio p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer" aria-label="Arquivar tarefa" title="Arquivar tarefa">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      `;

      el.querySelector('.btn-check-prio').addEventListener('click', async () => {
        await alternarStatusPrioridade(item.id, !isDone);
      });
      el.querySelector('.btn-demover-top3').addEventListener('click', async () => {
        await alternarTop3Prioridade(item.id, false);
      });
      el.querySelector('.btn-adiar-tarefa')?.addEventListener('click', () => adiarTarefa(item));
      el.querySelector('.btn-delete-prio').addEventListener('click', async () => {
        await excluirPrioridade(item.id);
      });

      containerTop3.appendChild(el);
    });
  }

  // Renderiza Caixa de Entrada Secundária
  containerQuick.innerHTML = '';
  if (quickItems.length === 0) {
    containerQuick.innerHTML = `
      <p class="text-[11px] text-slate-400 py-4 text-center">Nenhuma tarefa para este dia. Adicione uma acima.</p>
    `;
  } else {
    quickItems.forEach(item => {
      const isDone = item.concluida || item.concluido;
      const el = document.createElement('div');
      el.className = 'py-2 px-2.5 rounded-lg bg-slate-50 hover:bg-white border border-slate-200/80 transition flex items-center justify-between gap-2';

      el.dataset.prioId = item.id;
      el.classList.add("rotina-tarefa", "rx-item");
      el.innerHTML = `
        <div class="flex items-center gap-2 min-w-0 flex-1">
          <button type="button" aria-label="Concluir tarefa" aria-pressed="${!!isDone}" class="btn-check-prio w-4 h-4 rounded border flex items-center justify-center text-[10px] transition cursor-pointer shrink-0 ${
            isDone ? 'bg-emerald-600 border-emerald-600 text-white font-bold' : 'border-slate-300 bg-white hover:border-emerald-500'
          }">
            ${isDone ? '✓' : ''}
          </button>
          ${item.horario ? `<span class="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200/70 shrink-0">${escapeHTML(item.horario)}</span>` : ''}
          <span class="text-xs ${isDone ? 'line-through text-slate-400' : 'text-slate-700'}">${escapeHTML(item.texto)}</span>
        </div>
        <div class="rotina-tarefa-acoes flex items-center gap-1">
          ${diaExibido !== hojeIso ? '<span class="text-[10px] text-slate-500">Planejada</span>' : `
            <button type="button" class="btn-promover-top3 text-[10px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md" title="Promover ao Top 3">Promover Top 3</button>`}
          ${!isDone && (diaExibido <= hojeIso || item.adiada_ate > hojeIso) ? `<button type="button" class="btn-adiar-tarefa text-[10px] font-semibold text-slate-700 underline">${item.adiada_ate && item.adiada_ate > dataLocalRotina(new Date()) ? 'Trazer para hoje' : 'Mover para amanhã'}</button>` : ''}
          <button type="button" class="btn-delete-prio p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer" aria-label="Arquivar tarefa" title="Arquivar tarefa">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      `;

      el.querySelector('.btn-check-prio').addEventListener('click', async () => {
        await alternarStatusPrioridade(item.id, !isDone);
      });
      el.querySelector('.btn-promover-top3')?.addEventListener('click', async () => {
        if (top3Items.length >= 3) {
          alert('Você já atingiu as 3 prioridades máximas do dia! Conclua ou desmarque uma delas antes de promover outra.');
          return;
        }
        await alternarTop3Prioridade(item.id, true);
      });
      el.querySelector('.btn-adiar-tarefa')?.addEventListener('click', () => adiarTarefa(item));
      el.querySelector('.btn-delete-prio').addEventListener('click', async () => {
        await excluirPrioridade(item.id);
      });

      containerQuick.appendChild(el);
    });
  }
}

function dataLocalRotina(data) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

async function adiarTarefa(item) {
  const hoje = new Date();
  const adiada = item.adiada_ate && item.adiada_ate > dataLocalRotina(hoje);
  const amanha = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1);
  try {
    await salvarRotina(`/api/rotina/prioridades/${item.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(adiada
        ? { adiar_ate: null, data: dataLocalRotina(hoje) }
        : { adiar_ate: dataLocalRotina(amanha) })
    });
    await carregarPrioridades();
  } catch (erro) {
    avisarFalhaRotina(erro);
  }
}

async function alternarStatusPrioridade(id, novoStatus) {
  try {
    await salvarRotina(`/api/rotina/prioridades/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ concluida: novoStatus })
    });
    await carregarPrioridades();
  } catch (e) {
    avisarFalhaRotina(e);
  }
}

async function alternarTop3Prioridade(id, novoTop3) {
  try {
    await salvarRotina(`/api/rotina/prioridades/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ top3: novoTop3 })
    });
    await carregarPrioridades();
  } catch (e) {
    avisarFalhaRotina(e);
  }
}

async function excluirPrioridade(id) {
  try {
    await salvarRotina(`/api/rotina/prioridades/${id}`, { method: 'DELETE' });
    await carregarPrioridades();
  } catch (e) {
    avisarFalhaRotina(e);
  }
}

// ========================================================================= //
// 2.1 HISTÓRICO DE TAREFAS (CONCLUÍDAS E ARQUIVADAS)
// ========================================================================= //

async function carregarHistoricoTarefas() {
  const container = document.getElementById('container-lista-historico-tarefas');
  const lblTotal = document.getElementById('lbl-total-historico-tarefas');
  if (!container) return;

  container.innerHTML = '<p class="text-xs text-slate-400 text-center py-6">Carregando histórico...</p>';

  try {
    const res = await fetchRotinaAuth('/api/rotina/historico-tarefas');
    const json = await res.json();
    const lista = (json.success && Array.isArray(json.data)) ? json.data : [];

    if (lblTotal) {
      lblTotal.textContent = `${lista.length} ${lista.length === 1 ? 'item arquivado' : 'itens arquivados'}`;
    }

    if (lista.length === 0) {
      container.innerHTML = `
        <div class="px-6 py-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-lg bg-slate-50/50">
          Nenhuma tarefa no histórico ainda. Tarefas concluídas ou excluídas aparecerão aqui.
        </div>
      `;
      return;
    }

    container.innerHTML = '';
    lista.forEach(item => {
      const dataFormatada = item.concluida_em 
        ? new Date(item.concluida_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
        : (item.excluida_em ? new Date(item.excluida_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

      const isConcluida = item.status === 'concluida';
      const el = document.createElement('div');
      el.className = 'p-3 rounded-lg border border-slate-200 bg-slate-50/60 hover:bg-white transition flex items-center justify-between gap-3 shadow-2xs';

      el.innerHTML = `
        <div class="flex items-center gap-2.5 min-w-0 flex-1">
          <div class="w-6 h-6 rounded-md flex items-center justify-center shrink-0 text-xs ${
            isConcluida ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
          }">
            ${isConcluida ? '✓' : '🗑️'}
          </div>
          <div class="truncate flex-1">
            <p class="text-xs font-medium text-slate-800 ${isConcluida ? 'line-through opacity-85' : ''}">${escapeHTML(item.texto)}</p>
            <p class="text-[10px] text-slate-400">${isConcluida ? 'Concluída em' : 'Arquivada em'}: ${dataFormatada || 'Data recente'}</p>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button type="button" class="btn-restaurar-tarefa text-[10px] font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-md transition cursor-pointer" title="Restaurar para a lista de hoje">
            Restaurar
          </button>
          <button type="button" class="btn-del-item-historico text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-1.5 rounded-md transition cursor-pointer" title="Excluir permanentemente">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      `;

      // Restaurar tarefa
      el.querySelector('.btn-restaurar-tarefa').addEventListener('click', async ({ currentTarget: botao }) => {
        botao.disabled = true;
        try {
          await salvarRotina(`/api/rotina/historico-tarefas/${item.id}/restaurar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ criado_em: item.criado_em || null })
          });
          await Promise.all([carregarPrioridades(), carregarHistoricoTarefas()]);
        } catch (e) {
          avisarFalhaRotina(e);
        } finally {
          botao.disabled = false;
        }
      });

      // Excluir permanentemente do histórico
      el.querySelector('.btn-del-item-historico').addEventListener('click', async () => {
        try {
          const query = new URLSearchParams({ criado_em: item.criado_em || '' });
          await salvarRotina(`/api/rotina/historico-tarefas/${item.id}?${query}`, { method: 'DELETE' });
          await carregarHistoricoTarefas();
        } catch (e) {
          avisarFalhaRotina(e);
        }
      });

      container.appendChild(el);
    });

  } catch (e) {
    console.error('Erro ao carregar histórico de tarefas:', e);
    container.innerHTML = '<p class="text-xs text-rose-500 text-center py-6">Erro ao carregar histórico.</p>';
  }
}

// ========================================================================= //
// 3. RENDERIZAÇÃO: RASTREADOR DE HÁBITOS (HABIT TRACKER)
// ========================================================================= //

function obterDiasSemanaAtual(referencia = new Date()) {
  const hoje = new Date();
  const diaSemanaIndex = referencia.getDay(); // 0 Dom, 1 Seg...
  const inicio = window.PerfilPortal?.primeiroDia() ?? 1;
  const diffSegunda = -((diaSemanaIndex - inicio + 7) % 7);
  
  const segunda = new Date(referencia);
  segunda.setDate(referencia.getDate() + diffSegunda);

  const dias = [];
  const nomesCurtos = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  for (let i = 0; i < 7; i++) {
    const d = new Date(segunda);
    d.setDate(segunda.getDate() + i);
    dias.push({
      nome: nomesCurtos[d.getDay()],
      iso: dataLocalRotina(d),
      isHoje: dataLocalRotina(d) === dataLocalRotina(hoje)
    });
  }
  return dias;
}

function calcularForcaHabito(diasConcluidos) {
  const lista = Array.isArray(diasConcluidos) ? diasConcluidos : [];
  if (lista.length === 0) return 0;
  const setDias = new Set(lista);
  const alpha = 0.14;
  let score = 0;
  const hoje = new Date();
  hoje.setHours(12, 0, 0, 0);

  for (let d = 29; d >= 0; d--) {
    const dt = new Date(hoje);
    dt.setDate(hoje.getDate() - d);
    const iso = dataLocalRotina(dt);
    if (setDias.has(iso)) {
      score = score + alpha * (1 - score);
    } else if (d > 0) {
      // Só reduz pontuação em dias passados; hoje ainda está em aberto
      score = score * (1 - alpha);
    }
  }
  return Math.max(0, Math.min(100, Math.round(score * 100)));
}

window.calcularForcaHabito = calcularForcaHabito;

function obterMetaPeriodoHabito(periodo) {
  const mapa = {
    manha: { label: 'Manhã', icone: '🌅', classe: 'bg-amber-50 text-amber-800 border-amber-200/80' },
    pos_trabalho: { label: 'Pós-Trabalho', icone: '🌆', classe: 'bg-indigo-50 text-indigo-800 border-indigo-200/80' },
    noite: { label: 'Noite', icone: '🌙', classe: 'bg-slate-100 text-slate-700 border-slate-200' },
    livre: { label: 'Flexível', icone: '✨', classe: 'bg-emerald-50 text-emerald-800 border-emerald-200/70' }
  };
  return mapa[periodo] || mapa.manha;
}

function horarioParaMinutosHabito(hhmm) {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function abrirModalEditarHabito(habito) {
  const modalHabito = document.getElementById('modal-habito');
  if (!modalHabito) return;
  const idInput = document.getElementById('input-habito-id');
  const tituloModal = document.getElementById('modal-habito-titulo');
  const nomeInput = document.getElementById('input-habito-nome');
  const iconeInput = document.getElementById('input-habito-icone');
  const periodoSelect = document.getElementById('select-habito-periodo');
  const duracaoInput = document.getElementById('input-habito-duracao');
  const idealInput = document.getElementById('input-habito-ideal');
  const limiteInput = document.getElementById('input-habito-limite');

  if (habito) {
    if (idInput) idInput.value = String(habito.id);
    if (tituloModal) tituloModal.textContent = 'Editar Hábito Diário';
    if (nomeInput) nomeInput.value = habito.nome || '';
    if (iconeInput) iconeInput.value = habito.icone || '⚡';
    if (periodoSelect) periodoSelect.value = habito.periodo || 'manha';
    if (duracaoInput) duracaoInput.value = String(habito.duracao_min || 15);
    if (idealInput) idealInput.value = habito.horario_ideal || '';
    if (limiteInput) limiteInput.value = habito.horario_limite || '';
  } else {
    if (idInput) idInput.value = '';
    if (tituloModal) tituloModal.textContent = 'Novo Hábito Diário';
    if (nomeInput) nomeInput.value = '';
    if (iconeInput) iconeInput.value = '⚡';
    if (periodoSelect) periodoSelect.value = 'manha';
    if (duracaoInput) duracaoInput.value = '15';
    if (idealInput) idealInput.value = '';
    if (limiteInput) limiteInput.value = '';
  }

  modalHabito.classList.remove('hidden');
  modalHabito.classList.add('flex');
  if (nomeInput) setTimeout(() => nomeInput.focus(), 40);
}

function renderizarHabitos() {
  const container = document.getElementById('container-habitos-lista');
  if (!container) return;

  const badgeResumo = document.getElementById('badge-habitos-resumo');
  if (badgeResumo) {
    const total = rotinaState.habitos.length;
    badgeResumo.textContent = `${total} ${total === 1 ? 'ativo' : 'ativos'}`;
  }

  if (typeof window.atualizarContadoresModoPlay === 'function') {
    window.atualizarContadoresModoPlay(rotinaState.habitos);
  }

  container.innerHTML = '';
  const diasSemana = obterDiasSemanaAtual();
  const hojeIso = dataLocalRotina(new Date());
  const agoraMin = new Date().getHours() * 60 + new Date().getMinutes();

  if (rotinaState.habitos.length === 0) {
    container.innerHTML = `
      <div class="px-6 py-10 text-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 flex flex-col items-center justify-center gap-2">
        <div class="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-emerald-700 shadow-2xs">
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <p class="text-sm font-semibold text-slate-700">Nenhum hábito cadastrado ainda</p>
        <p class="text-xs text-slate-500 max-w-md">Clique em <strong class="text-emerald-700">+ Novo Hábito</strong> acima para criar sua primeira meta de consistência semanal.</p>
      </div>
    `;
    return;
  }

  rotinaState.habitos.forEach(habito => {
    const el = document.createElement('div');
    el.id = `habito-card-${habito.id}`;
    el.className = 'nx-card-alive p-3.5 sm:p-4 rounded-xl bg-slate-50/70 hover:bg-white border border-slate-200/80 hover:border-emerald-200 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs';

    const concluidos = Array.isArray(habito.dias_concluidos) ? habito.dias_concluidos : [];
    const concluidosSemana = diasSemana.filter(d => concluidos.includes(d.iso)).length;
    const feitoHoje = concluidos.includes(hojeIso);
    const forca = calcularForcaHabito(concluidos);
    const habRingCirc = 87.96; // 2 * Math.PI * 14
    const habRingOffset = (habRingCirc * (1 - concluidosSemana / 7)).toFixed(2);

    const metaPeriodo = obterMetaPeriodoHabito(habito.periodo || 'manha');
    const duracaoMin = Number(habito.duracao_min) || 15;
    const ideal = habito.horario_ideal || '';
    const limite = habito.horario_limite || '';
    const idealMin = horarioParaMinutosHabito(ideal);
    const limiteMin = horarioParaMinutosHabito(limite);
    const naJanelaFlex = !feitoHoje && idealMin !== null && limiteMin !== null && agoraMin >= idealMin && agoraMin <= limiteMin;

    let janelaHtml = '';
    if (ideal && limite) {
      janelaHtml = `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium border ${naJanelaFlex ? 'bg-amber-50 text-amber-800 border-amber-300 font-semibold' : 'bg-white text-slate-500 border-slate-200/80'}" title="Janela flexível: ideal ${ideal}, tolerância até ${limite}">⏰ ${ideal}–${limite}${naJanelaFlex ? ' · agora' : ''}</span>`;
    } else if (ideal) {
      janelaHtml = `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-white text-slate-500 border border-slate-200/80">⏰ ${ideal}</span>`;
    }

    const classeForca = forca >= 70
      ? 'text-emerald-800 bg-emerald-50 border-emerald-200'
      : (forca >= 40 ? 'text-amber-800 bg-amber-50 border-amber-200' : 'text-slate-500 bg-slate-100 border-slate-200/80');

    el.innerHTML = `
      <div class="flex items-center gap-3 min-w-0 flex-1">
        <div class="relative w-9 h-9 shrink-0 flex items-center justify-center">
          <svg viewBox="0 0 34 34" class="w-9 h-9 -rotate-90 nx-meta-ring" aria-hidden="true">
            <circle cx="17" cy="17" r="14" fill="none" stroke="rgba(31, 42, 39, 0.1)" stroke-width="3" />
            <circle cx="17" cy="17" r="14" fill="none" stroke="#5b9086" stroke-width="3" stroke-linecap="round"
              class="nx-meta-ring-fg" stroke-dasharray="${habRingCirc}" stroke-dashoffset="${habRingOffset}" />
          </svg>
          <span class="absolute text-[9px] font-bold tabular-nums text-emerald-800">${concluidosSemana}/7</span>
        </div>
        <div class="min-w-0 flex-1 space-y-1">
          <div class="flex items-center gap-1.5 min-w-0">
            <span class="text-sm shrink-0" aria-hidden="true">${escapeHTML(habito.icone || '⚡')}</span>
            <p class="text-sm font-semibold text-slate-900 truncate" title="${escapeHTML(habito.nome)}">${escapeHTML(habito.nome)}</p>
          </div>
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold border ${metaPeriodo.classe}">${metaPeriodo.icone} ${metaPeriodo.label} · ${duracaoMin}m</span>
            ${janelaHtml}
            <span class="text-[11px] text-slate-400">${concluidosSemana === 7 ? 'Semana perfeita! ✨' : `${concluidosSemana}/7 na semana`}</span>
          </div>
        </div>
      </div>
      <div class="flex items-center justify-between sm:justify-end gap-2 sm:gap-2.5 shrink-0 flex-wrap">
        <div class="flex items-center gap-1.5">
          ${diasSemana.map(d => {
            const checked = concluidos.includes(d.iso);
            return `
              <button
                type="button"
                class="btn-checkin-habito w-7 h-7 rounded-lg flex flex-col items-center justify-center text-[10px] transition cursor-pointer ${
                  checked
                    ? 'bg-emerald-600 text-white font-bold shadow-xs'
                    : (d.isHoje ? 'border-2 border-emerald-500 bg-white text-emerald-700 font-semibold hover:bg-emerald-50' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-100')
                }"
                data-id="${habito.id}"
                data-iso="${d.iso}"
                title="${d.nome} (${d.iso}): ${checked ? 'Concluído (Clique para desmarcar)' : 'Pendente (Clique para marcar)'}"
              >
                ${checked ? '✓' : d.nome.slice(0, 1)}
              </button>
            `;
          }).join('')}
        </div>
        
        <div class="flex items-center gap-1.5">
          <div class="px-2 py-1 rounded-lg font-sans tabular-nums text-[11px] font-bold border ${classeForca}" title="Força do Hábito (últimos 30 dias): errar 1 dia não zera seu progresso">
            <span>💪 ${forca}%</span>
          </div>
          <div class="px-2 py-1 rounded-lg font-sans tabular-nums text-[11px] font-bold ${habito.streak > 0 ? 'text-emerald-800 bg-emerald-50 border border-emerald-200' : 'text-slate-400 bg-slate-100 border border-slate-200/70'}" title="Sequência atual de dias seguidos">
            <span>🔥 ${habito.streak || 0}d</span>
          </div>

          <button type="button" class="btn-edit-habito text-slate-400 hover:text-emerald-700 p-1.5 rounded-lg hover:bg-emerald-50 text-xs cursor-pointer transition" data-id="${habito.id}" title="Editar hábito, período e janela flexível">
            ✎
          </button>
          <button type="button" class="btn-delete-habito text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 text-xs cursor-pointer transition" data-id="${habito.id}" title="Excluir hábito">
            ✕
          </button>
        </div>
      </div>
    `;

    // Eventos dos botões de checkin
    el.querySelectorAll('.btn-checkin-habito').forEach(btn => {
      btn.addEventListener('click', async () => {
        const hId = btn.getAttribute('data-id');
        const iso = btn.getAttribute('data-iso');
        const estavaMarcado = btn.textContent.trim() === '✓';
        await alternarCheckinHabito(hId, iso);
        if (!estavaMarcado) {
          const novoCard = document.getElementById(`habito-card-${hId}`);
          if (novoCard && typeof window.nxCelebrate === 'function') window.nxCelebrate(novoCard);
        }
      });
    });

    el.querySelector('.btn-edit-habito').addEventListener('click', () => {
      abrirModalEditarHabito(habito);
    });

    el.querySelector('.btn-delete-habito').addEventListener('click', async () => {
      const confirmado = typeof window.nxConfirmarExclusao === 'function'
        ? await window.nxConfirmarExclusao({
            titulo: 'Excluir hábito?',
            nomeItem: habito.nome,
            descricao: 'O histórico de check-ins e a força deste hábito serão removidos permanentemente.',
            textoConfirmar: 'Excluir hábito'
          })
        : confirm(`Deseja remover o hábito "${habito.nome}"?`);
      if (!confirmado) return;
      await excluirHabito(habito.id);
    });

    container.appendChild(el);
  });
}

window.rotinaHabitosHelpers = {
  obterHabitos: () => Array.isArray(rotinaState.habitos) ? rotinaState.habitos : [],
  carregarHabitos: () => carregarHabitos(),
  alternarCheckinHabito: (id, iso) => alternarCheckinHabito(id, iso),
  calcularForcaHabito,
  dataLocalRotina: (dt) => dataLocalRotina(dt || new Date())
};

async function alternarCheckinHabito(id, dataIso) {
  try {
    await salvarRotina(`/api/rotina/habitos/${id}/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: dataIso })
    });
    await carregarHabitos();
    if (Array.isArray(rotinaState.metas) && rotinaState.metas.some(m => m.tipo === 'habito')) {
      await carregarMetas();
    }
  } catch (e) {
    avisarFalhaRotina(e);
  }
}

async function excluirHabito(id) {
  try {
    await salvarRotina(`/api/rotina/habitos/${id}`, { method: 'DELETE' });
    await carregarHabitos();
  } catch (e) {
    avisarFalhaRotina(e);
  }
}

// ========================================================================= //
// 4. RENDERIZAÇÃO: LINHA DO TEMPO DA AGENDA DE HOJE (INTEGRADA)
// ========================================================================= //

function renderizarAgendaHojeTimeline(diaSemanaNome) {
  const container = document.getElementById('container-agenda-hoje-timeline');
  const badgeData = document.getElementById('badge-agenda-hoje-data');
  if (!container) return;

  if (badgeData && diaSemanaNome) {
    const d = new Date();
    badgeData.textContent = `${diaSemanaNome}, ${d.getDate()} de ${d.toLocaleDateString('pt-BR', { month: 'short' })}`;
  }

  container.innerHTML = '';
  if (rotinaState.agendaHoje.length === 0) {
    container.innerHTML = `
      <div class="col-span-full px-6 py-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-lg bg-slate-50/50">
        Nenhum compromisso, vencimento ou aula agendada para hoje. Dia livre!
      </div>
    `;
    return;
  }

  rotinaState.agendaHoje.forEach(item => {
    const el = document.createElement('div');
    const isFinancas = item.categoria === 'financas';
    const isEstudos = item.categoria === 'estudos';
    
    const bgClass = isFinancas
      ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
      : (isEstudos ? 'bg-purple-50/80 border-purple-200 text-purple-950' : 'bg-blue-50/80 border-blue-200 text-blue-950');

    let badgeIconSvg = `
      <svg class="w-3.5 h-3.5 text-blue-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
      </svg>
    `;
    if (isFinancas) {
      badgeIconSvg = `
        <svg class="w-3.5 h-3.5 text-emerald-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
      `;
    } else if (isEstudos) {
      badgeIconSvg = `
        <svg class="w-3.5 h-3.5 text-purple-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
        </svg>
      `;
    }

    el.className = `p-3 rounded-lg border transition flex items-center justify-between gap-3 ${bgClass} shadow-2xs`;
    el.innerHTML = `
      <div class="flex items-center gap-2.5 truncate min-w-0">
        <div class="w-6 h-6 rounded-md bg-white/90 border border-black/5 flex items-center justify-center shrink-0">
          ${badgeIconSvg}
        </div>
        <div class="truncate">
          <p class="text-xs font-bold truncate leading-tight">${escapeHTML(item.titulo)}</p>
          <p class="text-[10px] opacity-75 font-medium truncate">${escapeHTML(item.origem || 'Agenda')}</p>
        </div>
      </div>
      <span class="text-[10px] font-sans tabular-nums font-bold px-2 py-0.5 rounded-md bg-white/90 border border-black/5 shrink-0 text-slate-800">
        ${escapeHTML(item.horario)}
      </span>
    `;

    container.appendChild(el);
  });
}

// ========================================================================= //
// 5. RENDERIZAÇÃO: AGENDA COMPLETA (SEMANAL E MENSAL)
// ========================================================================= //

function origemCompromisso(compromisso) {
  return { estudos: 'Aula / Estudo', financas: 'Vencimento', pessoal: 'Compromisso' }[compromisso.categoria] || 'Compromisso';
}

function eventosIntegradosAgenda(dataIso, mostrarEstudos, mostrarFinancas) {
  const data = new Date(`${dataIso}T12:00:00`);
  const dia = DIAS_SEMANA[(data.getDay() + 6) % 7];
  const eventos = [];
  if (mostrarEstudos) {
    for (const aula of state.agendamentos.filter(item => item.dia_semana === dia)) {
      const video = state.allVideos.find(item => item.id === Number(aula.id_video));
      eventos.push({ titulo: video?.titulo || 'Aula agendada', categoria: 'estudos', integrado: true });
    }
  }
  if (mostrarFinancas && dataIso === dataLocalRotina(new Date())) {
    for (const conta of rotinaState.agendaHoje.filter(item => item.tipo === 'financas')) {
      eventos.push({ ...conta, integrado: true });
    }
  }
  return eventos;
}

function referenciaDaAgenda() {
  const data = document.getElementById('data-navegacao-agenda')?.value;
  return data ? new Date(`${data}T12:00:00`) : new Date();
}

function renderizarAgendaAtiva() {
  if (rotinaState.agendaVisualizacao === 'mes') renderizarAgendaMensal();
  else renderizarAgendaSemanal();
}

function abrirNovoCompromisso(data) {
  const modal = document.getElementById('modal-compromisso');
  document.getElementById('input-comp-data').value = data;
  document.getElementById('status-novo-compromisso').textContent = '';
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function renderizarAgendaSemanal() {
  const container = document.getElementById('grid-agenda-semanal');
  if (!container) return;

  container.innerHTML = '';
  const diasSemana = obterDiasSemanaAtual(referenciaDaAgenda());

  const filtroPessoal = document.getElementById('chk-filtro-pessoal')?.checked ?? true;
  const filtroFinancas = document.getElementById('chk-filtro-financas')?.checked ?? true;
  const filtroEstudos = document.getElementById('chk-filtro-estudos')?.checked ?? true;

  diasSemana.forEach(dia => {
    const card = document.createElement('div');
    card.className = `rounded-xl border p-3 flex flex-col justify-between min-h-[220px] transition ${
      dia.isHoje ? 'bg-[#f0f9f5] border-emerald-300 shadow-xs' : 'bg-slate-50/60 border-slate-200/80'
    }`;

    // Filtra compromissos deste dia
    const compsDoDia = rotinaState.compromissos.filter(c => {
      if (c.data !== dia.iso) return false;
      if (c.categoria === 'financas' && !filtroFinancas) return false;
      if (c.categoria === 'estudos' && !filtroEstudos) return false;
      if (c.categoria === 'pessoal' && !filtroPessoal) return false;
      return true;
    }).concat(eventosIntegradosAgenda(dia.iso, filtroEstudos, filtroFinancas));

    card.innerHTML = `
      <div>
        <div class="flex items-center justify-between pb-2 border-b border-black/5 mb-2">
          <span class="text-xs font-bold ${dia.isHoje ? 'text-emerald-800' : 'text-slate-800'}">${dia.nome}</span>
          <span class="text-[10px] font-sans tabular-nums px-1.5 py-0.2 rounded-md ${dia.isHoje ? 'bg-emerald-600 text-white font-bold' : 'text-slate-500 bg-white border border-slate-200'}">
            ${dia.iso.slice(8, 10)}
          </span>
        </div>
        <div class="space-y-1.5">
          ${compsDoDia.map(c => `
            <div class="p-1.5 rounded-md text-[11px] font-medium bg-white border border-slate-200 shadow-2xs flex items-center justify-between gap-1 group">
              <div class="truncate flex items-center gap-1.5 min-w-0">
                <span class="w-1.5 h-1.5 rounded-full ${c.categoria === 'financas' ? 'bg-emerald-500' : (c.categoria === 'estudos' ? 'bg-purple-500' : 'bg-blue-500')} shrink-0"></span>
                <span class="truncate">${origemCompromisso(c)} · ${escapeHTML(c.titulo)}</span>
              </div>
              ${c.integrado ? '' : `<button class="btn-del-comp text-slate-300 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition cursor-pointer text-[10px]" data-id="${c.id}">
                ✕
              </button>`}
            </div>
          `).join('')}
          ${compsDoDia.length === 0 ? '<p class="text-[10px] text-slate-400 italic py-4 text-center">Vazio</p>' : ''}
        </div>
      </div>
      <button class="btn-add-comp-dia mt-2 w-full py-1 text-[10px] font-semibold text-slate-600 hover:text-emerald-700 bg-white hover:bg-emerald-50 rounded-md border border-slate-200 transition cursor-pointer" data-data="${dia.iso}">
        + Adicionar
      </button>
    `;

    card.querySelectorAll('.btn-del-comp').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        await excluirCompromisso(id);
      });
    });

    card.querySelector('.btn-add-comp-dia').addEventListener('click', () => {
      abrirNovoCompromisso(dia.iso);
    });

    if (isConcluida && gridGaleria) {
      gridGaleria.appendChild(card);
    } else {
      container.appendChild(card);
    }
  });
}

function abrirModalHistoricoMeta(meta) {
  const modal = document.getElementById('modal-meta-historico');
  if (!modal || !meta) return;
  const tit = document.getElementById('meta-hist-titulo');
  const idEl = document.getElementById('input-meta-hist-id');
  const woopBox = document.getElementById('meta-hist-woop-box');
  const lista = document.getElementById('meta-hist-lista');
  const notaEl = document.getElementById('input-meta-hist-nota');

  if (tit) tit.textContent = meta.titulo;
  if (idEl) idEl.value = String(meta.id);
  if (notaEl) notaEl.value = '';

  if (woopBox) {
    if (meta.proposito || meta.woop_obstaculo || meta.woop_plano) {
      woopBox.innerHTML = `
        <div class="p-3 rounded-xl bg-amber-50/70 border border-amber-200/80 text-xs space-y-1">
          ${meta.proposito ? `<p class="text-slate-800"><strong>💡 Por que importa:</strong> ${escapeHTML(meta.proposito)}</p>` : ''}
          ${meta.woop_obstaculo ? `<p class="text-slate-700"><strong>🧱 Obstáculo (Se):</strong> ${escapeHTML(meta.woop_obstaculo)}</p>` : ''}
          ${meta.woop_plano ? `<p class="text-emerald-900"><strong>🛡️ Plano (Então):</strong> ${escapeHTML(meta.woop_plano)}</p>` : ''}
        </div>
      `;
    } else {
      woopBox.innerHTML = `<p class="text-[11px] text-slate-400">Nenhum propósito ou plano Se–Então cadastrado nesta meta.</p>`;
    }
  }

  if (lista) {
    const avancos = Array.isArray(meta.avancos) ? [...meta.avancos].reverse() : [];
    if (avancos.length === 0) {
      lista.innerHTML = `<p class="text-xs text-slate-400 py-3 text-center border border-dashed border-slate-200 rounded-xl">Nenhum avanço registrado ainda. Faça progresso ou adicione uma nota acima!</p>`;
    } else {
      lista.innerHTML = avancos.map(a => {
        const dt = a.data ? new Date(a.data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
        return `
          <div class="p-2.5 rounded-xl bg-white border border-slate-200 text-xs space-y-0.5">
            <div class="flex items-center justify-between gap-2">
              <span class="font-bold text-emerald-800">${a.de ?? 0}% → ${a.para ?? 0}%</span>
              <span class="text-[10px] text-slate-400">${dt}</span>
            </div>
            ${a.nota ? `<p class="text-slate-700">${escapeHTML(a.nota)}</p>` : ''}
          </div>
        `;
      }).join('');
    }
  }

  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function renderizarAgendaMensal() {
  const container = document.getElementById('grid-agenda-mensal');
  if (!container) return;

  container.innerHTML = '';
  const hoje = new Date();
  const referencia = referenciaDaAgenda();
  const ano = referencia.getFullYear();
  const mes = referencia.getMonth();

  const primeiroDia = new Date(ano, mes, 1);
  const ultimoDia = new Date(ano, mes + 1, 0);
  const totalDias = ultimoDia.getDate();
  const primeiroDiaSemana = primeiroDia.getDay(); // 0 Dom, 1 Seg...
  const inicio = window.PerfilPortal?.primeiroDia() ?? 1;
  const offset = (primeiroDiaSemana - inicio + 7) % 7;

  const filtroPessoal = document.getElementById('chk-filtro-pessoal')?.checked ?? true;
  const filtroFinancas = document.getElementById('chk-filtro-financas')?.checked ?? true;
  const filtroEstudos = document.getElementById('chk-filtro-estudos')?.checked ?? true;

  const headerGrid = document.createElement('div');
  headerGrid.className = 'grid grid-cols-7 gap-1 text-center font-bold text-[10px] text-slate-400 uppercase tracking-wider pb-1';
  obterDiasSemanaAtual().map(dia => dia.nome).forEach(n => {
    headerGrid.innerHTML += `<div>${n}</div>`;
  });
  container.appendChild(headerGrid);

  const daysGrid = document.createElement('div');
  daysGrid.className = 'grid grid-cols-7 gap-1.5';

  for (let i = 0; i < offset; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.className = 'min-h-[75px] rounded-lg bg-slate-50/30 border border-transparent';
    daysGrid.appendChild(emptyCell);
  }

  for (let diaNum = 1; diaNum <= totalDias; diaNum++) {
    const dataIso = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(diaNum).padStart(2, '0')}`;
    const isHoje = dataIso === dataLocalRotina(hoje);

    const compsDoDia = rotinaState.compromissos.filter(c => {
      if (c.data !== dataIso) return false;
      if (c.categoria === 'financas' && !filtroFinancas) return false;
      if (c.categoria === 'estudos' && !filtroEstudos) return false;
      if (c.categoria === 'pessoal' && !filtroPessoal) return false;
      return true;
    }).concat(eventosIntegradosAgenda(dataIso, filtroEstudos, filtroFinancas));

    const dayCell = document.createElement('div');
    dayCell.className = `min-h-[75px] p-1.5 rounded-lg border flex flex-col justify-between text-left transition ${
      isHoje ? 'bg-[#f0f9f5] border-emerald-300 shadow-xs' : 'bg-white border-slate-200/80 hover:border-slate-300'
    }`;

    dayCell.innerHTML = `
      <div class="flex items-center justify-between pb-1">
        <span class="text-[10px] font-sans tabular-nums font-bold ${isHoje ? 'text-emerald-800' : 'text-slate-700'}">${diaNum}</span>
        ${compsDoDia.length > 0 ? `<span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>` : ''}
      </div>
      <div class="space-y-1 overflow-hidden">
        ${compsDoDia.slice(0, 2).map(c => `
          <div class="text-[9px] truncate px-1 py-0.5 rounded bg-slate-50 border border-slate-200 text-slate-700 font-medium" title="${escapeHTML(c.titulo)}">
            ${origemCompromisso(c)} · ${escapeHTML(c.titulo)}
          </div>
        `).join('')}
        ${compsDoDia.length > 2 ? `<span class="text-[8px] font-bold text-slate-400 block">+${compsDoDia.length - 2} mais</span>` : ''}
      </div>
      <button type="button" class="btn-add-comp-mes mt-1 text-[9px] font-semibold text-slate-400 hover:text-emerald-700 transition" data-data="${dataIso}">
        +
      </button>
    `;

    dayCell.querySelector('.btn-add-comp-mes').addEventListener('click', (e) => {
      e.stopPropagation();
      abrirNovoCompromisso(dataIso);
    });

    daysGrid.appendChild(dayCell);
  }

  container.appendChild(daysGrid);
}

async function excluirCompromisso(id) {
  try {
    await salvarRotina(`/api/agenda/compromissos/${id}`, { method: 'DELETE' });
    await carregarCompromissos();
  } catch (e) {
    avisarFalhaRotina(e);
  }
}

// ========================================================================= //
// 6. RENDERIZAÇÃO: PAINEL DE METAS & MODELOS PRONTOS
// ========================================================================= //

const MODELOS_METAS = [
  {
    titulo: 'Reserva de Emergência R$ 10.000',
    tipo: 'financeira',
    valor_atual: 1000,
    valor_alvo: 10000,
    prazo: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    descricao: 'Construir colchão de segurança de 3 a 6 meses de custos fixos.'
  },
  {
    titulo: 'Concluir Trilha de Estudos Completa',
    tipo: 'estudos',
    valor_atual: 0,
    valor_alvo: 10,
    prazo: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    descricao: 'Avançar continuamente em videoaulas e anotações sincronizadas.'
  },
  {
    titulo: 'Lançamento de Projeto Estratégico',
    tipo: 'pessoal',
    valor_atual: 0,
    valor_alvo: 100,
    prazo: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    checklist: [
      { texto: 'Mapeamento e requisitos do escopo', concluido: false },
      { texto: 'Desenvolvimento e validação de protótipo', concluido: false },
      { texto: 'Testes de entrega e go-live oficial', concluido: false }
    ],
    descricao: 'Executar marcos estruturados com checklist direto no card.'
  }
];

function preencherModalPorModelo(modeloOuIdx) {
  const modelo = typeof modeloOuIdx === 'number' ? MODELOS_METAS[modeloOuIdx] : modeloOuIdx;
  if (!modelo) return;

  const modalMeta = document.getElementById('modal-meta');
  const formNovaMeta = document.getElementById('form-nova-meta');
  const inputTitulo = document.getElementById('input-meta-titulo');
  const selectTipo = document.getElementById('select-meta-tipo');
  const campoMetaValores = document.getElementById('campo-meta-valores');
  const campoMetaChecklist = document.getElementById('campo-meta-checklist');
  const inputValorAtual = document.getElementById('input-meta-valor-atual');
  const inputValorAlvo = document.getElementById('input-meta-valor-alvo');
  const inputPrazo = document.getElementById('input-meta-prazo');
  const textareaChecklist = document.getElementById('textarea-meta-checklist');

  if (formNovaMeta) formNovaMeta.reset();
  if (inputTitulo) inputTitulo.value = modelo.titulo;
  if (selectTipo) selectTipo.value = modelo.tipo;
  if (inputPrazo) inputPrazo.value = modelo.prazo || '';

  if (modelo.tipo === 'financeira') {
    campoMetaValores?.classList.remove('hidden');
    campoMetaChecklist?.classList.add('hidden');
    if (inputValorAtual) inputValorAtual.value = modelo.valor_atual || 0;
    if (inputValorAlvo) inputValorAlvo.value = modelo.valor_alvo || 10000;
  } else if (modelo.tipo === 'pessoal') {
    campoMetaValores?.classList.add('hidden');
    campoMetaChecklist?.classList.remove('hidden');
    if (textareaChecklist && Array.isArray(modelo.checklist)) {
      textareaChecklist.value = modelo.checklist.map(c => c.texto).join('\n');
    }
  } else {
    campoMetaValores?.classList.add('hidden');
    campoMetaChecklist?.classList.add('hidden');
  }

  if (modalMeta) {
    modalMeta.classList.remove('hidden');
    modalMeta.classList.add('flex');
  }
}

function atualizarKpisResumoMetas() {
  const todas = rotinaState.metas || [];
  const total = todas.length;

  const barEl = document.getElementById('kpi-metas-progresso-bar');
  const pctEl = document.getElementById('kpi-metas-progresso-pct');
  const ativasEl = document.getElementById('kpi-metas-ativas');
  const concluidasEl = document.getElementById('kpi-metas-concluidas');
  const proxTituloEl = document.getElementById('kpi-metas-proximo-titulo');
  const proxDiasEl = document.getElementById('kpi-metas-proximo-dias');

  if (total === 0) {
    if (barEl) barEl.style.width = '0%';
    if (pctEl) pctEl.textContent = '0%';
    if (ativasEl) ativasEl.textContent = '0 Ativas';
    if (concluidasEl) concluidasEl.textContent = '0 Concluídas';
    if (proxTituloEl) proxTituloEl.textContent = 'Nenhuma meta ativa';
    if (proxDiasEl) proxDiasEl.textContent = 'Sem contagem regressiva';
    return;
  }

  const concluidas = todas.filter(m => (m.progresso || 0) >= 100).length;
  const ativas = total - concluidas;
  const somaProgresso = todas.reduce((acc, m) => acc + (Number(m.progresso) || 0), 0);
  const mediaPct = Math.round(somaProgresso / total);

  if (barEl) barEl.style.width = `${mediaPct}%`;
  if (pctEl) {
    if (typeof window.nxAnimateNumber === 'function') window.nxAnimateNumber(pctEl, mediaPct, '%');
    else pctEl.textContent = `${mediaPct}%`;
  }
  if (ativasEl) ativasEl.textContent = `${ativas} ${ativas === 1 ? 'Ativa' : 'Ativas'}`;
  if (concluidasEl) concluidasEl.textContent = `${concluidas} ${concluidas === 1 ? 'Concluída' : 'Concluídas'}`;

  // Próximo prazo
  const comPrazo = todas
    .filter(m => m.prazo && (m.progresso || 0) < 100)
    .sort((a, b) => new Date(a.prazo) - new Date(b.prazo));

  if (comPrazo.length > 0) {
    const proxima = comPrazo[0];
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const dataMeta = new Date(proxima.prazo + 'T00:00:00');
    const diffDias = Math.ceil((dataMeta - hoje) / (1000 * 60 * 60 * 24));

    if (proxTituloEl) {
      proxTituloEl.textContent = proxima.titulo;
      proxTituloEl.title = proxima.titulo;
    }
    if (proxDiasEl) {
      if (diffDias < 0) {
        proxDiasEl.textContent = `Atrasada (${Math.abs(diffDias)} dias)`;
        proxDiasEl.className = 'text-[10px] font-sans tabular-nums text-rose-700 font-bold mt-0.5';
      } else if (diffDias === 0) {
        proxDiasEl.textContent = 'Vence hoje!';
        proxDiasEl.className = 'text-[10px] font-sans tabular-nums text-amber-700 font-bold mt-0.5';
      } else {
        proxDiasEl.textContent = `Faltam ${diffDias} ${diffDias === 1 ? 'dia' : 'dias'}`;
        proxDiasEl.className = 'text-[10px] font-sans tabular-nums text-emerald-800 font-bold mt-0.5';
      }
    }
  } else {
    if (proxTituloEl) proxTituloEl.textContent = concluidas === total ? 'Todas concluídas! 🎉' : 'Sem prazos estipulados';
    if (proxDiasEl) {
      proxDiasEl.textContent = concluidas === total ? 'Parabéns pelos resultados' : 'Defina datas ao editar';
      proxDiasEl.className = 'text-[10px] font-sans tabular-nums text-slate-500 font-medium mt-0.5';
    }
  }
}

function calcularRitmoMeta(meta) {
  const progresso = Math.min(100, Math.max(0, Number(meta?.progresso || 0)));
  if (progresso >= 100) {
    return { status: 'concluida', label: 'Concluída ✓', esperadoPct: 100, diffDias: 0, classe: 'text-emerald-800 bg-emerald-100/90 border-emerald-300' };
  }
  if (!meta?.prazo || !/^\d{4}-\d{2}-\d{2}$/.test(meta.prazo)) {
    return { status: 'sem_prazo', label: 'Em andamento', esperadoPct: null, diffDias: null, classe: 'text-slate-500 bg-slate-100 border-slate-200' };
  }

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const fim = new Date(meta.prazo + 'T00:00:00');
  const diffDias = Math.ceil((fim - hoje) / (1000 * 60 * 60 * 24));

  if (diffDias < 0) {
    return { status: 'vencida', label: `🔴 Prazo vencido (${Math.abs(diffDias)}d)`, esperadoPct: 100, diffDias, classe: 'text-rose-800 bg-rose-50 border-rose-200' };
  }

  let inicio = meta.criado_em ? new Date(meta.criado_em) : new Date(hoje.getTime() - 30 * 86400000);
  if (!Number.isFinite(inicio.getTime())) inicio = new Date(hoje.getTime() - 30 * 86400000);
  inicio.setHours(0, 0, 0, 0);
  if (inicio >= fim) inicio = new Date(fim.getTime() - 30 * 86400000);

  const duracaoTotal = Math.max(1, Math.round((fim - inicio) / 86400000));
  const decorrido = Math.max(0, Math.min(duracaoTotal, Math.round((hoje - inicio) / 86400000)));
  const esperadoPct = Math.round((decorrido / duracaoTotal) * 100);
  const deltaRitmo = progresso - esperadoPct;

  if (deltaRitmo >= 10) {
    return { status: 'adiantada', label: `🟢 Adiantado (+${deltaRitmo}% · ${diffDias}d)`, esperadoPct, diffDias, classe: 'text-emerald-800 bg-emerald-50 border-emerald-200' };
  }
  if (deltaRitmo >= -5) {
    return { status: 'no_ritmo', label: `🟢 No Ritmo (${diffDias}d)`, esperadoPct, diffDias, classe: 'text-emerald-800 bg-emerald-50 border-emerald-200' };
  }
  if (deltaRitmo >= -20) {
    return { status: 'atencao', label: `🟡 Atenção (${progresso}% vs ${esperadoPct}%)`, esperadoPct, diffDias, classe: 'text-amber-800 bg-amber-50 border-amber-200' };
  }
  return { status: 'em_risco', label: `🔴 Em Risco (${progresso}% vs ${esperadoPct}%)`, esperadoPct, diffDias, classe: 'text-rose-800 bg-rose-50 border-rose-200' };
}

function calcularEsforcoMeta(meta, diffDias) {
  if (!meta || Number(meta.progresso || 0) >= 100) return '';
  if (diffDias === null || diffDias === undefined || diffDias < 1) return '';

  const dias = Math.max(1, diffDias);
  const semanas = Math.max(1, dias / 7);
  const meses = Math.max(1, dias / 30);

  if (meta.tipo === 'financeira') {
    const falta = Math.max(0, Number(meta.valor_alvo || 0) - Number(meta.valor_atual || 0));
    if (falta <= 0) return '';
    if (dias >= 45) {
      const m = Math.max(1, Math.round(meses));
      const porMes = falta / m;
      return `📐 Esforço: R$ ${porMes.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}/mês (${m} ${m === 1 ? 'mês' : 'meses'})`;
    }
    if (dias >= 14) {
      const porSem = falta / semanas;
      return `📐 Esforço: R$ ${porSem.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}/semana`;
    }
    const porDia = falta / dias;
    return `📐 Esforço: R$ ${porDia.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}/dia`;
  }

  if (meta.tipo === 'numerica') {
    const falta = Math.max(0, Number(meta.valor_alvo || 0) - Number(meta.valor_atual || 0));
    if (falta <= 0) return '';
    const un = meta.unidade || 'un';
    const porDia = falta / dias;
    if (porDia >= 1 || dias <= 21) {
      const txtDia = porDia >= 1 ? Math.ceil(porDia) : porDia.toFixed(1).replace('.', ',');
      return `📐 Faltam ${falta} ${un} em ${dias}d → ${txtDia} ${un}/dia`;
    }
    const porSem = Math.ceil(falta / semanas);
    return `📐 Faltam ${falta} ${un} → ${porSem} ${un}/semana`;
  }

  if (meta.tipo === 'estudos') {
    const falta = Math.max(0, Number(meta.valor_alvo || 0) - Number(meta.valor_atual || 0));
    if (falta <= 0) return '';
    const porSem = Math.ceil(falta / semanas);
    return dias <= 14
      ? `📐 Faltam ${falta} aulas em ${dias}d → ${Math.ceil(falta / dias)} aula(s)/dia`
      : `📐 Faltam ${falta} aulas → ${porSem} aula(s)/semana`;
  }

  if (meta.tipo === 'habito') {
    const falta = Math.max(0, Number(meta.valor_alvo || 0) - Number(meta.valor_atual || 0));
    if (falta <= 0) return '';
    return dias <= 14
      ? `📐 Faltam ${falta} check-in(s) em ${dias}d`
      : `📐 Faltam ${falta} check-in(s) → ${Math.ceil(falta / semanas)}/semana`;
  }

  if (meta.tipo === 'pessoal' && Array.isArray(meta.checklist) && meta.checklist.length > 0) {
    const falta = meta.checklist.filter(s => !s.concluido).length;
    if (falta <= 0) return '';
    return dias <= 14
      ? `📐 Faltam ${falta} etapa(s) em ${dias}d`
      : `📐 Faltam ${falta} etapa(s) → ${Math.ceil(falta / semanas)}/semana`;
  }

  return '';
}

window.calcularRitmoMeta = calcularRitmoMeta;
window.calcularEsforcoMeta = calcularEsforcoMeta;

const PILARES_META = [
  { id: 'carreira', label: 'Carreira & Estudos', icone: '🎓', cor: '#5b9086' },
  { id: 'financeiro', label: 'Financeiro', icone: '💰', cor: '#cfa468' },
  { id: 'saude', label: 'Saúde & Energia', icone: '💪', cor: '#7e8ab4' },
  { id: 'pessoal', label: 'Vida Pessoal', icone: '🌿', cor: '#cc9170' }
];

function renderizarRadarPilares() {
  const svg = document.getElementById('svg-metas-radar');
  const lista = document.getElementById('lista-metas-pilares');
  if (!svg || !lista) return;

  const metas = Array.isArray(rotinaState.metas) ? rotinaState.metas : [];
  const stats = PILARES_META.map(p => {
    const doPilar = metas.filter(m => (m.pilar || 'pessoal') === p.id);
    const media = doPilar.length > 0
      ? Math.round(doPilar.reduce((acc, m) => acc + Math.min(100, Math.max(0, Number(m.progresso || 0))), 0) / doPilar.length)
      : 0;
    return { ...p, total: doPilar.length, media };
  });

  const cx = 110;
  const cy = 100;
  const rMax = 68;
  const angulos = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];

  const pt = (r, a) => `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  const aneis = [0.25, 0.5, 0.75, 1].map(f => {
    const pts = angulos.map(a => pt(rMax * f, a)).join(' ');
    return `<polygon points="${pts}" fill="none" stroke="rgba(31,42,39,0.1)" stroke-width="1" />`;
  }).join('');

  const eixos = angulos.map(a => `<line x1="${cx}" y1="${cy}" x2="${(cx + rMax * Math.cos(a)).toFixed(1)}" y2="${(cy + rMax * Math.sin(a)).toFixed(1)}" stroke="rgba(31,42,39,0.12)" stroke-width="1" />`).join('');

  const polyPts = stats.map((s, i) => {
    const r = Math.max(6, (s.media / 100) * rMax);
    return pt(r, angulos[i]);
  }).join(' ');

  const labelsPos = [
    { x: cx, y: 18, anchor: 'middle', txt: '🎓 Carreira' },
    { x: cx + rMax + 10, y: cy + 3, anchor: 'start', txt: '💰 Finanças' },
    { x: cx, y: cy + rMax + 18, anchor: 'middle', txt: '💪 Saúde' },
    { x: cx - rMax - 10, y: cy + 3, anchor: 'end', txt: '🌿 Pessoal' }
  ];

  const labelsSvg = labelsPos.map(l => `<text x="${l.x}" y="${l.y}" text-anchor="${l.anchor}" font-size="9.5" font-weight="700" fill="#334155">${l.txt}</text>`).join('');

  svg.innerHTML = `
    ${aneis}
    ${eixos}
    <polygon points="${polyPts}" fill="rgba(91, 144, 134, 0.25)" stroke="#437268" stroke-width="2" />
    ${stats.map((s, i) => {
      const r = Math.max(6, (s.media / 100) * rMax);
      const x = (cx + r * Math.cos(angulos[i])).toFixed(1);
      const y = (cy + r * Math.sin(angulos[i])).toFixed(1);
      return `<circle cx="${x}" cy="${y}" r="3.5" fill="#437268" stroke="#fff" stroke-width="1.5" />`;
    }).join('')}
    ${labelsSvg}
  `;

  lista.innerHTML = stats.map(s => `
    <div class="p-2.5 rounded-xl bg-slate-50/80 border border-slate-200/80 flex items-center justify-between gap-2">
      <div class="min-w-0">
        <p class="text-[11px] font-bold text-slate-800 truncate">${s.icone} ${s.label}</p>
        <p class="text-[10px] text-slate-500">${s.total} ${s.total === 1 ? 'meta' : 'metas'}</p>
      </div>
      <span class="text-xs font-extrabold tabular-nums text-emerald-800 shrink-0">${s.media}%</span>
    </div>
  `).join('');
}

function renderizarMetas() {
  const container = document.getElementById('grid-cards-metas');
  if (!container) return;

  atualizarKpisResumoMetas();
  renderizarRadarPilares();

  // Alerta de foco (3 a 5 metas ativas simultaneamente)
  const alertaFoco = document.getElementById('alerta-foco-metas');
  const ativasTotal = (rotinaState.metas || []).filter(m => Number(m.progresso || 0) < 100).length;
  if (alertaFoco) {
    if (ativasTotal > 5) {
      alertaFoco.textContent = `🎯 Alerta de Foco: você tem ${ativasTotal} metas ativas ao mesmo tempo. Para evitar dispersão, priorize de 3 a 5 metas principais neste trimestre.`;
      alertaFoco.classList.remove('hidden');
    } else {
      alertaFoco.classList.add('hidden');
    }
  }

  container.innerHTML = '';

  const tipo = rotinaState.filtroMetaAtual;
  const cicloFiltro = document.getElementById('select-filtro-ciclo-meta')?.value || 'todos';
  const metasFiltradas = (rotinaState.metas || []).filter(m => {
    const matchTipo = tipo === 'todas' || m.tipo === tipo;
    const matchCiclo = cicloFiltro === 'todos' || (m.ciclo || 'anual') === cicloFiltro;
    return matchTipo && matchCiclo;
  });

  const metasAtivasFiltradas = metasFiltradas.filter(m => Number(m.progresso || 0) < 100);
  const metasConcluidasFiltradas = metasFiltradas.filter(m => Number(m.progresso || 0) >= 100);

  const secaoGaleria = document.getElementById('secao-metas-concluidas');
  const gridGaleria = document.getElementById('grid-metas-concluidas');
  const badgeGaleria = document.getElementById('badge-metas-concluidas-galeria');
  if (secaoGaleria && gridGaleria) {
    if (metasConcluidasFiltradas.length > 0) {
      secaoGaleria.classList.remove('hidden');
      if (badgeGaleria) badgeGaleria.textContent = String(metasConcluidasFiltradas.length);
      gridGaleria.innerHTML = '';
    } else {
      secaoGaleria.classList.add('hidden');
    }
  }

  if (metasFiltradas.length === 0) {
    container.innerHTML = `
      <div class="col-span-full py-10 px-6 text-center border border-dashed border-slate-200 rounded-xl bg-white shadow-xs space-y-5">
        <div>
          <div class="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-200/60 mx-auto flex items-center justify-center mb-2.5">
            <svg class="w-5 h-5 text-emerald-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 class="text-sm font-bold text-slate-900">Nenhuma meta encontrada nesta categoria</h3>
          <p class="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Comece criando um objetivo manual ou use um de nossos modelos corporativos com 1 clique.
          </p>
        </div>

        <!-- 3 Modelos Prontos Clicáveis -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3.5 max-w-3xl mx-auto pt-2 text-left">
          ${MODELOS_METAS.map((mod, idx) => `
            <div class="card-modelo-pronto p-4 rounded-xl border border-slate-200 hover:border-emerald-300 bg-slate-50 hover:bg-white transition cursor-pointer flex flex-col justify-between group shadow-2xs" data-idx="${idx}">
              <div>
                <div class="flex items-center justify-between mb-1.5">
                  <span class="text-[9px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    ${mod.tipo === 'financeira' ? 'Financeiro' : (mod.tipo === 'estudos' ? 'Estudos' : 'Projeto')}
                  </span>
                  <span class="text-xs text-slate-400 group-hover:text-emerald-700 transition">→</span>
                </div>
                <h4 class="text-xs font-bold text-slate-900 group-hover:text-emerald-800 transition line-clamp-1">${escapeHTML(mod.titulo)}</h4>
                <p class="text-[11px] text-slate-500 mt-1 leading-snug">${escapeHTML(mod.descricao)}</p>
              </div>
              <button type="button" class="mt-3.5 w-full py-1.5 rounded-lg text-xs font-semibold text-emerald-800 bg-white group-hover:bg-emerald-50 border border-slate-200 group-hover:border-emerald-300 transition cursor-pointer text-center">
                Usar este modelo
              </button>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    container.querySelectorAll('.card-modelo-pronto').forEach(card => {
      card.addEventListener('click', () => {
        const idx = parseInt(card.getAttribute('data-idx'), 10);
        preencherModalPorModelo(MODELOS_METAS[idx]);
      });
    });

    return;
  }

  if (metasAtivasFiltradas.length === 0 && metasConcluidasFiltradas.length > 0) {
    container.innerHTML = `
      <div class="col-span-full py-6 px-5 text-center border border-emerald-200 rounded-xl bg-emerald-50/60">
        <p class="text-sm font-bold text-emerald-900">🏆 Todas as metas desta seleção foram concluídas!</p>
        <p class="text-xs text-emerald-800/80 mt-0.5">Confira suas conquistas na Galeria de Metas Concluídas logo abaixo ou crie uma nova meta.</p>
      </div>
    `;
  }

  metasFiltradas.forEach(meta => {
    const card = document.createElement('div');
    card.id = 'meta-portal-' + meta.id;
    card.tabIndex = -1;
    const isConcluida = (meta.progresso || 0) >= 100;
    const progresso = Math.min(100, Math.max(0, meta.progresso || 0));

    card.className = `nx-card-alive rounded-xl border p-5 shadow-xs flex flex-col justify-between space-y-4 transition ${
      isConcluida
        ? 'bg-gradient-to-br from-[#f0f9f5] to-white border-emerald-300 shadow-xs'
        : 'bg-white border-slate-200/90 hover:border-emerald-300'
    }`;

    const ringCirc = 100.53; // 2 * Math.PI * 16
    const ringOffset = (ringCirc * (1 - progresso / 100)).toFixed(2);

    let tipoLabel = 'Projeto & Pessoal';
    if (meta.tipo === 'financeira') tipoLabel = 'Financeiro';
    else if (meta.tipo === 'estudos') tipoLabel = 'Estudos';
    else if (meta.tipo === 'numerica') tipoLabel = 'Numérica';
    else if (meta.tipo === 'habito') tipoLabel = 'Por Hábito';

    const pilarObj = PILARES_META.find(p => p.id === (meta.pilar || 'pessoal')) || PILARES_META[3];

    const ritmo = calcularRitmoMeta(meta);
    const seloRitmo = `<span class="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${ritmo.classe}">${ritmo.label}</span>`;
    const esforcoTexto = calcularEsforcoMeta(meta, ritmo.diffDias);

    const CONFIANCA_MAP = {
      alta: { label: '🟢 Confiança Alta', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200', prox: 'media' },
      media: { label: '🟡 Confiança Média', cls: 'bg-amber-50 text-amber-800 border-amber-200', prox: 'baixa' },
      baixa: { label: '🔴 Confiança Baixa', cls: 'bg-rose-50 text-rose-800 border-rose-200', prox: 'alta' }
    };
    const conf = CONFIANCA_MAP[meta.confianca || 'alta'] || CONFIANCA_MAP.alta;

    const primeiroPassoPendente = Array.isArray(meta.checklist) ? meta.checklist.find(s => !s.concluido)?.texto : '';
    const proximaAcao = meta.proxima_acao || primeiroPassoPendente || `Avançar em "${meta.titulo}"`;
    const cicloLabel = meta.ciclo || 'anual';

    card.innerHTML = `
      <div>
        <div class="flex items-center justify-between pb-2.5 border-b border-slate-100 gap-2">
          <div class="flex flex-wrap items-center gap-1.5 min-w-0">
            <span class="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-800">
              ${tipoLabel}
            </span>
            <span class="text-[9px] font-bold px-2 py-0.5 rounded border border-slate-200 bg-white text-slate-600">
              ${pilarObj.icone} ${cicloLabel}
            </span>
            ${seloRitmo}
          </div>
          <button class="btn-delete-meta text-slate-300 hover:text-rose-600 p-1 text-xs cursor-pointer shrink-0" data-id="${meta.id}" title="Excluir meta">
            ✕
          </button>
        </div>

        <div class="flex items-start justify-between gap-3 mt-2.5">
          <div class="min-w-0 flex-1">
            <h4 class="text-sm font-bold text-slate-900 line-clamp-2">${escapeHTML(meta.titulo)}</h4>
            ${meta.prazo ? `<p class="text-[11px] text-slate-400 mt-0.5">Data limite: ${meta.prazo}</p>` : ''}
          </div>
          <div class="relative w-11 h-11 shrink-0 flex items-center justify-center" title="${progresso}% concluído">
            <svg viewBox="0 0 40 40" class="w-11 h-11 -rotate-90 nx-meta-ring" aria-hidden="true">
              <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(31, 42, 39, 0.09)" stroke-width="3.5" />
              <circle cx="20" cy="20" r="16" fill="none" stroke="${isConcluida ? '#437268' : '#5b9086'}" stroke-width="3.5" stroke-linecap="round"
                class="nx-meta-ring-fg" stroke-dasharray="${ringCirc}" stroke-dashoffset="${ringOffset}" />
            </svg>
            <span class="absolute text-[10px] font-bold tabular-nums text-emerald-900">${progresso}%</span>
          </div>
        </div>

        <!-- Barra de Progresso Viva (com marcador de ritmo esperado quando houver prazo) -->
        <div class="mt-3 space-y-1.5">
          <div class="flex items-center justify-between text-xs font-semibold">
            <span class="text-slate-600">Progresso${ritmo.esperadoPct !== null && !isConcluida ? ` <span class="text-[10px] font-normal text-slate-400">(esperado hoje: ${ritmo.esperadoPct}%)</span>` : ''}</span>
            <span class="font-sans font-bold tabular-nums text-emerald-800">${progresso}%</span>
          </div>
          <div class="relative nx-bar-track w-full h-2 rounded-full bg-slate-100 overflow-hidden border border-slate-200">
            <div class="nx-bar-fill h-full rounded-full bg-emerald-600" style="width: ${progresso}%;"></div>
            ${ritmo.esperadoPct !== null && !isConcluida ? `<div class="absolute top-0 bottom-0 w-0.5 bg-slate-700/60" style="left: ${Math.min(99, Math.max(1, ritmo.esperadoPct))}%;" title="Ritmo esperado hoje: ${ritmo.esperadoPct}%"></div>` : ''}
          </div>
          ${esforcoTexto ? `<p class="text-[11px] font-semibold text-emerald-900 bg-emerald-50/70 border border-emerald-200/60 rounded-lg px-2.5 py-1">${esforcoTexto}</p>` : ''}
        </div>

        <!-- 1. Conteúdo Interativo: Meta Financeira -->
        ${meta.tipo === 'financeira' ? `
          <div class="mt-3.5 p-3 rounded-lg bg-[#f0f9f5] border border-[#b9d4ca]/60 space-y-2">
            <div class="flex items-center justify-between text-xs">
              <div>
                <p class="text-[10px] uppercase font-bold text-emerald-800/70">Atual</p>
                <p class="font-bold text-emerald-900 font-sans tabular-nums">R$ ${Number(meta.valor_atual || 0).toLocaleString('pt-BR')}</p>
              </div>
              <span class="text-slate-300">/</span>
              <div>
                <p class="text-[10px] uppercase font-bold text-slate-500">Alvo</p>
                <p class="font-bold text-slate-800 font-sans tabular-nums">R$ ${Number(meta.valor_alvo || 0).toLocaleString('pt-BR')}</p>
              </div>
            </div>
          </div>
          <div class="mt-2.5 flex items-center justify-between">
            ${meta.projeto_id ? `
              <span class="text-xs text-slate-600">${meta.projeto_status === 'vinculado' ? 'Saldo vinculado a Finanças' : 'Projeto vinculado indisponível'}</span>
              <button type="button" class="btn-abrir-projeto-meta text-xs font-semibold text-emerald-800 underline">Abrir Projetos & Compras</button>
            ` : `
            <span class="text-[10px] text-slate-400">Aporte direto no saldo</span>
            <button type="button" class="btn-aportar-meta px-3 py-1 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-md border border-emerald-200 transition cursor-pointer flex items-center gap-1" data-id="${meta.id}" data-nome="${escapeHTML(meta.titulo)}" data-atual="${meta.valor_atual || 0}">
              <span>+</span>
              <span>Aportar</span>
            </button>
            `}
          </div>
        ` : ''}

        <!-- 1B. Conteúdo Interativo: Meta Numérica (+1, +5, +10) -->
        ${meta.tipo === 'numerica' ? `
          <div class="mt-3.5 p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2.5">
            <div class="flex items-center justify-between text-xs">
              <span class="text-slate-600 font-medium">Acumulado:</span>
              <span class="font-bold text-slate-900 font-sans tabular-nums">${Number(meta.valor_atual || 0).toLocaleString('pt-BR')} / ${Number(meta.valor_alvo || 0).toLocaleString('pt-BR')} ${escapeHTML(meta.unidade || 'un')}</span>
            </div>
            <div class="flex items-center justify-between gap-1.5">
              <span class="text-[10px] font-semibold text-slate-400">Somar rápido:</span>
              <div class="flex items-center gap-1.5">
                <button type="button" class="btn-inc-meta-num px-2.5 py-1 rounded-md text-xs font-bold text-emerald-800 bg-white hover:bg-emerald-50 border border-emerald-200 transition cursor-pointer" data-id="${meta.id}" data-delta="1">+1</button>
                <button type="button" class="btn-inc-meta-num px-2.5 py-1 rounded-md text-xs font-bold text-emerald-800 bg-white hover:bg-emerald-50 border border-emerald-200 transition cursor-pointer" data-id="${meta.id}" data-delta="5">+5</button>
                <button type="button" class="btn-inc-meta-num px-2.5 py-1 rounded-md text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 transition cursor-pointer shadow-2xs" data-id="${meta.id}" data-delta="10">+10</button>
              </div>
            </div>
          </div>
        ` : ''}

        <!-- 1C. Conteúdo Interativo: Meta por Hábito -->
        ${meta.tipo === 'habito' ? `
          <div class="mt-3.5 p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
            <div class="flex items-center justify-between text-xs">
              <span class="text-slate-600 font-medium truncate">${escapeHTML(meta.habito_icone || '⚡')} ${escapeHTML(meta.habito_nome || 'Hábito vinculado')}</span>
              <span class="font-bold text-slate-900 font-sans tabular-nums shrink-0">${meta.valor_atual || 0} / ${meta.valor_alvo || 30}</span>
            </div>
            <p class="text-[10px] text-slate-400">Cada check-in no hábito abaixo soma automaticamente aqui.</p>
          </div>
          <div class="mt-2.5 flex justify-end">
            <button type="button" onclick="document.getElementById('secao-metas-habitos')?.scrollIntoView({ behavior: 'smooth' })" class="px-3 py-1 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-md border border-emerald-200 transition cursor-pointer">
              Ir para Hábitos ↓
            </button>
          </div>
        ` : ''}

        <!-- 2. Conteúdo Interativo: Meta de Estudos -->
        ${meta.tipo === 'estudos' ? `
          <div class="mt-3.5 p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
            <div class="flex items-center justify-between text-xs">
              <span class="text-slate-600 font-medium">Aulas Concluídas:</span>
              <span class="font-bold text-slate-900 font-sans tabular-nums">${meta.valor_atual || 0} de ${meta.valor_alvo || 0}</span>
            </div>
            <p class="text-[10px] text-slate-400">Sincronizado em tempo real com o módulo Educação.</p>
          </div>
          <div class="mt-2.5 flex justify-end">
            <button type="button" onclick="window.navIrParaLms()" class="px-3 py-1 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-md border border-emerald-200 transition cursor-pointer">
              Continuar Trilha →
            </button>
          </div>
        ` : ''}

        <!-- 3. Conteúdo Interativo: Meta Pessoal / Projeto -->
        ${meta.tipo === 'pessoal' && Array.isArray(meta.checklist) && meta.checklist.length > 0 ? `
          <div class="mt-3.5 space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar-dark pr-1">
            <div class="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              <span>Etapas do Projeto</span>
              <span class="font-sans tabular-nums">${meta.checklist.filter(s => s.concluido).length}/${meta.checklist.length}</span>
            </div>
            ${meta.checklist.map((step, idx) => `
              <label class="flex items-center justify-between gap-2 p-1.5 rounded-md bg-slate-50 border border-slate-200/80 text-xs cursor-pointer hover:bg-white transition">
                <div class="flex items-center gap-2 min-w-0">
                  <input type="checkbox" class="chk-step-meta rounded accent-emerald-600 shrink-0" data-meta-id="${meta.id}" data-step-idx="${idx}" ${step.concluido ? 'checked' : ''}>
                  <span class="text-[11px] truncate ${step.concluido ? 'line-through text-slate-400' : 'text-slate-700'}">${escapeHTML(step.texto)}</span>
                </div>
                ${Number(step.peso) > 0 ? `<span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 shrink-0">${step.peso}%</span>` : ''}
              </label>
            `).join('')}
          </div>
        ` : ''}

        <!-- 4. Propósito & Plano Se-Então (WOOP) quando preenchido -->
        ${(meta.proposito || meta.woop_obstaculo || meta.woop_plano) ? `
          <details class="mt-3 p-2.5 rounded-lg bg-[#f9f6ee] border border-amber-200/70 text-[11px] space-y-1">
            <summary class="font-bold text-amber-950 cursor-pointer select-none">💡 Propósito &amp; Plano Se–Então (WOOP)</summary>
            ${meta.proposito ? `<p class="text-slate-700 pt-1"><strong>Por quê:</strong> ${escapeHTML(meta.proposito)}</p>` : ''}
            ${meta.woop_obstaculo ? `<p class="text-slate-600"><strong>Se:</strong> ${escapeHTML(meta.woop_obstaculo)}</p>` : ''}
            ${meta.woop_plano ? `<p class="text-emerald-900"><strong>Então:</strong> ${escapeHTML(meta.woop_plano)}</p>` : ''}
          </details>
        ` : ''}

        <!-- 5. Próxima Ação + Semáforo de Confiança + Histórico -->
        <div class="mt-3.5 pt-3 border-t border-slate-100 space-y-2">
          ${!isConcluida ? `
            <div class="flex items-center justify-between gap-2 text-[11px]">
              <span class="text-slate-500 truncate" title="${escapeHTML(proximaAcao)}">👉 <strong class="text-slate-700">Próxima:</strong> ${escapeHTML(proximaAcao)}</span>
              <button type="button" class="btn-meta-enviar-agenda px-2 py-1 rounded-md text-[10px] font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition cursor-pointer shrink-0" title="Criar tarefa na Agenda/Inbox de Hoje">
                ⚡ Enviar p/ Agenda
              </button>
            </div>
          ` : ''}
          <div class="flex items-center justify-between gap-2 flex-wrap">
            ${!isConcluida ? `
              <button type="button" class="btn-meta-confianca px-2 py-0.5 rounded-md text-[10px] font-bold border transition cursor-pointer ${conf.cls}" title="Clique para alternar seu nível de confiança (aparece na Revisão Semanal)">
                ${conf.label}
              </button>
            ` : `<span class="text-[10px] font-bold text-emerald-800">🏆 Conquista desbloqueada</span>`}
            <button type="button" class="btn-meta-historico px-2 py-0.5 rounded-md text-[10px] font-semibold text-slate-600 hover:text-emerald-800 bg-slate-50 hover:bg-emerald-50 border border-slate-200 transition cursor-pointer">
              📜 Histórico${Array.isArray(meta.avancos) && meta.avancos.length ? ` (${meta.avancos.length})` : ''}
            </button>
          </div>
        </div>
      </div>
    `;

    card.querySelector('.btn-meta-historico')?.addEventListener('click', () => {
      abrirModalHistoricoMeta(meta);
    });

    card.querySelector('.btn-meta-confianca')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      if (btn.disabled) return;
      btn.disabled = true;
      try {
        await salvarRotina(`/api/metas/${meta.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confianca: conf.prox })
        });
        await carregarMetas();
      } catch (err) {
        avisarFalhaRotina(err);
      } finally {
        btn.disabled = false;
      }
    });

    card.querySelector('.btn-meta-enviar-agenda')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      if (btn.disabled) return;
      btn.disabled = true;
      try {
        const hoje = dataLocalRotina(new Date());
        await salvarRotina('/api/rotina/prioridades', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            texto: `[Meta] ${proximaAcao}`,
            top3: false,
            data: hoje,
            duracao_min: 30,
            energia: 'alto'
          })
        });
        if (typeof carregarPrioridades === 'function') await carregarPrioridades();
        if (typeof window.mostrarToast === 'function') {
          window.mostrarToast('Próxima ação enviada para Rotina & Agenda de Hoje! ⚡', 'success');
        }
      } catch (err) {
        avisarFalhaRotina(err);
      } finally {
        btn.disabled = false;
      }
    });

    card.querySelector('.btn-delete-meta').addEventListener('click', async () => {
      const confirmado = typeof window.nxConfirmarExclusao === 'function'
        ? await window.nxConfirmarExclusao({
            titulo: 'Excluir meta?',
            nomeItem: meta.titulo,
            descricao: 'Todo o progresso e histórico de avanços desta meta serão removidos.',
            textoConfirmar: 'Excluir meta'
          })
        : confirm(`Deseja excluir a meta "${meta.titulo}"?`);
      if (!confirmado) return;
      await excluirMeta(meta.id);
    });

    card.querySelectorAll('.btn-inc-meta-num').forEach(btnInc => {
      btnInc.addEventListener('click', async () => {
        if (btnInc.disabled) return;
        btnInc.disabled = true;
        const delta = Number(btnInc.getAttribute('data-delta') || 1);
        try {
          const resp = await salvarRotina(`/api/metas/${meta.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ delta })
          });
          await carregarMetas();
          if (resp?.data?.progresso >= 100) {
            const cardAtual = document.getElementById('meta-portal-' + meta.id);
            if (cardAtual && typeof window.nxCelebrate === 'function') window.nxCelebrate(cardAtual);
          }
        } catch (err) {
          avisarFalhaRotina(err);
        } finally {
          btnInc.disabled = false;
        }
      });
    });

    const btnAporte = card.querySelector('.btn-aportar-meta');
    card.querySelector('.btn-abrir-projeto-meta')?.addEventListener('click', () => {
      window.abrirAcaoFinanceira('projetosCompras');
    });
    if (btnAporte) {
      btnAporte.addEventListener('click', () => {
        abrirModalAporte(meta.id, meta.titulo, meta.valor_atual || 0);
      });
    }

    card.querySelectorAll('.chk-step-meta').forEach(chk => {
      chk.addEventListener('change', async () => {
        const mId = chk.getAttribute('data-meta-id');
        const sIdx = parseInt(chk.getAttribute('data-step-idx'), 10);
        await alternarChecklistMeta(mId, sIdx, chk.checked);
      });
    });

    if (isConcluida && gridGaleria) {
      gridGaleria.appendChild(card);
    } else {
      container.appendChild(card);
    }
  });
}

function abrirModalHistoricoMeta(meta) {
  const modal = document.getElementById('modal-meta-historico');
  if (!modal || !meta) return;
  const tit = document.getElementById('meta-hist-titulo');
  const idEl = document.getElementById('input-meta-hist-id');
  const woopBox = document.getElementById('meta-hist-woop-box');
  const lista = document.getElementById('meta-hist-lista');
  const notaEl = document.getElementById('input-meta-hist-nota');

  if (tit) tit.textContent = meta.titulo;
  if (idEl) idEl.value = String(meta.id);
  if (notaEl) notaEl.value = '';

  if (woopBox) {
    if (meta.proposito || meta.woop_obstaculo || meta.woop_plano) {
      woopBox.innerHTML = `
        <div class="p-3 rounded-xl bg-amber-50/70 border border-amber-200/80 text-xs space-y-1">
          ${meta.proposito ? `<p class="text-slate-800"><strong>💡 Por que importa:</strong> ${escapeHTML(meta.proposito)}</p>` : ''}
          ${meta.woop_obstaculo ? `<p class="text-slate-700"><strong>🧱 Obstáculo (Se):</strong> ${escapeHTML(meta.woop_obstaculo)}</p>` : ''}
          ${meta.woop_plano ? `<p class="text-emerald-900"><strong>🛡️ Plano (Então):</strong> ${escapeHTML(meta.woop_plano)}</p>` : ''}
        </div>
      `;
    } else {
      woopBox.innerHTML = `<p class="text-[11px] text-slate-400">Nenhum propósito ou plano Se–Então cadastrado nesta meta.</p>`;
    }
  }

  if (lista) {
    const avancos = Array.isArray(meta.avancos) ? [...meta.avancos].reverse() : [];
    if (avancos.length === 0) {
      lista.innerHTML = `<p class="text-xs text-slate-400 py-3 text-center border border-dashed border-slate-200 rounded-xl">Nenhum avanço registrado ainda. Faça progresso ou adicione uma nota acima!</p>`;
    } else {
      lista.innerHTML = avancos.map(a => {
        const dt = a.data ? new Date(a.data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
        return `
          <div class="p-2.5 rounded-xl bg-white border border-slate-200 text-xs space-y-0.5">
            <div class="flex items-center justify-between gap-2">
              <span class="font-bold text-emerald-800">${a.de ?? 0}% → ${a.para ?? 0}%</span>
              <span class="text-[10px] text-slate-400">${dt}</span>
            </div>
            ${a.nota ? `<p class="text-slate-700">${escapeHTML(a.nota)}</p>` : ''}
          </div>
        `;
      }).join('');
    }
  }

  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function abrirModalAporte(id, nome, valorAtual) {
  const modal = document.getElementById('modal-aporte-meta');
  const inputId = document.getElementById('input-aporte-meta-id');
  const lblNome = document.getElementById('label-aporte-meta-nome');
  const inputValor = document.getElementById('input-aporte-valor');

  if (inputId) inputId.value = id;
  if (lblNome) lblNome.textContent = nome;
  if (inputValor) {
    inputValor.value = '';
    inputValor.focus();
  }

  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

async function alternarChecklistMeta(metaId, stepIdx, status) {
  const meta = rotinaState.metas.find(m => m.id === parseInt(metaId, 10));
  if (!meta || !Array.isArray(meta.checklist)) return;

  const checklist = meta.checklist.map((passo, idx) => idx === stepIdx ? { ...passo, concluido: status } : passo);
  try {
    await salvarRotina(`/api/metas/${metaId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checklist })
    });
    await carregarMetas();
    if (typeof carregarDashboardGeral === 'function') carregarDashboardGeral();
    if (status) {
      const cardEl = document.getElementById('meta-portal-' + metaId);
      if (cardEl && typeof window.nxCelebrate === 'function') window.nxCelebrate(cardEl);
    }
  } catch (e) {
    renderizarMetas();
    avisarFalhaRotina(e);
  }
}

async function realizarAporteMeta(metaId, valorAdicional) {
  const meta = rotinaState.metas.find(m => m.id === parseInt(metaId, 10));
  if (!meta) return false;

  const novoValor = Number(meta.valor_atual || 0) + Number(valorAdicional || 0);
  try {
    await salvarRotina(`/api/metas/${metaId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ valor_atual: novoValor })
    });
    await carregarMetas();
    if (typeof carregarDashboardGeral === 'function') carregarDashboardGeral();
    const cardEl = document.getElementById('meta-portal-' + metaId);
    if (cardEl && typeof window.nxCelebrate === 'function') window.nxCelebrate(cardEl);
    return true;
  } catch (e) {
    avisarFalhaRotina(e);
    return false;
  }
}

async function excluirMeta(id) {
  try {
    await salvarRotina(`/api/metas/${id}`, { method: 'DELETE' });
    await carregarMetas();
    if (typeof carregarDashboardGeral === 'function') carregarDashboardGeral();
  } catch (e) {
    avisarFalhaRotina(e);
  }
}

// ========================================================================= //
// 7. CRONÔMETRO POMODORO INTEGRADO (25m Foco / 5m Pausa)
// ========================================================================= //

function formatarTempoPomodoro(segundos) {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function atualizarDisplayPomodoro() {
  const display = document.getElementById('pomodoro-timer-display');
  const badge = document.getElementById('pomodoro-mode-badge');
  const btnStart = document.getElementById('btn-pomodoro-start');

  if (display) display.textContent = formatarTempoPomodoro(rotinaState.pomodoroSeconds);
  if (badge) {
    badge.textContent = rotinaState.pomodoroMode === 'foco' ? 'Foco' : 'Pausa';
    badge.className = rotinaState.pomodoroMode === 'foco'
      ? 'text-[9px] font-bold uppercase px-1.5 py-0.2 rounded bg-amber-100 text-amber-800'
      : 'text-[9px] font-bold uppercase px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800';
  }
  if (btnStart) {
    btnStart.textContent = rotinaState.pomodoroRunning ? '⏸' : '▶';
  }
}

function alternarPomodoro() {
  if (rotinaState.pomodoroRunning) {
    clearInterval(rotinaState.pomodoroInterval);
    rotinaState.pomodoroRunning = false;
  } else {
    rotinaState.pomodoroRunning = true;
    rotinaState.pomodoroInterval = setInterval(() => {
      if (rotinaState.pomodoroSeconds > 0) {
        rotinaState.pomodoroSeconds--;
        atualizarDisplayPomodoro();
      } else {
        // Alterna entre foco (25m) e pausa (5m)
        if (rotinaState.pomodoroMode === 'foco') {
          rotinaState.pomodoroMode = 'pausa';
          rotinaState.pomodoroSeconds = 5 * 60;
          alert('⏰ Pomodoro de foco concluído! Faça uma pausa de 5 minutos.');
        } else {
          rotinaState.pomodoroMode = 'foco';
          rotinaState.pomodoroSeconds = 25 * 60;
          alert('🚀 Pausa finalizada! Pronto para mais um bloco de 25 minutos de foco?');
        }
        rotinaState.pomodoroRunning = false;
        clearInterval(rotinaState.pomodoroInterval);
        atualizarDisplayPomodoro();
      }
    }, 1000);
  }
  atualizarDisplayPomodoro();
}

function resetarPomodoro() {
  clearInterval(rotinaState.pomodoroInterval);
  rotinaState.pomodoroRunning = false;
  rotinaState.pomodoroMode = 'foco';
  rotinaState.pomodoroSeconds = 25 * 60;
  atualizarDisplayPomodoro();
}

// ========================================================================= //
// 8. INICIALIZAÇÃO DE EVENTOS & MODAIS
// ========================================================================= //

document.addEventListener('DOMContentLoaded', () => {
  // Inicializa Modal de Histórico de Tarefas
  const btnAbrirHistorico = document.getElementById('btn-abrir-historico-tarefas');
  const modalHistorico = document.getElementById('modal-historico-tarefas');
  const btnLimparHistorico = document.getElementById('btn-limpar-todo-historico');

  if (btnAbrirHistorico && modalHistorico) {
    btnAbrirHistorico.addEventListener('click', () => {
      modalHistorico.classList.remove('hidden');
      modalHistorico.classList.add('flex');
      carregarHistoricoTarefas();
    });
  }

  if (btnLimparHistorico) {
    const abrirModalLimparHistorico = () => {
      let modal = document.getElementById('modal-confirmar-limpar-historico');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-confirmar-limpar-historico';
        modal.className = 'fixed inset-0 z-[10000] hidden items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm transition-opacity duration-200';
        modal.innerHTML = `
          <div class="bg-[#fffdf8] border border-[#1f2a27]/12 rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center space-y-4 transform transition-all duration-200 scale-95 opacity-0" id="card-confirmar-limpar-historico">
            <div class="w-12 h-12 mx-auto rounded-2xl bg-rose-50 border border-rose-200/80 flex items-center justify-center text-rose-600 shadow-xs">
              <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>

            <div class="space-y-1.5">
              <h3 class="text-base font-bold text-[#1f2a27] tracking-tight">Limpar histórico de tarefas?</h3>
              <p class="text-xs text-[#5d5c54] leading-relaxed">
                Todas as tarefas concluídas e arquivadas do histórico serão removidas permanentemente. <strong class="text-rose-700">Esta ação não pode ser desfeita.</strong>
              </p>
            </div>

            <div class="grid grid-cols-2 gap-2.5 pt-2">
              <button type="button" id="btn-cancelar-limpar-hist" class="py-2.5 px-4 rounded-xl text-xs font-semibold text-[#5d5c54] bg-[#f1ede3] hover:bg-[#e5dfd0] border border-[#1f2a27]/10 transition cursor-pointer">
                Cancelar
              </button>
              <button type="button" id="btn-confirmar-limpar-hist" class="py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-700 hover:to-rose-800 shadow-md shadow-rose-600/20 transition cursor-pointer flex items-center justify-center gap-1.5">
                <span>Sim, limpar</span>
              </button>
            </div>
          </div>
        `;
        document.body.appendChild(modal);

        const card = modal.querySelector('#card-confirmar-limpar-historico');
        const fechar = () => {
          card.classList.add('scale-95', 'opacity-0');
          setTimeout(() => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
          }, 150);
        };

        modal.querySelector('#btn-cancelar-limpar-hist').addEventListener('click', fechar);
        modal.addEventListener('click', (e) => { if (e.target === modal) fechar(); });
        document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape' && !modal.classList.contains('hidden')) fechar();
        });

        const btnConfirm = modal.querySelector('#btn-confirmar-limpar-hist');
        btnConfirm.addEventListener('click', async () => {
          btnConfirm.disabled = true;
          btnConfirm.innerHTML = '<svg class="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg><span>Limpando...</span>';
          try {
            await salvarRotina('/api/rotina/historico-tarefas', { method: 'DELETE' });
            await carregarHistoricoTarefas();
            fechar();

            // Toast elegante de confirmação
            const toast = document.createElement('div');
            toast.className = 'fixed bottom-5 right-5 z-[10001] bg-[#1f2a27] text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-xl border border-emerald-500/30 flex items-center gap-2 transition-all duration-300';
            toast.innerHTML = '<span class="text-emerald-400">✓</span><span>Histórico de tarefas limpo com sucesso!</span>';
            document.body.appendChild(toast);
            setTimeout(() => {
              toast.style.opacity = '0';
              toast.style.transform = 'translateY(8px)';
              setTimeout(() => toast.remove(), 300);
            }, 2600);
          } catch (e) {
            avisarFalhaRotina(e);
            fechar();
          } finally {
            btnConfirm.disabled = false;
            btnConfirm.innerHTML = '<span>Sim, limpar</span>';
          }
        });
      }

      const card = modal.querySelector('#card-confirmar-limpar-historico');
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      requestAnimationFrame(() => {
        card.classList.remove('scale-95', 'opacity-0');
      });
    };

    btnLimparHistorico.addEventListener('click', abrirModalLimparHistorico);
  }

  // Modal Interativo de Exclusão Seletiva de Metas (Selecionar itens ou Apagar Tudo com confirmação)
  window.abrirModalExcluirMetas = async function abrirModalExcluirMetas() {
    let modal = document.getElementById('modal-excluir-metas-seletivo');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'modal-excluir-metas-seletivo';
    modal.className = 'fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-sm';
    modal.innerHTML = `
      <div id="card-excluir-metas" class="bg-[#fffdf8] border border-[#1f2a27]/12 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden transform transition-all duration-200 scale-95 opacity-0">
        <!-- ETAPA 1: SELEÇÃO INDIVIDUAL DE METAS -->
        <div id="etapa-metas-selecao" class="p-5 sm:p-6 space-y-4">
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200/80 flex items-center justify-center text-rose-600 shrink-0">
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h3 class="text-base font-bold text-[#1f2a27] leading-tight">Excluir Metas</h3>
                <p class="text-[11px] text-[#5d5c54] mt-0.5">Selecione exatamente as metas que deseja remover.</p>
              </div>
            </div>
            <button type="button" id="btn-fechar-excluir-metas" class="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer">✕</button>
          </div>

          <div class="flex items-center justify-between px-1">
            <label class="flex items-center gap-2 text-xs font-semibold text-[#5d5c54] cursor-pointer select-none">
              <input type="checkbox" id="chk-selecionar-todas-metas" class="w-4 h-4 rounded accent-rose-600 cursor-pointer" />
              <span>Selecionar todas as metas</span>
            </label>
            <span id="lbl-resumo-metas-selecionadas" class="text-[11px] font-semibold text-rose-700">0 selecionadas</span>
          </div>

          <div id="lista-metas-excluir" class="max-h-64 overflow-y-auto space-y-2 pr-1">
            <div class="py-8 text-center text-xs text-slate-400">Carregando metas...</div>
          </div>

          <div class="space-y-2.5 pt-2 border-t border-[#1f2a27]/10">
            <button type="button" id="btn-executar-excluir-metas" disabled class="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer flex items-center justify-center gap-2">
              <span>Excluir Selecionadas</span>
            </button>

            <div class="flex items-center gap-2">
              <button type="button" id="btn-ir-apagar-todas-metas" class="flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition cursor-pointer">
                ⚠️ Apagar Todas
              </button>
              <button type="button" id="btn-cancelar-excluir-metas" class="py-2.5 px-4 rounded-xl text-xs font-semibold text-[#5d5c54] bg-[#f1ede3] hover:bg-[#e5dfd0] border border-[#1f2a27]/10 transition cursor-pointer">
                Cancelar
              </button>
            </div>
          </div>
        </div>

        <!-- ETAPA 2: CONFIRMAÇÃO EXTRA PARA APAGAR TODAS -->
        <div id="etapa-metas-confirmar-tudo" class="hidden p-6 text-center space-y-5">
          <div class="w-14 h-14 mx-auto rounded-2xl bg-rose-100 border border-rose-300 flex items-center justify-center text-rose-700 text-2xl">
            ⚠️
          </div>
          <div class="space-y-2">
            <h3 class="text-base font-bold text-rose-900">Tem certeza que deseja apagar TODAS as metas?</h3>
            <p class="text-xs text-[#5d5c54] leading-relaxed">
              Todas as suas metas e históricos de progresso serão excluídos permanentemente. Esta ação não pode ser desfeita.
            </p>
          </div>
          <div class="grid grid-cols-2 gap-2.5 pt-1">
            <button type="button" id="btn-voltar-metas-selecao" class="py-2.5 px-4 rounded-xl text-xs font-semibold text-[#5d5c54] bg-[#f1ede3] hover:bg-[#e5dfd0] border border-[#1f2a27]/10 transition cursor-pointer">
              ← Voltar
            </button>
            <button type="button" id="btn-confirmar-apagar-todas-metas" class="py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-700 hover:to-rose-800 shadow-md shadow-rose-600/25 transition cursor-pointer flex items-center justify-center gap-1.5">
              <span>Sim, apagar todas</span>
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const card = modal.querySelector('#card-excluir-metas');
    requestAnimationFrame(() => card.classList.remove('scale-95', 'opacity-0'));

    const etapa1 = modal.querySelector('#etapa-metas-selecao');
    const etapa2 = modal.querySelector('#etapa-metas-confirmar-tudo');
    const listaEl = modal.querySelector('#lista-metas-excluir');
    const chkTodas = modal.querySelector('#chk-selecionar-todas-metas');
    const lblResumo = modal.querySelector('#lbl-resumo-metas-selecionadas');
    const btnSel = modal.querySelector('#btn-executar-excluir-metas');
    const btnIrTudo = modal.querySelector('#btn-ir-apagar-todas-metas');
    const btnVoltar = modal.querySelector('#btn-voltar-metas-selecao');
    const btnConfTudo = modal.querySelector('#btn-confirmar-apagar-todas-metas');

    let listaMetas = [];
    const selecionadas = new Set();

    const fechar = () => {
      card.classList.add('scale-95', 'opacity-0');
      setTimeout(() => modal.remove(), 150);
    };

    modal.querySelector('#btn-fechar-excluir-metas').addEventListener('click', fechar);
    modal.querySelector('#btn-cancelar-excluir-metas').addEventListener('click', fechar);
    modal.addEventListener('click', (e) => { if (e.target === modal) fechar(); });

    btnIrTudo.addEventListener('click', () => {
      etapa1.classList.add('hidden');
      etapa2.classList.remove('hidden');
    });
    btnVoltar.addEventListener('click', () => {
      etapa2.classList.add('hidden');
      etapa1.classList.remove('hidden');
    });

    const atualizarResumo = () => {
      const total = selecionadas.size;
      lblResumo.textContent = total === 1 ? '1 selecionada' : `${total} selecionadas`;
      btnSel.disabled = total === 0;
      btnSel.innerHTML = total > 0
        ? `<span>Excluir Selecionadas (${total})</span>`
        : '<span>Excluir Selecionadas</span>';
      chkTodas.disabled = listaMetas.length === 0;
      chkTodas.checked = listaMetas.length > 0 && listaMetas.every(m => selecionadas.has(String(m.id)));
    };

    const renderLista = () => {
      if (listaMetas.length === 0) {
        listaEl.innerHTML = '<div class="py-8 text-center text-xs text-slate-400 bg-slate-50/80 rounded-xl border border-dashed border-slate-200">Nenhuma meta cadastrada.</div>';
        atualizarResumo();
        return;
      }
      listaEl.innerHTML = listaMetas.map(m => {
        const idStr = String(m.id);
        const marcado = selecionadas.has(idStr) ? 'checked' : '';
        const titulo = (m.titulo || 'Meta').replace(/</g, '&lt;');
        const tipo = m.tipo || m.categoria || 'pessoal';
        const pct = Number(m.progresso || 0);
        return `
          <label class="flex items-center gap-3 p-3 rounded-xl border border-[#1f2a27]/10 bg-white hover:border-rose-300 cursor-pointer transition select-none">
            <input type="checkbox" class="chk-item-meta-excluir w-4 h-4 rounded accent-rose-600 cursor-pointer shrink-0" data-id="${idStr}" ${marcado} />
            <div class="min-w-0 flex-1">
              <p class="text-xs font-semibold text-[#1f2a27] truncate">${titulo}</p>
              <p class="text-[10px] text-[#5d5c54] mt-0.5 capitalize">${tipo} • ${pct}% concluída</p>
            </div>
          </label>
        `;
      }).join('');

      listaEl.querySelectorAll('.chk-item-meta-excluir').forEach(chk => {
        chk.addEventListener('change', () => {
          const idStr = chk.getAttribute('data-id');
          if (chk.checked) selecionadas.add(idStr);
          else selecionadas.delete(idStr);
          atualizarResumo();
        });
      });
      atualizarResumo();
    };

    chkTodas.addEventListener('change', () => {
      if (chkTodas.checked) listaMetas.forEach(m => selecionadas.add(String(m.id)));
      else selecionadas.clear();
      renderLista();
    });

    const executarExclusao = async (payload, botaoAlvo, textoOriginal, msgSucesso) => {
      botaoAlvo.disabled = true;
      botaoAlvo.innerHTML = '<svg class="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg><span>Excluindo...</span>';
      try {
        await salvarRotina('/api/metas/limpar-selecao', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (typeof carregarMetas === 'function') await carregarMetas();
        if (typeof carregarDashboardGeral === 'function') carregarDashboardGeral();
        fechar();

        const toast = document.createElement('div');
        toast.className = 'fixed bottom-5 right-5 z-[10001] bg-[#1f2a27] text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-xl border border-emerald-500/30 flex items-center gap-2 transition-all duration-300';
        toast.innerHTML = `<span class="text-emerald-400">✓</span><span>${msgSucesso}</span>`;
        document.body.appendChild(toast);
        setTimeout(() => {
          toast.style.opacity = '0';
          toast.style.transform = 'translateY(8px)';
          setTimeout(() => toast.remove(), 300);
        }, 2800);
      } catch (e) {
        avisarFalhaRotina(e);
        botaoAlvo.disabled = false;
        botaoAlvo.innerHTML = textoOriginal;
      }
    };

    btnSel.addEventListener('click', () => {
      executarExclusao(
        { ids: Array.from(selecionadas) },
        btnSel,
        '<span>Excluir Selecionadas</span>',
        'Metas selecionadas excluídas com sucesso!'
      );
    });

    btnConfTudo.addEventListener('click', () => {
      executarExclusao(
        { todas: true },
        btnConfTudo,
        '<span>Sim, apagar todas</span>',
        'Todas as metas foram excluídas!'
      );
    });

    try {
      const r = await fetchRotinaAuth('/api/metas').then(res => res.json());
      listaMetas = Array.isArray(r.data) ? r.data : [];
      renderLista();
    } catch (e) {
      listaEl.innerHTML = '<div class="py-6 text-center text-xs text-rose-600">Não foi possível carregar as metas.</div>';
    }
  };

  // Modal Interativo de Exclusão Seletiva por Item dentro de cada aba (Foco de Hoje / Agenda / Histórico / Apagar Tudo)
  window.abrirModalExcluirRotina = async function abrirModalExcluirRotina() {
    let modal = document.getElementById('modal-excluir-rotina-seletivo');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'modal-excluir-rotina-seletivo';
    modal.className = 'fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-sm';
    modal.innerHTML = `
      <div id="card-excluir-rotina" class="bg-[#fffdf8] border border-[#1f2a27]/12 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden transform transition-all duration-200 scale-95 opacity-0">
        <!-- ETAPA 1: ABAS + SELEÇÃO INDIVIDUAL -->
        <div id="etapa-excluir-selecao" class="p-5 sm:p-6 space-y-4">
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200/80 flex items-center justify-center text-rose-600 shrink-0">
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h3 class="text-base font-bold text-[#1f2a27] leading-tight">Excluir dados da Rotina</h3>
                <p class="text-[11px] text-[#5d5c54] mt-0.5">Escolha exatamente os itens que deseja apagar em cada aba.</p>
              </div>
            </div>
            <button type="button" id="btn-fechar-excluir-rotina" class="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer">✕</button>
          </div>

          <!-- Abas internas -->
          <div class="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[#f1ede3] border border-[#1f2a27]/10">
            <button type="button" class="tab-excluir-rotina py-2 px-2 rounded-lg text-[11px] font-bold transition cursor-pointer bg-white text-[#1f2a27] shadow-2xs" data-aba="foco">
              ☀️ Foco <span id="cnt-aba-foco" class="opacity-60">(0)</span>
            </button>
            <button type="button" class="tab-excluir-rotina py-2 px-2 rounded-lg text-[11px] font-semibold transition cursor-pointer text-[#5d5c54] hover:text-[#1f2a27]" data-aba="agenda">
              📅 Agenda <span id="cnt-aba-agenda" class="opacity-60">(0)</span>
            </button>
            <button type="button" class="tab-excluir-rotina py-2 px-2 rounded-lg text-[11px] font-semibold transition cursor-pointer text-[#5d5c54] hover:text-[#1f2a27]" data-aba="historico">
              🕘 Histórico <span id="cnt-aba-historico" class="opacity-60">(0)</span>
            </button>
          </div>

          <!-- Barra Selecionar todos da aba -->
          <div class="flex items-center justify-between px-1">
            <label class="flex items-center gap-2 text-xs font-semibold text-[#5d5c54] cursor-pointer select-none">
              <input type="checkbox" id="chk-selecionar-todos-aba" class="w-4 h-4 rounded accent-rose-600 cursor-pointer" />
              <span>Selecionar todos desta aba</span>
            </label>
            <span id="lbl-resumo-selecionados" class="text-[11px] font-semibold text-rose-700">0 selecionados</span>
          </div>

          <!-- Lista rolável de itens da aba ativa -->
          <div id="lista-itens-excluir" class="max-h-60 overflow-y-auto space-y-2 pr-1">
            <div class="py-8 text-center text-xs text-slate-400">Carregando itens...</div>
          </div>

          <div class="space-y-2.5 pt-2 border-t border-[#1f2a27]/10">
            <button type="button" id="btn-executar-excluir-selecionados" disabled class="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer flex items-center justify-center gap-2">
              <span>Excluir Selecionados</span>
            </button>

            <div class="flex items-center gap-2">
              <button type="button" id="btn-ir-apagar-tudo" class="flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition cursor-pointer">
                ⚠️ Apagar Tudo
              </button>
              <button type="button" id="btn-cancelar-excluir-rotina" class="py-2.5 px-4 rounded-xl text-xs font-semibold text-[#5d5c54] bg-[#f1ede3] hover:bg-[#e5dfd0] border border-[#1f2a27]/10 transition cursor-pointer">
                Cancelar
              </button>
            </div>
          </div>
        </div>

        <!-- ETAPA 2: CONFIRMAÇÃO EXTRA PARA APAGAR TUDO -->
        <div id="etapa-confirmar-apagar-tudo" class="hidden p-6 text-center space-y-5">
          <div class="w-14 h-14 mx-auto rounded-2xl bg-rose-100 border border-rose-300 flex items-center justify-center text-rose-700 text-2xl">
            ⚠️
          </div>
          <div class="space-y-2">
            <h3 class="text-base font-bold text-rose-900">Tem certeza que deseja apagar TUDO?</h3>
            <p class="text-xs text-[#5d5c54] leading-relaxed">
              Você está prestes a excluir permanentemente todo o seu <strong>Foco de Hoje</strong>, sua <strong>Agenda</strong> e seu <strong>Histórico de Tarefas</strong>. Esta ação não pode ser desfeita.
            </p>
          </div>
          <div class="grid grid-cols-2 gap-2.5 pt-1">
            <button type="button" id="btn-voltar-etapa-selecao" class="py-2.5 px-4 rounded-xl text-xs font-semibold text-[#5d5c54] bg-[#f1ede3] hover:bg-[#e5dfd0] border border-[#1f2a27]/10 transition cursor-pointer">
              ← Voltar
            </button>
            <button type="button" id="btn-confirmar-apagar-tudo" class="py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-700 hover:to-rose-800 shadow-md shadow-rose-600/25 transition cursor-pointer flex items-center justify-center gap-1.5">
              <span>Sim, apagar tudo</span>
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const card = modal.querySelector('#card-excluir-rotina');
    requestAnimationFrame(() => card.classList.remove('scale-95', 'opacity-0'));

    const etapa1 = modal.querySelector('#etapa-excluir-selecao');
    const etapa2 = modal.querySelector('#etapa-confirmar-apagar-tudo');
    const listaEl = modal.querySelector('#lista-itens-excluir');
    const chkTodosAba = modal.querySelector('#chk-selecionar-todos-aba');
    const lblResumo = modal.querySelector('#lbl-resumo-selecionados');
    const btnSelecionados = modal.querySelector('#btn-executar-excluir-selecionados');
    const btnIrApagarTudo = modal.querySelector('#btn-ir-apagar-tudo');
    const btnVoltar = modal.querySelector('#btn-voltar-etapa-selecao');
    const btnConfirmarTudo = modal.querySelector('#btn-confirmar-apagar-tudo');

    const dadosModal = { foco: [], agenda: [], historico: [] };
    const selecionados = { foco: new Set(), agenda: new Set(), historico: new Set() };
    let abaAtiva = 'foco';

    const fechar = () => {
      card.classList.add('scale-95', 'opacity-0');
      setTimeout(() => modal.remove(), 150);
    };

    modal.querySelector('#btn-fechar-excluir-rotina').addEventListener('click', fechar);
    modal.querySelector('#btn-cancelar-excluir-rotina').addEventListener('click', fechar);
    modal.addEventListener('click', (e) => { if (e.target === modal) fechar(); });

    btnIrApagarTudo.addEventListener('click', () => {
      etapa1.classList.add('hidden');
      etapa2.classList.remove('hidden');
    });
    btnVoltar.addEventListener('click', () => {
      etapa2.classList.add('hidden');
      etapa1.classList.remove('hidden');
    });

    const atualizarResumo = () => {
      const total = selecionados.foco.size + selecionados.agenda.size + selecionados.historico.size;
      lblResumo.textContent = total === 1 ? '1 selecionado' : `${total} selecionados`;
      btnSelecionados.disabled = total === 0;
      btnSelecionados.innerHTML = total > 0
        ? `<span>Excluir Selecionados (${total})</span>`
        : '<span>Excluir Selecionados</span>';

      const itensAba = dadosModal[abaAtiva] || [];
      chkTodosAba.disabled = itensAba.length === 0;
      chkTodosAba.checked = itensAba.length > 0 && itensAba.every(it => selecionados[abaAtiva].has(String(it.id)));
    };

    const renderListaAba = () => {
      const itens = dadosModal[abaAtiva] || [];
      if (itens.length === 0) {
        listaEl.innerHTML = '<div class="py-8 text-center text-xs text-slate-400 bg-slate-50/80 rounded-xl border border-dashed border-slate-200">Nenhum item cadastrado nesta aba.</div>';
        atualizarResumo();
        return;
      }

      listaEl.innerHTML = itens.map(item => {
        const idStr = String(item.id);
        const marcado = selecionados[abaAtiva].has(idStr) ? 'checked' : '';
        const titulo = (item.titulo || 'Sem título').replace(/</g, '&lt;');
        let sub = '';
        if (abaAtiva === 'foco') {
          sub = item.concluida ? 'Concluída' : (item.eh_top3 ? 'Prioridade Top 3' : 'Caixa de Entrada');
        } else if (abaAtiva === 'agenda') {
          sub = `${item.data || ''} ${item.horario ? 'às ' + item.horario : ''}`.trim();
        } else {
          sub = item.concluida_em ? `Concluída em ${String(item.concluida_em).slice(0, 10)}` : 'No histórico';
        }
        return `
          <label class="flex items-center gap-3 p-3 rounded-xl border border-[#1f2a27]/10 bg-white hover:border-rose-300 cursor-pointer transition select-none">
            <input type="checkbox" class="chk-item-excluir w-4 h-4 rounded accent-rose-600 cursor-pointer shrink-0" data-id="${idStr}" ${marcado} />
            <div class="min-w-0 flex-1">
              <p class="text-xs font-semibold text-[#1f2a27] truncate">${titulo}</p>
              ${sub ? `<p class="text-[10px] text-[#5d5c54] truncate mt-0.5">${sub}</p>` : ''}
            </div>
          </label>
        `;
      }).join('');

      listaEl.querySelectorAll('.chk-item-excluir').forEach(chk => {
        chk.addEventListener('change', () => {
          const idStr = chk.getAttribute('data-id');
          if (chk.checked) selecionados[abaAtiva].add(idStr);
          else selecionados[abaAtiva].delete(idStr);
          atualizarResumo();
        });
      });

      atualizarResumo();
    };

    chkTodosAba.addEventListener('change', () => {
      const itens = dadosModal[abaAtiva] || [];
      if (chkTodosAba.checked) {
        itens.forEach(it => selecionados[abaAtiva].add(String(it.id)));
      } else {
        selecionados[abaAtiva].clear();
      }
      renderListaAba();
    });

    modal.querySelectorAll('.tab-excluir-rotina').forEach(tabBtn => {
      tabBtn.addEventListener('click', () => {
        abaAtiva = tabBtn.getAttribute('data-aba');
        modal.querySelectorAll('.tab-excluir-rotina').forEach(b => {
          b.className = 'tab-excluir-rotina py-2 px-2 rounded-lg text-[11px] font-semibold transition cursor-pointer text-[#5d5c54] hover:text-[#1f2a27]';
        });
        tabBtn.className = 'tab-excluir-rotina py-2 px-2 rounded-lg text-[11px] font-bold transition cursor-pointer bg-white text-[#1f2a27] shadow-2xs';
        renderListaAba();
      });
    });

    const executarExclusao = async (payload, botaoAlvo, textoOriginal, msgSucesso) => {
      botaoAlvo.disabled = true;
      botaoAlvo.innerHTML = '<svg class="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg><span>Excluindo...</span>';
      try {
        await salvarRotina('/api/rotina/limpar-selecao', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (typeof carregarPrioridades === 'function') await carregarPrioridades();
        if (typeof carregarCompromissos === 'function') await carregarCompromissos();
        if (typeof carregarAgendaHoje === 'function') await carregarAgendaHoje();
        if (typeof carregarHistoricoTarefas === 'function') await carregarHistoricoTarefas();
        fechar();

        const toast = document.createElement('div');
        toast.className = 'fixed bottom-5 right-5 z-[10001] bg-[#1f2a27] text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-xl border border-emerald-500/30 flex items-center gap-2 transition-all duration-300';
        toast.innerHTML = `<span class="text-emerald-400">✓</span><span>${msgSucesso}</span>`;
        document.body.appendChild(toast);
        setTimeout(() => {
          toast.style.opacity = '0';
          toast.style.transform = 'translateY(8px)';
          setTimeout(() => toast.remove(), 300);
        }, 2800);
      } catch (e) {
        avisarFalhaRotina(e);
        botaoAlvo.disabled = false;
        botaoAlvo.innerHTML = textoOriginal;
      }
    };

    btnSelecionados.addEventListener('click', () => {
      executarExclusao(
        {
          focoIds: Array.from(selecionados.foco),
          agendaIds: Array.from(selecionados.agenda),
          historicoIds: Array.from(selecionados.historico)
        },
        btnSelecionados,
        '<span>Excluir Selecionados</span>',
        'Itens selecionados excluídos com sucesso!'
      );
    });

    btnConfirmarTudo.addEventListener('click', () => {
      executarExclusao(
        { foco: true, agenda: true, historico: true },
        btnConfirmarTudo,
        '<span>Sim, apagar tudo</span>',
        'Foco de Hoje, Agenda e Histórico apagados com sucesso!'
      );
    });

    // Carrega os itens reais das 3 abas em paralelo
    try {
      const [rFoco, rAgenda, rHist] = await Promise.all([
        fetchRotinaAuth('/api/rotina/prioridades').then(r => r.json()).catch(() => ({ data: [] })),
        fetchRotinaAuth('/api/agenda/compromissos').then(r => r.json()).catch(() => ({ data: [] })),
        fetchRotinaAuth('/api/rotina/historico-tarefas').then(r => r.json()).catch(() => ({ data: [] }))
      ]);
      dadosModal.foco = Array.isArray(rFoco.data) ? rFoco.data : [];
      dadosModal.agenda = Array.isArray(rAgenda.data) ? rAgenda.data : [];
      dadosModal.historico = Array.isArray(rHist.data) ? rHist.data : [];

      modal.querySelector('#cnt-aba-foco').textContent = `(${dadosModal.foco.length})`;
      modal.querySelector('#cnt-aba-agenda').textContent = `(${dadosModal.agenda.length})`;
      modal.querySelector('#cnt-aba-historico').textContent = `(${dadosModal.historico.length})`;
      renderListaAba();
    } catch (e) {
      listaEl.innerHTML = '<div class="py-6 text-center text-xs text-rose-600">Não foi possível carregar os itens.</div>';
    }
  };

  // Inicializa Pomodoro
  const btnPomStart = document.getElementById('btn-pomodoro-start');
  const btnPomReset = document.getElementById('btn-pomodoro-reset');
  if (btnPomStart) btnPomStart.addEventListener('click', alternarPomodoro);
  if (btnPomReset) btnPomReset.addEventListener('click', resetarPomodoro);

  const abasRotina = ['hoje', 'checklist', 'agenda'];
  const estiloAtivo = document.getElementById('btn-subaba-hoje').className;
  const estiloInativo = document.getElementById('btn-subaba-agenda').className;
  function selecionarAbaRotina(aba) {
    for (const nome of abasRotina) {
      const ativa = nome === aba;
      const botao = document.getElementById('btn-subaba-' + nome);
      botao.className = ativa ? estiloAtivo : estiloInativo;
      botao.setAttribute('aria-pressed', String(ativa));
      document.getElementById('subview-rotina-' + nome).classList.toggle('hidden', !ativa);
      const lateral = document.querySelector('[data-rotina-action="' + nome + '"]');
      lateral.classList.toggle('bg-slate-800', ativa);
      lateral.classList.toggle('text-white', ativa);
      lateral.classList.toggle('font-semibold', ativa);
      lateral.classList.toggle('text-slate-300', !ativa);
    }
    if (aba === 'agenda') renderizarAgendaAtiva();
  }
  for (const nome of abasRotina) {
    document.getElementById('btn-subaba-' + nome).addEventListener('click', () => selecionarAbaRotina(nome));
  }
  selecionarAbaRotina('hoje');

  // Formulário de Nova Tarefa do Checklist do Dia
  const formQuickTask = document.getElementById('form-quick-task');
  const inputQuickDate = document.getElementById('input-quick-task-date');
  const inputQuickTime = document.getElementById('input-quick-task-time');
  const seletorDia = document.getElementById('checklist-dia');
  const feedback = document.getElementById('checklist-feedback');
  const hoje = () => dataLocalRotina(new Date());
  function selecionarDia(data) {
    seletorDia.value = data;
    inputQuickDate.value = data;
    feedback.textContent = '';
    renderizarPrioridades();
  }
  if (formQuickTask) {
    selecionarDia(hoje());
    seletorDia.addEventListener('change', () => selecionarDia(seletorDia.value || hoje()));
    document.getElementById('checklist-dia-hoje').addEventListener('click', () => selecionarDia(hoje()));
    for (const [id, dias] of [['checklist-dia-anterior', -1], ['checklist-dia-proximo', 1]]) {
      document.getElementById(id).addEventListener('click', () => {
        const data = new Date(`${seletorDia.value || hoje()}T12:00:00`);
        data.setDate(data.getDate() + dias);
        selecionarDia(dataLocalRotina(data));
      });
    }
    const campoTexto = document.getElementById('input-quick-task-text');
    campoTexto.addEventListener('invalid', e => {
      e.preventDefault();
      feedback.textContent = 'Digite o nome da tarefa.';
      campoTexto.focus();
    });
    formQuickTask.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('input-quick-task-text');
      const texto = input.value.trim();
      if (!texto) {
        feedback.textContent = 'Digite o nome da tarefa.';
        input.focus();
        return;
      }
      const dataProg = (inputQuickDate && inputQuickDate.value) ? inputQuickDate.value : dataLocalRotina(new Date());
      const horarioProg = (inputQuickTime && inputQuickTime.value) ? inputQuickTime.value : null;
      const botao = formQuickTask.querySelector('[type=submit]');
      if (botao.disabled) return;
      botao.disabled = true;
      feedback.textContent = 'Salvando…';

      try {
        await salvarRotina('/api/rotina/prioridades', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texto, top3: false, data: dataProg, horario: horarioProg })
        });
        input.value = '';
        if (inputQuickTime) inputQuickTime.value = '';
        selecionarDia(dataProg);
        await carregarPrioridades();
        feedback.textContent = 'Tarefa adicionada.';
        input.focus();
      } catch (err) {
        feedback.textContent = err.message || 'Não foi possível adicionar a tarefa.';
      } finally {
        botao.disabled = false;
      }
    });
  }

  // Modal Novo / Editar Hábito
  const btnNovoHabito = document.getElementById('btn-novo-habito');
  const modalHabito = document.getElementById('modal-habito');
  const formNovoHabito = document.getElementById('form-novo-habito');

  if (btnNovoHabito && modalHabito) {
    btnNovoHabito.addEventListener('click', () => {
      abrirModalEditarHabito(null);
    });
  }

  if (formNovoHabito) {
    formNovoHabito.addEventListener('submit', async (e) => {
      e.preventDefault();
      const idEdit = document.getElementById('input-habito-id')?.value?.trim() || '';
      const nome = document.getElementById('input-habito-nome').value.trim();
      const icone = document.getElementById('input-habito-icone').value.trim() || '⚡';
      const periodo = document.getElementById('select-habito-periodo')?.value || 'manha';
      const duracao_min = parseInt(document.getElementById('input-habito-duracao')?.value || '15', 10) || 15;
      const horario_ideal = document.getElementById('input-habito-ideal')?.value?.trim() || '';
      const horario_limite = document.getElementById('input-habito-limite')?.value?.trim() || '';
      if (!nome) return;
      const botao = formNovoHabito.querySelector('[type=submit]');
      if (botao.disabled) return;
      botao.disabled = true;

      try {
        const url = idEdit ? `/api/rotina/habitos/${idEdit}` : '/api/rotina/habitos';
        const method = idEdit ? 'PATCH' : 'POST';
        await salvarRotina(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nome, icone, periodo, duracao_min, horario_ideal, horario_limite })
        });
        abrirModalEditarHabito(null);
        modalHabito.classList.add('hidden');
        modalHabito.classList.remove('flex');
        await carregarHabitos();
      } catch (err) {
        avisarFalhaRotina(err);
      } finally {
        botao.disabled = false;
      }
    });
  }

  // Modal Novo Compromisso
  const btnNovoComp = document.getElementById('btn-novo-compromisso');
  const modalComp = document.getElementById('modal-compromisso');
  const formNovoComp = document.getElementById('form-novo-compromisso');
  const dataAgenda = document.getElementById('data-navegacao-agenda');
  dataAgenda.value = dataLocalRotina(new Date());
  dataAgenda.addEventListener('change', renderizarAgendaAtiva);

  if (btnNovoComp && modalComp) {
    btnNovoComp.addEventListener('click', () => {
      abrirNovoCompromisso(dataAgenda.value || dataLocalRotina(new Date()));
    });
  }

  if (formNovoComp) {
    formNovoComp.addEventListener('submit', async (e) => {
      e.preventDefault();
      const titulo = document.getElementById('input-comp-titulo').value.trim();
      const data = document.getElementById('input-comp-data').value;
      const horario = document.getElementById('input-comp-horario').value;
      const categoria = document.getElementById('select-comp-categoria').value;

      const status = document.getElementById('status-novo-compromisso');
      if (!titulo || !data || !horario) {
        status.textContent = 'Preencha o título, a data e o horário.';
        return;
      }
      const botaoSalvar = formNovoComp.querySelector('[type=submit]');
      if (botaoSalvar.disabled) return;
      botaoSalvar.disabled = true;
      status.textContent = '';

      try {
        const json = await salvarRotina('/api/agenda/compromissos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ titulo, data, horario, categoria })
        });
        rotinaState.compromissos.push(json.data);
        dataAgenda.value = json.data.data;
        const filtro = { pessoal: 'pessoal', financas: 'financas', estudos: 'estudos' }[categoria];
        if (filtro) document.getElementById(`chk-filtro-${filtro}`).checked = true;
        formNovoComp.reset();
        modalComp.classList.add('hidden');
        modalComp.classList.remove('flex');
        document.getElementById('status-agenda').textContent =
          `Compromisso salvo para ${new Date(`${json.data.data}T12:00:00`).toLocaleDateString('pt-BR')} às ${json.data.horario}.`;
        renderizarAgendaAtiva();
        await Promise.all([carregarCompromissos(), carregarAgendaHoje()]);
      } catch (err) {
        status.textContent = err.message || 'Não foi possível conectar ao serviço.';
      } finally {
        botaoSalvar.disabled = false;
      }
    });
  }

  // Alternância de visão da Agenda: Semana vs Mês
  const btnViewSemana = document.getElementById('btn-agenda-view-semana');
  const btnViewMes = document.getElementById('btn-agenda-view-mes');
  const gridSemanal = document.getElementById('grid-agenda-semanal');
  const gridMensal = document.getElementById('grid-agenda-mensal');

  if (btnViewSemana && btnViewMes) {
    btnViewSemana.addEventListener('click', () => {
      rotinaState.agendaVisualizacao = 'semana';
      btnViewSemana.className = 'px-3 py-1 rounded-md bg-white text-slate-900 shadow-2xs cursor-pointer font-semibold';
      btnViewMes.className = 'px-3 py-1 rounded-md text-slate-500 hover:text-slate-800 transition cursor-pointer font-medium';
      if (gridSemanal) gridSemanal.classList.remove('hidden');
      if (gridMensal) gridMensal.classList.add('hidden');
      renderizarAgendaSemanal();
    });

    btnViewMes.addEventListener('click', () => {
      rotinaState.agendaVisualizacao = 'mes';
      btnViewMes.className = 'px-3 py-1 rounded-md bg-white text-slate-900 shadow-2xs cursor-pointer font-semibold';
      btnViewSemana.className = 'px-3 py-1 rounded-md text-slate-500 hover:text-slate-800 transition cursor-pointer font-medium';
      if (gridSemanal) gridSemanal.classList.add('hidden');
      if (gridMensal) gridMensal.classList.remove('hidden');
      renderizarAgendaMensal();
    });
  }

  // Filtros de Categoria da Agenda
  ['chk-filtro-pessoal', 'chk-filtro-financas', 'chk-filtro-estudos'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', () => {
        if (rotinaState.agendaVisualizacao === 'mes') {
          renderizarAgendaMensal();
        } else {
          renderizarAgendaSemanal();
        }
      });
    }
  });

  // Modal Nova Meta
  const btnNovaMeta = document.getElementById('btn-nova-meta');
  const modalMeta = document.getElementById('modal-meta');
  const formNovaMeta = document.getElementById('form-nova-meta');
  const selectMetaTipo = document.getElementById('select-meta-tipo');
  const selectMetaPilar = document.getElementById('select-meta-pilar');
  const campoMetaValores = document.getElementById('campo-meta-valores');
  const campoMetaNumerica = document.getElementById('campo-meta-numerica');
  const campoMetaHabito = document.getElementById('campo-meta-habito');
  const campoMetaChecklist = document.getElementById('campo-meta-checklist');
  const selectMetaProjeto = document.getElementById('select-meta-projeto');
  const selectMetaHabito = document.getElementById('select-meta-habito');
  const statusMeta = document.getElementById('status-meta-form');
  const valoresMeta = [document.getElementById('input-meta-valor-atual'), document.getElementById('input-meta-valor-alvo')];
  selectMetaProjeto.addEventListener('change', () => {
    valoresMeta.forEach(campo => { campo.disabled = Boolean(selectMetaProjeto.value); });
  });

  function preencherHabitosVinculaveis() {
    if (!selectMetaHabito) return;
    selectMetaHabito.replaceChildren(new Option('Selecione um hábito...', ''));
    const lista = Array.isArray(rotinaState.habitos) ? rotinaState.habitos : [];
    for (const h of lista) {
      selectMetaHabito.add(new Option(`${h.icone || '⚡'} ${h.nome}`, h.id));
    }
  }

  async function carregarProjetosVinculaveis() {
    selectMetaProjeto.replaceChildren(new Option('Meta independente', ''));
    selectMetaProjeto.dispatchEvent(new Event('change'));
    statusMeta.textContent = '';
    try {
      const resposta = await fetchRotinaAuth('/api/projetos');
      if (!resposta.ok) throw new Error('Falha ao consultar projetos.');
      const { projetos } = await resposta.json();
      for (const projeto of projetos || []) selectMetaProjeto.add(new Option(projeto.nome, projeto.id));
    } catch {
      statusMeta.textContent = 'Não foi possível carregar os projetos. Você pode criar uma meta independente.';
    }
  }

  if (selectMetaTipo) {
    selectMetaTipo.addEventListener('change', () => {
      const tipo = selectMetaTipo.value;
      campoMetaValores?.classList.toggle('hidden', tipo !== 'financeira');
      campoMetaNumerica?.classList.toggle('hidden', tipo !== 'numerica');
      campoMetaHabito?.classList.toggle('hidden', tipo !== 'habito');
      campoMetaChecklist?.classList.toggle('hidden', tipo !== 'pessoal');
      if (selectMetaPilar) {
        selectMetaPilar.value = tipo === 'financeira' ? 'financeiro' : (tipo === 'estudos' ? 'carreira' : (tipo === 'habito' ? 'saude' : 'pessoal'));
      }
      if (tipo === 'financeira') carregarProjetosVinculaveis();
      if (tipo === 'habito') preencherHabitosVinculaveis();
    });
  }

  if (btnNovaMeta && modalMeta) {
    btnNovaMeta.addEventListener('click', () => {
      // Limpa os campos para um novo cadastro limpo
      if (formNovaMeta) formNovaMeta.reset();
      statusMeta.textContent = '';
      selectMetaProjeto.dispatchEvent(new Event('change'));
      if (selectMetaTipo) selectMetaTipo.value = 'pessoal';
      if (selectMetaPilar) selectMetaPilar.value = 'pessoal';
      const selCiclo = document.getElementById('select-meta-ciclo');
      if (selCiclo) selCiclo.value = `Q${Math.floor(new Date().getMonth() / 3) + 1}`;
      campoMetaValores?.classList.add('hidden');
      campoMetaNumerica?.classList.add('hidden');
      campoMetaHabito?.classList.add('hidden');
      campoMetaChecklist?.classList.remove('hidden');
      modalMeta.classList.remove('hidden');
      modalMeta.classList.add('flex');
    });
  }

  if (formNovaMeta) {
    formNovaMeta.addEventListener('submit', async (e) => {
      e.preventDefault();
      const titulo = document.getElementById('input-meta-titulo').value.trim();
      const tipo = document.getElementById('select-meta-tipo').value;
      const pilar = selectMetaPilar?.value || 'pessoal';
      const ciclo = document.getElementById('select-meta-ciclo')?.value || 'Q1';
      const proxima_acao = document.getElementById('input-meta-proxima-acao')?.value?.trim() || '';
      const proposito = document.getElementById('input-meta-proposito')?.value?.trim() || '';
      const woop_obstaculo = document.getElementById('input-meta-woop-obstaculo')?.value?.trim() || '';
      const woop_plano = document.getElementById('input-meta-woop-plano')?.value?.trim() || '';
      const valor_atual = tipo === 'numerica'
        ? Number(document.getElementById('input-meta-num-atual')?.value || 0)
        : Number(document.getElementById('input-meta-valor-atual')?.value || 0);
      const valor_alvo = tipo === 'numerica'
        ? Number(document.getElementById('input-meta-num-alvo')?.value || 100)
        : (tipo === 'habito'
          ? Number(document.getElementById('input-meta-habito-alvo')?.value || 30)
          : Number(document.getElementById('input-meta-valor-alvo')?.value || 100));
      const unidade = document.getElementById('input-meta-unidade')?.value?.trim() || 'un';
      const habito_id = tipo === 'habito' ? (selectMetaHabito?.value || '') : '';
      const prazo = document.getElementById('input-meta-prazo')?.value || '';
      const rawChecklist = document.getElementById('textarea-meta-checklist')?.value || '';

      const checklist = rawChecklist.split(/[\n,]/).map(s => s.trim()).filter(Boolean).map(linha => {
        const partes = linha.split('|');
        const texto = partes[0].trim();
        const pesoNum = partes[1] ? parseInt(partes[1].trim(), 10) : 0;
        return Number.isFinite(pesoNum) && pesoNum > 0
          ? { texto, peso: pesoNum, concluido: false }
          : { texto, concluido: false };
      }).filter(s => s.texto);

      try {
        await salvarRotina('/api/metas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ titulo, tipo, pilar, ciclo, proxima_acao, proposito, woop_obstaculo, woop_plano, valor_atual, valor_alvo, unidade, habito_id, prazo, checklist, projeto_id: tipo === 'financeira' ? selectMetaProjeto.value : '' })
        });
        document.getElementById('input-meta-titulo').value = '';
        modalMeta.classList.add('hidden');
        modalMeta.classList.remove('flex');
        await carregarMetas();
      } catch (err) {
        statusMeta.textContent = err.message;
      }
    });
  }

  const selectFiltroCicloMeta = document.getElementById('select-filtro-ciclo-meta');
  if (selectFiltroCicloMeta) {
    selectFiltroCicloMeta.addEventListener('change', renderizarMetas);
  }

  // Modal Linha do Tempo & WOOP da Meta
  const modalMetaHist = document.getElementById('modal-meta-historico');
  document.getElementById('btn-meta-hist-fechar')?.addEventListener('click', () => {
    modalMetaHist?.classList.add('hidden');
    modalMetaHist?.classList.remove('flex');
  });
  document.getElementById('form-meta-hist-nota')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = Number(document.getElementById('input-meta-hist-id')?.value || 0);
    const nota = document.getElementById('input-meta-hist-nota')?.value?.trim() || '';
    if (!id || !nota) return;
    try {
      const resp = await salvarRotina(`/api/metas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nota })
      });
      await carregarMetas();
      if (resp?.data) abrirModalHistoricoMeta(resp.data);
    } catch (err) {
      avisarFalhaRotina(err);
    }
  });

  // Botão "Usar Modelo"
  const btnMetasModelos = document.getElementById('btn-metas-modelos');
  if (btnMetasModelos) {
    btnMetasModelos.addEventListener('click', () => {
      // Abre o modal pré-preenchido com o primeiro modelo (Reserva de Emergência)
      if (typeof preencherModalPorModelo === 'function') {
        preencherModalPorModelo(0);
      }
    });
  }

  // Formulário de Aporte Rápido em Meta Financeira
  const formAporteMeta = document.getElementById('form-aporte-meta');
  const modalAporteMeta = document.getElementById('modal-aporte-meta');
  if (formAporteMeta) {
    formAporteMeta.addEventListener('submit', async (e) => {
      e.preventDefault();
      const metaId = document.getElementById('input-aporte-meta-id')?.value;
      const valor = parseFloat(document.getElementById('input-aporte-valor')?.value || '0');
      if (!metaId || valor <= 0 || !await realizarAporteMeta(metaId, valor)) return;
      if (modalAporteMeta) {
        modalAporteMeta.classList.add('hidden');
        modalAporteMeta.classList.remove('flex');
      }
    });
  }

  // Filtros de Tipo de Meta
  document.querySelectorAll('.btn-filtro-meta').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-filtro-meta').forEach(b => {
        b.className = 'btn-filtro-meta px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-white border border-transparent hover:border-slate-200 transition cursor-pointer';
      });
      btn.className = 'btn-filtro-meta px-3.5 py-1.5 rounded-lg text-xs font-bold bg-white text-slate-900 border border-slate-300 shadow-2xs cursor-pointer';

      rotinaState.filtroMetaAtual = btn.getAttribute('data-tipo');
      renderizarMetas();
    });
  });
});
