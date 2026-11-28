// ========================================================================= //
// CONVERGE — MODO "PLAY" PARA ROTINAS EM BLOCO (FASE 2)
// Execução guiada de hábitos por período com cronômetro e check-in automático
// ========================================================================= //

(function initRotinaPlay() {
  const RING_CIRC = 376.99; // 2 * Math.PI * 60

  const LABELS_PERIODO = {
    manha: '🌅 Rotina da Manhã',
    pos_trabalho: '🌆 Rotina Pós-Trabalho',
    noite: '🌙 Rotina da Noite',
    todos: '⚡ Rotina Completa do Dia'
  };

  const state = {
    aberto: false,
    periodo: 'manha',
    fila: [],
    indiceAtual: 0,
    totalSegundos: 900,
    restantesSegundos: 900,
    pausado: false,
    timerId: null,
    concluidosSessao: 0,
    segundosFocados: 0,
    salvandoCheckin: false
  };

  function tocarSinoSuave() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.18); // A5
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.14, ctx.currentTime + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.58);
    } catch (_) {
      // Áudio opcional
    }
  }

  function formatarMMSS(seg) {
    const s = Math.max(0, Math.floor(seg));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }

  function obterHabitosLista() {
    if (window.rotinaHabitosHelpers && typeof window.rotinaHabitosHelpers.obterHabitos === 'function') {
      return window.rotinaHabitosHelpers.obterHabitos();
    }
    return [];
  }

  function obterHojeIso() {
    if (window.rotinaHabitosHelpers && typeof window.rotinaHabitosHelpers.dataLocalRotina === 'function') {
      return window.rotinaHabitosHelpers.dataLocalRotina(new Date());
    }
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function filtrarHabitosPorPeriodo(habitos, periodo) {
    const hoje = obterHojeIso();
    const lista = Array.isArray(habitos) ? habitos : [];
    const doPeriodo = periodo === 'todos'
      ? lista
      : lista.filter(h => (h.periodo || 'manha') === periodo || h.periodo === 'livre');

    // Prioriza hábitos ainda não concluídos hoje; se todos já foram concluídos, permite rodar novamente o bloco
    const pendentes = doPeriodo.filter(h => !(Array.isArray(h.dias_concluidos) && h.dias_concluidos.includes(hoje)));
    return pendentes.length > 0 ? pendentes : doPeriodo;
  }

  function atualizarContadoresModoPlay(habitos) {
    const lista = Array.isArray(habitos) ? habitos : obterHabitosLista();
    const hoje = obterHojeIso();
    const botoes = document.querySelectorAll('#barra-modo-play-habitos .btn-iniciar-rotina-play');
    botoes.forEach(btn => {
      const periodo = btn.getAttribute('data-play-periodo') || 'todos';
      const span = btn.querySelector('.play-count');
      if (!span) return;
      const doPeriodo = periodo === 'todos'
        ? lista
        : lista.filter(h => (h.periodo || 'manha') === periodo);
      const pendentes = doPeriodo.filter(h => !(Array.isArray(h.dias_concluidos) && h.dias_concluidos.includes(hoje)));
      const alvo = pendentes.length > 0 ? pendentes : doPeriodo;
      const mins = alvo.reduce((acc, h) => acc + (Number(h.duracao_min) || 15), 0);
      if (alvo.length === 0) {
        span.textContent = '(0)';
      } else {
        span.textContent = `(${alvo.length} · ${mins}m)`;
      }
    });
  }

  window.atualizarContadoresModoPlay = atualizarContadoresModoPlay;

  function pararTimer() {
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
  }

  function atualizarVisorTimer() {
    const txt = document.getElementById('play-timer-texto');
    const ring = document.getElementById('play-ring-fg');
    const status = document.getElementById('play-timer-status');
    const btnPausar = document.getElementById('btn-play-pausar');

    if (txt) txt.textContent = formatarMMSS(state.restantesSegundos);
    if (ring) {
      const frac = state.totalSegundos > 0 ? state.restantesSegundos / state.totalSegundos : 0;
      const offset = (RING_CIRC * (1 - Math.max(0, Math.min(1, frac)))).toFixed(2);
      ring.setAttribute('stroke-dashoffset', offset);
      ring.setAttribute('stroke', state.restantesSegundos === 0 ? '#cfa468' : '#5b9086');
    }
    if (status) {
      if (state.restantesSegundos === 0) {
        status.textContent = 'Tempo concluído! ✨';
        status.className = 'text-[11px] font-bold text-amber-700 mt-0.5';
      } else if (state.pausado) {
        status.textContent = 'Pausado';
        status.className = 'text-[11px] font-semibold text-slate-500 mt-0.5';
      } else {
        status.textContent = 'Em foco';
        status.className = 'text-[11px] font-semibold text-emerald-700 mt-0.5';
      }
    }
    if (btnPausar) {
      btnPausar.textContent = state.pausado ? '▶ Retomar' : '⏸ Pausar';
    }
  }

  function iniciarContagem() {
    pararTimer();
    state.timerId = setInterval(() => {
      if (!state.aberto || state.pausado) return;
      if (state.restantesSegundos > 0) {
        state.restantesSegundos -= 1;
        state.segundosFocados += 1;
        atualizarVisorTimer();
        if (state.restantesSegundos === 0) {
          tocarSinoSuave();
        }
      }
    }, 1000);
  }

  function renderizarEtapaAtual() {
    const ativoEl = document.getElementById('play-conteudo-ativo');
    const concluidoEl = document.getElementById('play-conteudo-concluido');
    const badgePeriodo = document.getElementById('play-periodo-badge');
    const contador = document.getElementById('play-etapa-contador');

    if (badgePeriodo) badgePeriodo.textContent = LABELS_PERIODO[state.periodo] || LABELS_PERIODO.todos;

    if (state.indiceAtual >= state.fila.length) {
      pararTimer();
      if (ativoEl) ativoEl.classList.add('hidden');
      if (concluidoEl) concluidoEl.classList.remove('hidden');
      if (contador) contador.textContent = 'Finalizado';
      const resumo = document.getElementById('play-resumo-final');
      const minsFocados = Math.max(1, Math.round(state.segundosFocados / 60));
      if (resumo) {
        resumo.textContent = `Você concluiu ${state.concluidosSessao} de ${state.fila.length} ${state.fila.length === 1 ? 'hábito' : 'hábitos'} (${minsFocados} min de foco registrado).`;
      }
      if (typeof window.nxCelebrate === 'function' && concluidoEl) {
        window.nxCelebrate(concluidoEl);
      }
      return;
    }

    if (ativoEl) ativoEl.classList.remove('hidden');
    if (concluidoEl) concluidoEl.classList.add('hidden');

    const habito = state.fila[state.indiceAtual];
    const duracaoMin = Math.max(1, Number(habito.duracao_min) || 15);
    state.totalSegundos = duracaoMin * 60;
    state.restantesSegundos = duracaoMin * 60;
    state.pausado = false;

    if (contador) contador.textContent = `Etapa ${state.indiceAtual + 1} de ${state.fila.length}`;
    const iconeEl = document.getElementById('play-habito-icone');
    const nomeEl = document.getElementById('play-habito-nome');
    const metaEl = document.getElementById('play-habito-meta');
    const filaEl = document.getElementById('play-fila-etapas');

    if (iconeEl) iconeEl.textContent = habito.icone || '⚡';
    if (nomeEl) nomeEl.textContent = habito.nome || 'Hábito';
    if (metaEl) {
      const janela = habito.horario_ideal && habito.horario_limite
        ? ` · Janela ${habito.horario_ideal}–${habito.horario_limite}`
        : (habito.horario_ideal ? ` · Ideal ${habito.horario_ideal}` : '');
      metaEl.textContent = `${duracaoMin} min${janela}`;
    }

    if (filaEl) {
      filaEl.innerHTML = state.fila.map((item, idx) => {
        const cls = idx < state.indiceAtual
          ? 'bg-emerald-50 text-emerald-800 border-emerald-200 line-through opacity-75'
          : (idx === state.indiceAtual
            ? 'bg-emerald-700 text-white border-emerald-700 font-bold'
            : 'bg-white text-slate-500 border-slate-200');
        const labelCurto = (item.nome || '').length > 18 ? `${item.nome.slice(0, 17)}…` : item.nome;
        return `<span class="px-2 py-0.5 rounded-full border ${cls}">${item.icone || '⚡'} ${labelCurto}</span>`;
      }).join('');
    }

    atualizarVisorTimer();
    iniciarContagem();
  }

  function fecharModoPlay() {
    pararTimer();
    state.aberto = false;
    const modal = document.getElementById('modal-rotina-play');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  }

  async function abrirModoPlay(periodo) {
    let habitos = obterHabitosLista();
    if (habitos.length === 0 && window.rotinaHabitosHelpers?.carregarHabitos) {
      await window.rotinaHabitosHelpers.carregarHabitos();
      habitos = obterHabitosLista();
    }

    const fila = filtrarHabitosPorPeriodo(habitos, periodo);
    if (fila.length === 0) {
      const nomeBloco = LABELS_PERIODO[periodo] || 'este período';
      if (typeof window.mostrarToast === 'function') {
        window.mostrarToast(`Nenhum hábito cadastrado em ${nomeBloco}. Cadastre um hábito em Metas de Hábitos.`, 'info');
      } else {
        alert(`Nenhum hábito cadastrado em ${nomeBloco}. Crie um hábito em Metas de Hábitos primeiro.`);
      }
      return;
    }

    state.aberto = true;
    state.periodo = periodo || 'todos';
    state.fila = fila;
    state.indiceAtual = 0;
    state.concluidosSessao = 0;
    state.segundosFocados = 0;
    state.pausado = false;

    const modal = document.getElementById('modal-rotina-play');
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }
    renderizarEtapaAtual();
  }

  window.abrirModoPlayRotina = abrirModoPlay;

  async function concluirEtapaEAvancar() {
    if (state.salvandoCheckin || state.indiceAtual >= state.fila.length) return;
    const habito = state.fila[state.indiceAtual];
    const hoje = obterHojeIso();
    const jaMarcadoHoje = Array.isArray(habito.dias_concluidos) && habito.dias_concluidos.includes(hoje);

    const btn = document.getElementById('btn-play-concluir');
    state.salvandoCheckin = true;
    if (btn) btn.disabled = true;

    try {
      if (!jaMarcadoHoje && window.rotinaHabitosHelpers?.alternarCheckinHabito) {
        await window.rotinaHabitosHelpers.alternarCheckinHabito(habito.id, hoje);
      }
      state.concluidosSessao += 1;
      state.indiceAtual += 1;
      tocarSinoSuave();
      renderizarEtapaAtual();
    } finally {
      state.salvandoCheckin = false;
      if (btn) btn.disabled = false;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    // Delegação para todos os botões de lançamento do Modo Play (em Metas de Hábitos e em Rotina & Agenda)
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-iniciar-rotina-play');
      if (!btn) return;
      const periodo = btn.getAttribute('data-play-periodo') || 'todos';
      abrirModoPlay(periodo);
    });

    document.getElementById('btn-play-fechar')?.addEventListener('click', fecharModoPlay);
    document.getElementById('btn-play-concluir-fechar')?.addEventListener('click', fecharModoPlay);

    document.getElementById('btn-play-pausar')?.addEventListener('click', () => {
      state.pausado = !state.pausado;
      atualizarVisorTimer();
    });

    document.getElementById('btn-play-mais-5')?.addEventListener('click', () => {
      state.totalSegundos += 300;
      state.restantesSegundos += 300;
      atualizarVisorTimer();
    });

    document.getElementById('btn-play-concluir')?.addEventListener('click', concluirEtapaEAvancar);

    document.getElementById('btn-play-pular')?.addEventListener('click', () => {
      state.indiceAtual += 1;
      renderizarEtapaAtual();
    });

    document.addEventListener('keydown', (e) => {
      if (!state.aberto) return;
      if (e.key === 'Escape') {
        fecharModoPlay();
      } else if (e.key === ' ' && e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT') {
        e.preventDefault();
        state.pausado = !state.pausado;
        atualizarVisorTimer();
      }
    });

    // Atualiza contadores caso hábitos já estejam carregados
    setTimeout(() => atualizarContadoresModoPlay(obterHabitosLista()), 600);
  });
})();
