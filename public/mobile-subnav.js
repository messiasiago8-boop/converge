/**
 * mobile-subnav.js — Sub-navegação sticky exclusiva para Mobile (< 768px).
 * Mantém 100% do Desktop intacto e sincroniza com os botões da sidebar
 * para permitir trocar de seção dentro do mesmo módulo sem sair da tela.
 */
(function () {
  'use strict';

  const BAR_ID = 'mobile-module-subnav';

  const MODULOS = {
    lms: [
      { id: 'grid', icon: '🎬', label: 'Catálogo', run: () => typeof window.navIrParaLms === 'function' && window.navIrParaLms() },
      { id: 'estudos-os', icon: '🧠', label: 'Study OS', run: () => typeof window.navIrParaEstudosOS === 'function' && window.navIrParaEstudosOS('overview') },
      { id: 'schedule', icon: '📅', label: 'Cronograma', run: () => document.getElementById('nav-btn-schedule')?.click() }
    ],
    financas: [
      { id: 'dashboard', icon: '📊', label: 'Orçamento' },
      { id: 'planilha', icon: '📑', label: 'Planilha' },
      { id: 'investimentosFuturo', icon: '🏦', label: 'Investimentos' },
      { id: 'projetosCompras', icon: '🎯', label: 'Projetos' },
      { id: 'ia', icon: '🧠', label: 'IA' }
    ],
    rotina: [
      { id: 'hoje', icon: '☀️', label: 'Hoje' },
      { id: 'checklist', icon: '📋', label: 'Checklist' },
      { id: 'agenda', icon: '📅', label: 'Agenda' },
      { id: 'historico', icon: '🕘', label: 'Histórico' },
      { id: 'excluir', icon: '🗑️', label: 'Limpar', danger: true }
    ],
    metas: [
      { id: 'painel', icon: '🎯', label: 'Painel' },
      { id: 'modelos', icon: '📋', label: 'Modelos' },
      { id: 'nova', icon: '➕', label: 'Nova Meta' },
      { id: 'excluir', icon: '🗑️', label: 'Excluir', danger: true }
    ]
  };

  let financasTabAtiva = 'dashboard';
  let rotinaSubAtiva = 'hoje';
  let metasSubAtiva = 'painel';

  function detectarModuloEAtivo() {
    const visivel = (id) => {
      const el = document.getElementById(id);
      return el && !el.classList.contains('hidden');
    };
    if (visivel('view-estudos-os')) return { modulo: 'lms', ativo: 'estudos-os' };
    if (visivel('view-schedule')) return { modulo: 'lms', ativo: 'schedule' };
    if (visivel('view-grid') || visivel('view-lesson')) return { modulo: 'lms', ativo: 'grid' };
    if (visivel('view-financas')) return { modulo: 'financas', ativo: financasTabAtiva };
    if (visivel('view-rotina')) {
      if (visivel('subview-rotina-checklist')) rotinaSubAtiva = 'checklist';
      else if (visivel('subview-rotina-agenda')) rotinaSubAtiva = 'agenda';
      else rotinaSubAtiva = 'hoje';
      return { modulo: 'rotina', ativo: rotinaSubAtiva };
    }
    if (visivel('view-metas')) return { modulo: 'metas', ativo: metasSubAtiva };
    return null;
  }

  function renderizar() {
    const bar = document.getElementById(BAR_ID);
    if (!bar) return;

    const info = detectarModuloEAtivo();
    if (!info) {
      bar.classList.add('hidden');
      bar.innerHTML = '';
      return;
    }

    const itens = MODULOS[info.modulo] || [];
    bar.classList.remove('hidden');
    bar.innerHTML = itens.map(item => {
      const ativo = item.id === info.ativo;
      const cls = `nx-mob-pill ${ativo ? 'is-active' : ''} ${item.danger && !ativo ? 'is-danger' : ''}`;
      return `<button type="button" class="${cls}" data-mob-mod="${info.modulo}" data-mob-id="${item.id}"><span>${item.icon}</span><span>${item.label}</span></button>`;
    }).join('');

    bar.querySelectorAll('.nx-mob-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        const mod = btn.getAttribute('data-mob-mod');
        const id = btn.getAttribute('data-mob-id');
        if (mod === 'lms') {
          const item = MODULOS.lms.find(x => x.id === id);
          if (item && item.run) item.run();
        } else if (mod === 'financas') {
          financasTabAtiva = id;
          document.querySelector(`.btn-subnav-financas[data-tab="${id}"]`)?.click();
          renderizar();
        } else if (mod === 'rotina') {
          if (id === 'hoje' || id === 'checklist' || id === 'agenda') rotinaSubAtiva = id;
          document.querySelector(`.btn-subnav-rotina[data-rotina-action="${id}"]`)?.click();
          renderizar();
        } else if (mod === 'metas') {
          if (id === 'painel') metasSubAtiva = 'painel';
          document.querySelector(`.btn-subnav-metas[data-metas-action="${id}"]`)?.click();
          renderizar();
        }
      });
    });

    const activePill = bar.querySelector('.nx-mob-pill.is-active');
    if (activePill && typeof activePill.scrollIntoView === 'function') {
      activePill.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }

  function init() {
    // Sincroniza quando o usuário clica pelos botões da sidebar também
    document.addEventListener('click', (e) => {
      const fin = e.target.closest?.('.btn-subnav-financas');
      if (fin) {
        financasTabAtiva = fin.getAttribute('data-tab') || 'dashboard';
        setTimeout(renderizar, 30);
      }
      const rot = e.target.closest?.('.btn-subnav-rotina');
      if (rot) {
        const act = rot.getAttribute('data-rotina-action');
        if (act === 'hoje' || act === 'checklist' || act === 'agenda') rotinaSubAtiva = act;
        setTimeout(renderizar, 30);
      }
    });

    const obsTargets = [
      'view-dashboard-geral', 'view-grid', 'view-schedule', 'view-lesson', 'view-estudos-os',
      'view-financas', 'view-rotina', 'view-metas', 'view-perfil', 'view-configuracoes',
      'view-revisao', 'view-tutorial-ios',
      'subview-rotina-hoje', 'subview-rotina-checklist', 'subview-rotina-agenda'
    ];
    const observer = new MutationObserver(() => renderizar());
    obsTargets.forEach(id => {
      const el = document.getElementById(id);
      if (el) observer.observe(el, { attributes: true, attributeFilter: ['class'] });
    });

    renderizar();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
