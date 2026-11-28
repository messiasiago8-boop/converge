/**
 * estudos-blocos.js — Fase 2 do Study OS:
 * Editor em Blocos (Toggles, Callouts, LaTeX, Código, Embeds, Blocos Sincronizados),
 * Drag & Drop, Transformação de Blocos, Sumário Automático (TOC) e Hierarquia Infinita.
 */
(function () {
  'use strict';

  const ebState = {
    paginaAtivaId: null,
    dragIndex: null,
    saveTimer: null,
    syncedTimers: {}
  };

  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function novoId(prefix = 'b') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
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
    return window.EstudosOS ? window.EstudosOS.getDados() : { materias: [], paginas: [], synced_blocks: {} };
  }

  function getPaginaAtiva() {
    const { paginas } = getDados();
    return paginas.find(p => p.id === ebState.paginaAtivaId) || null;
  }

  function setStatus(texto, ok = true) {
    const el = document.getElementById('eos-editor-save-status');
    if (!el) return;
    el.textContent = texto;
    el.className = `text-[11px] font-semibold ${ok ? 'text-emerald-700' : 'text-amber-700'}`;
  }

  function agendarSalvamento() {
    setStatus('Salvando...', false);
    clearTimeout(ebState.saveTimer);
    ebState.saveTimer = setTimeout(() => salvarPaginaAtiva(), 650);
  }

  async function salvarPaginaAtiva() {
    const pag = getPaginaAtiva();
    if (!pag) return;
    try {
      await apiReq(`/api/estudos-os/paginas/${pag.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: pag.titulo,
          materia_id: pag.materia_id,
          status: pag.status,
          blocos: pag.blocos
        })
      });
      setStatus('Salvo ✓', true);
    } catch (e) {
      setStatus('Erro ao salvar', false);
      console.warn('[EstudosBlocos]', e.message);
    }
  }

  function salvarBlocoSincronizado(syncId, title, content) {
    const dados = getDados();
    if (!dados.synced_blocks) dados.synced_blocks = {};
    dados.synced_blocks[syncId] = {
      sync_id: syncId,
      title: title || 'Bloco Sincronizado',
      content: content || '',
      atualizado_em: new Date().toISOString()
    };
    setStatus('Sincronizando...', false);
    clearTimeout(ebState.syncedTimers[syncId]);
    ebState.syncedTimers[syncId] = setTimeout(async () => {
      try {
        await apiReq(`/api/estudos-os/synced-blocks/${encodeURIComponent(syncId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, content })
        });
        setStatus('Sincronizado ✓', true);
        renderizarSyncedDisponiveis();
      } catch (e) {
        setStatus('Erro ao sincronizar', false);
      }
    }, 550);
  }

  /* ---------------- 1. ÁRVORE HIERÁRQUICA INFINITA ---------------- */
  function renderizarArvore() {
    const container = document.getElementById('eos-arvore-paginas');
    if (!container) return;
    const { paginas, materias } = getDados();

    if (!paginas.length) {
      container.innerHTML = '<p class="text-[11px] text-slate-400 text-center py-6 border border-dashed border-slate-200 rounded-xl">Nenhuma página ainda. Clique em <strong>+ Raiz</strong>.</p>';
      return;
    }

    const porParent = new Map();
    paginas.forEach(p => {
      const pid = p.parent_id && paginas.some(x => x.id === p.parent_id) ? p.parent_id : 0;
      if (!porParent.has(pid)) porParent.set(pid, []);
      porParent.get(pid).push(p);
    });

    const renderRamo = (parentId, nivel) => {
      const filhos = porParent.get(parentId) || [];
      return filhos.map(p => {
        const ativo = p.id === ebState.paginaAtivaId;
        const mat = materias.find(m => m.id === p.materia_id);
        const pad = Math.min(nivel * 12, 48);
        return `
          <div class="space-y-0.5">
            <div class="group flex items-center justify-between gap-1 px-2 py-1.5 rounded-lg cursor-pointer transition ${ativo ? 'bg-emerald-50 text-emerald-900 border border-emerald-200 font-semibold' : 'hover:bg-slate-50 text-slate-700'}" style="margin-left:${pad}px" data-arvore-id="${p.id}">
              <div class="flex items-center gap-1.5 min-w-0 flex-1 btn-abrir-pag" data-id="${p.id}">
                <span class="text-[10px] opacity-70">${nivel > 0 ? '↳' : '📄'}</span>
                <span class="truncate">${esc(p.titulo)}</span>
                ${mat ? `<span class="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 shrink-0 hidden sm:inline">${esc(mat.nome)}</span>` : ''}
              </div>
              <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition shrink-0">
                <button type="button" class="btn-add-subpag px-1.5 py-0.5 text-[10px] text-emerald-700 hover:bg-emerald-100 rounded cursor-pointer" data-id="${p.id}" title="Nova subpágina">+</button>
                <button type="button" class="btn-del-pag px-1.5 py-0.5 text-[10px] text-rose-600 hover:bg-rose-50 rounded cursor-pointer" data-id="${p.id}" title="Excluir página">✕</button>
              </div>
            </div>
            ${renderRamo(p.id, nivel + 1)}
          </div>
        `;
      }).join('');
    };

    container.innerHTML = renderRamo(0, 0);

    container.querySelectorAll('.btn-abrir-pag').forEach(el => {
      el.addEventListener('click', () => abrirPagina(parseInt(el.getAttribute('data-id'), 10)));
    });
    container.querySelectorAll('.btn-add-subpag').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        abrirModalNovaPagina(parseInt(btn.getAttribute('data-id'), 10));
      });
    });
    container.querySelectorAll('.btn-del-pag').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = parseInt(btn.getAttribute('data-id'), 10);
        const pagObj = paginas.find(p => p.id === id);
        const ok = typeof window.nxConfirmarExclusao === 'function'
          ? await window.nxConfirmarExclusao({
              titulo: 'Excluir página de estudo?',
              nomeItem: pagObj ? pagObj.titulo : '',
              descricao: 'Esta página será removida do caderno. Subpáginas vinculadas serão mantidas na raiz.',
              textoConfirmar: 'Excluir página'
            })
          : confirm('Excluir esta página? Subpáginas serão mantidas na raiz.');
        if (!ok) return;
        await apiReq(`/api/estudos-os/paginas/${id}`, { method: 'DELETE' });
        if (ebState.paginaAtivaId === id) ebState.paginaAtivaId = null;
        if (window.EstudosOS) await window.EstudosOS.carregar();
      });
    });
  }

  function abrirModalNovaPagina(parentId = '') {
    const inpParent = document.getElementById('input-eos-pagina-parent');
    if (inpParent) inpParent.value = parentId ? String(parentId) : '';
    const modal = document.getElementById('modal-eos-pagina');
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      document.getElementById('input-eos-pagina-titulo')?.focus();
    }
  }

  /* ---------------- 2. SUMÁRIO AUTOMÁTICO & SYNCED LIST ---------------- */
  function renderizarTOC() {
    const nav = document.getElementById('eos-toc-list');
    if (!nav) return;
    const pag = getPaginaAtiva();
    const headings = pag && Array.isArray(pag.blocos)
      ? pag.blocos.filter(b => ['h1', 'h2', 'h3'].includes(b.type) && (b.content || '').trim())
      : [];

    if (!headings.length) {
      nav.innerHTML = '<p class="text-[11px] text-slate-400">Adicione blocos de título (H1–H3) para navegar rápido.</p>';
      return;
    }

    nav.innerHTML = headings.map(h => {
      const indent = h.type === 'h1' ? '' : h.type === 'h2' ? 'pl-3' : 'pl-6';
      return `<button type="button" class="btn-toc-jump w-full text-left py-1 px-2 rounded-lg hover:bg-emerald-50 hover:text-emerald-800 truncate transition cursor-pointer ${indent}" data-bloco-id="${esc(h.id)}">${esc(h.content)}</button>`;
    }).join('');

    nav.querySelectorAll('.btn-toc-jump').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = document.querySelector(`[data-block-id="${btn.getAttribute('data-bloco-id')}"]`);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          if (typeof window.nxCelebrate === 'function') window.nxCelebrate(target);
        }
      });
    });
  }

  function renderizarSyncedDisponiveis() {
    const box = document.getElementById('eos-synced-disponiveis');
    if (!box) return;
    const { synced_blocks } = getDados();
    const entries = Object.values(synced_blocks || {});
    if (!entries.length) {
      box.innerHTML = '<p class="text-[11px] text-slate-400">Nenhum bloco sincronizado criado ainda.</p>';
      return;
    }
    box.innerHTML = entries.map(sb => `
      <div class="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200/80">
        <span class="truncate font-medium text-slate-700">${esc(sb.title || 'Bloco Sincronizado')}</span>
        <button type="button" class="btn-inserir-synced px-2 py-0.5 text-[10px] font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded border border-emerald-200 shrink-0 cursor-pointer" data-sync-id="${esc(sb.sync_id)}">+ Inserir</button>
      </div>
    `).join('');

    box.querySelectorAll('.btn-inserir-synced').forEach(btn => {
      btn.addEventListener('click', () => {
        const pag = getPaginaAtiva();
        if (!pag) return;
        const syncId = btn.getAttribute('data-sync-id');
        pag.blocos.push({ id: novoId(), type: 'synced', props: { sync_id: syncId }, content: '' });
        renderizarBlocos();
        agendarSalvamento();
      });
    });
  }

  /* ---------------- 3. RENDERIZAÇÃO DE EMBEDS, LATEX E CÓDIGO ---------------- */
  function montarPreviewEmbed(url) {
    const raw = String(url || '').trim();
    if (!raw) return '<p class="text-[11px] text-slate-400">Cole um link de YouTube, Spotify, PDF, imagem ou áudio.</p>';

    const yt = raw.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
    if (yt) {
      return `<div class="relative w-full pb-[56.25%] rounded-xl overflow-hidden bg-slate-950 border border-slate-200"><iframe class="absolute inset-0 w-full h-full" src="https://www.youtube.com/embed/${yt[1]}" allowfullscreen loading="lazy"></iframe></div>`;
    }
    if (raw.includes('open.spotify.com/')) {
      const embedUrl = raw.replace('open.spotify.com/', 'open.spotify.com/embed/').split('?')[0];
      return `<iframe class="w-full h-20 rounded-xl border border-slate-200" src="${esc(embedUrl)}" allow="encrypted-media" loading="lazy"></iframe>`;
    }
    if (/\.(png|jpe?g|gif|webp)(\?|$)/i.test(raw)) {
      return `<img src="${esc(raw)}" alt="Mídia incorporada" class="max-h-72 rounded-xl border border-slate-200 object-contain bg-slate-50" loading="lazy" />`;
    }
    if (/\.(mp3|wav|ogg)(\?|$)/i.test(raw)) {
      return `<audio controls class="w-full"><source src="${esc(raw)}"></audio>`;
    }
    if (/\.pdf(\?|$)/i.test(raw)) {
      return `<iframe class="w-full h-72 rounded-xl border border-slate-200" src="${esc(raw)}" loading="lazy"></iframe>`;
    }
    return `<a href="${esc(raw)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 underline break-all">🔗 Abrir recurso externo: ${esc(raw)}</a>`;
  }

  function aplicarLatex(el, tex) {
    if (!el) return;
    const formula = String(tex || '').trim();
    if (!formula) {
      el.innerHTML = '<span class="text-[11px] text-slate-400">Prévia LaTeX aparecerá aqui...</span>';
      return;
    }
    if (window.katex && typeof window.katex.render === 'function') {
      try {
        window.katex.render(formula, el, { displayMode: true, throwOnError: false });
        return;
      } catch (e) {}
    }
    el.textContent = formula;
  }

  function aplicarHighlight(codeEl, lang, code) {
    if (!codeEl) return;
    codeEl.className = `language-${lang || 'javascript'} text-xs font-mono`;
    codeEl.textContent = code || '// Escreva seu código aqui...';
    if (window.hljs && typeof window.hljs.highlightElement === 'function') {
      try {
        delete codeEl.dataset.highlighted;
        window.hljs.highlightElement(codeEl);
      } catch (e) {}
    }
  }

  /* ---------------- 4. EDITOR EM BLOCOS ---------------- */
  const CALLOUT_TONES = {
    sage: 'bg-emerald-50/90 border-emerald-200 text-emerald-950',
    honey: 'bg-amber-50/90 border-amber-200 text-amber-950',
    dusk: 'bg-indigo-50/90 border-indigo-200 text-indigo-950',
    clay: 'bg-rose-50/90 border-rose-200 text-rose-950'
  };

  function renderizarBlocos() {
    const container = document.getElementById('eos-blocos-container');
    const pag = getPaginaAtiva();
    if (!container || !pag) return;

    if (!Array.isArray(pag.blocos)) pag.blocos = [];
    if (pag.blocos.length === 0) {
      pag.blocos.push({ id: novoId(), type: 'paragraph', content: '' });
    }

    const { synced_blocks } = getDados();
    container.innerHTML = '';

    pag.blocos.forEach((bloco, idx) => {
      const wrap = document.createElement('div');
      wrap.className = 'group relative p-3 rounded-xl border border-slate-200/80 bg-slate-50/40 hover:bg-white hover:border-emerald-200 transition space-y-2';
      wrap.draggable = true;
      wrap.setAttribute('data-block-id', bloco.id);
      wrap.setAttribute('data-index', String(idx));

      // Toolbar do bloco (Drag, Transformar, Mover, Excluir)
      const toolbar = `
        <div class="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-slate-100/80">
          <div class="flex items-center gap-1.5">
            <span class="cursor-grab text-slate-400 hover:text-slate-700 px-1 select-none text-xs" title="Arraste para reordenar">⋮⋮</span>
            <select class="sel-bloco-tipo text-[11px] font-semibold bg-white border border-slate-200 rounded-md px-2 py-0.5 text-slate-700 cursor-pointer">
              <option value="paragraph" ${bloco.type === 'paragraph' ? 'selected' : ''}>Texto</option>
              <option value="h1" ${bloco.type === 'h1' ? 'selected' : ''}>Título H1</option>
              <option value="h2" ${bloco.type === 'h2' ? 'selected' : ''}>Título H2</option>
              <option value="h3" ${bloco.type === 'h3' ? 'selected' : ''}>Título H3</option>
              <option value="toggle" ${bloco.type === 'toggle' ? 'selected' : ''}>Toggle (Active Recall)</option>
              <option value="callout" ${bloco.type === 'callout' ? 'selected' : ''}>Callout</option>
              <option value="latex" ${bloco.type === 'latex' ? 'selected' : ''}>LaTeX</option>
              <option value="code" ${bloco.type === 'code' ? 'selected' : ''}>Código</option>
              <option value="embed" ${bloco.type === 'embed' ? 'selected' : ''}>Embed / Mídia</option>
              <option value="synced" ${bloco.type === 'synced' ? 'selected' : ''}>Sincronizado</option>
            </select>
          </div>
          <div class="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition">
            <button type="button" class="btn-bloco-up px-1.5 py-0.5 text-[11px] text-slate-500 hover:text-slate-900 cursor-pointer" title="Subir">↑</button>
            <button type="button" class="btn-bloco-down px-1.5 py-0.5 text-[11px] text-slate-500 hover:text-slate-900 cursor-pointer" title="Descer">↓</button>
            <button type="button" class="btn-bloco-del px-1.5 py-0.5 text-[11px] text-rose-500 hover:text-rose-700 cursor-pointer" title="Excluir bloco">✕</button>
          </div>
        </div>
      `;

      let corpo = '';
      if (bloco.type === 'h1' || bloco.type === 'h2' || bloco.type === 'h3') {
        const cls = bloco.type === 'h1' ? 'text-lg font-bold' : bloco.type === 'h2' ? 'text-base font-bold' : 'text-sm font-semibold';
        corpo = `<input type="text" class="inp-bloco-main w-full bg-transparent ${cls} text-slate-900 px-1 py-0.5 focus:outline-none" value="${esc(bloco.content || '')}" placeholder="Título da seção..." />`;
      } else if (bloco.type === 'toggle') {
        const corpoInterno = bloco.props?.body || '';
        corpo = `
          <details class="rounded-lg border border-slate-200 bg-white p-2.5" open>
            <summary class="cursor-pointer font-semibold text-xs text-slate-800 flex items-center gap-2">
              <input type="text" class="inp-bloco-main flex-1 bg-transparent font-semibold text-xs text-slate-900 focus:outline-none" value="${esc(bloco.content || '')}" placeholder="Pergunta ou título do Toggle..." />
            </summary>
            <textarea class="inp-toggle-body mt-2 w-full text-xs p-2 rounded-lg bg-slate-50 border border-slate-200 resize-y min-h-[60px]" placeholder="Resposta, demonstração ou resumo oculto...">${esc(corpoInterno)}</textarea>
          </details>
        `;
      } else if (bloco.type === 'callout') {
        const tone = bloco.props?.tone || 'sage';
        const icon = bloco.props?.icon || '💡';
        corpo = `
          <div class="p-3 rounded-xl border ${CALLOUT_TONES[tone] || CALLOUT_TONES.sage} space-y-2">
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-1.5">
                <select class="sel-callout-icon text-xs bg-white/80 border border-slate-200 rounded px-1.5 py-0.5">
                  ${['💡', '📌', '⚠️', '📐', '🔥'].map(ic => `<option value="${ic}" ${icon === ic ? 'selected' : ''}>${ic}</option>`).join('')}
                </select>
                <select class="sel-callout-tone text-[11px] bg-white/80 border border-slate-200 rounded px-1.5 py-0.5">
                  <option value="sage" ${tone === 'sage' ? 'selected' : ''}>Sálvia (Fórmula/Nota)</option>
                  <option value="honey" ${tone === 'honey' ? 'selected' : ''}>Mel (Atenção)</option>
                  <option value="dusk" ${tone === 'dusk' ? 'selected' : ''}>Lavanda (Conceito)</option>
                  <option value="clay" ${tone === 'clay' ? 'selected' : ''}>Argila (Pegadinha)</option>
                </select>
              </div>
            </div>
            <textarea class="inp-bloco-main w-full bg-transparent text-xs font-medium resize-y min-h-[54px] focus:outline-none" placeholder="Escreva o destaque aqui...">${esc(bloco.content || '')}</textarea>
          </div>
        `;
      } else if (bloco.type === 'latex') {
        corpo = `
          <div class="space-y-2">
            <textarea class="inp-bloco-main w-full font-mono text-xs p-2 rounded-lg bg-white border border-slate-200 resize-y min-h-[52px]" placeholder="Ex.: \\int_a^b f(x)\\,dx = F(b) - F(a)">${esc(bloco.content || '')}</textarea>
            <div class="latex-preview p-3 rounded-lg bg-white border border-slate-200 overflow-x-auto text-center"></div>
          </div>
        `;
      } else if (bloco.type === 'code') {
        const lang = bloco.props?.lang || 'javascript';
        corpo = `
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <select class="sel-code-lang text-[11px] font-mono bg-white border border-slate-200 rounded px-2 py-0.5">
                ${['javascript', 'python', 'sql', 'html', 'css', 'bash'].map(l => `<option value="${l}" ${lang === l ? 'selected' : ''}>${l}</option>`).join('')}
              </select>
            </div>
            <textarea class="inp-bloco-main w-full font-mono text-xs p-2.5 rounded-lg bg-slate-900 text-slate-100 border border-slate-700 resize-y min-h-[80px]" placeholder="// Digite ou cole seu código...">${esc(bloco.content || '')}</textarea>
            <pre class="rounded-lg overflow-x-auto border border-slate-800 bg-[#282c34] p-2.5"><code class="code-preview"></code></pre>
          </div>
        `;
      } else if (bloco.type === 'embed') {
        corpo = `
          <div class="space-y-2">
            <input type="url" class="inp-bloco-main w-full text-xs px-3 py-1.5 rounded-lg bg-white border border-slate-200" value="${esc(bloco.content || '')}" placeholder="Cole link do YouTube, Spotify, PDF, imagem ou áudio..." />
            <div class="embed-preview">${montarPreviewEmbed(bloco.content)}</div>
          </div>
        `;
      } else if (bloco.type === 'synced') {
        if (!bloco.props) bloco.props = {};
        if (!bloco.props.sync_id) bloco.props.sync_id = novoId('sync');
        const sId = bloco.props.sync_id;
        const sb = synced_blocks[sId] || { sync_id: sId, title: 'Bloco Sincronizado', content: bloco.content || '' };
        corpo = `
          <div class="p-3 rounded-xl border-2 border-emerald-400/70 bg-emerald-50/40 space-y-2">
            <div class="flex items-center justify-between gap-2">
              <input type="text" class="inp-sync-title text-xs font-bold text-emerald-900 bg-transparent border-b border-emerald-200 focus:outline-none flex-1" value="${esc(sb.title || 'Bloco Sincronizado')}" placeholder="Nome do bloco sincronizado..." />
              <span class="text-[10px] font-mono text-emerald-700 bg-white px-2 py-0.5 rounded border border-emerald-200">🔄 ${esc(sId)}</span>
            </div>
            <textarea class="inp-sync-content w-full text-xs p-2 rounded-lg bg-white border border-emerald-200 resize-y min-h-[60px]" placeholder="Conteúdo sincronizado entre todas as páginas que usam este bloco...">${esc(sb.content || '')}</textarea>
          </div>
        `;
      } else {
        corpo = `<textarea class="inp-bloco-main w-full bg-transparent text-xs text-slate-800 leading-relaxed resize-y min-h-[46px] px-1 focus:outline-none" placeholder="Escreva suas anotações...">${esc(bloco.content || '')}</textarea>`;
      }

      wrap.innerHTML = toolbar + corpo;

      // Eventos Drag & Drop
      wrap.addEventListener('dragstart', () => { ebState.dragIndex = idx; wrap.classList.add('opacity-50'); });
      wrap.addEventListener('dragend', () => { ebState.dragIndex = null; wrap.classList.remove('opacity-50'); });
      wrap.addEventListener('dragover', (e) => e.preventDefault());
      wrap.addEventListener('drop', (e) => {
        e.preventDefault();
        if (ebState.dragIndex === null || ebState.dragIndex === idx) return;
        const [movido] = pag.blocos.splice(ebState.dragIndex, 1);
        pag.blocos.splice(idx, 0, movido);
        renderizarBlocos();
        renderizarTOC();
        agendarSalvamento();
      });

      // Transformar tipo
      wrap.querySelector('.sel-bloco-tipo').addEventListener('change', (e) => {
        bloco.type = e.target.value;
        renderizarBlocos();
        renderizarTOC();
        agendarSalvamento();
      });

      wrap.querySelector('.btn-bloco-up').addEventListener('click', () => {
        if (idx === 0) return;
        [pag.blocos[idx - 1], pag.blocos[idx]] = [pag.blocos[idx], pag.blocos[idx - 1]];
        renderizarBlocos();
        renderizarTOC();
        agendarSalvamento();
      });

      wrap.querySelector('.btn-bloco-down').addEventListener('click', () => {
        if (idx >= pag.blocos.length - 1) return;
        [pag.blocos[idx + 1], pag.blocos[idx]] = [pag.blocos[idx], pag.blocos[idx + 1]];
        renderizarBlocos();
        renderizarTOC();
        agendarSalvamento();
      });

      wrap.querySelector('.btn-bloco-del').addEventListener('click', () => {
        pag.blocos.splice(idx, 1);
        renderizarBlocos();
        renderizarTOC();
        agendarSalvamento();
      });

      // Inputs por tipo
      const inpMain = wrap.querySelector('.inp-bloco-main');
      if (inpMain) {
        inpMain.addEventListener('input', () => {
          bloco.content = inpMain.value;
          if (['h1', 'h2', 'h3'].includes(bloco.type)) renderizarTOC();
          if (bloco.type === 'latex') aplicarLatex(wrap.querySelector('.latex-preview'), bloco.content);
          if (bloco.type === 'code') aplicarHighlight(wrap.querySelector('.code-preview'), bloco.props?.lang, bloco.content);
          if (bloco.type === 'embed') wrap.querySelector('.embed-preview').innerHTML = montarPreviewEmbed(bloco.content);
          agendarSalvamento();
        });
      }

      if (bloco.type === 'toggle') {
        wrap.querySelector('.inp-toggle-body')?.addEventListener('input', (e) => {
          bloco.props = { ...(bloco.props || {}), body: e.target.value };
          agendarSalvamento();
        });
      }
      if (bloco.type === 'callout') {
        wrap.querySelector('.sel-callout-icon')?.addEventListener('change', (e) => {
          bloco.props = { ...(bloco.props || {}), icon: e.target.value };
          agendarSalvamento();
        });
        wrap.querySelector('.sel-callout-tone')?.addEventListener('change', (e) => {
          bloco.props = { ...(bloco.props || {}), tone: e.target.value };
          renderizarBlocos();
          agendarSalvamento();
        });
      }
      if (bloco.type === 'latex') aplicarLatex(wrap.querySelector('.latex-preview'), bloco.content);
      if (bloco.type === 'code') {
        aplicarHighlight(wrap.querySelector('.code-preview'), bloco.props?.lang, bloco.content);
        wrap.querySelector('.sel-code-lang')?.addEventListener('change', (e) => {
          bloco.props = { ...(bloco.props || {}), lang: e.target.value };
          aplicarHighlight(wrap.querySelector('.code-preview'), bloco.props.lang, bloco.content);
          agendarSalvamento();
        });
      }
      if (bloco.type === 'synced') {
        const sId = bloco.props.sync_id;
        const inpTitle = wrap.querySelector('.inp-sync-title');
        const inpCont = wrap.querySelector('.inp-sync-content');
        const syncHandler = () => salvarBlocoSincronizado(sId, inpTitle.value, inpCont.value);
        inpTitle?.addEventListener('input', syncHandler);
        inpCont?.addEventListener('input', syncHandler);
      }

      container.appendChild(wrap);
    });
  }

  function abrirPagina(paginaId) {
    ebState.paginaAtivaId = paginaId;
    const pag = getPaginaAtiva();
    const { materias } = getDados();

    const vazio = document.getElementById('eos-editor-vazio');
    const ativo = document.getElementById('eos-editor-ativo');
    if (!pag) {
      vazio?.classList.remove('hidden');
      ativo?.classList.add('hidden');
      renderizarArvore();
      renderizarTOC();
      return;
    }

    vazio?.classList.add('hidden');
    ativo?.classList.remove('hidden');

    const tituloEl = document.getElementById('eos-editor-titulo');
    const matSel = document.getElementById('eos-editor-materia');
    const stSel = document.getElementById('eos-editor-status');
    const bcEl = document.getElementById('eos-editor-breadcrumb');

    if (tituloEl) tituloEl.value = pag.titulo || '';
    if (matSel) {
      matSel.innerHTML = '<option value="">Sem matéria</option>' +
        materias.map(m => `<option value="${m.id}">${esc(m.nome)}</option>`).join('');
      matSel.value = pag.materia_id ? String(pag.materia_id) : '';
    }
    if (stSel) stSel.value = pag.status || 'a_estudar';
    if (bcEl) {
      const mat = materias.find(m => m.id === pag.materia_id);
      bcEl.textContent = mat ? `${mat.nome} › ${pag.titulo}` : pag.titulo;
    }

    renderizarArvore();
    renderizarBlocos();
    renderizarTOC();
    renderizarSyncedDisponiveis();
  }

  function atualizarPainelCaderno() {
    const { paginas } = getDados();
    if (!ebState.paginaAtivaId && paginas.length > 0) {
      ebState.paginaAtivaId = paginas[0].id;
    }
    abrirPagina(ebState.paginaAtivaId);
  }

  function inicializarEditor() {
    document.getElementById('btn-eos-nova-pagina-arvore')?.addEventListener('click', () => abrirModalNovaPagina(''));
    document.getElementById('btn-eos-criar-subpagina')?.addEventListener('click', () => abrirModalNovaPagina(ebState.paginaAtivaId || ''));
    document.getElementById('btn-eos-salvar-blocos')?.addEventListener('click', () => salvarPaginaAtiva());

    document.getElementById('eos-editor-titulo')?.addEventListener('input', (e) => {
      const pag = getPaginaAtiva();
      if (!pag) return;
      pag.titulo = e.target.value;
      renderizarArvore();
      agendarSalvamento();
    });
    document.getElementById('eos-editor-materia')?.addEventListener('change', (e) => {
      const pag = getPaginaAtiva();
      if (!pag) return;
      pag.materia_id = e.target.value ? parseInt(e.target.value, 10) : null;
      renderizarArvore();
      agendarSalvamento();
    });
    document.getElementById('eos-editor-status')?.addEventListener('change', (e) => {
      const pag = getPaginaAtiva();
      if (!pag) return;
      pag.status = e.target.value;
      agendarSalvamento();
      if (pag.status === 'dominado' && typeof window.nxCelebrate === 'function') {
        window.nxCelebrate(document.getElementById('eos-editor-ativo'));
      }
    });

    document.querySelectorAll('.btn-eos-add-bloco').forEach(btn => {
      btn.addEventListener('click', () => {
        const pag = getPaginaAtiva();
        if (!pag) return;
        const tipo = btn.getAttribute('data-bloco-tipo') || 'paragraph';
        const bloco = { id: novoId(), type: tipo, content: '' };
        if (tipo === 'synced') bloco.props = { sync_id: novoId('sync') };
        if (tipo === 'callout') bloco.props = { tone: 'sage', icon: '💡' };
        if (tipo === 'code') bloco.props = { lang: 'javascript' };
        pag.blocos.push(bloco);
        renderizarBlocos();
        renderizarTOC();
        agendarSalvamento();
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializarEditor);
  } else {
    inicializarEditor();
  }

  window.EstudosBlocos = {
    atualizarPainelCaderno,
    abrirPagina,
    abrirModalNovaPagina
  };
})();
