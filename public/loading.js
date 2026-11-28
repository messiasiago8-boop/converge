/**
 * loading.js — Sistema Global Inteligente de Carregamento (3 níveis)
 *  1. Barra de Progresso no Topo (Top Loading Bar) contínua (sem reiniciar em chamadas sequenciais)
 *  2. Overlay Global com vidro/blur (apenas se o ciclo passar de 200ms)
 *  3. Loading automático em botões de ação/formulário (try/finally fail-safe)
 */
(function () {
  'use strict';

  if (window.__nxLoadingInitialized) return;
  window.__nxLoadingInitialized = true;

  const DELAY_OVERLAY_MS = 200;
  const FINISH_DEBOUNCE_MS = 280;
  const FAILSAFE_TIMEOUT_MS = 25000;
  const SILENT_URL_RE = /(\/progresso\b|\/api\/push|manifest\.json|sw\.js|favicon)/i;
  const PAGE_BOOT_AT = Date.now();
  const IS_EMBEDDED = (() => {
    try { return window.self !== window.top; } catch (e) { return true; }
  })();

  let activeCount = 0;
  let sessionActive = false;
  let overlayTimer = null;
  let finishTimer = null;
  let failsafeTimer = null;
  let barHideTimer = null;
  let currentBarPct = 0;

  let lastTriggerBtn = null;
  let lastTriggerAt = 0;
  let lastUserActionAt = 0;

  let topBarEl = null;
  let overlayEl = null;

  function ensureUI() {
    if (!document.body || IS_EMBEDDED) return;
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
    if (IS_EMBEDDED) return;
    ensureUI();
    if (!topBarEl) return;
    clearTimeout(barHideTimer);
    topBarEl.classList.add('is-active');
    if (currentBarPct < 25) {
      currentBarPct = 28;
      topBarEl.style.width = '28%';
      requestAnimationFrame(() => {
        if (sessionActive && topBarEl) {
          currentBarPct = 76;
          topBarEl.style.width = '76%';
        }
      });
    } else if (currentBarPct < 90) {
      currentBarPct = Math.min(90, currentBarPct + 8);
      topBarEl.style.width = `${currentBarPct}%`;
    }
  }

  function finishTopBar() {
    if (IS_EMBEDDED || !topBarEl) return;
    currentBarPct = 100;
    topBarEl.style.width = '100%';
    clearTimeout(barHideTimer);
    barHideTimer = setTimeout(() => {
      if (!sessionActive && topBarEl) {
        topBarEl.classList.remove('is-active');
        setTimeout(() => {
          if (!sessionActive && topBarEl) {
            currentBarPct = 0;
            topBarEl.style.width = '0%';
          }
        }, 220);
      }
    }, 180);
  }

  function pulseTabBar() {
    if (IS_EMBEDDED || sessionActive) return;
    clearTimeout(finishTimer);
    startTopBar();
    finishTimer = setTimeout(() => {
      if (activeCount === 0) {
        sessionActive = false;
        finishTopBar();
      }
    }, 260);
  }

  function showOverlay(texto) {
    if (IS_EMBEDDED) return;
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
    clearTimeout(finishTimer);
    finishTimer = null;
    activeCount += 1;
    sessionActive = true;
    startTopBar();
    if (btnRef) setButtonLoading(btnRef, true);

    if (usarOverlay && !IS_EMBEDDED && !overlayTimer && (!overlayEl || !overlayEl.classList.contains('is-visible'))) {
      overlayTimer = setTimeout(() => {
        if (sessionActive && activeCount > 0) showOverlay('Carregando...');
      }, DELAY_OVERLAY_MS);
    }

    clearTimeout(failsafeTimer);
    failsafeTimer = setTimeout(() => {
      activeCount = 0;
      sessionActive = false;
      hideOverlay();
      finishTopBar();
      document.querySelectorAll('[data-nx-loading="1"]').forEach(b => setButtonLoading(b, false));
    }, FAILSAFE_TIMEOUT_MS);
  }

  function endRequest(btnRef) {
    if (btnRef) setButtonLoading(btnRef, false);
    activeCount = Math.max(0, activeCount - 1);
    if (activeCount === 0) {
      clearTimeout(finishTimer);
      // Aguarda 280ms antes de encerrar: evita que chamadas sequenciais reiniciem o loading 3x
      finishTimer = setTimeout(() => {
        if (activeCount === 0) {
          sessionActive = false;
          clearTimeout(failsafeTimer);
          hideOverlay();
          finishTopBar();
        }
      }, FINISH_DEBOUNCE_MS);
    }
  }

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

  document.addEventListener('change', () => {
    lastUserActionAt = Date.now();
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') lastUserActionAt = Date.now();
  }, true);

  if (typeof window.fetch === 'function') {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async function (input, init) {
      const urlStr = typeof input === 'string' ? input : (input && input.url ? input.url : '');
      const method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      const agora = Date.now();
      const semAcaoRecente = (agora - PAGE_BOOT_AT > 3500) && (agora - lastUserActionAt > 1500);
      const isSilent = Boolean(
        (init && init.silent) ||
        SILENT_URL_RE.test(urlStr) ||
        (method === 'GET' && semAcaoRecente)
      );

      if (isSilent) {
        return originalFetch(input, init);
      }

      const btnRef = (lastTriggerBtn && (Date.now() - lastTriggerAt <= 250)) ? lastTriggerBtn : null;
      if (btnRef) lastTriggerBtn = null;

      const usarOverlay = !btnRef;
      beginRequest(usarOverlay, btnRef);
      try {
        return await originalFetch(input, init);
      } finally {
        endRequest(btnRef);
      }
    };
  }

  const TAB_RE = /^(aba[A-Z]\w*|view-(dashboard-geral|grid|schedule|lesson|estudos-os|financas|rotina|perfil|configuracoes|revisao|metas|tutorial-ios)|subview-rotina-(hoje|checklist|agenda))$/;
  function observarAbas() {
    if (IS_EMBEDDED) return;
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
