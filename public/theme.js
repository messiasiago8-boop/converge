/**
 * theme.js — comportamento "vivo" do tema Sálvia & Areia.
 *  - Spotlight que segue o mouse nos cards
 *  - Tilt 3D nos cards de vídeo
 *  - Animação de entrada (reveal) escalonada
 *  - Transição suave ao trocar de aba/visão
 *  - Hero do Portal: saudação, relógio, contadores animados, anel de progresso
 *    e card "Continuar de onde parou"
 * Tudo é aditivo: não altera a lógica existente do sistema.
 */
(function () {
  'use strict';
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 1. Spotlight + Tilt ---------- */
  const SPOT_SELECTOR = '.bg-white.border.rounded-xl, .bg-white.border.rounded-2xl, .nx-resume';
  document.addEventListener('mousemove', (e) => {
    const el = e.target.closest && e.target.closest(SPOT_SELECTOR);
    if (!el) return;
    if (!el.classList.contains('nx-resume')) el.classList.add('nx-spot');
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
    el.style.setProperty('--my', (e.clientY - r.top) + 'px');

    // Tilt apenas nos cards do catálogo de vídeos
    if (!reduce && el.parentElement && el.parentElement.id === 'videos-grid-container') {
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      el.style.setProperty('--ry', (px * 7).toFixed(2) + 'deg');
      el.style.setProperty('--rx', (-py * 7).toFixed(2) + 'deg');
    }
  }, { passive: true });
  document.addEventListener('mouseout', (e) => {
    const el = e.target.closest && e.target.closest('#videos-grid-container > div');
    if (el && !el.contains(e.relatedTarget)) {
      el.style.setProperty('--rx', '0deg');
      el.style.setProperty('--ry', '0deg');
    }
  }, { passive: true });

  /* ---------- 2. Reveal escalonado em grades dinâmicas ---------- */
  const REVEAL_PARENTS = ['videos-grid-container', 'schedule-days-grid', 'gridCartoesProjetos', 'gridCardsInvestimentos'];
  function revealChildren(parent) {
    if (reduce) return;
    Array.from(parent.children).forEach((child, i) => {
      if (child.classList.contains('nx-reveal')) return;
      child.style.setProperty('--i', Math.min(i, 12));
      child.classList.add('nx-reveal');
      child.addEventListener('animationend', () => child.classList.remove('nx-reveal'), { once: true });
    });
  }
  function watchGrid(id) {
    const parent = document.getElementById(id);
    if (!parent || parent.__nxWatched) return;
    parent.__nxWatched = true;
    new MutationObserver(() => revealChildren(parent)).observe(parent, { childList: true });
    revealChildren(parent);
  }

  /* ---------- 3. Transição ao trocar de aba / visão ---------- */
  const TAB_IDS = /^(aba[A-Z]\w*|view-(grid|schedule|lesson|financas))$/;
  function watchTabs() {
    const hiddenState = new WeakMap();
    const els = Array.from(document.querySelectorAll('[id]')).filter((el) => TAB_IDS.test(el.id));
    els.forEach((el) => {
      hiddenState.set(el, el.classList.contains('hidden'));
      new MutationObserver(() => {
        const wasHidden = hiddenState.get(el);
        const isHidden = el.classList.contains('hidden');
        hiddenState.set(el, isHidden);
        if (wasHidden && !isHidden && !reduce) {
          el.classList.remove('nx-tabin');
          void el.offsetWidth;
          el.classList.add('nx-tabin');
          setTimeout(() => el.classList.remove('nx-tabin'), 700);
        }
      }).observe(el, { attributes: true, attributeFilter: ['class'] });
    });
  }

  /* ---------- 4. Hero do Portal ---------- */
  const fmtTime = (s) => {
    s = Math.max(0, Math.floor(s || 0));
    const m = Math.floor(s / 60), r = s % 60;
    return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
  };
  const ytId = (url) => {
    const m = (url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    return m ? m[1] : 'M7lc1UVf-VE';
  };
  function countUp(el, to) {
    if (!el) return;
    const from = Number(el.dataset.v || 0);
    el.dataset.v = to;
    if (reduce || from === to) { el.textContent = to; return; }
    const t0 = performance.now(), dur = 1100;
    (function step(t) {
      const k = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(from + (to - from) * eased);
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }
  function greeting() {
    const h = new Date().getHours();
    return h < 5 ? 'Boa madrugada' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  }
  function formatarDataNatural(d) {
    const str = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    // Ex: "sábado, 21 de novembro" -> "Sábado, 21 de novembro"
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
  function obterPrimeiroNomeUsuario() {
    const nomeCompleto = localStorage.getItem('usuarioNome') || '';
    if (!nomeCompleto) return 'Estudante';
    const partes = nomeCompleto.trim().split(/\s+/);
    return partes[0] || 'Estudante';
  }
  function tickClock() {
    const d = new Date();
    const date = document.getElementById('nx-date');
    const greet = document.getElementById('nx-greet');
    if (date) date.textContent = formatarDataNatural(d);
    if (greet) {
      const primeiroNome = obterPrimeiroNomeUsuario();
      greet.innerHTML = `${greeting()},<br><em>${primeiroNome}</em>`;
    }
  }

  async function updateHero() {
    const hero = document.getElementById('nx-hero');
    if (!hero) return;
    let videos = [];
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const res = await fetch('/api/videos', { headers });
      const j = await res.json();
      if (j.success) videos = j.data;
    } catch (e) { return; }

    const total = videos.length;
    const done = videos.filter((v) => v.concluido).length;
    const doing = videos.filter((v) => !v.concluido && v.segundo_atual > 0).length;
    const pct = total ? Math.round((done / total) * 100) : 0;

    countUp(document.getElementById('nx-s-total'), total);
    countUp(document.getElementById('nx-s-done'), done);
    countUp(document.getElementById('nx-s-doing'), doing);
    countUp(document.getElementById('nx-ring-num'), pct);

    // Ajuste de plural dinâmico nas labels
    const lTotal = document.getElementById('nx-l-total');
    const lDone = document.getElementById('nx-l-done');
    const lDoing = document.getElementById('nx-l-doing');
    if (lTotal) lTotal.textContent = total === 1 ? 'Aula' : 'Aulas';
    if (lDone) lDone.textContent = done === 1 ? 'Concluída' : 'Concluídas';
    if (lDoing) lDoing.textContent = doing === 1 ? 'Em curso' : 'Em curso';

    // Puxa resumo financeiro integrado (Disponível no mês)
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const resFin = await fetch('/api/dados', { headers });
      if (resFin.ok) {
        const dadosFin = await resFin.json();
        const dispEl = document.getElementById('nx-s-finance');
        if (dispEl && dadosFin && dadosFin.resumo) {
          const valDisp = Number(dadosFin.resumo.saldoDisponivelTotal || 0);
          dispEl.textContent = valDisp.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        }
      }
    } catch (errFin) {
      console.warn('Não foi possível carregar resumo financeiro no hero:', errFin);
    }

    const fg = document.querySelector('#nx-hero .nx-ring .fg');
    if (fg) fg.style.strokeDashoffset = String(327 - (327 * pct) / 100);

    const txt = document.getElementById('nx-ring-msg');
    if (txt) {
      txt.textContent = !total ? 'Cadastre sua primeira aula para começar a jornada.'
        : pct === 100 ? 'Tudo concluído! Hora de celebrar e planejar novas trilhas.'
        : pct >= 50 ? 'Você já passou da metade. Mantenha o ritmo, está indo muito bem.'
        : done > 0 ? 'Bom começo! Cada aula concluída é um passo firme.'
        : 'Escolha uma aula e dê o primeiro passo hoje.';
    }

    // "Continuar de onde parou"
    const slot = document.getElementById('nx-resume-slot');
    if (!slot) return;
    const lastId = Number(localStorage.getItem('nx_last_video') || 0);
    let pick = videos.find((v) => v.id === lastId && !v.concluido)
      || videos.filter((v) => !v.concluido && v.segundo_atual > 0).sort((a, b) => b.segundo_atual - a.segundo_atual)[0]
      || videos.find((v) => !v.concluido);

    if (!pick) {
      slot.innerHTML = total
        ? '<div class="nx-resume" style="cursor:default"><div><small>Parabéns</small><strong>Você concluiu todas as aulas cadastradas 🎉</strong></div></div>'
        : '';
      return;
    }
    const started = pick.segundo_atual > 0;
    slot.innerHTML =
      '<button type="button" class="nx-resume" id="nx-resume-btn">' +
        '<span class="thumb"><img alt="" src="https://img.youtube.com/vi/' + ytId(pick.url_youtube) + '/mqdefault.jpg"><span class="play"><i>▶</i></span></span>' +
        '<span style="min-width:0;flex:1">' +
          '<small>' + (started ? 'Continuar de onde parou' : 'Próxima aula sugerida') + '</small>' +
          '<strong></strong>' +
          (started ? '<span class="bar"><i style="width:' + Math.min(96, 8 + Math.log10(1 + pick.segundo_atual) * 24) + '%"></i></span><em>Parou em ' + fmtTime(pick.segundo_atual) + '</em>' : '<em>Toque para iniciar</em>') +
        '</span>' +
      '</button>';
    slot.querySelector('strong').textContent = pick.titulo;
    slot.querySelector('#nx-resume-btn').addEventListener('click', () => {
      if (typeof openLessonView === 'function') openLessonView(pick, 'grid');
    });
  }

  /* ---------- Inicialização ---------- */
  function init() {
    REVEAL_PARENTS.forEach(watchGrid);
    // grades criadas depois (ex.: abas do Finanças)
    new MutationObserver(() => REVEAL_PARENTS.forEach(watchGrid)).observe(document.body, { childList: true, subtree: true });
    watchTabs();

    if (document.getElementById('nx-hero')) {
      tickClock();
      setInterval(tickClock, 1000);
      updateHero();
      setInterval(() => {
        const g = document.getElementById('view-grid');
        if (g && !g.classList.contains('hidden')) updateHero();
      }, 15000);
      const grid = document.getElementById('view-grid');
      if (grid) {
        let was = grid.classList.contains('hidden');
        new MutationObserver(() => {
          const now = grid.classList.contains('hidden');
          if (was && !now) updateHero();
          was = now;
        }).observe(grid, { attributes: true, attributeFilter: ['class'] });
      }
      // memoriza a última aula aberta
      const original = window.openLessonView;
      if (typeof original === 'function') {
        window.openLessonView = function (video) {
          try { if (video && video.id) localStorage.setItem('nx_last_video', video.id); } catch (e) {}
          return original.apply(this, arguments);
        };
      }
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
