/**
 * rotina-planejamento.js — Fase 1 da Evolução de Rotina & Agenda:
 *  - Alarme de Sobrecarga do Dia (Barra de Capacidade)
 *  - Captura Rápida em Linguagem Natural ("Revisar redação amanhã 19h 45m #alto")
 *  - Timeline Visual com Lacunas (Gaps) + botão "+ Preencher"
 *  - Time Blocking (Drag & Drop no Desktop + botão Agendar no Mobile)
 */
(function () {
  'use strict';

  const STORAGE_CAP_KEY = 'converge_rotina_cap_horas';
  const STORAGE_PICO_KEY = 'converge_rotina_pico_energia';
  let dragTaskId = null;

  const PICOS_ENERGIA = {
    manha: { id: 'manha', label: 'Manhã (06h–12h)', ini: 6 * 60, fim: 12 * 60, sugestao: '09:00' },
    tarde: { id: 'tarde', label: 'Tarde (12h–18h)', ini: 12 * 60, fim: 18 * 60, sugestao: '14:00' },
    noite: { id: 'noite', label: 'Noite (18h–23h)', ini: 18 * 60, fim: 23 * 60, sugestao: '19:30' }
  };

  function obterPicoEnergia() {
    const sel = document.getElementById('select-pico-energia');
    const val = (sel && sel.value) || localStorage.getItem(STORAGE_PICO_KEY) || 'manha';
    return PICOS_ENERGIA[val] || PICOS_ENERGIA.manha;
  }

  function estaNoPico(minutos) {
    if (minutos === null || minutos === undefined) return false;
    const pico = obterPicoEnergia();
    return minutos >= pico.ini && minutos < pico.fim;
  }

  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function dataIsoOffset(dias = 0) {
    const d = new Date();
    d.setDate(d.getDate() + dias);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  function paraMinutos(hhmm) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
    return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
  }

  function minParaHHMM(total) {
    const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(total)));
    const h = String(Math.floor(clamped / 60)).padStart(2, '0');
    const m = String(clamped % 60).padStart(2, '0');
    return `${h}:${m}`;
  }

  function formatarDuracao(min) {
    const m = Math.max(0, Math.round(Number(min) || 0));
    const h = Math.floor(m / 60);
    const r = m % 60;
    if (h > 0 && r > 0) return `${h}h${String(r).padStart(2, '0')}`;
    if (h > 0) return `${h}h`;
    return `${r}m`;
  }

  /* ---------------- 1. PARSER DE LINGUAGEM NATURAL ---------------- */
  function parseCapturaNatural(raw) {
    let texto = String(raw || '').trim();
    let data = dataIsoOffset(0);
    let horario = null;
    let duracao_min = 30;
    let energia = 'medio';

    // Energia (#alto, #medio, #baixo)
    const mEnergia = texto.match(/#(alto|m[eé]dio|baixo)\b/i);
    if (mEnergia) {
      const val = mEnergia[1].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      energia = val;
      texto = texto.replace(mEnergia[0], ' ');
    }

    // Data (hoje, amanhã, DD/MM)
    if (/(^|\s)amanh[aã](?=\s|$)/i.test(texto)) {
      data = dataIsoOffset(1);
      texto = texto.replace(/(^|\s)amanh[aã](?=\s|$)/i, ' ');
    } else if (/(^|\s)hoje(?=\s|$)/i.test(texto)) {
      data = dataIsoOffset(0);
      texto = texto.replace(/(^|\s)hoje(?=\s|$)/i, ' ');
    } else {
      const mData = texto.match(/\b(\d{1,2})\/(\d{1,2})\b/);
      if (mData) {
        const ano = new Date().getFullYear();
        const dd = mData[1].padStart(2, '0');
        const mm = mData[2].padStart(2, '0');
        data = `${ano}-${mm}-${dd}`;
        texto = texto.replace(mData[0], ' ');
      }
    }

    // Duração (1h30, 2h, 45m, 45min) — detecta antes do horário quando possui min/m ou h seguido de fim
    const mDurHM = texto.match(/\b(\d{1,2})h(\d{1,2})(?:m|min)?\b/i);
    const mDurMin = texto.match(/\b(\d{1,3})\s*(?:min|m)\b/i);
    // Horário (às 19h, 19:30, 08h30, 19h)
    const mHoraColon = texto.match(/(?:[àa]s\s+)?\b([01]?\d|2[0-3]):([0-5]\d)\b/i);
    if (mHoraColon) {
      horario = `${mHoraColon[1].padStart(2, '0')}:${mHoraColon[2]}`;
      texto = texto.replace(mHoraColon[0], ' ');
    } else {
      const mHoraH = texto.match(/(?:[àa]s\s+)?\b([01]?\d|2[0-3])h([0-5]\d)?\b/i);
      if (mHoraH && (parseInt(mHoraH[1], 10) >= 6 || /às|as/i.test(mHoraH[0]))) {
        horario = `${mHoraH[1].padStart(2, '0')}:${mHoraH[2] || '00'}`;
        texto = texto.replace(mHoraH[0], ' ');
      }
    }

    // Duração restante após extrair horário
    const mDurAfterHM = texto.match(/\b(\d{1,2})h(\d{1,2})\b/i);
    const mDurAfterH = texto.match(/\b(\d{1,2})h\b/i);
    if (mDurAfterHM) {
      duracao_min = parseInt(mDurAfterHM[1], 10) * 60 + parseInt(mDurAfterHM[2], 10);
      texto = texto.replace(mDurAfterHM[0], ' ');
    } else if (mDurMin) {
      duracao_min = parseInt(mDurMin[1], 10);
      texto = texto.replace(mDurMin[0], ' ');
    } else if (mDurAfterH) {
      duracao_min = parseInt(mDurAfterH[1], 10) * 60;
      texto = texto.replace(mDurAfterH[0], ' ');
    } else if (mDurHM && !horario) {
      duracao_min = parseInt(mDurHM[1], 10) * 60 + parseInt(mDurHM[2], 10);
      texto = texto.replace(mDurHM[0], ' ');
    }

    duracao_min = Math.max(5, Math.min(480, duracao_min));
    const titulo = texto.replace(/\s+/g, ' ').trim();
    return { titulo, data, horario, duracao_min, energia };
  }

  /* ---------------- 2. ALARME DE SOBRECARGA (CAPACIDADE DO DIA) ---------------- */
  function obterCapacidadeHoras() {
    const sel = document.getElementById('select-capacidade-horas');
    if (sel) return Number(sel.value) || 8;
    return Number(localStorage.getItem(STORAGE_CAP_KEY) || 8);
  }

  function atualizarCapacidadeDia() {
    if (typeof rotinaState === 'undefined') return;
    const hoje = dataIsoOffset(0);
    const capMin = obterCapacidadeHoras() * 60;

    const priosHoje = (rotinaState.prioridades || []).filter(p => !p.concluida && (!p.data || p.data === hoje));
    const compsHoje = (rotinaState.agendaHoje || []).filter(it => it.origem !== 'Checklist');

    const minPrios = priosHoje.reduce((acc, p) => acc + (Number(p.duracao_min) || 30), 0);
    const minComps = compsHoje.reduce((acc, c) => acc + (Number(c.duracao_min) || 45), 0);
    const totalMin = minPrios + minComps;
    const pct = capMin > 0 ? Math.round((totalMin / capMin) * 100) : 0;

    const badge = document.getElementById('badge-capacidade-status');
    const bar = document.getElementById('bar-capacidade-dia');
    const txt = document.getElementById('txt-capacidade-alerta');

    const statusTxt = pct > 100 ? 'Sobrecarga!' : (pct >= 85 ? 'Atenção' : 'Equilibrado');
    if (badge) {
      badge.textContent = `${formatarDuracao(totalMin)} / ${obterCapacidadeHoras()}h · ${statusTxt}`;
      badge.className = pct > 100
        ? 'text-[11px] font-bold px-2.5 py-1 rounded-lg bg-rose-50 text-rose-800 border border-rose-200 tabular-nums'
        : pct >= 85
          ? 'text-[11px] font-bold px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 tabular-nums'
          : 'text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 tabular-nums';
    }
    if (bar) {
      bar.style.width = `${Math.min(100, pct)}%`;
      bar.className = `nx-bar-fill h-full rounded-full ${pct > 100 ? 'bg-rose-600' : (pct >= 85 ? 'bg-amber-500' : 'bg-emerald-600')}`;
    }
    if (txt) {
      txt.textContent = pct > 100
        ? `⚠️ Você planejou ${formatarDuracao(totalMin - capMin)} acima da sua capacidade diária. Considere mover tarefas para amanhã.`
        : pct >= 85
          ? `⏳ Agenda quase cheia (${pct}%). Deixe margem para imprevistos.`
          : `✓ ${formatarDuracao(Math.max(0, capMin - totalMin))} livres na sua capacidade planejada hoje.`;
    }
  }

  /* ---------------- 3. INBOX & TIMELINE COM LACUNAS (GAPS) ---------------- */
  async function agendarTarefaEmHorario(tarefaId, hhmm, dataIso = null, duracaoMin = null) {
    if (typeof salvarRotina !== 'function') return;
    const payload = {
      data: dataIso || dataIsoOffset(0),
      horario: hhmm
    };
    if (duracaoMin && Number.isFinite(Number(duracaoMin))) {
      payload.duracao_min = Number(duracaoMin);
    }
    await salvarRotina(`/api/rotina/prioridades/${tarefaId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (typeof carregarPrioridades === 'function') await carregarPrioridades();
    if (typeof carregarAgendaHoje === 'function') await carregarAgendaHoje();
    if (typeof window.mostrarToast === 'function') {
      window.mostrarToast(`Tarefa agendada para ${hhmm}!`, 'success');
    }
  }

  async function concluirTarefaDaTimeline(tarefaId) {
    if (typeof salvarRotina !== 'function') return;
    await salvarRotina(`/api/rotina/prioridades/${tarefaId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ concluida: true })
    });
    if (typeof carregarPrioridades === 'function') await carregarPrioridades();
    if (typeof carregarAgendaHoje === 'function') await carregarAgendaHoje();
    if (typeof window.mostrarToast === 'function') {
      window.mostrarToast('Tarefa concluída na Linha do Tempo! ✓', 'success');
    }
  }

  async function desagendarTarefaDaTimeline(tarefaId) {
    if (typeof salvarRotina !== 'function') return;
    await salvarRotina(`/api/rotina/prioridades/${tarefaId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ horario: null })
    });
    if (typeof carregarPrioridades === 'function') await carregarPrioridades();
    if (typeof carregarAgendaHoje === 'function') await carregarAgendaHoje();
    if (typeof window.mostrarToast === 'function') {
      window.mostrarToast('Tarefa movida de volta para a Inbox.', 'info');
    }
  }

  function calcularLacunasLivresHoje() {
    const hoje = dataIsoOffset(0);
    const ocupados = [];
    (rotinaState.agendaHoje || []).forEach(it => {
      const ini = paraMinutos(it.horario);
      if (ini !== null) ocupados.push([ini, ini + (Number(it.duracao_min) || 45)]);
    });
    (rotinaState.prioridades || []).forEach(p => {
      if (!p.concluida && p.horario && (!p.data || p.data === hoje)) {
        const ini = paraMinutos(p.horario);
        if (ini !== null) ocupados.push([ini, ini + (Number(p.duracao_min) || 30)]);
      }
    });
    const agoraMin = new Date().getHours() * 60 + new Date().getMinutes();
    const candidatos = ['08:00', '09:00', '10:30', '14:00', '16:00', '19:00', '20:30'];
    const livres = candidatos.filter(hhmm => {
      const m = paraMinutos(hhmm);
      if (m === null || m < agoraMin - 10) return false;
      return !ocupados.some(([a, b]) => m < b && (m + 30) > a);
    });
    return livres.length > 0 ? livres.slice(0, 4) : ['09:00', '14:00', '19:00'];
  }

  function abrirModalAgendarTarefa(tarefa) {
    const modal = document.getElementById('modal-agendar-tarefa');
    if (!modal || !tarefa) return;
    const idEl = document.getElementById('input-agendar-task-id');
    const nomeEl = document.getElementById('agendar-tarefa-nome');
    const dataEl = document.getElementById('input-agendar-data');
    const horaEl = document.getElementById('input-agendar-horario');
    const durEl = document.getElementById('select-agendar-duracao');
    const chipsEl = document.getElementById('agendar-chips-horarios');

    const livres = calcularLacunasLivresHoje();
    if (idEl) idEl.value = String(tarefa.id);
    if (nomeEl) nomeEl.textContent = tarefa.texto || 'Tarefa';
    if (dataEl) dataEl.value = tarefa.data || dataIsoOffset(0);
    if (horaEl) horaEl.value = livres[0] || '14:00';
    if (durEl) {
      const d = String(tarefa.duracao_min || 30);
      durEl.value = [...durEl.options].some(o => o.value === d) ? d : '30';
    }
    if (chipsEl) {
      chipsEl.innerHTML = livres.map(h => {
        const noPico = estaNoPico(paraMinutos(h));
        return `<button type="button" class="btn-chip-hora-agendar px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer ${noPico ? 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100' : 'bg-white border-slate-200 text-slate-700 hover:bg-emerald-50 hover:border-emerald-300'}" data-hora="${h}">⏰ ${h}${noPico ? ' ⚡' : ''}</button>`;
      }).join('');
      chipsEl.querySelectorAll('.btn-chip-hora-agendar').forEach(ch => {
        ch.addEventListener('click', () => {
          if (horaEl) horaEl.value = ch.getAttribute('data-hora');
        });
      });
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  function fecharModalAgendarTarefa() {
    const modal = document.getElementById('modal-agendar-tarefa');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }

  function preencherLacuna(hhmm) {
    const inp = document.getElementById('input-captura-natural');
    if (inp) {
      inp.value = `hoje ${hhmm} 30m `;
      inp.focus();
      inp.dispatchEvent(new Event('input'));
      inp.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function renderizarInboxTimeBlocking() {
    const box = document.getElementById('container-inbox-timeblock');
    const badge = document.getElementById('badge-inbox-count');
    if (!box || typeof rotinaState === 'undefined') return;

    const pesoEnergia = { alto: 0, medio: 1, baixo: 2 };
    const semHora = (rotinaState.prioridades || [])
      .filter(p => !p.concluida && !p.horario)
      .sort((a, b) => (pesoEnergia[a.energia || 'medio'] ?? 1) - (pesoEnergia[b.energia || 'medio'] ?? 1));
    if (badge) badge.textContent = String(semHora.length);

    if (!semHora.length) {
      box.innerHTML = '<p class="text-[11px] text-slate-400 text-center py-4 border border-dashed border-slate-200 rounded-lg bg-white/70">Todas as tarefas já têm horário ou foram concluídas 🎉</p>';
      return;
    }

    const ENERGIA_TAG = {
      alto: { label: '⚡ Alto', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
      medio: { label: '🎯 Médio', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
      baixo: { label: '🌿 Leve', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' }
    };

    box.innerHTML = semHora.map(t => {
      const en = ENERGIA_TAG[t.energia || 'medio'] || ENERGIA_TAG.medio;
      return `
        <div class="inbox-tb-card p-2.5 rounded-xl bg-white border border-slate-200 hover:border-emerald-300 shadow-2xs cursor-grab transition space-y-2" draggable="true" data-task-id="${t.id}">
          <p class="text-xs font-semibold text-slate-900 line-clamp-2">${esc(t.texto)}</p>
          <div class="flex items-center justify-between gap-1.5 flex-wrap">
            <div class="flex items-center gap-1">
              <span class="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">${formatarDuracao(t.duracao_min || 30)}</span>
              <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded border ${en.cls}">${en.label}</span>
            </div>
            <button type="button" class="btn-tb-agendar px-2.5 py-1 rounded-lg text-[10px] font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 cursor-pointer" data-task-id="${t.id}">⏰ Agendar</button>
          </div>
        </div>
      `;
    }).join('');

    box.querySelectorAll('.inbox-tb-card').forEach(card => {
      card.addEventListener('dragstart', () => {
        dragTaskId = parseInt(card.getAttribute('data-task-id'), 10);
        card.classList.add('opacity-50');
      });
      card.addEventListener('dragend', () => {
        dragTaskId = null;
        card.classList.remove('opacity-50');
      });
    });

    box.querySelectorAll('.btn-tb-agendar').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.getAttribute('data-task-id'), 10);
        const tarefa = (rotinaState.prioridades || []).find(p => p.id === id);
        if (tarefa) abrirModalAgendarTarefa(tarefa);
      });
    });
  }

  function aprimorarTimelineComLacunas() {
    const container = document.getElementById('container-agenda-hoje-timeline');
    if (!container || typeof rotinaState === 'undefined') return;
    const hoje = dataIsoOffset(0);

    // Une agendaHoje + prioridades com horário de hoje
    const blocos = [];
    (rotinaState.agendaHoje || []).forEach(it => {
      const ini = paraMinutos(it.horario);
      if (ini !== null) {
        blocos.push({
          titulo: it.titulo,
          inicio: ini,
          duracao: Number(it.duracao_min) || 45,
          origem: it.origem || 'Agenda',
          categoria: it.categoria || 'pessoal'
        });
      }
    });
    (rotinaState.prioridades || []).forEach(p => {
      if (!p.concluida && p.horario && (!p.data || p.data === hoje)) {
        const ini = paraMinutos(p.horario);
        if (ini !== null) {
          blocos.push({
            taskId: p.id,
            titulo: p.texto,
            inicio: ini,
            duracao: Number(p.duracao_min) || 30,
            origem: 'Tarefa',
            categoria: 'estudos',
            energia: p.energia || 'medio'
          });
        }
      }
    });

    blocos.sort((a, b) => a.inicio - b.inicio);
    const pico = obterPicoEnergia();

    if (blocos.length === 0) {
      container.innerHTML = `
        <div class="p-6 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 text-center space-y-2">
          <p class="text-xs font-semibold text-slate-700">Dia livre até agora</p>
          <p class="text-[11px] text-slate-500">Use a Captura Rápida acima ou clique em uma lacuna abaixo para bloquear seu tempo.</p>
          <div class="flex flex-wrap justify-center gap-2 pt-2">
            ${['09:00', '14:00', '19:00'].map(h => {
              const noPico = estaNoPico(paraMinutos(h));
              return `
              <button type="button" class="gap-drop-zone px-3 py-1.5 rounded-lg text-xs font-semibold ${noPico ? 'text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300' : 'text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200'} cursor-pointer" data-gap-hora="${h}">+ Preencher ${h}${noPico ? ' · ⚡ Pico' : ''}</button>
            `;
            }).join('')}
          </div>
        </div>
      `;
    } else {
      const agora = new Date();
      const agoraMin = agora.getHours() * 60 + agora.getMinutes();
      let html = '';

      blocos.forEach((b, i) => {
        const fim = b.inicio + b.duracao;
        const passado = fim < agoraMin;
        let badgeEnergia = '';
        if (b.energia === 'alto') {
          badgeEnergia = estaNoPico(b.inicio)
            ? '<span class="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 shrink-0">⚡ Foco Alto · no pico</span>'
            : `<span class="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 shrink-0" title="Sugestão: mova para ${pico.label}">⚠️ Foco Alto · fora do pico</span>`;
        } else if (b.energia === 'baixo') {
          badgeEnergia = '<span class="px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 shrink-0">🌿 Baixa Energia</span>';
        }
        html += `
          <div class="flex items-stretch gap-3 ${passado ? 'opacity-60' : ''}">
            <div class="w-12 shrink-0 pt-2.5 text-right text-[11px] font-mono font-bold text-slate-700">${minParaHHMM(b.inicio)}</div>
            <div class="flex flex-col items-center shrink-0">
              <span class="w-2.5 h-2.5 rounded-full mt-3 ${b.energia === 'alto' ? 'bg-amber-500' : 'bg-emerald-600'}"></span>
              <span class="flex-1 w-px bg-slate-200"></span>
            </div>
            <div class="flex-1 min-w-0 mb-1.5 p-3 rounded-xl border border-slate-200 bg-white shadow-2xs flex flex-wrap sm:flex-nowrap items-center justify-between gap-2">
              <div class="min-w-0 flex-1">
                <p class="text-xs font-bold text-slate-900 truncate">${esc(b.titulo)}</p>
                <p class="text-[10px] text-slate-500">${esc(b.origem)} · ${minParaHHMM(b.inicio)} – ${minParaHHMM(fim)} (${formatarDuracao(b.duracao)})</p>
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
                ${badgeEnergia}
                ${b.taskId ? `
                  <button type="button" class="btn-tl-concluir w-7 h-7 rounded-lg bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200 text-xs font-bold transition cursor-pointer flex items-center justify-center" data-task-id="${b.taskId}" title="Concluir tarefa">✓</button>
                  <button type="button" class="btn-tl-desagendar w-7 h-7 rounded-lg bg-slate-50 hover:bg-slate-200 text-slate-500 hover:text-slate-800 border border-slate-200 text-xs transition cursor-pointer flex items-center justify-center" data-task-id="${b.taskId}" title="Mover de volta para Inbox (sem horário)">📥</button>
                ` : ''}
              </div>
            </div>
          </div>
        `;

        // Calcula lacuna (gap) até o próximo bloco (>= 15 min)
        const prox = blocos[i + 1];
        if (prox && prox.inicio - fim >= 15) {
          const gapMin = prox.inicio - fim;
          const horaGap = minParaHHMM(fim);
          const gapNoPico = estaNoPico(fim);
          html += `
            <div class="gap-drop-zone flex items-center gap-3 my-1 py-2 px-3 rounded-xl border border-dashed ${gapNoPico ? 'border-amber-300 bg-amber-50/50 hover:bg-amber-50' : 'border-emerald-300/80 bg-emerald-50/40 hover:bg-emerald-50'} transition" data-gap-hora="${horaGap}">
              <span class="text-[11px] font-semibold ${gapNoPico ? 'text-amber-900' : 'text-emerald-800'} flex-1">⏱ ${formatarDuracao(gapMin)} livres (${horaGap} – ${minParaHHMM(prox.inicio)})${gapNoPico ? ' · ⚡ Ideal p/ Foco Alto' : ''}</span>
              <button type="button" class="btn-preencher-lacuna px-2.5 py-1 rounded-lg text-[10px] font-bold text-emerald-800 bg-white border border-emerald-200 hover:bg-emerald-100 cursor-pointer" data-gap-hora="${horaGap}">+ Preencher</button>
            </div>
          `;
        }
      });

      // Lacuna final após o último bloco
      const ultimoFim = blocos[blocos.length - 1].inicio + blocos[blocos.length - 1].duracao;
      if (ultimoFim < 22 * 60) {
        const horaFim = minParaHHMM(ultimoFim);
        html += `
          <div class="gap-drop-zone flex items-center gap-3 mt-1 py-2 px-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 hover:border-emerald-300 transition" data-gap-hora="${horaFim}">
            <span class="text-[11px] text-slate-500 flex-1">Espaço livre após ${horaFim} (arraste uma tarefa para cá)</span>
            <button type="button" class="btn-preencher-lacuna px-2.5 py-1 rounded-lg text-[10px] font-bold text-emerald-800 bg-white border border-emerald-200 hover:bg-emerald-50 cursor-pointer" data-gap-hora="${horaFim}">+ Preencher</button>
          </div>
        `;
      }
      container.innerHTML = html;
    }

    container.querySelectorAll('.btn-preencher-lacuna').forEach(btn => {
      btn.addEventListener('click', () => preencherLacuna(btn.getAttribute('data-gap-hora')));
    });

    container.querySelectorAll('.btn-tl-concluir').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        await concluirTarefaDaTimeline(parseInt(btn.getAttribute('data-task-id'), 10));
      });
    });

    container.querySelectorAll('.btn-tl-desagendar').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        await desagendarTarefaDaTimeline(parseInt(btn.getAttribute('data-task-id'), 10));
      });
    });

    container.querySelectorAll('.gap-drop-zone').forEach(zone => {
      zone.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON' && zone.classList.contains('gap-drop-zone') && zone.tagName === 'BUTTON') {
          preencherLacuna(zone.getAttribute('data-gap-hora'));
        }
      });
      zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('ring-2', 'ring-emerald-500');
      });
      zone.addEventListener('dragleave', () => {
        zone.classList.remove('ring-2', 'ring-emerald-500');
      });
      zone.addEventListener('drop', async (e) => {
        e.preventDefault();
        zone.classList.remove('ring-2', 'ring-emerald-500');
        if (!dragTaskId) return;
        const hora = zone.getAttribute('data-gap-hora');
        await agendarTarefaEmHorario(dragTaskId, hora);
      });
    });
  }

  function atualizarSugestaoEnergia() {
    const alerta = document.getElementById('alerta-energia-pico');
    if (!alerta || typeof rotinaState === 'undefined') return;
    const hoje = dataIsoOffset(0);
    const pico = obterPicoEnergia();
    const tarefas = (rotinaState.prioridades || []).filter(t => !t.concluida && !t.adiada_ate && (!t.data || t.data === hoje));
    const altoForaPico = tarefas.filter(t => t.energia === 'alto' && t.horario && !estaNoPico(paraMinutos(t.horario)));
    const altoInbox = tarefas.filter(t => t.energia === 'alto' && !t.horario);

    if (altoForaPico.length > 0) {
      alerta.textContent = `⚡ Dica de Energia: você tem ${altoForaPico.length} ${altoForaPico.length === 1 ? 'tarefa de Foco Alto agendada' : 'tarefas de Foco Alto agendadas'} fora do seu pico (${pico.label}). Tente movê-la para o período em que você rende mais!`;
      alerta.classList.remove('hidden');
    } else if (altoInbox.length > 0) {
      alerta.textContent = `⚡ Dica de Energia: você tem ${altoInbox.length} ${altoInbox.length === 1 ? 'tarefa de Foco Alto' : 'tarefas de Foco Alto'} na Inbox. Arraste para uma lacuna da ${pico.label} (seu pico de foco).`;
      alerta.classList.remove('hidden');
    } else {
      alerta.classList.add('hidden');
    }
  }

  function atualizarTudoPlanejamento() {
    atualizarCapacidadeDia();
    atualizarSugestaoEnergia();
    renderizarInboxTimeBlocking();
    aprimorarTimelineComLacunas();
  }

  function init() {
    const selCap = document.getElementById('select-capacidade-horas');
    if (selCap) {
      const saved = localStorage.getItem(STORAGE_CAP_KEY);
      if (saved) selCap.value = saved;
      selCap.addEventListener('change', () => {
        localStorage.setItem(STORAGE_CAP_KEY, selCap.value);
        atualizarCapacidadeDia();
      });
    }

    const selPico = document.getElementById('select-pico-energia');
    if (selPico) {
      const savedPico = localStorage.getItem(STORAGE_PICO_KEY);
      if (savedPico && PICOS_ENERGIA[savedPico]) selPico.value = savedPico;
      selPico.addEventListener('change', () => {
        localStorage.setItem(STORAGE_PICO_KEY, selPico.value);
        atualizarTudoPlanejamento();
      });
    }

    const inpNat = document.getElementById('input-captura-natural');
    const prevNat = document.getElementById('preview-captura-natural');
    if (inpNat && prevNat) {
      inpNat.addEventListener('input', () => {
        const val = inpNat.value.trim();
        if (!val) { prevNat.innerHTML = ''; return; }
        const p = parseCapturaNatural(val);
        prevNat.innerHTML = `
          <span class="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700 font-semibold">📅 ${esc(p.data)}</span>
          ${p.horario ? `<span class="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold">⏰ ${esc(p.horario)}</span>` : '<span class="px-2 py-0.5 rounded bg-slate-100 text-slate-500">📥 Inbox (sem hora)</span>'}
          <span class="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700">⏱ ${formatarDuracao(p.duracao_min)}</span>
          <span class="px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800">Energia: ${esc(p.energia)}</span>
        `;
      });
    }

    document.getElementById('form-captura-natural')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!inpNat || !inpNat.value.trim() || typeof salvarRotina !== 'function') return;
      const p = parseCapturaNatural(inpNat.value);
      if (!p.titulo) return;

      const form = e.currentTarget;
      const btnSubmit = form.querySelector('[type="submit"]');
      if (btnSubmit?.disabled) return;
      if (btnSubmit) btnSubmit.disabled = true;

      try {
        await salvarRotina('/api/rotina/prioridades', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            texto: p.titulo,
            top3: false,
            data: p.data,
            horario: p.horario,
            duracao_min: p.duracao_min,
            energia: p.energia
          })
        });
        inpNat.value = '';
        if (prevNat) prevNat.innerHTML = '';
        if (typeof carregarPrioridades === 'function') await carregarPrioridades();
        if (typeof carregarAgendaHoje === 'function') await carregarAgendaHoje();
        if (typeof window.mostrarToast === 'function') {
          window.mostrarToast(p.horario ? `Agendado para ${p.horario} (${p.data})!` : 'Adicionado à Inbox!', 'success');
        }
      } catch (err) {
        if (typeof window.mostrarToast === 'function') {
          window.mostrarToast(err.message || 'Erro ao agendar tarefa.', 'error');
        }
      } finally {
        if (btnSubmit) btnSubmit.disabled = false;
      }
    });

    // Modal Agendar Tarefa (sem prompt nativo)
    document.getElementById('btn-agendar-fechar')?.addEventListener('click', fecharModalAgendarTarefa);
    document.getElementById('btn-agendar-cancelar')?.addEventListener('click', fecharModalAgendarTarefa);
    document.getElementById('form-agendar-tarefa')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = parseInt(document.getElementById('input-agendar-task-id')?.value || '0', 10);
      const dataIso = document.getElementById('input-agendar-data')?.value || dataIsoOffset(0);
      const hora = document.getElementById('input-agendar-horario')?.value || '';
      const dur = parseInt(document.getElementById('select-agendar-duracao')?.value || '30', 10);
      const btnSalvar = document.getElementById('btn-agendar-salvar');
      if (!id || !hora) return;
      if (btnSalvar) btnSalvar.disabled = true;
      try {
        await agendarTarefaEmHorario(id, hora, dataIso, dur);
        fecharModalAgendarTarefa();
      } catch (err) {
        if (typeof window.mostrarToast === 'function') {
          window.mostrarToast(err.message || 'Erro ao agendar tarefa.', 'error');
        }
      } finally {
        if (btnSalvar) btnSalvar.disabled = false;
      }
    });

    // Envolve renderizações existentes sem quebrar nada
    if (typeof window.renderizarPrioridades === 'function') {
      const origPrio = window.renderizarPrioridades;
      window.renderizarPrioridades = function () {
        const res = origPrio.apply(this, arguments);
        atualizarTudoPlanejamento();
        return res;
      };
    }
    if (typeof window.renderizarAgendaHojeTimeline === 'function') {
      const origTl = window.renderizarAgendaHojeTimeline;
      window.renderizarAgendaHojeTimeline = function () {
        const res = origTl.apply(this, arguments);
        atualizarTudoPlanejamento();
        return res;
      };
    }

    atualizarTudoPlanejamento();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 60));
  } else {
    setTimeout(init, 60);
  }

  window.parseCapturaNatural = parseCapturaNatural;
  window.RotinaPlanejamento = { atualizar: atualizarTudoPlanejamento, parseCapturaNatural };
})();
