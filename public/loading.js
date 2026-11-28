/**
 * loading.js — Sistema Global Inteligente de Carregamento (3 níveis)
 *  1. Barra de Progresso no Topo (Top Loading Bar)
 *  2. Overlay Global com vidro/blur (apenas se a requisição passar de 180ms)
 *  3. Loading automático em botões de ação/formulário (try/finally fail-safe)
 */
(function () {
  'use strict';

  if (window.__nxLoadingInitialized) return;
  window.__nxLoadingInitialized = true;

  const DELAY_OVERLAY_MS = 180;
  const FAILSAFE_TIMEOUT_MS = 25000;
  const SILENT_URL_RE = /(\/progresso\b|\/api\/push|manifest\.json|sw\.js|favicon)/i;

  let activeCount = 0;
  let overlayTimer = null;
  let failsafeTimer = null;
  let barTimer = null;
  let lastTriggerBtn = null;
  let lastTriggerAt = 0;
  let lastUserActionAt = 0;

  let topBarEl = null;
  let overlayEl = null;

  function ensureUI() {
    if (!document.body) return;
    if (!topBarEl) {
      topBarEl = document.getElementById('nx-top-loader');
      if (!topBarEl) {
        topBarEl = document.createElement('div');
        topBarEl.id = 'nx-top-loader';
        topBarEl.setAttribute('aria-hidden', 'true');
        document.body.appendChild(topBarEl);
      }
    }
    if (!overlayEl) {
      overlayEl = document.getElementById('nx-global-loader');
      if (!overlayEl) {
        overlayEl = document.createElement('div');
        overlayEl.id = 'nx-global-loader';
        overlayEl.setAttribute('role', 'status');
        overlayEl.setAttribute('aria-live', 'polite');
        overlayEl.innerHTML = `
          <div class="nx-loader-card">
            <span class="nx-loader-ring" aria-hidden="true"></span>
            <span id="nx-global-loader-text">Carregando...</span>
          </div>
        `;
        document.body.appendChild(overlayEl);
      }
    }
  }

  function startTopBar() {
    ensureUI();
    if (!topBarEl) return;
    clearTimeout(barTimer);
    topBarEl.classList.add('is-active');
    topBarEl.style.width = '28%';
    requestAnimationFrame(() => {
      if (topBarEl && topBarEl.classList.contains('is-active')) {
        topBarEl.style.width = '74%';
      }
    });
  }

  function finishTopBar() {
    if (!topBarEl) return;
    topBarEl.style.width = '100%';
    clearTimeout(barTimer);
    barTimer = setTimeout(() => {
      if (activeCount === 0 && topBarEl) {
        topBarEl.classList.remove('is-active');
        setTimeout(() => {
          if (activeCount === 0 && topBarEl) topBarEl.style.width = '0%';
        }, 220);
      }
    }, 180);
  }

  function pulseTabBar() {
    startTopBar();
    setTimeout(() => {
      if (activeCount === 0) finishTopBar();
    }, 240);
  }

  function showOverlay(texto) {
    ensureUI();
    if (!overlayEl) return;
    const lbl = document.getElementById('nx-global-loader-text');
    if (lbl && texto) lbl.textContent = texto;
    overlayEl.classList.add('is-visible');
  }

  function hideOverlay() {
    clearTimeout(overlayTimer);
    overlayTimer = null;
    if (overlayEl) overlayEl.classList.remove('is-visible');
  }

  function textoContextualBotao(btn) {
    const txt = (btn.textContent || '').trim().toLowerCase();
    if (txt.includes('excluir') || txt.includes('apagar') || txt.includes('remover')) return 'Excluindo...';
    if (txt.includes('entrar') || txt.includes('login') || txt.includes('acessar')) return 'Entrando...';
    if (txt.includes('criar') || txt.includes('adicionar') || txt.includes('nova') || txt.includes('novo')) return 'Criando...';
    if (txt.includes('enviar') || txt.includes('executar')) return 'Enviando...';
    if (txt.includes('salvar') || txt.includes('aplicar') || txt.includes('atualizar')) return 'Salvando...';
    return 'Processando...';
  }

  function setButtonLoading(btn, loading) {
    if (!btn || !btn.isConnected) return;
    if (loading) {
      if (btn.dataset.nxLoading === '1') return;
      const textoLimpo = (btn.textContent || '').trim();
      // Evita alterar botões puramente icônicos curtos (ex: ✕, ↑, ↓, ✓)
      if (!btn.hasAttribute('data-loading') && textoLimpo.length <= 2) return;
      btn.dataset.nxLoading = '1';
      btn.dataset.nxOrigHtml = btn.innerHTML;
      btn.dataset.nxOrigDisabled = btn.disabled ? '1' : '0';
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
      btn.innerHTML = `<span class="nx-btn-spinner" aria-hidden="true"></span><span>${textoContextualBotao(btn)}</span>`;
    } else {
      if (btn.dataset.nxLoading !== '1') return;
      btn.innerHTML = btn.dataset.nxOrigHtml || btn.innerHTML;
      btn.disabled = btn.dataset.nxOrigDisabled === '1';
      btn.removeAttribute('aria-busy');
      delete btn.dataset.nxLoading;
      delete btn.dataset.nxOrigHtml;
      delete btn.dataset.nxOrigDisabled;
    }
  }

  function beginRequest(usarOverlay, btnRef) {
    activeCount += 1;
    startTopBar();
    if (btnRef) setButtonLoading(btnRef, true);

    if (usarOverlay && !overlayTimer && (!overlayEl || !overlayEl.classList.contains('is-visible'))) {
      overlayTimer = setTimeout(() => {
        if (activeCount > 0) showOverlay('Carregando...');
      }, DELAY_OVERLAY_MS);
    }

    clearTimeout(failsafeTimer);
    failsafeTimer = setTimeout(() => {
      activeCount = 0;
      hideOverlay();
      finishTopBar();
      document.querySelectorAll('[data-nx-loading="1"]').forEach(b => setButtonLoading(b, false));
    }, FAILSAFE_TIMEOUT_MS);
  }

  function endRequest(btnRef) {
    if (btnRef) setButtonLoading(btnRef, false);
    activeCount = Math.max(0, activeCount - 1);
    if (activeCount === 0) {
      clearTimeout(failsafeTimer);
      hideOverlay();
      finishTopBar();
    }
  }

  // Captura botão/formulário recentemente acionado pelo usuário
  document.addEventListener('click', (e) => {
    lastUserActionAt = Date.now();
    const btn = e.target.closest && e.target.closest('button, [type="submit"]');
    if (btn && !btn.disabled && !btn.hasAttribute('data-no-loading')) {
      lastTriggerBtn = btn;
      lastTriggerAt = Date.now();
    }
  }, true);

  document.addEventListener('submit', (e) => {
    lastUserActionAt = Date.now();
    const form = e.target;
    const submitBtn = form && form.querySelector && form.querySelector('button[type="submit"], button:not([type])');
    if (submitBtn && !submitBtn.disabled && !submitBtn.hasAttribute('data-no-loading')) {
      lastTriggerBtn = submitBtn;
      lastTriggerAt = Date.now();
    }
  }, true);

  // Interceptador global de window.fetch com proteção try/finally
  if (typeof window.fetch === 'function') {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async function (input, init) {
      const urlStr = typeof input === 'string' ? input : (input && input.url ? input.url : '');
      const method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      const isSilent = Boolean(
        (init && init.silent) ||
        SILENT_URL_RE.test(urlStr) ||
        // Evita overlay em polling automático em segundo plano sem interação recente
        (method === 'GET' && urlStr.includes('/api/videos') && (Date.now() - lastUserActionAt > 2000))
      );

      if (isSilent) {
        return originalFetch(input, init);
      }

      const btnRef = (lastTriggerBtn && (Date.now() - lastTriggerAt <= 250)) ? lastTriggerBtn : null;
      if (btnRef) lastTriggerBtn = null;

      // Overlay aparece em carregamentos principais (GET ou mutações sem botão específico) quando >180ms
      const usarOverlay = !btnRef;
      beginRequest(usarOverlay, btnRef);
      try {
        return await originalFetch(input, init);
      } finally {
        endRequest(btnRef);
      }
    };
  }

  // Observa trocas de abas/visões para animar a barra superior
  const TAB_RE = /^(aba[A-Z]\w*|view-(dashboard-geral|grid|schedule|lesson|estudos-os|financas|rotina|perfil|configuracoes|revisao|metas|tutorial-ios)|subview-rotina-(hoje|checklist|agenda))$/;
  function observarAbas() {
    const stateMap = new WeakMap();
    document.querySelectorAll('[id]').forEach((el) => {
      if (!TAB_RE.test(el.id)) return;
      stateMap.set(el, el.classList.contains('hidden'));
      new MutationObserver(() => {
        const was = stateMap.get(el);
        const now = el.classList.contains('hidden');
        stateMap.set(el, now);
        if (was && !now) pulseTabBar();
      }).observe(el, { attributes: true, attributeFilter: ['class'] });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      ensureUI();
      observarAbas();
    });
  } else {
    ensureUI();
    observarAbas();
  }

  window.ConvergeLoading = {
    startBar: startTopBar,
    stopBar: finishTopBar,
    showOverlay,
    hideOverlay,
    withButtonLoading: async (btn, fn) => {
      setButtonLoading(btn, true);
      try {
        return await fn();
      } finally {
        setButtonLoading(btn, false);
      }
    }
  };
})();
