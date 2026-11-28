// ========================================================================= //
// CONVERGE — FASE 3: REAGENDAR ATRASADAS, CHECK-IN MATINAL & ENCERRAMENTO
// ========================================================================= //

(function initRotinaRituais() {
  'use strict';

  const state = {
    checkinPasso: 1,
    top3Selecionados: new Set(),
    energiaSelecionada: 4,
    rituaisInfo: { ultimo_checkin: null, ultimo_encerramento: null, diario_energia: [] }
  };

  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function dataIsoOffset(dias = 0) {
    const d = new Date();
    d.setDate(d.getDate() + dias);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function horaParaMin(hhmm) {
    const m = /^(\d{2}):(\d{2})$/.exec(String(hhmm || '').trim());
    return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
  }

  function obterPrioridades() {
    return (typeof rotinaState !== 'undefined' && Array.isArray(rotinaState.prioridades))
      ? rotinaState.prioridades
      : [];
  }

  function obterHabitos() {
    if (window.rotinaHabitosHelpers && typeof window.rotinaHabitosHelpers.obterHabitos === 'function') {
      return window.rotinaHabitosHelpers.obterHabitos();
    }
    return (typeof rotinaState !== 'undefined' && Array.isArray(rotinaState.habitos)) ? rotinaState.habitos : [];
  }

  function notificar(msg, tipo = 'success') {
    if (typeof window.mostrarToast === 'function') {
      window.mostrarToast(msg, tipo);
    }
  }

  /* ---------------- 1. DETECÇÃO & REAGENDAMENTO DE ATRASADAS ---------------- */
  function listarAtrasadas() {
    const hoje = dataIsoOffset(0);
    const agoraMin = new Date().getHours() * 60 + new Date().getMinutes();
    return obterPrioridades().filter(t => {
      if (t.concluida || t.adiada_ate) return false;
      if (t.data && t.data < hoje) return true;
      if (t.data === hoje && t.horario) {
        const hm = horaParaMin(t.horario);
        if (hm !== null && hm < agoraMin) return true;
      }
      return false;
    });
  }

  function atualizarBarraAtrasadas() {
    const barra = document.getElementById('barra-reagendar-atrasadas');
    const txt = document.getElementById('txt-qtd-atrasadas');
    if (!barra || !txt) return;
    const atrasadas = listarAtrasadas();
    if (atrasadas.length === 0) {
      barra.classList.add('hidden');
      barra.classList.remove('flex');
      return;
    }
    txt.textContent = `⚠️ ${atrasadas.length} ${atrasadas.length === 1 ? 'atrasada' : 'atrasadas'}`;
    barra.classList.remove('hidden');
    barra.classList.add('flex');
  }

  async function executarReagendamento(modo) {
    if (typeof salvarRotina !== 'function') return;
    const hoje = dataIsoOffset(0);
    const amanha = dataIsoOffset(1);
    const agora_min = new Date().getHours() * 60 + new Date().getMinutes();
    const btnHoje = document.getElementById('btn-reagendar-hoje-livres');
    const btnAmanha = document.getElementById('btn-reagendar-amanha');
    if (btnHoje) btnHoje.disabled = true;
    if (btnAmanha) btnAmanha.disabled = true;

    try {
      const resp = await salvarRotina('/api/rotina/reagendar-atrasadas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modo, hoje, amanha, agora_min })
      });
      if (typeof carregarPrioridades === 'function') await carregarPrioridades();
      if (typeof carregarAgendaHoje === 'function') await carregarAgendaHoje();
      atualizarBarraAtrasadas();

      const total = resp?.reagendadas || 0;
      const overflow = resp?.movidas_amanha || 0;
      if (total === 0) {
        notificar('Nenhuma tarefa atrasada para reagendar.', 'info');
      } else if (modo === 'amanha') {
        notificar(`${total} ${total === 1 ? 'tarefa movida' : 'tarefas movidas'} para amanhã!`, 'success');
      } else if (overflow > 0) {
        notificar(`${total - overflow} encaixada(s) nos horários livres de hoje e ${overflow} movida(s) para amanhã.`, 'success');
      } else {
        notificar(`${total} ${total === 1 ? 'tarefa redistribuída' : 'tarefas redistribuídas'} nos horários livres de hoje!`, 'success');
      }
    } catch (err) {
      notificar(err.message || 'Erro ao reagendar tarefas.', 'error');
    } finally {
      if (btnHoje) btnHoje.disabled = false;
      if (btnAmanha) btnAmanha.disabled = false;
    }
  }

  /* ---------------- 2. BADGES DE RITUAIS ---------------- */
  function atualizarBadgesRituais() {
    const hoje = dataIsoOffset(0);
    const bCheck = document.getElementById('badge-checkin-feito');
    const bEnc = document.getElementById('badge-encerramento-feito');
    if (bCheck) bCheck.classList.toggle('hidden', state.rituaisInfo.ultimo_checkin !== hoje);
    if (bEnc) bEnc.classList.toggle('hidden', state.rituaisInfo.ultimo_encerramento !== hoje);
  }

  async function carregarEstadoRituais() {
    if (typeof fetchAuth !== 'function') return;
    try {
      const res = await fetchAuth('/api/rotina/rituais');
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && json.data) {
        state.rituaisInfo = json.data;
        atualizarBadgesRituais();
      }
    } catch (_) {
      // Silencioso
    }
  }

  /* ---------------- 3. CHECK-IN MATINAL (3 PASSOS) ---------------- */
  function abrirCheckinMatinal() {
    const modal = document.getElementById('modal-checkin-matinal');
    if (!modal) return;
    state.checkinPasso = 1;
    state.top3Selecionados = new Set(
      obterPrioridades().filter(t => !t.concluida && t.top3).slice(0, 3).map(t => t.id)
    );
    renderizarCheckinPasso();
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  function fecharCheckinMatinal() {
    const modal = document.getElementById('modal-checkin-matinal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }

  function renderizarCheckinPasso() {
    const p = state.checkinPasso;
    const label = document.getElementById('checkin-passo-label');
    const s1 = document.getElementById('checkin-step-1');
    const s2 = document.getElementById('checkin-step-2');
    const s3 = document.getElementById('checkin-step-3');
    const btnVoltar = document.getElementById('btn-checkin-voltar');
    const btnAvancar = document.getElementById('btn-checkin-avancar');

    const titulos = {
      1: 'Passo 1 de 3 · Revisar pendências anteriores',
      2: 'Passo 2 de 3 · Escolher até 3 Prioridades Máximas',
      3: 'Passo 3 de 3 · Confirmar plano do dia'
    };
    if (label) label.textContent = titulos[p] || '';
    if (s1) s1.classList.toggle('hidden', p !== 1);
    if (s2) s2.classList.toggle('hidden', p !== 2);
    if (s3) s3.classList.toggle('hidden', p !== 3);
    if (btnVoltar) btnVoltar.classList.toggle('hidden', p === 1);
    if (btnAvancar) btnAvancar.textContent = p === 3 ? '✓ Começar o Dia' : 'Próximo passo →';

    const hoje = dataIsoOffset(0);
    const tarefas = obterPrioridades();

    if (p === 1) {
      const box = document.getElementById('checkin-lista-ontem');
      if (!box) return;
      const antigas = tarefas.filter(t => !t.concluida && !t.adiada_ate && t.data && t.data < hoje);
      if (antigas.length === 0) {
        box.innerHTML = `<div class="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200/70 text-xs text-emerald-900 font-medium">✨ Nenhuma pendência atrasada de dias anteriores! Você começa o dia leve.</div>`;
      } else {
        box.innerHTML = `
          <div class="flex items-center justify-between gap-2 pb-1">
            <span class="text-[11px] font-bold text-rose-700">${antigas.length} ${antigas.length === 1 ? 'tarefa pendente' : 'tarefas pendentes'} de dias anteriores</span>
            <button type="button" id="btn-checkin-mover-hoje" class="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer">⚡ Trazer tudo para hoje</button>
          </div>
          ${antigas.map(t => `
            <div class="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between gap-2 text-xs">
              <span class="font-medium text-slate-800 truncate">${esc(t.texto)}</span>
              <span class="text-[10px] text-slate-400 shrink-0">${esc(t.data)}</span>
            </div>
          `).join('')}
        `;
        document.getElementById('btn-checkin-mover-hoje')?.addEventListener('click', async () => {
          await executarReagendamento('hoje_livres');
          renderizarCheckinPasso();
        });
      }
    } else if (p === 2) {
      const box = document.getElementById('checkin-lista-top3');
      const cont = document.getElementById('checkin-top3-contador');
      if (cont) cont.textContent = `${state.top3Selecionados.size}/3`;
      if (!box) return;
      const candidatas = tarefas.filter(t => !t.concluida && !t.adiada_ate);
      if (candidatas.length === 0) {
        box.innerHTML = `<div class="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500">Nenhuma tarefa aberta no momento. Você pode adicionar novas usando a Captura Rápida!</div>`;
      } else {
        box.innerHTML = candidatas.map(t => {
          const marcada = state.top3Selecionados.has(t.id);
          return `
            <label class="flex items-center justify-between gap-2.5 p-2.5 rounded-xl border transition cursor-pointer ${marcada ? 'bg-emerald-50 border-emerald-400' : 'bg-white border-slate-200 hover:border-slate-300'}">
              <div class="flex items-center gap-2.5 min-w-0">
                <input type="checkbox" class="chk-checkin-top3 rounded text-emerald-700" data-id="${t.id}" ${marcada ? 'checked' : ''} />
                <span class="text-xs font-medium text-slate-800 truncate">${esc(t.texto)}</span>
              </div>
              <span class="text-[10px] text-slate-400 shrink-0">${t.horario ? `⏰ ${esc(t.horario)}` : `${t.duracao_min || 30}m`}</span>
            </label>
          `;
        }).join('');
        box.querySelectorAll('.chk-checkin-top3').forEach(chk => {
          chk.addEventListener('change', () => {
            const id = Number(chk.getAttribute('data-id'));
            if (chk.checked) {
              if (state.top3Selecionados.size >= 3) {
                chk.checked = false;
                notificar('Escolha no máximo 3 prioridades máximas para manter o foco.', 'info');
                return;
              }
              state.top3Selecionados.add(id);
            } else {
              state.top3Selecionados.delete(id);
            }
            renderizarCheckinPasso();
          });
        });
      }
    } else if (p === 3) {
      const box = document.getElementById('checkin-resumo-final');
      if (!box) return;
      const hojeTarefas = tarefas.filter(t => !t.concluida && (!t.data || t.data === hoje));
      const totalMin = hojeTarefas.reduce((acc, t) => acc + (Number(t.duracao_min) || 30), 0);
      const horasStr = `${Math.floor(totalMin / 60)}h${String(totalMin % 60).padStart(2, '0')}`;
      const top3Nomes = tarefas.filter(t => state.top3Selecionados.has(t.id)).map(t => t.texto);
      box.innerHTML = `
        <div class="font-bold text-emerald-900">📅 Carga planejada para hoje: ${horasStr} (${hojeTarefas.length} tarefas)</div>
        <div>
          <span class="font-semibold text-slate-700">Suas Prioridades Máximas (${top3Nomes.length}):</span>
          ${top3Nomes.length > 0
            ? `<ul class="list-disc pl-5 mt-1 space-y-0.5 text-slate-700">${top3Nomes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>`
            : '<p class="text-slate-500 mt-1">Nenhuma prioridade Top 3 selecionada.</p>'}
        </div>
      `;
    }
  }

  async function concluirCheckinMatinal() {
    if (typeof salvarRotina !== 'function') return;
    const hoje = dataIsoOffset(0);
    const btn = document.getElementById('btn-checkin-avancar');
    if (btn) btn.disabled = true;
    try {
      await salvarRotina('/api/rotina/rituais', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'checkin',
          data: hoje,
          top3_ids: [...state.top3Selecionados]
        })
      });
      state.rituaisInfo.ultimo_checkin = hoje;
      atualizarBadgesRituais();
      if (typeof carregarPrioridades === 'function') await carregarPrioridades();
      if (typeof carregarAgendaHoje === 'function') await carregarAgendaHoje();
      fecharCheckinMatinal();
      notificar('Check-in Matinal concluído! Bom foco hoje. 🌅', 'success');
    } catch (err) {
      notificar(err.message || 'Erro ao salvar Check-in Matinal.', 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  /* ---------------- 4. ENCERRAMENTO DO DIA (DAILY SHUTDOWN) ---------------- */
  function abrirEncerramentoDia() {
    const modal = document.getElementById('modal-encerramento-dia');
    if (!modal) return;

    const hoje = dataIsoOffset(0);
    const tarefas = obterPrioridades();
    const habitos = obterHabitos();

    const concluidasHoje = tarefas.filter(t => t.concluida && String(t.concluida_em || '').slice(0, 10) === hoje).length;
    const pendentesHoje = tarefas.filter(t => !t.concluida && !t.adiada_ate && (!t.data || t.data <= hoje)).length;
    const habitosHoje = habitos.filter(h => Array.isArray(h.dias_concluidos) && h.dias_concluidos.includes(hoje)).length;

    const kConc = document.getElementById('enc-kpi-concluidas');
    const kHab = document.getElementById('enc-kpi-habitos');
    const kPend = document.getElementById('enc-kpi-pendentes');
    const descMover = document.getElementById('txt-enc-mover-desc');
    const wrapMover = document.getElementById('wrap-enc-mover-amanha');

    if (kConc) kConc.textContent = String(concluidasHoje);
    if (kHab) kHab.textContent = String(habitosHoje);
    if (kPend) kPend.textContent = String(pendentesHoje);
    if (wrapMover) wrapMover.classList.toggle('hidden', pendentesHoje === 0);
    if (descMover) {
      descMover.textContent = pendentesHoje > 0
        ? `${pendentesHoje} ${pendentesHoje === 1 ? 'pendência será movida' : 'pendências serão movidas'} para amanhã automaticamente.`
        : 'Nenhuma pendência restante hoje!';
    }

    // Pré-preenche se já registrou hoje
    const regHoje = (state.rituaisInfo.diario_energia || []).find(r => r.data === hoje);
    selecionarEnergia(regHoje ? regHoje.energia : 4);
    const notaEl = document.getElementById('input-enc-nota');
    if (notaEl) notaEl.value = regHoje ? (regHoje.nota || '') : '';

    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  function fecharEncerramentoDia() {
    const modal = document.getElementById('modal-encerramento-dia');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }

  function selecionarEnergia(valor) {
    state.energiaSelecionada = Math.max(1, Math.min(5, Number(valor) || 4));
    document.querySelectorAll('#enc-energia-opcoes .btn-enc-energia').forEach(btn => {
      const v = Number(btn.getAttribute('data-energia'));
      const ativo = v === state.energiaSelecionada;
      btn.className = ativo
        ? 'btn-enc-energia py-2 rounded-xl border-2 border-emerald-600 bg-emerald-50 text-center transition cursor-pointer'
        : 'btn-enc-energia py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-center transition cursor-pointer';
    });
  }

  async function salvarEncerramentoDia(e) {
    e.preventDefault();
    if (typeof salvarRotina !== 'function') return;
    const hoje = dataIsoOffset(0);
    const amanha = dataIsoOffset(1);
    const mover = !!document.getElementById('chk-enc-mover-amanha')?.checked;
    const nota = document.getElementById('input-enc-nota')?.value?.trim() || '';
    const concluidas = Number(document.getElementById('enc-kpi-concluidas')?.textContent || '0');
    const pendentes = Number(document.getElementById('enc-kpi-pendentes')?.textContent || '0');
    const btn = document.getElementById('btn-encerramento-salvar');
    if (btn) btn.disabled = true;

    try {
      const resp = await salvarRotina('/api/rotina/rituais', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'encerramento',
          data: hoje,
          amanha,
          mover_pendencias_amanha: mover,
          energia: state.energiaSelecionada,
          nota,
          concluidas,
          pendentes
        })
      });
      state.rituaisInfo.ultimo_encerramento = hoje;
      if (resp?.data?.registro) {
        state.rituaisInfo.diario_energia = [
          resp.data.registro,
          ...(state.rituaisInfo.diario_energia || []).filter(r => r.data !== hoje)
        ];
      }
      atualizarBadgesRituais();
      if (typeof carregarPrioridades === 'function') await carregarPrioridades();
      if (typeof carregarAgendaHoje === 'function') await carregarAgendaHoje();
      atualizarBarraAtrasadas();
      fecharEncerramentoDia();
      const movidas = resp?.data?.movidas || 0;
      notificar(
        movidas > 0
          ? `Dia encerrado! ${movidas} ${movidas === 1 ? 'pendência movida' : 'pendências movidas'} para amanhã e energia salva na Revisão Semanal. 🌙`
          : 'Dia encerrado! Seu registro de energia já aparece na Revisão Semanal. 🌙',
        'success'
      );
    } catch (err) {
      notificar(err.message || 'Erro ao salvar encerramento do dia.', 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  /* ---------------- 5. INICIALIZAÇÃO ---------------- */
  function init() {
    document.getElementById('btn-reagendar-hoje-livres')?.addEventListener('click', () => executarReagendamento('hoje_livres'));
    document.getElementById('btn-reagendar-amanha')?.addEventListener('click', () => executarReagendamento('amanha'));

    document.getElementById('btn-abrir-checkin-matinal')?.addEventListener('click', abrirCheckinMatinal);
    document.getElementById('btn-checkin-fechar')?.addEventListener('click', fecharCheckinMatinal);
    document.getElementById('btn-checkin-voltar')?.addEventListener('click', () => {
      if (state.checkinPasso > 1) {
        state.checkinPasso -= 1;
        renderizarCheckinPasso();
      }
    });
    document.getElementById('btn-checkin-avancar')?.addEventListener('click', () => {
      if (state.checkinPasso < 3) {
        state.checkinPasso += 1;
        renderizarCheckinPasso();
      } else {
        concluirCheckinMatinal();
      }
    });

    document.getElementById('btn-abrir-encerramento-dia')?.addEventListener('click', abrirEncerramentoDia);
    document.getElementById('btn-encerramento-fechar')?.addEventListener('click', fecharEncerramentoDia);
    document.getElementById('btn-encerramento-cancelar')?.addEventListener('click', fecharEncerramentoDia);
    document.getElementById('form-encerramento-dia')?.addEventListener('submit', salvarEncerramentoDia);

    document.querySelectorAll('#enc-energia-opcoes .btn-enc-energia').forEach(btn => {
      btn.addEventListener('click', () => selecionarEnergia(btn.getAttribute('data-energia')));
    });

    // Envolve renderizações para manter a barra de atrasadas sempre atualizada
    if (typeof window.renderizarPrioridades === 'function') {
      const orig = window.renderizarPrioridades;
      window.renderizarPrioridades = function () {
        const res = orig.apply(this, arguments);
        atualizarBarraAtrasadas();
        return res;
      };
    }

    atualizarBarraAtrasadas();
    carregarEstadoRituais();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 120));
  } else {
    setTimeout(init, 120);
  }

  window.RotinaRituais = {
    atualizarBarraAtrasadas,
    abrirCheckinMatinal,
    abrirEncerramentoDia,
    carregarEstadoRituais
  };
})();
