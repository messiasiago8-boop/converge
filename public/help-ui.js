/**
 * help-ui.js — Componente Reutilizável de Ajuda Contextual (HelpButton / HelpInfo)
 *  - Ícone discreto "?" (HelpCircle) com e.stopPropagation()
 *  - Desktop (>= 768px): Popover flutuante inteligente com detecção de bordas da tela
 *  - Mobile (< 768px): Bottom sheet responsivo com backdrop e botão fechar
 *  - Funciona no Portal e no módulo Finanças mantendo 100% da paleta Sálvia & Areia
 */
(function () {
  'use strict';

  if (window.__nxHelpInitialized) return;
  window.__nxHelpInitialized = true;

  const SVG_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>`;

  let activePopover = null;
  let activeBackdrop = null;
  let activeTrigger = null;

  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function closeHelp() {
    if (activePopover) {
      activePopover.remove();
      activePopover = null;
    }
    if (activeBackdrop) {
      activeBackdrop.remove();
      activeBackdrop = null;
    }
    if (activeTrigger) {
      activeTrigger.setAttribute('aria-expanded', 'false');
      activeTrigger = null;
    }
  }

  function openHelp(key, triggerBtn) {
    const dict = window.CONVERGE_HELP || {};
    const info = dict[key];
    if (!info) return;

    if (activeTrigger === triggerBtn && activePopover) {
      closeHelp();
      return;
    }
    closeHelp();

    const isMobile = window.innerWidth < 768;
    activeTrigger = triggerBtn;
    triggerBtn.setAttribute('aria-expanded', 'true');

    if (isMobile) {
      const backdrop = document.createElement('div');
      backdrop.className = 'nx-help-backdrop';
      backdrop.addEventListener('click', closeHelp);

      const sheet = document.createElement('div');
      sheet.className = 'nx-help-sheet';
      sheet.setAttribute('role', 'dialog');
      sheet.setAttribute('aria-modal', 'true');
      sheet.innerHTML = `
        <div class="nx-help-sheet-handle" aria-hidden="true"></div>
        <div class="nx-help-head">
          <div class="nx-help-title-wrap">
            <span class="nx-help-badge">${SVG_ICON}</span>
            <h4>${esc(info.titulo)}</h4>
          </div>
          <button type="button" class="nx-help-close" aria-label="Fechar ajuda">✕</button>
        </div>
        <p class="nx-help-desc">${esc(info.descricao)}</p>
        ${info.dica ? `<div class="nx-help-tip"><strong>Dica rápida:</strong> ${esc(info.dica)}</div>` : ''}
        <button type="button" class="nx-help-ok">Entendi</button>
      `;
      sheet.querySelector('.nx-help-close').addEventListener('click', closeHelp);
      sheet.querySelector('.nx-help-ok').addEventListener('click', closeHelp);
      sheet.addEventListener('click', e => e.stopPropagation());

      document.body.appendChild(backdrop);
      document.body.appendChild(sheet);
      activeBackdrop = backdrop;
      activePopover = sheet;
      return;
    }

    // Desktop: Popover flutuante posicionado com proteção contra saída da viewport
    const pop = document.createElement('div');
    pop.className = 'nx-help-popover';
    pop.setAttribute('role', 'dialog');
    pop.innerHTML = `
      <div class="nx-help-head">
        <div class="nx-help-title-wrap">
          <span class="nx-help-badge">${SVG_ICON}</span>
          <h4>${esc(info.titulo)}</h4>
        </div>
        <button type="button" class="nx-help-close" aria-label="Fechar ajuda">✕</button>
      </div>
      <p class="nx-help-desc">${esc(info.descricao)}</p>
      ${info.dica ? `<div class="nx-help-tip"><strong>Dica:</strong> ${esc(info.dica)}</div>` : ''}
    `;
    pop.querySelector('.nx-help-close').addEventListener('click', (e) => {
      e.stopPropagation();
      closeHelp();
    });
    pop.addEventListener('click', e => e.stopPropagation());

    document.body.appendChild(pop);
    activePopover = pop;

    const r = triggerBtn.getBoundingClientRect();
    const pr = pop.getBoundingClientRect();
    const margin = 12;

    let top = r.bottom + 10;
    if (top + pr.height > window.innerHeight - margin) {
      top = Math.max(margin, r.top - pr.height - 10);
    }
    let left = r.left - pr.width / 2 + r.width / 2;
    left = Math.max(margin, Math.min(window.innerWidth - pr.width - margin, left));

    pop.style.top = `${Math.round(top)}px`;
    pop.style.left = `${Math.round(left)}px`;
  }

  function createHelpButton(key, label) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nx-help-btn';
    btn.setAttribute('data-help-key', key);
    btn.setAttribute('data-no-loading', '1');
    btn.setAttribute('aria-label', `Ajuda sobre ${label || 'esta função'}`);
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('title', 'Como funciona?');
    btn.textContent = '?';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openHelp(key, btn);
    });
    return btn;
  }

  function attachToElement(el, key) {
    if (!el || el.dataset.nxHelpAttached === '1') return;
    const dict = window.CONVERGE_HELP || {};
    if (!dict[key]) return;
    el.dataset.nxHelpAttached = '1';
    el.appendChild(createHelpButton(key, dict[key].titulo));
  }

  // Mapeamento declarativo para 100% das abas e seções internas (Portal + Finanças)
  const AUTO_TARGETS = [
    // Portal — Início
    ['#nx-hero .nx-eyebrow', 'inicio-geral'],
    ['#nx-hero .nx-ring-text h4', 'inicio-progresso'],
    ['#nx-overview-pillars > div:nth-child(1) h3', 'inicio-rotina'],
    ['#nx-overview-pillars > div:nth-child(2) h3', 'inicio-financas'],
    ['#nx-overview-pillars > div:nth-child(3) h3', 'inicio-educacao'],
    ['#nx-overview-pillars > div:nth-child(4) h3', 'inicio-metas'],

    // Portal — Educação (Catálogo, Cronograma, Aula, Study OS)
    ['#grid-topic-title', 'edu-catalogo'],
    ['#view-schedule h2', 'edu-cronograma'],
    ['#lesson-video-title', 'edu-aula'],
    ['#view-lesson aside h3', 'edu-aula'],
    ['#view-estudos-os h2', 'edu-study-os'],
    ['#eos-panel-overview h3:has(+ p)', 'eos-foco'],
    ['#eos-panel-databases h3', 'eos-bases'],
    ['#eos-panel-caderno aside:first-of-type h3', 'eos-hierarquia'],
    ['#eos-panel-caderno aside:last-of-type > div:nth-child(1) h3', 'eos-toc'],
    ['#eos-panel-caderno aside:last-of-type > div:nth-child(2) h3', 'eos-synced'],
    ['#eos-panel-srs h3', 'eos-srs'],
    ['#eos-panel-desempenho > div:nth-child(1) > div:nth-child(1) h3', 'eos-graficos'],
    ['#eos-panel-desempenho > div:nth-child(2) > div:nth-child(1) h3', 'eos-provas'],
    ['#eos-panel-desempenho > div:nth-child(2) > div:nth-child(2) h3', 'eos-leituras'],

    // Portal — Rotina & Agenda
    ['#view-rotina #subview-rotina-hoje h3', 'rotina-top3'],
    ['#subview-rotina-checklist h3', 'rotina-checklist'],
    ['#subview-rotina-agenda h3', 'rotina-agenda'],

    // Portal — Metas & Hábitos
    ['#view-metas h2', 'metas-geral'],
    ['#secao-metas-habitos h3', 'metas-habitos'],

    // Portal — Revisão, Perfil, Configurações e Tutorial
    ['#titulo-revisao', 'revisao-semanal'],
    ['#titulo-perfil', 'perfil-geral'],
    ['#titulo-configuracoes', 'config-geral'],
    ['#view-tutorial-ios h2', 'tutorial-mobile'],

    // Finanças (iframe)
    ['#abaDashboard > div:first-child h4', 'fin-modelo'],
    ['#tituloGraficoBudget', 'fin-grafico'],
    ['#abaDashboard section.grid.lg\\:grid-cols-3 > div:last-child h3', 'fin-seguranca'],
    ['#abaPlanilha h3', 'fin-planilha'],
    ['#abaInvestimentosFuturo h2, #abaInvestimentosFuturo h3', 'fin-investimentos'],
    ['#abaInvestimentos h3', 'fin-investimentos'],
    ['#abaProjetosCompras h2, #abaProjetosCompras h3', 'fin-projetos'],
    ['#abaRelatorios h3', 'fin-relatorios'],
    ['#abaIa h2, #abaIa h3', 'fin-ia']
  ];

  function scanAndAttach() {
    // 1. Elementos explicitamente marcados com data-help="chave"
    document.querySelectorAll('[data-help]').forEach(el => {
      attachToElement(el, el.getAttribute('data-help'));
    });

    // 2. Mapeamento automático de cabeçalhos e seções
    AUTO_TARGETS.forEach(([selector, key]) => {
      try {
        const el = document.querySelector(selector);
        if (el) attachToElement(el, key);
      } catch (e) {}
    });

    // 3. Seções específicas com múltiplos cards de títulos (ex: IA de Estudos, Flashcards, Banco de Erros, Linha do Tempo)
    document.querySelectorAll('h3, h4').forEach(h => {
      if (h.dataset.nxHelpAttached === '1') return;
      const txt = (h.textContent || '').trim();
      if (txt.includes('IA de Estudos')) attachToElement(h, 'eos-ia');
      else if (txt.includes('Flashcards')) attachToElement(h, 'eos-flashcards');
      else if (txt.includes('Banco de Erros')) attachToElement(h, 'eos-erros');
      else if (txt.includes('Linha do Tempo de Hoje')) attachToElement(h, 'rotina-timeline');
      else if (txt.includes('Ambiente de Foco')) attachToElement(h, 'eos-foco');
    });
  }

  document.addEventListener('click', (e) => {
    if (activePopover && !activePopover.contains(e.target) && (!activeTrigger || !activeTrigger.contains(e.target))) {
      closeHelp();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeHelp();
  });
  window.addEventListener('resize', () => {
    if (activePopover) closeHelp();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scanAndAttach);
  } else {
    scanAndAttach();
  }

  window.ConvergeHelp = {
    open: openHelp,
    close: closeHelp,
    refresh: scanAndAttach,
    createButton: createHelpButton
  };
})();
