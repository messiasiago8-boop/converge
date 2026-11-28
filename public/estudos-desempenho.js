/**
 * estudos-desempenho.js — Fase 4 do Study OS:
 * Grade Tracker (Provas + Média Ponderada), Reading Tracker, Gráficos Chart.js,
 * Ambiente de Foco (Pomodoro + Playlist) e Assistente Study OS (Groq IA).
 */
(function () {
  'use strict';

  const edState = {
    chartHoras: null,
    chartDominio: null,
    pomoSegundos: 25 * 60,
    pomoModo: 'foco',
    pomoRodando: false,
    pomoTimer: null,
    iaModo: 'perguntar'
  };

  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  async function apiReq(url, options = {}) {
    const token = localStorage.getItem('token');
    const headers = { ...(options.headers || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(url, { ...options, headers });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.success === false) throw new Error(json.message || `Erro HTTP ${res.status}`);
    return json;
  }

  function getDados() {
    return window.EstudosOS ? window.EstudosOS.getDados() : { materias: [], paginas: [], provas: [], leituras: [], sessoes_foco: [] };
  }

  async function recarregar() {
    if (window.EstudosOS) await window.EstudosOS.carregar();
  }

  async function confirmarExclusao(titulo, nomeItem, descricao, textoConfirmar = 'Sim, excluir') {
    if (typeof window.nxConfirmarExclusao === 'function') {
      return window.nxConfirmarExclusao({ titulo, nomeItem, descricao, textoConfirmar });
    }
    return confirm(`${titulo} ${nomeItem || ''}`);
  }

  function preencherSelectsMaterias() {
    const { materias } = getDados();
    for (const id of ['select-eos-pomo-materia', 'select-eos-prova-materia', 'select-eos-leitura-materia']) {
      const sel = document.getElementById(id);
      if (!sel) continue;
      const atual = sel.value;
      const labelZero = id === 'select-eos-pomo-materia' ? 'Foco geral' : 'Sem matéria';
      sel.innerHTML = `<option value="">${labelZero}</option>` +
        materias.map(m => `<option value="${m.id}">${esc(m.nome)}</option>`).join('');
      if (atual) sel.value = atual;
    }
  }

  /* ---------------- 1. GRADE TRACKER (PROVAS & MÉDIA PONDERADA) ---------------- */
  function calcularMediaPonderada(provas) {
    const avaliadas = (provas || []).filter(p => p.nota !== null && p.nota !== undefined && !isNaN(Number(p.nota)));
    if (!avaliadas.length) return null;
    const somaNotas = avaliadas.reduce((acc, p) => acc + Number(p.nota) * (Number(p.peso) || 1), 0);
    const somaPesos = avaliadas.reduce((acc, p) => acc + (Number(p.peso) || 1), 0);
    return somaPesos > 0 ? (somaNotas / somaPesos) : null;
  }

  function renderizarProvas() {
    const box = document.getElementById('eos-provas-list');
    const badge = document.getElementById('eos-media-ponderada-badge');
    if (!box) return;
    const { provas, materias } = getDados();

    const media = calcularMediaPonderada(provas);
    if (badge) badge.textContent = media !== null ? `Média: ${media.toFixed(1)}` : 'Média: —';

    if (!provas.length) {
      box.innerHTML = '<p class="text-xs text-slate-400 text-center py-6 border border-dashed border-slate-200 rounded-xl">Nenhuma prova cadastrada ainda.</p>';
      return;
    }

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    box.innerHTML = provas.slice().sort((a, b) => (a.data || '9999').localeCompare(b.data || '9999')).map(pr => {
      const mat = materias.find(m => m.id === pr.materia_id);
      let prazoBadge = '<span class="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-500">Sem data</span>';
      if (pr.data) {
        const diff = Math.ceil((new Date(pr.data + 'T00:00:00') - hoje) / 86400000);
        if (diff < 0) prazoBadge = `<span class="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-500">Há ${Math.abs(diff)}d</span>`;
        else if (diff === 0) prazoBadge = '<span class="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">Hoje!</span>';
        else prazoBadge = `<span class="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">Faltam ${diff}d</span>`;
      }

      return `
        <div class="p-3 rounded-xl bg-slate-50/80 border border-slate-200/80 flex items-center justify-between gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-xs font-bold text-slate-900 truncate">${esc(pr.titulo)}</span>
              ${prazoBadge}
            </div>
            <p class="text-[11px] text-slate-500 mt-0.5">${mat ? esc(mat.nome) : 'Geral'} · Peso ${pr.peso || 1}</p>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <input type="number" step="0.1" min="0" max="100" class="inp-prova-nota w-16 px-2 py-1 text-xs font-bold text-center border border-slate-200 bg-white rounded-lg" value="${pr.nota !== null && pr.nota !== undefined ? pr.nota : ''}" placeholder="Nota" data-id="${pr.id}" />
            <button type="button" class="btn-del-prova text-slate-400 hover:text-rose-600 text-xs cursor-pointer" data-id="${pr.id}" title="Excluir prova">✕</button>
          </div>
        </div>
      `;
    }).join('');

    box.querySelectorAll('.inp-prova-nota').forEach(inp => {
      inp.addEventListener('change', async () => {
        const val = inp.value === '' ? null : Number(inp.value);
        await apiReq(`/api/estudos-os/provas/${inp.getAttribute('data-id')}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nota: val })
        });
        await recarregar();
      });
    });

    box.querySelectorAll('.btn-del-prova').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.getAttribute('data-id'), 10);
        const pr = provas.find(x => x.id === id);
        if (!await confirmarExclusao('Excluir prova?', pr?.titulo, 'Esta avaliação será removida do cálculo da sua média.', 'Excluir prova')) return;
        await apiReq(`/api/estudos-os/provas/${id}`, { method: 'DELETE' });
        await recarregar();
      });
    });
  }

  /* ---------------- 2. READING TRACKER ---------------- */
  function renderizarLeituras() {
    const box = document.getElementById('eos-leituras-list');
    if (!box) return;
    const { leituras, materias } = getDados();

    if (!leituras.length) {
      box.innerHTML = '<p class="text-xs text-slate-400 text-center py-6 border border-dashed border-slate-200 rounded-xl">Nenhum livro, PDF ou artigo cadastrado.</p>';
      return;
    }

    box.innerHTML = leituras.slice().reverse().map(l => {
      const mat = materias.find(m => m.id === l.materia_id);
      const pct = l.total_paginas > 0 ? Math.min(100, Math.round((l.paginas_lidas / l.total_paginas) * 100)) : 0;
      return `
        <div class="p-3 rounded-xl bg-slate-50/80 border border-slate-200/80 space-y-2">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="text-xs font-bold text-slate-900 truncate">${esc(l.titulo)}</p>
              <p class="text-[11px] text-slate-500">${l.autor ? esc(l.autor) + ' · ' : ''}${esc(l.tipo.toUpperCase())}${mat ? ' · ' + esc(mat.nome) : ''}</p>
            </div>
            <button type="button" class="btn-del-leitura text-slate-400 hover:text-rose-600 text-xs cursor-pointer" data-id="${l.id}" title="Excluir leitura">✕</button>
          </div>
          <div class="nx-bar-track w-full h-1.5 rounded-full bg-slate-200 overflow-hidden">
            <div class="nx-bar-fill h-full rounded-full bg-emerald-600" style="width: ${pct}%;"></div>
          </div>
          <div class="flex items-center justify-between gap-2 text-[11px]">
            <div class="flex items-center gap-1.5">
              <input type="number" min="0" max="${l.total_paginas}" class="inp-leitura-pags w-16 px-2 py-0.5 text-xs border border-slate-200 bg-white rounded" value="${l.paginas_lidas}" data-id="${l.id}" />
              <span class="text-slate-500">/ ${l.total_paginas} págs. (${pct}%)</span>
            </div>
            <button type="button" class="btn-leitura-fichamento text-emerald-800 font-semibold hover:underline cursor-pointer" data-titulo="${esc(l.titulo)}" data-mat="${l.materia_id || ''}">+ Fichamento</button>
          </div>
        </div>
      `;
    }).join('');

    box.querySelectorAll('.inp-leitura-pags').forEach(inp => {
      inp.addEventListener('change', async () => {
        await apiReq(`/api/estudos-os/leituras/${inp.getAttribute('data-id')}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paginas_lidas: parseInt(inp.value, 10) || 0 })
        });
        await recarregar();
      });
    });

    box.querySelectorAll('.btn-leitura-fichamento').forEach(btn => {
      btn.addEventListener('click', async () => {
        const titulo = `Fichamento: ${btn.getAttribute('data-titulo')}`;
        const matId = btn.getAttribute('data-mat') || null;
        const resp = await apiReq('/api/estudos-os/paginas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ titulo, materia_id: matId, template: 'aula' })
        });
        await recarregar();
        if (resp?.data?.id && window.EstudosBlocos) window.EstudosBlocos.abrirPagina(resp.data.id);
        if (window.EstudosOS) window.EstudosOS.irParaSubaba('caderno');
      });
    });

    box.querySelectorAll('.btn-del-leitura').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.getAttribute('data-id'), 10);
        const l = leituras.find(x => x.id === id);
        if (!await confirmarExclusao('Excluir leitura?', l?.titulo, 'Este livro/PDF será removido do seu controle de leituras.', 'Excluir leitura')) return;
        await apiReq(`/api/estudos-os/leituras/${id}`, { method: 'DELETE' });
        await recarregar();
      });
    });
  }

  /* ---------------- 3. GRÁFICOS CHART.JS ---------------- */
  function renderizarGraficos() {
    if (typeof window.Chart !== 'function') return;
    const { materias, paginas, sessoes_foco } = getDados();

    const cHoras = document.getElementById('eosChartHoras');
    if (cHoras) {
      const labels = materias.length ? materias.map(m => m.nome) : ['Geral'];
      const valores = materias.length
        ? materias.map(m => (sessoes_foco || []).filter(s => s.materia_id === m.id).reduce((a, s) => a + (Number(s.duracao_min) || 0), 0))
        : [(sessoes_foco || []).reduce((a, s) => a + (Number(s.duracao_min) || 0), 0)];

      if (edState.chartHoras) edState.chartHoras.destroy();
      edState.chartHoras = new window.Chart(cHoras.getContext('2d'), {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Minutos focados',
            data: valores,
            backgroundColor: '#5b9086',
            hoverBackgroundColor: '#437268',
            borderRadius: 8
          }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
      });
    }

    const cDom = document.getElementById('eosChartDominio');
    if (cDom) {
      const counts = ['a_estudar', 'estudando', 'revisar', 'dominado'].map(st => paginas.filter(p => (p.status || 'a_estudar') === st).length);
      if (edState.chartDominio) edState.chartDominio.destroy();
      edState.chartDominio = new window.Chart(cDom.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: ['A estudar', 'Estudando', 'Revisar', 'Dominado'],
          datasets: [{
            data: counts,
            backgroundColor: ['#cfc9ba', '#7e8ab4', '#cfa468', '#5b9086'],
            borderColor: '#fffdf8',
            borderWidth: 2
          }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '66%' }
      });
    }
  }

  /* ---------------- 4. AMBIENTE DE FOCO (POMODORO + PLAYLIST) ---------------- */
  function atualizarDisplayPomodoro() {
    const disp = document.getElementById('eos-pomo-display');
    const modo = document.getElementById('eos-pomo-modo');
    const btn = document.getElementById('btn-eos-pomo-toggle');
    const m = String(Math.floor(edState.pomoSegundos / 60)).padStart(2, '0');
    const s = String(edState.pomoSegundos % 60).padStart(2, '0');
    if (disp) disp.textContent = `${m}:${s}`;
    if (modo) modo.textContent = edState.pomoModo === 'foco' ? 'Foco · 25 min' : 'Pausa · 5 min';
    if (btn) btn.textContent = edState.pomoRodando ? '⏸ Pausar' : '▶ Iniciar';

    const { sessoes_foco } = getDados();
    const badge = document.getElementById('eos-foco-sessoes-badge');
    if (badge) badge.textContent = `${(sessoes_foco || []).length} ${(sessoes_foco || []).length === 1 ? 'sessão' : 'sessões'}`;
  }

  function alternarPomodoro() {
    if (edState.pomoRodando) {
      clearInterval(edState.pomoTimer);
      edState.pomoRodando = false;
      atualizarDisplayPomodoro();
      return;
    }
    edState.pomoRodando = true;
    atualizarDisplayPomodoro();
    edState.pomoTimer = setInterval(async () => {
      if (edState.pomoSegundos > 0) {
        edState.pomoSegundos -= 1;
        atualizarDisplayPomodoro();
        return;
      }
      clearInterval(edState.pomoTimer);
      edState.pomoRodando = false;
      if (edState.pomoModo === 'foco') {
        const matId = document.getElementById('select-eos-pomo-materia')?.value || null;
        await apiReq('/api/estudos-os/sessoes-foco', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ materia_id: matId, duracao_min: 25 })
        }).catch(() => {});
        edState.pomoModo = 'pausa';
        edState.pomoSegundos = 5 * 60;
        await recarregar();
      } else {
        edState.pomoModo = 'foco';
        edState.pomoSegundos = 25 * 60;
      }
      atualizarDisplayPomodoro();
    }, 1000);
  }

  function carregarPlaylist() {
    const url = (document.getElementById('input-eos-playlist-url')?.value || '').trim();
    const box = document.getElementById('eos-playlist-embed');
    if (!box || !url) return;
    if (url.includes('open.spotify.com/')) {
      const embedUrl = url.replace('open.spotify.com/', 'open.spotify.com/embed/').split('?')[0];
      box.innerHTML = `<iframe class="w-full h-20 rounded-xl border border-slate-200" src="${esc(embedUrl)}" allow="encrypted-media" loading="lazy"></iframe>`;
      return;
    }
    const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]{11})/);
    if (yt) {
      box.innerHTML = `<iframe class="w-full h-36 rounded-xl border border-slate-200" src="https://www.youtube.com/embed/${yt[1]}" allowfullscreen loading="lazy"></iframe>`;
      return;
    }
    box.innerHTML = '<span class="text-rose-600">Cole um link válido do Spotify ou YouTube.</span>';
  }

  /* ---------------- 5. GROQ IA STUDY OS ---------------- */
  async function executarIA(e) {
    e.preventDefault();
    const promptVal = document.getElementById('input-eos-ia-prompt')?.value.trim();
    const statusEl = document.getElementById('eos-ia-status');
    const resEl = document.getElementById('eos-ia-resultado');
    if (!promptVal || !resEl) return;

    if (statusEl) statusEl.textContent = 'Consultando Groq IA...';
    resEl.classList.remove('hidden');
    resEl.innerHTML = '<p class="text-slate-500 animate-pulse">Processando...</p>';

    try {
      const payload = edState.iaModo === 'perguntar'
        ? { acao: 'perguntar', pergunta: promptVal }
        : { acao: edState.iaModo, texto: promptVal };
      const json = await apiReq('/api/estudos-os/ia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (statusEl) statusEl.textContent = 'Concluído ✓';

      if (edState.iaModo === 'perguntar') {
        resEl.innerHTML = `<div class="whitespace-pre-line leading-relaxed">${esc(json.data?.resposta || '')}</div>`;
      } else if (edState.iaModo === 'estruturar') {
        const blocos = Array.isArray(json.data?.blocos) ? json.data.blocos : [];
        resEl.innerHTML = `
          <p class="font-bold text-emerald-800">${blocos.length} blocos estruturados gerados!</p>
          <button type="button" id="btn-eos-ia-criar-pag" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 cursor-pointer">+ Criar Página no Caderno</button>
        `;
        document.getElementById('btn-eos-ia-criar-pag')?.addEventListener('click', async () => {
          const r = await apiReq('/api/estudos-os/paginas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ titulo: 'Nota Estruturada (IA)', blocos })
          });
          await recarregar();
          if (r?.data?.id && window.EstudosBlocos) window.EstudosBlocos.abrirPagina(r.data.id);
          if (window.EstudosOS) window.EstudosOS.irParaSubaba('caderno');
        });
      } else if (edState.iaModo === 'gerar_questoes') {
        const fcs = Array.isArray(json.data?.flashcards) ? json.data.flashcards : [];
        resEl.innerHTML = `
          <p class="font-bold text-emerald-800">${fcs.length} flashcards gerados!</p>
          <ul class="list-disc pl-4 space-y-1">${fcs.map(f => `<li><strong>${esc(f.frente)}</strong> — ${esc(f.verso)}</li>`).join('')}</ul>
          <button type="button" id="btn-eos-ia-salvar-fcs" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 cursor-pointer">+ Salvar nos Flashcards</button>
        `;
        document.getElementById('btn-eos-ia-salvar-fcs')?.addEventListener('click', async () => {
          for (const fc of fcs) {
            await apiReq('/api/estudos-os/flashcards', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ frente: fc.frente, verso: fc.verso })
            });
          }
          await recarregar();
          if (window.EstudosOS) window.EstudosOS.irParaSubaba('srs');
        });
      }
    } catch (err) {
      if (statusEl) statusEl.textContent = 'Erro';
      resEl.innerHTML = `<p class="text-rose-700">${esc(err.message)}</p>`;
    }
  }

  function inicializarEventos() {
    document.getElementById('btn-eos-pomo-toggle')?.addEventListener('click', alternarPomodoro);
    document.getElementById('btn-eos-pomo-reset')?.addEventListener('click', () => {
      clearInterval(edState.pomoTimer);
      edState.pomoRodando = false;
      edState.pomoModo = 'foco';
      edState.pomoSegundos = 25 * 60;
      atualizarDisplayPomodoro();
    });
    document.getElementById('btn-eos-playlist-carregar')?.addEventListener('click', carregarPlaylist);

    document.querySelectorAll('.btn-eos-ia-modo').forEach(btn => {
      btn.addEventListener('click', () => {
        edState.iaModo = btn.getAttribute('data-ia-modo');
        document.querySelectorAll('.btn-eos-ia-modo').forEach(b => {
          const ativo = b === btn;
          b.className = ativo
            ? 'btn-eos-ia-modo px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-700 text-white cursor-pointer'
            : 'btn-eos-ia-modo px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 cursor-pointer';
        });
        const inp = document.getElementById('input-eos-ia-prompt');
        if (inp) {
          inp.placeholder = edState.iaModo === 'perguntar'
            ? 'Ex.: Quais tópicos eu estudei esta semana mas ainda não revisei?'
            : edState.iaModo === 'estruturar'
              ? 'Cole aqui suas anotações bagunçadas para a IA organizar em blocos...'
              : 'Cole o conteúdo ou resumo para a IA gerar flashcards de Active Recall...';
        }
      });
    });

    document.getElementById('form-eos-ia')?.addEventListener('submit', executarIA);

    document.getElementById('form-eos-prova')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await apiReq('/api/estudos-os/provas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: document.getElementById('input-eos-prova-titulo')?.value.trim(),
          materia_id: document.getElementById('select-eos-prova-materia')?.value || null,
          data: document.getElementById('input-eos-prova-data')?.value || '',
          nota: document.getElementById('input-eos-prova-nota')?.value,
          peso: document.getElementById('input-eos-prova-peso')?.value || 1
        })
      });
      e.target.reset();
      await recarregar();
    });

    document.getElementById('form-eos-leitura')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await apiReq('/api/estudos-os/leituras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: document.getElementById('input-eos-leitura-titulo')?.value.trim(),
          autor: document.getElementById('input-eos-leitura-autor')?.value.trim(),
          tipo: document.getElementById('select-eos-leitura-tipo')?.value || 'livro',
          materia_id: document.getElementById('select-eos-leitura-materia')?.value || null,
          total_paginas: document.getElementById('input-eos-leitura-total')?.value || 100
        })
      });
      e.target.reset();
      await recarregar();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializarEventos);
  } else {
    inicializarEventos();
  }

  window.EstudosDesempenho = {
    renderizarTudo: () => {
      preencherSelectsMaterias();
      renderizarProvas();
      renderizarLeituras();
      renderizarGraficos();
      atualizarDisplayPomodoro();
    }
  };
})();
