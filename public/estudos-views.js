/**
 * estudos-views.js — Fase 3 do Study OS:
 * Múltiplas Visualizações (Galeria, Tabela, Kanban com Drag & Drop, Calendário)
 * + Active Recall & SRS SM-2 (Revisões de Hoje, Flashcards e Banco de Erros).
 */
(function () {
  'use strict';

  const evState = {
    dbView: 'galeria',
    dragPaginaId: null
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
    return window.EstudosOS ? window.EstudosOS.getDados() : { materias: [], paginas: [], flashcards: [], erros: [], provas: [] };
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

  /* ---------------- 1. FILTROS & MÚLTIPLAS VIEWS ---------------- */
  function preencherFiltros() {
    const { materias } = getDados();
    const opts = '<option value="">Todas as matérias</option>' +
      materias.map(m => `<option value="${m.id}">${esc(m.nome)}</option>`).join('');

    for (const id of ['eos-filtro-materia', 'select-eos-erro-materia', 'select-eos-fc-materia']) {
      const sel = document.getElementById(id);
      if (!sel) continue;
      const atual = sel.value;
      sel.innerHTML = (id === 'eos-filtro-materia' ? opts : '<option value="">Sem matéria</option>' + materias.map(m => `<option value="${m.id}">${esc(m.nome)}</option>`).join(''));
      if (atual) sel.value = atual;
    }
  }

  function filtrarPaginas() {
    const { paginas } = getDados();
    const matId = document.getElementById('eos-filtro-materia')?.value || '';
    const st = document.getElementById('eos-filtro-status')?.value || '';
    return paginas.filter(p => {
      if (matId && String(p.materia_id || '') !== matId) return false;
      if (st && p.status !== st) return false;
      return true;
    });
  }

  function alternarDbView(view) {
    evState.dbView = view;
    const filtros = document.getElementById('eos-filtros-paginas');
    if (filtros) filtros.hidden = view === 'galeria';
    const map = {
      galeria: 'eos-materias-grid',
      tabela: 'eos-view-tabela',
      kanban: 'eos-view-kanban',
      calendario: 'eos-view-calendario'
    };
    Object.entries(map).forEach(([k, id]) => {
      document.getElementById(id)?.classList.toggle('hidden', k !== view);
    });
    document.querySelectorAll('.btn-eos-dbview').forEach(btn => {
      const ativo = btn.getAttribute('data-dbview') === view;
      btn.className = ativo
        ? 'btn-eos-dbview px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-700 text-white cursor-pointer'
        : 'btn-eos-dbview px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-white border border-slate-200 cursor-pointer';
    });
    renderizarViewsDatabase();
  }

  function renderizarTabela(paginasFiltradas) {
    const box = document.getElementById('eos-view-tabela');
    if (!box) return;
    const { materias } = getDados();

    if (!paginasFiltradas.length) {
      box.innerHTML = '<p class="text-xs text-slate-400 text-center py-8 border border-dashed border-slate-200 rounded-xl">Nenhuma página encontrada para os filtros atuais.</p>';
      return;
    }

    box.innerHTML = `
      <table class="w-full text-left border-collapse text-xs">
        <thead>
          <tr class="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <th class="py-2.5 px-3">Título</th>
            <th class="py-2.5 px-3">Matéria</th>
            <th class="py-2.5 px-3">Status</th>
            <th class="py-2.5 px-3">Prioridade</th>
            <th class="py-2.5 px-3">Próx. Revisão</th>
            <th class="py-2.5 px-3 text-right">Ações</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          ${paginasFiltradas.map(p => {
            const mat = materias.find(m => m.id === p.materia_id);
            return `
              <tr class="hover:bg-slate-50/80 transition">
                <td class="py-2.5 px-3 font-semibold text-slate-900">
                  <button type="button" class="btn-abrir-no-caderno hover:text-emerald-700 hover:underline text-left cursor-pointer" data-id="${p.id}">${esc(p.titulo)}</button>
                </td>
                <td class="py-2.5 px-3 text-slate-600">${mat ? esc(mat.nome) : '—'}</td>
                <td class="py-2.5 px-3">
                  <select class="sel-tbl-status px-2 py-1 text-[11px] font-semibold rounded-md border border-slate-200 bg-white cursor-pointer" data-id="${p.id}">
                    <option value="a_estudar" ${p.status === 'a_estudar' ? 'selected' : ''}>A estudar</option>
                    <option value="estudando" ${p.status === 'estudando' ? 'selected' : ''}>Estudando</option>
                    <option value="revisar" ${p.status === 'revisar' ? 'selected' : ''}>Revisar</option>
                    <option value="dominado" ${p.status === 'dominado' ? 'selected' : ''}>Dominado</option>
                  </select>
                </td>
                <td class="py-2.5 px-3">
                  <select class="sel-tbl-prio px-2 py-1 text-[11px] rounded-md border border-slate-200 bg-white cursor-pointer" data-id="${p.id}">
                    <option value="baixa" ${p.prioridade === 'baixa' ? 'selected' : ''}>Baixa</option>
                    <option value="media" ${p.prioridade === 'media' ? 'selected' : ''}>Média</option>
                    <option value="alta" ${p.prioridade === 'alta' ? 'selected' : ''}>Alta</option>
                  </select>
                </td>
                <td class="py-2.5 px-3 font-mono text-[11px] text-slate-600">${p.proxima_revisao ? esc(p.proxima_revisao) : 'Não agendada'}</td>
                <td class="py-2.5 px-3 text-right">
                  <button type="button" class="btn-tbl-del text-rose-500 hover:text-rose-700 p-1 rounded cursor-pointer" data-id="${p.id}" title="Excluir">✕</button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;

    box.querySelectorAll('.btn-abrir-no-caderno').forEach(b => {
      b.addEventListener('click', () => {
        const id = parseInt(b.getAttribute('data-id'), 10);
        if (window.EstudosBlocos) window.EstudosBlocos.abrirPagina(id);
        if (window.EstudosOS) window.EstudosOS.irParaSubaba('caderno');
      });
    });

    box.querySelectorAll('.sel-tbl-status').forEach(sel => {
      sel.addEventListener('change', async () => {
        await apiReq(`/api/estudos-os/paginas/${sel.getAttribute('data-id')}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: sel.value })
        });
        await recarregar();
      });
    });

    box.querySelectorAll('.sel-tbl-prio').forEach(sel => {
      sel.addEventListener('change', async () => {
        await apiReq(`/api/estudos-os/paginas/${sel.getAttribute('data-id')}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prioridade: sel.value })
        });
        await recarregar();
      });
    });

    box.querySelectorAll('.btn-tbl-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.getAttribute('data-id'), 10);
        const pag = paginasFiltradas.find(p => p.id === id);
        if (!await confirmarExclusao('Excluir página?', pag?.titulo, 'A página será removida permanentemente do seu caderno.', 'Excluir página')) return;
        await apiReq(`/api/estudos-os/paginas/${id}`, { method: 'DELETE' });
        await recarregar();
      });
    });
  }

  function renderizarKanban(paginasFiltradas) {
    const box = document.getElementById('eos-view-kanban');
    if (!box) return;
    const { materias } = getDados();
    const colunas = [
      { key: 'a_estudar', titulo: 'A estudar', cor: 'border-slate-200 bg-slate-50/70' },
      { key: 'estudando', titulo: 'Estudando', cor: 'border-indigo-200 bg-indigo-50/40' },
      { key: 'revisar', titulo: 'Revisar', cor: 'border-amber-200 bg-amber-50/40' },
      { key: 'dominado', titulo: 'Dominado ✓', cor: 'border-emerald-200 bg-emerald-50/50' }
    ];

    box.innerHTML = colunas.map(col => {
      const itens = paginasFiltradas.filter(p => (p.status || 'a_estudar') === col.key);
      return `
        <div class="kanban-col rounded-xl border p-3 space-y-2.5 min-h-[220px] ${col.cor}" data-status="${col.key}">
          <div class="flex items-center justify-between pb-2 border-b border-slate-200/70">
            <span class="text-xs font-bold text-slate-800">${col.titulo}</span>
            <span class="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600">${itens.length}</span>
          </div>
          <div class="space-y-2">
            ${itens.map(p => {
              const mat = materias.find(m => m.id === p.materia_id);
              return `
                <div class="kanban-card p-3 rounded-xl bg-white border border-slate-200/90 shadow-2xs cursor-grab hover:border-emerald-300 transition space-y-1.5" draggable="true" data-id="${p.id}">
                  <p class="text-xs font-semibold text-slate-900 line-clamp-2">${esc(p.titulo)}</p>
                  <div class="flex items-center justify-between text-[10px] text-slate-500">
                    <span class="truncate">${mat ? esc(mat.nome) : 'Geral'}</span>
                    <button type="button" class="btn-kanban-open text-emerald-700 font-semibold hover:underline cursor-pointer" data-id="${p.id}">Abrir</button>
                  </div>
                </div>
              `;
            }).join('') || '<p class="text-[11px] text-slate-400 text-center py-6">Arraste cartões para cá</p>'}
          </div>
        </div>
      `;
    }).join('');

    box.querySelectorAll('.kanban-card').forEach(card => {
      card.addEventListener('dragstart', () => {
        evState.dragPaginaId = parseInt(card.getAttribute('data-id'), 10);
        card.classList.add('opacity-50');
      });
      card.addEventListener('dragend', () => {
        evState.dragPaginaId = null;
        card.classList.remove('opacity-50');
      });
    });

    box.querySelectorAll('.kanban-col').forEach(col => {
      col.addEventListener('dragover', e => e.preventDefault());
      col.addEventListener('drop', async (e) => {
        e.preventDefault();
        if (!evState.dragPaginaId) return;
        const novoStatus = col.getAttribute('data-status');
        const id = evState.dragPaginaId;
        await apiReq(`/api/estudos-os/paginas/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: novoStatus })
        });
        await recarregar();
        if (novoStatus === 'dominado' && typeof window.nxCelebrate === 'function') {
          window.nxCelebrate(col);
        }
      });
    });

    box.querySelectorAll('.btn-kanban-open').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.getAttribute('data-id'), 10);
        if (window.EstudosBlocos) window.EstudosBlocos.abrirPagina(id);
        if (window.EstudosOS) window.EstudosOS.irParaSubaba('caderno');
      });
    });
  }

  function renderizarCalendario(paginasFiltradas) {
    const box = document.getElementById('eos-view-calendario');
    if (!box) return;
    const { materias, provas } = getDados();
    const eventos = [];

    paginasFiltradas.forEach(p => {
      if (p.proxima_revisao) {
        const mat = materias.find(m => m.id === p.materia_id);
        eventos.push({ data: p.proxima_revisao.slice(0, 10), tipo: 'Revisão SRS', titulo: p.titulo, sub: mat ? mat.nome : 'Geral', id: p.id });
      }
    });
    (provas || []).forEach(pr => {
      if (pr.data) {
        const mat = materias.find(m => m.id === pr.materia_id);
        eventos.push({ data: pr.data.slice(0, 10), tipo: 'Prova / Entrega', titulo: pr.titulo, sub: mat ? mat.nome : 'Geral' });
      }
    });

    eventos.sort((a, b) => a.data.localeCompare(b.data));
    if (!eventos.length) {
      box.innerHTML = '<p class="text-xs text-slate-400 text-center py-8 border border-dashed border-slate-200 rounded-xl">Nenhuma revisão ou prova agendada ainda. Revise tópicos na aba <strong>Revisões & Flashcards</strong>.</p>';
      return;
    }

    box.innerHTML = eventos.map(ev => `
      <div class="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50/80 border border-slate-200/80">
        <div class="flex items-center gap-3 min-w-0">
          <span class="font-mono text-xs font-bold px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-emerald-800 shrink-0">${esc(ev.data)}</span>
          <div class="min-w-0">
            <p class="text-xs font-bold text-slate-900 truncate">${esc(ev.titulo)}</p>
            <p class="text-[11px] text-slate-500">${esc(ev.tipo)} · ${esc(ev.sub)}</p>
          </div>
        </div>
        ${ev.id ? `<button type="button" class="btn-cal-open text-xs font-semibold text-emerald-800 hover:underline shrink-0 cursor-pointer" data-id="${ev.id}">Abrir →</button>` : ''}
      </div>
    `).join('');

    box.querySelectorAll('.btn-cal-open').forEach(btn => {
      btn.addEventListener('click', () => {
        if (window.EstudosBlocos) window.EstudosBlocos.abrirPagina(parseInt(btn.getAttribute('data-id'), 10));
        if (window.EstudosOS) window.EstudosOS.irParaSubaba('caderno');
      });
    });
  }

  function renderizarViewsDatabase() {
    preencherFiltros();
    const filtradas = filtrarPaginas();
    if (evState.dbView === 'tabela') renderizarTabela(filtradas);
    else if (evState.dbView === 'kanban') renderizarKanban(filtradas);
    else if (evState.dbView === 'calendario') renderizarCalendario(filtradas);
  }

  /* ---------------- 2. REVISÕES DE HOJE, FLASHCARDS & BANCO DE ERROS ---------------- */
  function renderizarSRS() {
    preencherFiltros();
    const { materias, paginas, flashcards, erros } = getDados();
    const { paginas: revPaginas, flashcards: revFlash } = window.EstudosOS.obterRevisoesPendentes();
    const totalHoje = revPaginas.length + revFlash.length;

    const badge = document.getElementById('eos-srs-hoje-badge');
    if (badge) badge.textContent = `${totalHoje} ${totalHoje === 1 ? 'pendente' : 'pendentes'}`;

    const revBox = document.getElementById('eos-revisoes-hoje-list');
    if (revBox) {
      if (totalHoje === 0) {
        revBox.innerHTML = '<div class="py-8 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">Tudo em dia! Nenhuma revisão pendente para hoje 🎉</div>';
      } else {
        const itensHtml = [
          ...revPaginas.map(p => {
            const mat = materias.find(m => m.id === p.materia_id);
            return `
              <div class="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div class="min-w-0">
                  <span class="text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">Página</span>
                  <p class="text-xs font-bold text-slate-900 mt-1 truncate">${esc(p.titulo)}</p>
                  <p class="text-[11px] text-slate-500">${mat ? esc(mat.nome) : 'Geral'} · Intervalo atual: ${p.intervalo_dias || 0}d</p>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                  <button type="button" class="btn-srs-rate px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 cursor-pointer" data-kind="paginas" data-id="${p.id}" data-nivel="dificil">Difícil</button>
                  <button type="button" class="btn-srs-rate px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 cursor-pointer" data-kind="paginas" data-id="${p.id}" data-nivel="medio">Médio</button>
                  <button type="button" class="btn-srs-rate px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 cursor-pointer" data-kind="paginas" data-id="${p.id}" data-nivel="facil">Fácil</button>
                </div>
              </div>
            `;
          }),
          ...revFlash.map(f => {
            const mat = materias.find(m => m.id === f.materia_id);
            return `
              <div class="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div class="min-w-0">
                  <span class="text-[10px] font-bold uppercase tracking-wider text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">Flashcard</span>
                  <p class="text-xs font-bold text-slate-900 mt-1">${esc(f.frente)}</p>
                  <details class="mt-1 text-[11px] text-slate-600"><summary class="cursor-pointer font-semibold text-emerald-800">Mostrar resposta</summary><p class="mt-1 p-2 rounded bg-white border border-slate-200">${esc(f.verso)}</p></details>
                  <p class="text-[10px] text-slate-400 mt-1">${mat ? esc(mat.nome) : 'Geral'}</p>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                  <button type="button" class="btn-srs-rate px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 cursor-pointer" data-kind="flashcards" data-id="${f.id}" data-nivel="dificil">Difícil</button>
                  <button type="button" class="btn-srs-rate px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 cursor-pointer" data-kind="flashcards" data-id="${f.id}" data-nivel="medio">Médio</button>
                  <button type="button" class="btn-srs-rate px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 cursor-pointer" data-kind="flashcards" data-id="${f.id}" data-nivel="facil">Fácil</button>
                </div>
              </div>
            `;
          })
        ];
        revBox.innerHTML = itensHtml.join('');

        revBox.querySelectorAll('.btn-srs-rate').forEach(btn => {
          btn.addEventListener('click', async () => {
            const kind = btn.getAttribute('data-kind');
            const id = btn.getAttribute('data-id');
            const nivel = btn.getAttribute('data-nivel');
            const grupo = btn.parentElement;
            const botoes = grupo.querySelectorAll('button');
            botoes.forEach(botao => { botao.disabled = true; });
            try {
              await apiReq(`/api/estudos-os/${kind}/${id}/revisar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nivel })
              });
              await recarregar();
            } catch (erro) {
              let aviso = grupo.querySelector('[role="alert"]');
              if (!aviso) {
                aviso = document.createElement('span');
                aviso.setAttribute('role', 'alert');
                aviso.className = 'text-xs text-rose-700';
                grupo.append(aviso);
              }
              aviso.textContent = erro.message;
            } finally {
              botoes.forEach(botao => { botao.disabled = false; });
            }
          });
        });
      }
    }

    // 2. Lista de Flashcards
    const fcBox = document.getElementById('eos-flashcards-list');
    if (fcBox) {
      if (!flashcards.length) {
        fcBox.innerHTML = '<p class="text-xs text-slate-400 text-center py-8 border border-dashed border-slate-200 rounded-xl">Nenhum flashcard criado ainda.</p>';
      } else {
        fcBox.innerHTML = flashcards.slice().reverse().map(f => {
          const mat = materias.find(m => m.id === f.materia_id);
          return `
            <div class="p-3 rounded-xl bg-slate-50/80 border border-slate-200/80 space-y-1.5">
              <div class="flex items-start justify-between gap-2">
                <p class="text-xs font-bold text-slate-900">${esc(f.frente)}</p>
                <button type="button" class="btn-del-fc text-slate-400 hover:text-rose-600 text-xs cursor-pointer" data-id="${f.id}" title="Excluir flashcard">✕</button>
              </div>
              <details class="text-xs text-slate-600">
                <summary class="cursor-pointer text-[11px] font-semibold text-emerald-800">Revelar verso</summary>
                <p class="mt-1 p-2 rounded-lg bg-white border border-slate-200">${esc(f.verso)}</p>
              </details>
              <div class="flex items-center justify-between text-[10px] text-slate-400">
                <span>${mat ? esc(mat.nome) : 'Geral'}</span>
                <span>Próx. revisão: ${esc(f.proxima_revisao || 'Hoje')}</span>
              </div>
            </div>
          `;
        }).join('');

        fcBox.querySelectorAll('.btn-del-fc').forEach(btn => {
          btn.addEventListener('click', async () => {
            const id = parseInt(btn.getAttribute('data-id'), 10);
            const fc = flashcards.find(x => x.id === id);
            if (!await confirmarExclusao('Excluir flashcard?', fc?.frente, 'Este cartão será removido do seu baralho SRS.', 'Excluir flashcard')) return;
            await apiReq(`/api/estudos-os/flashcards/${id}`, { method: 'DELETE' });
            await recarregar();
          });
        });
      }
    }

    // 3. Banco de Erros
    const errBox = document.getElementById('eos-erros-list');
    if (errBox) {
      if (!erros.length) {
        errBox.innerHTML = '<p class="text-xs text-slate-400 text-center py-6 border border-dashed border-slate-200 rounded-xl">Nenhum erro registrado ainda.</p>';
      } else {
        errBox.innerHTML = erros.slice().reverse().map(er => {
          const mat = materias.find(m => m.id === er.materia_id);
          const taxa = er.tentativas > 0 ? Math.round((er.acertos / er.tentativas) * 100) : 0;
          return `
            <div class="p-3 rounded-xl bg-slate-50/80 border border-slate-200/80 space-y-2">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-1.5 mb-1">
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">${esc(er.motivo_erro)}</span>
                    <span class="text-[10px] font-mono font-bold text-slate-600">Taxa: ${taxa}% (${er.acertos}/${er.tentativas})</span>
                  </div>
                  <p class="text-xs font-semibold text-slate-900">${esc(er.enunciado)}</p>
                  ${er.resolucao ? `<p class="text-[11px] text-slate-600 mt-1 p-2 rounded bg-white border border-slate-200">${esc(er.resolucao)}</p>` : ''}
                  <p class="text-[10px] text-slate-400 mt-1">${mat ? esc(mat.nome) : 'Geral'}</p>
                </div>
                <button type="button" class="btn-del-erro text-slate-400 hover:text-rose-600 text-xs cursor-pointer" data-id="${er.id}" title="Excluir">✕</button>
              </div>
              <div class="flex items-center gap-2 pt-1 border-t border-slate-200/60">
                <button type="button" class="btn-erro-tentativa px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 cursor-pointer" data-id="${er.id}" data-ok="1">✓ Acertei na revisão</button>
                <button type="button" class="btn-erro-tentativa px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 cursor-pointer" data-id="${er.id}" data-ok="0">✕ Errei</button>
              </div>
            </div>
          `;
        }).join('');

        errBox.querySelectorAll('.btn-erro-tentativa').forEach(btn => {
          btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            const acertou = btn.getAttribute('data-ok') === '1';
            await apiReq(`/api/estudos-os/erros/${id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ acertou })
            });
            await recarregar();
          });
        });

        errBox.querySelectorAll('.btn-del-erro').forEach(btn => {
          btn.addEventListener('click', async () => {
            const id = parseInt(btn.getAttribute('data-id'), 10);
            const er = erros.find(x => x.id === id);
            if (!await confirmarExclusao('Remover registro de erro?', er?.enunciado, 'Este item será excluído do Banco de Erros.', 'Remover erro')) return;
            await apiReq(`/api/estudos-os/erros/${id}`, { method: 'DELETE' });
            await recarregar();
          });
        });
      }
    }
  }

  function inicializarEventos() {
    document.querySelectorAll('.btn-eos-dbview').forEach(btn => {
      btn.addEventListener('click', () => alternarDbView(btn.getAttribute('data-dbview')));
    });

    document.getElementById('eos-filtro-materia')?.addEventListener('change', renderizarViewsDatabase);
    document.getElementById('eos-filtro-status')?.addEventListener('change', renderizarViewsDatabase);

    const modalFc = document.getElementById('modal-eos-flashcard');
    const toggleFc = (abrir) => {
      if (!modalFc) return;
      modalFc.classList.toggle('hidden', !abrir);
      modalFc.classList.toggle('flex', !!abrir);
    };

    document.getElementById('btn-eos-novo-flashcard')?.addEventListener('click', () => {
      preencherFiltros();
      toggleFc(true);
      document.getElementById('input-eos-fc-frente')?.focus();
    });
    document.getElementById('btn-fechar-eos-flashcard')?.addEventListener('click', () => toggleFc(false));
    document.getElementById('btn-cancelar-eos-flashcard')?.addEventListener('click', () => toggleFc(false));

    document.getElementById('form-eos-flashcard')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const materia_id = document.getElementById('select-eos-fc-materia')?.value || null;
      const frente = document.getElementById('input-eos-fc-frente')?.value.trim();
      const verso = document.getElementById('input-eos-fc-verso')?.value.trim();
      if (!frente || !verso) return;
      await apiReq('/api/estudos-os/flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ materia_id, frente, verso })
      });
      e.target.reset();
      toggleFc(false);
      await recarregar();
    });

    document.getElementById('form-eos-erro')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const enunciado = document.getElementById('input-eos-erro-enunciado')?.value.trim();
      const materia_id = document.getElementById('select-eos-erro-materia')?.value || null;
      const motivo_erro = document.getElementById('input-eos-erro-motivo')?.value.trim();
      const resolucao = document.getElementById('input-eos-erro-resolucao')?.value.trim();
      if (!enunciado) return;
      await apiReq('/api/estudos-os/erros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enunciado, materia_id, motivo_erro, resolucao })
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

  window.EstudosViews = {
    renderizarTudo: () => {
      renderizarViewsDatabase();
      renderizarSRS();
    }
  };
})();
