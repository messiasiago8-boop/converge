/**
 * estudos-os.js — Fase 1 da Central Study OS (Educação Avançada).
 * Gerencia Matérias relacionais, Páginas/Tópicos e navegação interna
 * mantendo 100% de compatibilidade com Catálogo de Vídeos e Cronograma.
 */
(function () {
  'use strict';

  const eosState = {
    dados: {
      materias: [],
      paginas: [],
      synced_blocks: {},
      flashcards: [],
      erros: [],
      provas: [],
      leituras: [],
      sessoes_foco: []
    },
    subabaAtual: 'overview',
    carregando: null
  };

  const CORES_MATERIA = {
    sage: { pill: 'bg-emerald-50 text-emerald-800 border-emerald-200', dot: 'bg-emerald-600', label: 'Sálvia' },
    dusk: { pill: 'bg-indigo-50 text-indigo-800 border-indigo-200', dot: 'bg-indigo-500', label: 'Lavanda' },
    honey: { pill: 'bg-amber-50 text-amber-800 border-amber-200', dot: 'bg-amber-500', label: 'Mel' },
    clay: { pill: 'bg-rose-50 text-rose-800 border-rose-200', dot: 'bg-rose-500', label: 'Argila' }
  };

  const STATUS_PAGINA = {
    a_estudar: { label: 'A estudar', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
    estudando: { label: 'Estudando', cls: 'bg-indigo-50 text-indigo-800 border-indigo-200' },
    revisar: { label: 'Revisar', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
    dominado: { label: 'Dominado', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' }
  };

  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  async function apiEstudos(url, options = {}) {
    const token = localStorage.getItem('token');
    const headers = { ...(options.headers || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(url, { ...options, headers });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.success === false) {
      throw new Error(json.message || `Erro HTTP ${res.status}`);
    }
    return json;
  }

  function obterRevisoesPendentes() {
    const { paginas, flashcards } = eosState.dados;
    const hoje = new Date().toISOString().slice(0, 10);
    const venceu = item => item.proxima_revisao.slice(0, 10) <= hoje;
    return {
      paginas: paginas.filter(p => p.proxima_revisao ? venceu(p) : p.status === 'revisar'),
      flashcards: flashcards.filter(f => !f.proxima_revisao || venceu(f))
    };
  }

  function atualizarKPIs() {
    const { materias, paginas, provas, leituras } = eosState.dados;
    const revisoes = obterRevisoesPendentes();
    const revPendentes = revisoes.paginas.length + revisoes.flashcards.length;

    const animar = (id, val) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (typeof window.nxAnimateNumber === 'function') window.nxAnimateNumber(el, val, '', 550);
      else el.textContent = String(val);
    };

    animar('eos-kpi-materias', materias.length);
    animar('eos-kpi-paginas', paginas.length);
    animar('eos-kpi-revisoes', revPendentes);
    animar('eos-kpi-provas', provas.length + leituras.length);

    const badge = document.getElementById('sidebar-estudos-os-count');
    if (badge) badge.textContent = String(materias.length + paginas.length);
  }

  function preencherSelectMaterias() {
    const sel = document.getElementById('select-eos-pagina-materia');
    if (!sel) return;
    const atual = sel.value;
    sel.innerHTML = '<option value="">Sem matéria</option>' +
      eosState.dados.materias.map(m => `<option value="${m.id}">${esc(m.nome)}</option>`).join('');
    if (atual) sel.value = atual;
  }

  function renderizarOverview() {
    const boxMat = document.getElementById('eos-overview-materias');
    const boxPag = document.getElementById('eos-overview-paginas');
    const { materias, paginas } = eosState.dados;

    if (boxMat) {
      if (materias.length === 0) {
        boxMat.innerHTML = '<p class="text-slate-400 py-4 text-center border border-dashed border-slate-200 rounded-xl">Nenhuma matéria cadastrada. Clique em <strong>+ Nova Matéria</strong> acima.</p>';
      } else {
        boxMat.innerHTML = materias.slice(0, 5).map(m => {
          const cor = CORES_MATERIA[m.cor] || CORES_MATERIA.sage;
          const totalPag = paginas.filter(p => p.materia_id === m.id).length;
          return `
            <div class="flex items-center justify-between p-2.5 rounded-xl bg-slate-50/80 border border-slate-200/80">
              <div class="flex items-center gap-2.5 min-w-0">
                <span class="w-2.5 h-2.5 rounded-full shrink-0 ${cor.dot}"></span>
                <span class="font-semibold text-slate-800 truncate">${esc(m.nome)}</span>
              </div>
              <span class="text-[11px] font-medium text-slate-500 shrink-0">${totalPag} ${totalPag === 1 ? 'página' : 'páginas'}</span>
            </div>
          `;
        }).join('');
      }
    }

    if (boxPag) {
      if (paginas.length === 0) {
        boxPag.innerHTML = '<p class="text-slate-400 py-4 text-center border border-dashed border-slate-200 rounded-xl">Nenhuma página criada ainda. Clique em <strong>+ Nova Página</strong> para começar.</p>';
      } else {
        boxPag.innerHTML = paginas.slice(-5).reverse().map(p => {
          const st = STATUS_PAGINA[p.status] || STATUS_PAGINA.a_estudar;
          const mat = materias.find(m => m.id === p.materia_id);
          return `
            <div class="flex items-center justify-between p-2.5 rounded-xl bg-slate-50/80 border border-slate-200/80 gap-2">
              <div class="min-w-0">
                <p class="font-semibold text-slate-800 truncate">${esc(p.titulo)}</p>
                <p class="text-[10px] text-slate-500 truncate">${mat ? esc(mat.nome) : 'Geral'}</p>
              </div>
              <span class="text-[10px] font-semibold px-2 py-0.5 rounded-md border shrink-0 ${st.cls}">${st.label}</span>
            </div>
          `;
        }).join('');
      }
    }
  }

  function renderizarMaterias() {
    const grid = document.getElementById('eos-materias-grid');
    if (!grid) return;
    const { materias, paginas } = eosState.dados;

    if (materias.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full py-10 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/60">
          <p class="text-sm font-semibold text-slate-700">Nenhuma matéria cadastrada</p>
          <p class="text-xs text-slate-500 mt-1">Crie sua primeira disciplina para organizar páginas, flashcards e provas.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = materias.map(m => {
      const cor = CORES_MATERIA[m.cor] || CORES_MATERIA.sage;
      const pagsMat = paginas.filter(p => p.materia_id === m.id);
      const dominadas = pagsMat.filter(p => p.status === 'dominado').length;
      const pct = pagsMat.length > 0 ? Math.round((dominadas / pagsMat.length) * 100) : 0;

      return `
        <div class="nx-card-alive p-4 rounded-xl bg-slate-50/70 hover:bg-white border border-slate-200/90 space-y-3">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <span class="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${cor.pill}">
                <span class="w-1.5 h-1.5 rounded-full ${cor.dot}"></span>
                ${cor.label}
              </span>
              <h4 class="text-sm font-bold text-slate-900 mt-2 truncate" title="${esc(m.nome)}">${esc(m.nome)}</h4>
            </div>
            <button type="button" class="btn-eos-del-materia text-slate-400 hover:text-rose-600 p-1 rounded cursor-pointer text-xs" data-id="${m.id}" title="Excluir matéria">✕</button>
          </div>
          <div class="space-y-1">
            <div class="flex justify-between text-[11px] font-semibold text-slate-600">
              <span>${pagsMat.length} páginas · ${dominadas} dominadas</span>
              <span>${pct}%</span>
            </div>
            <div class="nx-bar-track w-full h-1.5 rounded-full bg-slate-200 overflow-hidden">
              <div class="nx-bar-fill h-full rounded-full bg-emerald-600" style="width: ${pct}%;"></div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    grid.querySelectorAll('.btn-eos-del-materia').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.getAttribute('data-id'), 10);
        const matObj = materias.find(m => m.id === id);
        const ok = typeof window.nxConfirmarExclusao === 'function'
          ? await window.nxConfirmarExclusao({
              titulo: 'Remover matéria?',
              nomeItem: matObj ? matObj.nome : '',
              descricao: 'A disciplina será removida, mas suas páginas vinculadas serão preservadas.',
              textoConfirmar: 'Remover matéria'
            })
          : confirm('Remover esta matéria? As páginas vinculadas serão preservadas.');
        if (!ok) return;
        await apiEstudos(`/api/estudos-os/materias/${id}`, { method: 'DELETE' });
        await carregar();
      });
    });
  }

  function renderizarPaginas() {
    if (window.EstudosBlocos && typeof window.EstudosBlocos.atualizarPainelCaderno === 'function') {
      window.EstudosBlocos.atualizarPainelCaderno();
    }
  }

  function renderizarTudo() {
    atualizarKPIs();
    preencherSelectMaterias();
    renderizarOverview();
    renderizarMaterias();
    renderizarPaginas();
    if (window.EstudosViews && typeof window.EstudosViews.renderizarTudo === 'function') {
      window.EstudosViews.renderizarTudo();
    }
    if (window.EstudosDesempenho && typeof window.EstudosDesempenho.renderizarTudo === 'function') {
      window.EstudosDesempenho.renderizarTudo();
    }
  }

  async function carregar() {
    // Uma atualização solicitada após gravar precisa consultar o servidor novamente.
    const anterior = eosState.carregando;
    const consulta = (async () => {
      await anterior;
      try {
        const editor = window.EstudosBlocos;
        let gravacoes;
        let data;
        do {
          gravacoes = editor?.gravacoesEmCurso();
          await gravacoes;
          ({ data } = await apiEstudos('/api/estudos-os', { cache: 'no-store' }));
        } while (gravacoes !== editor?.gravacoesEmCurso());
        if (data) {
          window.EstudosBlocos?.preservarEdicoes(data);
          eosState.dados = data;
          renderizarTudo();
        }
      } catch (e) {
        console.warn('[EstudosOS] Falha ao carregar dados:', e.message);
      }
      return eosState.dados;
    })();
    eosState.carregando = consulta;
    try {
      return await consulta;
    } finally {
      if (eosState.carregando === consulta) eosState.carregando = null;
    }
  }

  function irParaSubaba(subaba = 'overview') {
    const validas = ['overview', 'databases', 'caderno', 'srs', 'desempenho'];
    const alvo = validas.includes(subaba) ? subaba : 'overview';
    eosState.subabaAtual = alvo;

    validas.forEach(tab => {
      const panel = document.getElementById(`eos-panel-${tab}`);
      if (panel) panel.classList.toggle('hidden', tab !== alvo);
    });

    document.querySelectorAll('.btn-eos-tab').forEach(btn => {
      const ativo = btn.getAttribute('data-eos-tab') === alvo;
      btn.className = ativo
        ? 'btn-eos-tab px-3.5 py-2 rounded-xl text-xs font-bold bg-white text-slate-900 border border-slate-300 shadow-2xs cursor-pointer'
        : 'btn-eos-tab px-3.5 py-2 rounded-xl text-xs font-medium text-slate-600 bg-slate-100 hover:bg-white border border-transparent hover:border-slate-200 transition cursor-pointer';
    });
  }

  function toggleModal(id, abrir) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.toggle('hidden', !abrir);
    modal.classList.toggle('flex', !!abrir);
  }

  function inicializarEventos() {
    document.querySelectorAll('.btn-eos-tab').forEach(btn => {
      btn.addEventListener('click', () => irParaSubaba(btn.getAttribute('data-eos-tab')));
    });

    document.querySelectorAll('[data-eos-atalho]').forEach(btn => {
      btn.addEventListener('click', () => {
        irParaSubaba(btn.dataset.eosAtalho);
        document.querySelector(`[data-eos-tab="${btn.dataset.eosAtalho}"]`)?.focus();
      });
    });

    document.getElementById('btn-eos-ir-videos')?.addEventListener('click', () => {
      if (typeof window.navIrParaLms === 'function') window.navIrParaLms();
    });

    document.getElementById('btn-eos-nova-materia')?.addEventListener('click', () => {
      toggleModal('modal-eos-materia', true);
      document.getElementById('input-eos-materia-nome')?.focus();
    });
    document.getElementById('btn-fechar-eos-materia')?.addEventListener('click', () => toggleModal('modal-eos-materia', false));
    document.getElementById('btn-cancelar-eos-materia')?.addEventListener('click', () => toggleModal('modal-eos-materia', false));

    document.getElementById('btn-eos-nova-pagina')?.addEventListener('click', () => {
      preencherSelectMaterias();
      toggleModal('modal-eos-pagina', true);
      document.getElementById('input-eos-pagina-titulo')?.focus();
    });
    document.getElementById('btn-fechar-eos-pagina')?.addEventListener('click', () => toggleModal('modal-eos-pagina', false));
    document.getElementById('btn-cancelar-eos-pagina')?.addEventListener('click', () => toggleModal('modal-eos-pagina', false));

    document.getElementById('form-eos-materia')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nome = document.getElementById('input-eos-materia-nome')?.value.trim();
      const cor = document.getElementById('select-eos-materia-cor')?.value || 'sage';
      const meta_horas = Number(document.getElementById('input-eos-materia-horas')?.value || 0);
      if (!nome) return;
      await apiEstudos('/api/estudos-os/materias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, cor, meta_horas })
      });
      e.target.reset();
      toggleModal('modal-eos-materia', false);
      await carregar();
      irParaSubaba('databases');
    });

    document.getElementById('form-eos-pagina')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const titulo = document.getElementById('input-eos-pagina-titulo')?.value.trim();
      const materia_id = document.getElementById('select-eos-pagina-materia')?.value || null;
      const parent_id = document.getElementById('input-eos-pagina-parent')?.value || null;
      const template = document.getElementById('select-eos-pagina-template')?.value || 'aula';
      if (!titulo) return;
      const resp = await apiEstudos('/api/estudos-os/paginas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titulo, materia_id, parent_id, template })
      });
      e.target.reset();
      const inpParent = document.getElementById('input-eos-pagina-parent');
      if (inpParent) inpParent.value = '';
      toggleModal('modal-eos-pagina', false);
      await carregar();
      if (resp?.data?.id && window.EstudosBlocos) {
        window.EstudosBlocos.abrirPagina(resp.data.id);
      }
      irParaSubaba('caderno');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializarEventos);
  } else {
    inicializarEventos();
  }

  window.EstudosOS = {
    carregar,
    irParaSubaba,
    obterRevisoesPendentes,
    getDados: () => eosState.dados
  };
})();
