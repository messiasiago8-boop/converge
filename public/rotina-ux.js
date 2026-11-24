/**
 * rotina-ux.js - Camada de UI/UX (somente apresentação) para "Rotina & Agenda".
 * Estende as funções de renderização existentes SEM alterar a lógica de dados,
 * rotas ou estado. Se qualquer parte falhar, a tela original continua funcionando.
 */
(function () {
  'use strict';

  const rx = {
    prevDone: null,
    prevAllTop3: false,
    streakKey: '',
    lastDia: null,
    streak: 0,
    streakAtivoHoje: false
  };

  const $ = (id) => document.getElementById(id);
  const isDone = (p) => !!(p && (p.concluida || p.concluido));
  const reduzMovimento = () =>
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const chaveLocal = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  };

  const esc = (s) =>
    typeof escapeHTML === 'function'
      ? escapeHTML(String(s == null ? '' : s))
      : String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ------------------------------------------------------------------ //
  // 1. ANÉIS DE PROGRESSO + STREAK
  // ------------------------------------------------------------------ //
  const CIRC = 94.25; // 2 * PI * r(15)

  function setRing(ringId, txtId, fracao) {
    const ring = $(ringId);
    const txt = $(txtId);
    const f = Math.max(0, Math.min(1, fracao || 0));
    if (ring) {
      ring.style.strokeDashoffset = String(CIRC * (1 - f));
      ring.classList.toggle('rx-ring-full', f >= 1);
    }
    if (txt) txt.textContent = `${Math.round(f * 100)}%`;
  }

  function atualizarAneis() {
    if (typeof rotinaState === 'undefined') return;
    const prios = rotinaState.prioridades || [];
    const top3 = prios.filter((p) => p.top3);
    const quick = prios.filter((p) => !p.top3);
    const top3Feitas = top3.filter(isDone).length;
    const quickFeitas = quick.filter(isDone).length;

    setRing('ring-foco', 'ring-foco-txt', top3Feitas / 3);
    setRing('ring-pend', 'ring-pend-txt', quick.length ? quickFeitas / quick.length : 0);

    const lblPend = $('lbl-rotina-kpi-pendencias');
    if (lblPend) lblPend.textContent = `${quickFeitas} / ${quick.length} Feitas`;
  }

  function pintarStreak() {
    const el = $('kpi-streak-count');
    const chip = $('kpi-streak-chip');
    if (el) el.textContent = String(rx.streak);
    if (chip) {
      chip.classList.toggle('rx-streak-ativo', rx.streakAtivoHoje);
      chip.title = rx.streak > 0
        ? `${rx.streak} ${rx.streak === 1 ? 'dia seguido' : 'dias seguidos'} concluindo prioridades do Top 3`
        : 'Conclua uma prioridade do Top 3 hoje para iniciar sua ofensiva';
    }
  }

  async function atualizarStreak() {
    if (typeof fetchRotinaAuth !== 'function' || typeof rotinaState === 'undefined') return;
    try {
      const res = await fetchRotinaAuth('/api/rotina/historico-tarefas');
      const json = await res.json();
      const lista = json && json.success && Array.isArray(json.data) ? json.data : [];
      const dias = new Set();

      lista.forEach((h) => {
        const quando = h.concluida_em || h.excluida_em;
        if (h.top3 && h.status === 'concluida' && quando) dias.add(chaveLocal(new Date(quando)));
      });
      (rotinaState.prioridades || []).forEach((p) => {
        if (p.top3 && isDone(p)) dias.add(chaveLocal(new Date(p.concluida_em || Date.now())));
      });

      const hoje = new Date();
      const ativoHoje = dias.has(chaveLocal(hoje));
      const cursor = new Date(hoje);
      if (!ativoHoje) cursor.setDate(cursor.getDate() - 1); // hoje ainda não encerrou: não quebra a sequência

      let contagem = 0;
      while (dias.has(chaveLocal(cursor))) {
        contagem += 1;
        cursor.setDate(cursor.getDate() - 1);
      }

      rx.streak = contagem;
      rx.streakAtivoHoje = ativoHoje;
      pintarStreak();
    } catch (e) {
      console.warn('[rotina-ux] streak indisponível:', e);
    }
  }

  // ------------------------------------------------------------------ //
  // 2. ESTADOS VAZIOS COM CHIPS DE 1 CLIQUE
  // ------------------------------------------------------------------ //
  const SUGESTOES_TOP3 = ['Revisar e-mails', 'Treinar 30 min', 'Estudar 1 hora', 'Planejar a semana'];
  const SUGESTOES_QUICK = ['Pagar uma conta', 'Responder mensagens', 'Organizar a mesa', 'Ligar para alguém'];

  async function adicionarPrioridade(texto, top3) {
    if (!texto || !texto.trim()) return;
    try {
      await fetchRotinaAuth('/api/rotina/prioridades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: texto.trim(), top3: !!top3 })
      });
      await carregarPrioridades();
    } catch (e) {
      console.error('[rotina-ux] erro ao adicionar sugestão:', e);
    }
  }

  function montarVazio(container, { titulo, sugestoes, top3, comInput }) {
    const chips = sugestoes
      .map((s) => `<button type="button" class="rx-chip" data-texto="${esc(s)}">+ ${esc(s)}</button>`)
      .join('');
    const input = comInput
      ? `<form class="rx-empty-form flex gap-2 mt-3">
           <input type="text" maxlength="120" placeholder="Ou digite sua própria prioridade..." class="flex-1 min-w-0 text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-800" required />
           <button type="submit" class="px-3 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition shrink-0 cursor-pointer">Definir</button>
         </form>`
      : '';

    container.innerHTML = `
      <div class="rx-empty px-5 py-6 text-center rounded-lg border border-slate-200 bg-slate-50/60">
        <p class="text-xs font-semibold text-slate-700">${esc(titulo)}</p>
        <p class="text-[11px] text-slate-400 mt-0.5">Toque em uma sugestão para adicionar com 1 clique.</p>
        <div class="flex flex-wrap justify-center gap-1.5 mt-3">${chips}</div>
        ${input}
      </div>`;

    container.querySelectorAll('.rx-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        btn.disabled = true;
        adicionarPrioridade(btn.getAttribute('data-texto'), top3);
      });
    });
    const form = container.querySelector('.rx-empty-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const campo = form.querySelector('input');
        const valor = campo.value;
        campo.value = '';
        adicionarPrioridade(valor, top3);
      });
    }
  }

  // ------------------------------------------------------------------ //
  // 3. MICRO-INTERAÇÕES + CONFETTI
  // ------------------------------------------------------------------ //
  function confetti() {
    if (reduzMovimento()) return;
    const cores = ['#047857', '#10b981', '#f59e0b', '#64748b', '#a7f3d0'];
    const box = document.createElement('div');
    box.className = 'rx-confetti';
    for (let i = 0; i < 32; i++) {
      const p = document.createElement('i');
      p.style.left = `${Math.random() * 100}%`;
      p.style.background = cores[i % cores.length];
      p.style.setProperty('--dx', `${(Math.random() - 0.5) * 160}px`);
      p.style.setProperty('--rot', `${Math.random() * 540 - 270}deg`);
      p.style.animationDelay = `${Math.random() * 0.25}s`;
      p.style.animationDuration = `${1.1 + Math.random() * 0.8}s`;
      box.appendChild(p);
    }
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 2400);
  }

  function aprimorarPrioridades() {
    if (typeof rotinaState === 'undefined') return;
    const prios = rotinaState.prioridades || [];
    const top3 = prios.filter((p) => p.top3);
    const quick = prios.filter((p) => !p.top3);
    const cTop = $('container-top3-prioridades');
    const cQuick = $('container-quick-tasks');
    if (!cTop || !cQuick) return;

    // Estados vazios (substituem as caixas pontilhadas)
    if (top3.length === 0) {
      montarVazio(cTop, { titulo: 'Defina o foco de hoje', sugestoes: SUGESTOES_TOP3, top3: true, comInput: true });
    }
    if (quick.length === 0) {
      montarVazio(cQuick, { titulo: 'Caixa de entrada vazia', sugestoes: SUGESTOES_QUICK, top3: false, comInput: false });
    }

    // Identifica cada linha renderizada (mesma ordem usada pelo render original)
    Array.from(cTop.children).forEach((el, i) => {
      if (top3[i] && !el.classList.contains('rx-empty')) {
        el.dataset.prioId = top3[i].id;
        el.classList.add('rx-item');
      }
    });
    Array.from(cQuick.children).forEach((el, i) => {
      if (quick[i] && !el.classList.contains('rx-empty')) {
        el.dataset.prioId = quick[i].id;
        el.classList.add('rx-item');
      }
    });

    // Animação de check + confetti ao completar o Top 3
    const feitasAgora = new Set(prios.filter(isDone).map((p) => p.id));
    const todasTop3 = top3.length === 3 && top3.every(isDone);

    if (rx.prevDone) {
      feitasAgora.forEach((id) => {
        if (!rx.prevDone.has(id)) {
          const el = document.querySelector(`[data-prio-id="${id}"]`);
          if (el) el.classList.add('rx-pop');
        }
      });
      if (todasTop3 && !rx.prevAllTop3) confetti();
    }
    rx.prevAllTop3 = todasTop3;

    const chave = Array.from(feitasAgora).sort().join(',') + `|${prios.length}`;
    const mudou = chave !== rx.streakKey;
    rx.prevDone = feitasAgora;
    if (mudou) {
      rx.streakKey = chave;
      atualizarStreak();
    }
  }

  // ------------------------------------------------------------------ //
  // 4. LINHA DO TEMPO RICA + INDICADOR DE HORÁRIO ATUAL
  // ------------------------------------------------------------------ //
  const CATEGORIAS = {
    pessoal: { rotulo: 'Pessoal', tag: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500' },
    estudos: { rotulo: 'Estudos', tag: 'bg-purple-50 text-purple-700 border-purple-200', dot: 'bg-purple-500' },
    financas: { rotulo: 'Finanças', tag: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' }
  };

  const paraMinutos = (h) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(h || '').trim());
    return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
  };

  function aprimorarTimeline() {
    const container = $('container-agenda-hoje-timeline');
    if (!container || typeof rotinaState === 'undefined') return;
    const itens = (rotinaState.agendaHoje || []).slice();
    if (itens.length === 0) return; // mantém o estado vazio original

    const agora = new Date();
    const agoraMin = agora.getHours() * 60 + agora.getMinutes();
    const hhmm = `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`;

    const comHora = itens
      .map((it) => ({ it, min: paraMinutos(it.horario) }))
      .filter((x) => x.min !== null)
      .sort((a, b) => a.min - b.min);
    const diaTodo = itens.filter((it) => paraMinutos(it.horario) === null);

    const proximo = comHora.find((x) => x.min >= agoraMin);

    const linha = (it, min) => {
      const cat = CATEGORIAS[it.categoria] || CATEGORIAS.pessoal;
      const passado = min !== null && min < agoraMin;
      const ehProximo = proximo && proximo.it === it;
      const horaTxt = min !== null ? esc(it.horario) : 'Dia todo';
      return `
        <div class="rx-tl-row flex items-stretch gap-3 ${passado ? 'rx-tl-passado' : ''}">
          <div class="w-12 shrink-0 pt-3 text-right text-[11px] font-sans tabular-nums font-bold ${passado ? 'text-slate-400' : 'text-slate-700'}">${horaTxt}</div>
          <div class="flex flex-col items-center shrink-0">
            <span class="w-2.5 h-2.5 rounded-full mt-3.5 ${cat.dot} ${ehProximo ? 'rx-dot-pulse' : ''}"></span>
            <span class="flex-1 w-px bg-slate-200"></span>
          </div>
          <div class="flex-1 min-w-0 mb-2 p-3 rounded-lg border bg-white ${ehProximo ? 'border-emerald-300 shadow-xs' : 'border-slate-200'} rx-lift-sm">
            <div class="flex items-center justify-between gap-2">
              <p class="text-xs font-bold text-slate-900 truncate">${esc(it.titulo)}</p>
              <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded-md border shrink-0 ${cat.tag}">${cat.rotulo}</span>
            </div>
            <p class="text-[10px] text-slate-500 truncate mt-0.5">${esc(it.origem || 'Agenda')}${ehProximo ? ' · <span class="text-emerald-700 font-semibold">Próximo</span>' : ''}</p>
          </div>
        </div>`;
    };

    const marcadorAgora = `
      <div class="rx-now flex items-center gap-3" aria-label="Horário atual">
        <div class="w-12 shrink-0 text-right text-[10px] font-sans tabular-nums font-bold text-rose-600">${hhmm}</div>
        <span class="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0 ml-[1px]"></span>
        <div class="flex-1 flex items-center gap-2">
          <span class="text-[10px] font-bold uppercase tracking-wider text-rose-600">Agora</span>
          <span class="flex-1 h-px bg-rose-300"></span>
        </div>
      </div>`;

    let html = diaTodo.map((it) => linha(it, null)).join('');
    let inserido = false;
    comHora.forEach((x) => {
      if (!inserido && x.min >= agoraMin) {
        html += marcadorAgora;
        inserido = true;
      }
      html += linha(x.it, x.min);
    });
    if (!inserido && comHora.length > 0) html += marcadorAgora;

    container.className = 'relative flex flex-col';
    container.innerHTML = html;
  }

  // ------------------------------------------------------------------ //
  // INTEGRAÇÃO: estende (não substitui) as funções existentes
  // ------------------------------------------------------------------ //
  function estender(nome, depois) {
    const original = window[nome];
    if (typeof original !== 'function') return;
    window[nome] = function () {
      const resultado = original.apply(this, arguments);
      try {
        depois.apply(this, arguments);
      } catch (e) {
        console.warn(`[rotina-ux] ${nome}:`, e);
      }
      return resultado;
    };
  }

  estender('atualizarKpiRotina', atualizarAneis);
  estender('renderizarPrioridades', aprimorarPrioridades);
  estender('renderizarAgendaHojeTimeline', function (diaSemanaNome) {
    if (diaSemanaNome) rx.lastDia = diaSemanaNome;
    aprimorarTimeline();
  });

  // Hover nos cards principais da aba Hoje
  document.querySelectorAll('#subview-rotina-hoje > div > div, #subview-rotina-hoje > div.bg-white').forEach((c) => c.classList.add('rx-lift'));
  const tl = $('container-agenda-hoje-timeline');
  if (tl && tl.parentElement) tl.parentElement.classList.add('rx-lift');

  // Atualiza o indicador "Agora" a cada minuto
  setInterval(() => {
    if (document.hidden || typeof rotinaState === 'undefined') return;
    if ((rotinaState.agendaHoje || []).length && typeof window.renderizarAgendaHojeTimeline === 'function') {
      window.renderizarAgendaHojeTimeline(rx.lastDia);
    }
  }, 60000);

  pintarStreak();
})();
