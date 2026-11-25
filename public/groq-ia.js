/**
 * groq-ia.js - Interface Unificada da CONVERGE IA (powered by Groq)
 * Controla todos os 4 módulos do CONVERGE via linguagem natural.
 */
(function () {
  const historicoChat = [];

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
  }

  function criarPainelGroq() {
    let drawer = document.getElementById('drawer-converge-groq-ia');
    if (drawer) return drawer;

    drawer = document.createElement('div');
    drawer.id = 'drawer-converge-groq-ia';
    drawer.className = 'fixed inset-0 z-[10000] hidden justify-end bg-slate-950/50 backdrop-blur-xs';
    drawer.innerHTML = `
      <div class="w-full max-w-md h-full bg-[#fffdf8] border-l border-[#1f2a27]/12 shadow-2xl flex flex-col">
        <!-- Topo -->
        <div class="px-5 py-4 bg-[#172b25] text-white flex items-center justify-between shrink-0">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-300 text-sm">⚡</div>
            <div>
              <h3 class="text-sm font-bold leading-tight">CONVERGE IA</h3>
              <p class="text-[10px] text-emerald-200/80">Groq • Controla Finanças, Rotina, Metas e Educação</p>
            </div>
          </div>
          <button type="button" id="btn-fechar-groq-ia" class="text-slate-300 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition cursor-pointer">✕</button>
        </div>

        <!-- Mensagens -->
        <div id="groq-ia-messages" class="flex-1 overflow-y-auto p-4 space-y-3 bg-[#f7f4ec]">
          <div class="p-3.5 rounded-2xl rounded-tl-none bg-white border border-[#1f2a27]/10 text-xs text-slate-700 leading-relaxed shadow-2xs">
            <p class="font-bold text-[#1f2a27] mb-1">Olá! Sou a CONVERGE IA (via Groq) ⚡</p>
            <p>Posso criar, editar, consultar e apagar itens em <strong>Finanças, Rotina, Agenda, Metas e Educação</strong>.</p>
            <div class="mt-3 flex flex-wrap gap-1.5">
              <button type="button" class="groq-sugestao text-[11px] px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition cursor-pointer">Resumo do meu dia</button>
              <button type="button" class="groq-sugestao text-[11px] px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition cursor-pointer">Coloque meu salário de dezembro para R$ 1500</button>
              <button type="button" class="groq-sugestao text-[11px] px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition cursor-pointer">Adicione estudar hoje às 19:00</button>
              <button type="button" class="groq-sugestao text-[11px] px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition cursor-pointer">Crie uma meta de juntar R$ 5000</button>
            </div>
          </div>
        </div>

        <!-- Input -->
        <form id="form-groq-ia" class="p-3.5 bg-white border-t border-[#1f2a27]/10 flex items-center gap-2 shrink-0">
          <input
            type="text"
            id="input-groq-ia"
            placeholder="Peça qualquer ação no CONVERGE..."
            autocomplete="off"
            class="flex-1 text-xs px-3.5 py-2.5 rounded-xl bg-[#f7f4ec] border border-[#1f2a27]/12 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600/30 text-slate-800"
            required
          />
          <button type="submit" id="btn-enviar-groq-ia" class="px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 transition cursor-pointer shrink-0">
            Enviar
          </button>
        </form>
      </div>
    `;
    document.body.appendChild(drawer);

    const fechar = () => {
      drawer.classList.add('hidden');
      drawer.classList.remove('flex');
    };
    drawer.querySelector('#btn-fechar-groq-ia').addEventListener('click', fechar);
    drawer.addEventListener('click', (e) => { if (e.target === drawer) fechar(); });

    const inputEl = drawer.querySelector('#input-groq-ia');
    drawer.querySelectorAll('.groq-sugestao').forEach(btn => {
      btn.addEventListener('click', () => {
        inputEl.value = btn.textContent;
        drawer.querySelector('#form-groq-ia').dispatchEvent(new Event('submit', { cancelable: true }));
      });
    });

    drawer.querySelector('#form-groq-ia').addEventListener('submit', async (e) => {
      e.preventDefault();
      const texto = inputEl.value.trim();
      if (!texto) return;

      const msgsEl = drawer.querySelector('#groq-ia-messages');
      const btnEnviar = drawer.querySelector('#btn-enviar-groq-ia');

      // Mensagem do usuário
      const userBubble = document.createElement('div');
      userBubble.className = 'flex justify-end';
      userBubble.innerHTML = `<div class="max-w-[85%] p-3 rounded-2xl rounded-tr-none bg-[#172b25] text-white text-xs leading-relaxed shadow-xs">${escapeHtml(texto)}</div>`;
      msgsEl.appendChild(userBubble);
      msgsEl.scrollTop = msgsEl.scrollHeight;

      inputEl.value = '';
      btnEnviar.disabled = true;
      btnEnviar.textContent = '...';

      const loadingEl = document.createElement('div');
      loadingEl.className = 'p-3 rounded-2xl rounded-tl-none bg-white border border-[#1f2a27]/10 text-xs text-slate-500 animate-pulse';
      loadingEl.textContent = 'Pensando e executando no CONVERGE...';
      msgsEl.appendChild(loadingEl);
      msgsEl.scrollTop = msgsEl.scrollHeight;

      try {
        const token = localStorage.getItem('token');
        const resp = await fetch('/api/groq-ia', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: 'Bearer ' + token } : {})
          },
          body: JSON.stringify({ mensagem: texto, historico: historicoChat })
        });
        const data = await resp.json();
        loadingEl.remove();

        if (!resp.ok || !data.success) {
          throw new Error(data.error || 'Erro ao falar com a CONVERGE IA.');
        }

        historicoChat.push({ role: 'user', content: texto });
        historicoChat.push({ role: 'assistant', content: data.resposta });

        const acoesHtml = (data.acoesExecutadas || []).length > 0
          ? `<div class="mb-2 flex flex-wrap gap-1">${data.acoesExecutadas.map(a => `<span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">✓ ${escapeHtml(a)}</span>`).join('')}</div>`
          : '';

        const botBubble = document.createElement('div');
        botBubble.className = 'p-3.5 rounded-2xl rounded-tl-none bg-white border border-[#1f2a27]/10 text-xs text-slate-800 leading-relaxed shadow-2xs';
        botBubble.innerHTML = `${acoesHtml}<div>${escapeHtml(data.resposta)}</div>`;
        msgsEl.appendChild(botBubble);
        msgsEl.scrollTop = msgsEl.scrollHeight;

        // Atualiza módulos afetados em tempo real
        const afetados = data.modulosAfetados || [];
        if (afetados.includes('rotina')) {
          if (typeof carregarPrioridades === 'function') carregarPrioridades();
          if (typeof carregarCompromissos === 'function') carregarCompromissos();
          if (typeof carregarAgendaHoje === 'function') carregarAgendaHoje();
          if (typeof carregarHabitos === 'function') carregarHabitos();
        }
        if (afetados.includes('metas') && typeof carregarMetas === 'function') carregarMetas();
        if (afetados.includes('educacao') && typeof fetchTopics === 'function') fetchTopics();
        if (afetados.includes('financas')) {
          const iframe = document.getElementById('iframe-financas');
          if (iframe && iframe.contentWindow && typeof iframe.contentWindow.carregarDadosDoBanco === 'function') {
            const mes = data.mesFinancasAfetado || iframe.contentDocument?.getElementById('filtroMes')?.value;
            if (mes && iframe.contentDocument?.getElementById('filtroMes')) {
              iframe.contentDocument.getElementById('filtroMes').value = mes;
            }
            iframe.contentWindow.carregarDadosDoBanco(mes);
          }
        }
        if (afetados.length > 0 && typeof carregarDashboardGeral === 'function') {
          carregarDashboardGeral();
        }
      } catch (err) {
        loadingEl.remove();
        const errBubble = document.createElement('div');
        errBubble.className = 'p-3 rounded-2xl rounded-tl-none bg-rose-50 border border-rose-200 text-xs text-rose-800';
        errBubble.textContent = err.message;
        msgsEl.appendChild(errBubble);
        msgsEl.scrollTop = msgsEl.scrollHeight;
      } finally {
        btnEnviar.disabled = false;
        btnEnviar.textContent = 'Enviar';
        inputEl.focus();
      }
    });

    return drawer;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const btnOpen = document.getElementById('btn-open-groq-ia');
    if (btnOpen) {
      btnOpen.addEventListener('click', () => {
        const drawer = criarPainelGroq();
        drawer.classList.remove('hidden');
        drawer.classList.add('flex');
        setTimeout(() => drawer.querySelector('#input-groq-ia')?.focus(), 60);
      });
    }
  });
})();
