/**
 * notifications.js - Motor Inteligente de Notificações Locais & Web Push Real (iOS & Android) do CONVERGE
 * Monitora compromissos da Agenda em primeiro plano e registra Web Push VAPID para alertas com o site fechado.
 */

const ConvergeNotifications = {
  notificados: new Set(),
  intervalId: null,
  pushSubscribed: false,

  isIOS() {
    const ua = navigator.userAgent || '';
    const isAppleMobile = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return isAppleMobile;
  },

  isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  },

  getDeviceType() {
    if (this.isIOS()) return 'ios';
    if (/Android/i.test(navigator.userAgent || '')) return 'android';
    return 'desktop';
  },

  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  },

  getAuthHeaders() {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  },

  // Inicializa o Service Worker, sincroniza assinatura Push existente e inicia o monitor
  async init() {
    this.tokenSessao = localStorage.getItem('token');
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('/sw.js');
      } catch (err) {
        console.warn('[PWA] Service Worker não registrado:', err);
      }
    }

    if ('Notification' in window && Notification.permission === 'granted') {
      await this.registrarWebPushSilencioso();
    }

    this.iniciarMonitor();
    this.atualizarStatusUI();
    await this.convidarNoPrimeiroAcesso();
  },

  async convidarNoPrimeiroAcesso() {
    const modal = document.getElementById('convite-notificacoes');
    const token = this.tokenSessao;
    if (!token || !modal?.showModal) return;
    const guiaIOS = this.isIOS() && !this.isStandalone();
    try {
      const resposta = await fetch('/api/push/convite', {
        method: 'POST', headers: { Authorization: 'Bearer ' + token }
      });
      if (!resposta.ok || !(await resposta.json()).exibir || localStorage.getItem('token') !== token) return;
      if (!guiaIOS && (!('Notification' in window) || Notification.permission !== 'default')) return;
      const ativar = document.getElementById('convite-ativar-push');
      if (guiaIOS) ativar.textContent = 'Ver como ativar';
      ativar.addEventListener('click', () => {
        modal.close();
        this.solicitarPermissao().catch(() => alert('Não foi possível ativar os alertas. Você pode tentar novamente em App & Alertas.'));
      }, { once: true });
      modal.showModal();
    } catch (erro) {
      console.warn('[Alertas] Convite indisponível:', erro.name);
    }
  },

  // Registra/sincroniza inscrição Web Push com o backend sem interromper o usuário
  async registrarWebPushSilencioso() {
    try {
      if (localStorage.getItem('converge-push-pausado') === '1') return false;
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
      const token = this.tokenSessao;
      const conta = localStorage.getItem('usuarioEmail');
      const sessaoAtiva = () => token && localStorage.getItem('token') === token && !ConvergeSessao.encerrando;
      if (!conta || !sessaoAtiva()) return false;

      const keyResp = await fetch('/api/push/public-key');
      if (!keyResp.ok) return false;
      const keyData = await keyResp.json();
      if (!keyData.enabled || !keyData.publicKey) return false;

      const reg = await navigator.serviceWorker.ready;
      const expectedKey = this.urlBase64ToUint8Array(keyData.publicKey);
      let subscription = await reg.pushManager.getSubscription();
      if (!sessaoAtiva()) return false;

      if (subscription && localStorage.getItem(ConvergeSessao.chaveContaPush) !== conta) {
        await ConvergeSessao.permitirPush(false);
        if (!sessaoAtiva()) return false;
        await subscription.unsubscribe();
        subscription = await reg.pushManager.getSubscription();
        if (subscription) return false;
      }

      // Auto-recuperação: se a chave VAPID do servidor mudou, renova a assinatura
      if (subscription && subscription.options && subscription.options.applicationServerKey) {
        const existingBytes = new Uint8Array(subscription.options.applicationServerKey);
        const sameKey = existingBytes.length === expectedKey.length && existingBytes.every((v, i) => v === expectedKey[i]);
        if (!sameKey) {
          await subscription.unsubscribe();
          subscription = null;
        }
      }

      if (!subscription) {
        if (!sessaoAtiva()) return false;
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: expectedKey
        });
      }
      if (!sessaoAtiva()) return false;

      const timezone = (() => {
        try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo'; }
        catch (e) { return 'America/Sao_Paulo'; }
      })();

      const saveResp = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          timezone,
          device: this.getDeviceType()
        })
      });

      if (saveResp.ok && sessaoAtiva()) {
        await ConvergeSessao.permitirPush(true, sessaoAtiva);
        if (!sessaoAtiva()) return false;
        localStorage.setItem(ConvergeSessao.chaveContaPush, conta);
        this.pushSubscribed = true;
        return true;
      }
    } catch (err) {
      console.warn('[WebPush] Aviso ao sincronizar inscrição Push:', err.message || err);
    }
    return false;
  },

  // Exibe modal amigável para orientar usuários de iPhone fora do modo App instalado
  mostrarGuiaIOS() {
    let modal = document.getElementById('modal-guia-ios-push');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-guia-ios-push';
      modal.className = 'fixed inset-0 z-[9999] bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4';
      modal.innerHTML = `
        <div class="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-sm w-full p-5 space-y-4 text-slate-800">
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-center gap-2.5">
              <div class="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-lg">📱</div>
              <div>
                <h3 class="text-sm font-bold text-slate-900">Ativar Alertas no iPhone</h3>
                <p class="text-[11px] text-slate-500">Receba notificações mesmo com o site fechado</p>
              </div>
            </div>
            <button type="button" id="btn-fechar-guia-ios" class="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer">✕</button>
          </div>
          <video src="/tutorial-ios-notificacoes.mp4" controls playsinline preload="metadata" class="w-full max-h-64 rounded-xl bg-slate-950 border border-slate-200"></video>
          <ol class="text-xs text-slate-700 space-y-2 bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 list-decimal list-inside">
            <li>No <strong>Safari</strong>, toque no ícone <strong>Compartilhar</strong> (quadrado com seta para cima na barra inferior).</li>
            <li>Role e toque em <strong>Adicionar à Tela de Início</strong>.</li>
            <li>Abra o <strong>CONVERGE</strong> pelo ícone criado na tela inicial e toque em <strong>Ativar Alertas</strong>.</li>
          </ol>
          <button type="button" id="btn-ok-guia-ios" class="w-full py-2.5 rounded-xl text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 transition cursor-pointer">
            Entendi
          </button>
        </div>
      `;
      document.body.appendChild(modal);
      const fechar = () => modal.classList.add('hidden');
      modal.querySelector('#btn-fechar-guia-ios').addEventListener('click', fechar);
      modal.querySelector('#btn-ok-guia-ios').addEventListener('click', fechar);
      modal.addEventListener('click', (e) => { if (e.target === modal) fechar(); });
    }
    modal.classList.remove('hidden');
  },

  // Solicita permissão nativa + registra Web Push real (ou envia teste se já ativo)
  async solicitarPermissao() {
    localStorage.removeItem('converge-push-pausado');
    // Regra da Apple: no iPhone, Push só existe quando aberto pela Tela de Início
    if (this.isIOS() && !this.isStandalone()) {
      this.mostrarGuiaIOS();
      return false;
    }

    if (!('Notification' in window)) {
      alert('Seu navegador não suporta notificações. Use Chrome, Edge ou Safari (iOS 16.4+ na Tela de Início).');
      return false;
    }

    // Se já tem permissão concedida, garante assinatura Push e dispara um teste real do servidor!
    if (Notification.permission === 'granted') {
      const okSub = await this.registrarWebPushSilencioso();
      this.atualizarStatusUI();
      if (okSub) {
        const enviouPush = await this.enviarPushTeste();
        if (enviouPush) return true;
      }
      this.dispararNotificacao({
        titulo: '🔔 Teste de Alerta CONVERGE',
        corpo: 'Suas notificações estão ativas e funcionando perfeitamente!',
        tag: 'teste-local'
      });
      return true;
    }

    const permissao = await Notification.requestPermission();
    this.atualizarStatusUI();

    if (permissao === 'granted') {
      const okSub = await this.registrarWebPushSilencioso();
      this.atualizarStatusUI();

      if (okSub) {
        await this.enviarPushTeste();
      } else {
        this.dispararNotificacao({
          titulo: '🔔 Notificações Ativadas!',
          corpo: 'O CONVERGE irá avisar você na hora de cada compromisso e tarefa da sua rotina.',
          tag: 'boas-vindas'
        });
      }
      return true;
    }

    if (permissao === 'denied') {
      alert('As notificações foram bloqueadas nas configurações do navegador. Libere as notificações para o CONVERGE nas configurações do site.');
    }
    return false;
  },

  // Dispara um Push real vindo do servidor para testar na tela bloqueada / celular
  async enviarPushTeste(endpoint) {
    try {
      if (!endpoint) {
        const registro = await navigator.serviceWorker?.getRegistration('/');
        endpoint = (await registro?.pushManager?.getSubscription())?.endpoint;
      }
      if (!endpoint) return false;
      const resp = await fetch('/api/push/test', {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ endpoint })
      });
      if (!resp.ok) return false;
      const data = await resp.json();
      return Boolean(data.success && data.sent > 0);
    } catch (err) {
      console.warn('[WebPush] Erro ao disparar push de teste:', err);
      return false;
    }
  },

  // Dispara uma notificação nativa local com som suave (quando o app está aberto)
  async dispararNotificacao({ titulo, corpo, tag, icone = '/icon-192.png' }) {
    if (localStorage.getItem('converge-push-pausado') === '1') return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (!this.tokenSessao || this.tokenSessao !== localStorage.getItem('token')) return;

    this.tocarSomAlerta();

    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (this.tokenSessao !== localStorage.getItem('token')) return;
      if (reg && reg.showNotification) {
        reg.showNotification(titulo, {
          body: corpo,
          icon: icone,
          badge: icone,
          tag: tag || 'converge-alerta',
          renotify: true,
          vibrate: [200, 100, 200]
        });
        return;
      }
    }

    new Notification(titulo, {
      body: corpo,
      icon: icone,
      tag: tag || 'converge-alerta'
    });
  },

  tocarSomAlerta() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(783.99, ctx.currentTime + 0.15);

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch (e) {}
  },

  iniciarMonitor() {
    if (this.intervalId) clearInterval(this.intervalId);
    this.verificarCompromissos();
    this.intervalId = setInterval(() => {
      this.verificarCompromissos();
    }, 15000);
  },

  verificarCompromissos() {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (!this.tokenSessao || this.tokenSessao !== localStorage.getItem('token')) return;
    if (typeof rotinaState === 'undefined') return;

    const agora = new Date();
    const horaAtual = agora.getHours();
    const minutoAtual = agora.getMinutes();
    const minutoAtualTotal = horaAtual * 60 + minutoAtual;
    const hojeIso = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;

    const listaCompromissos = (rotinaState.compromissos || []).concat(rotinaState.agendaHoje || []);

    listaCompromissos.forEach((comp) => {
      if (comp.data && comp.data !== hojeIso) return;

      const horarioStr = comp.horario;
      if (!horarioStr || typeof horarioStr !== 'string' || !horarioStr.includes(':')) return;

      const [h, m] = horarioStr.split(':').map(Number);
      if (isNaN(h) || isNaN(m)) return;

      const minutoCompTotal = h * 60 + m;
      const diferencaMin = minutoCompTotal - minutoAtualTotal;

      const chaveAlertaExato = `exato_${comp.id || comp.titulo}_${hojeIso}_${horarioStr}`;
      const chaveAlertaPrevio = `previo_${comp.id || comp.titulo}_${hojeIso}_${horarioStr}`;

      if (diferencaMin === 0 && !this.notificados.has(chaveAlertaExato)) {
        this.notificados.add(chaveAlertaExato);
        this.dispararNotificacao({
          titulo: `⏰ Começando Agora: ${comp.titulo}`,
          corpo: `Horário agendado: ${horarioStr} (${comp.categoria ? comp.categoria.toUpperCase() : 'COMPROMISSO'})`,
          tag: chaveAlertaExato
        });
      }

      if (diferencaMin === 10 && !this.notificados.has(chaveAlertaPrevio)) {
        this.notificados.add(chaveAlertaPrevio);
        this.dispararNotificacao({
          titulo: `⏳ Lembrete em 10 Minutos: ${comp.titulo}`,
          corpo: `Seu compromisso está agendado para às ${horarioStr}. Prepare-se!`,
          tag: chaveAlertaPrevio
        });
      }
    });
  },

  atualizarStatusUI() {
    const btn = document.getElementById('btn-toggle-notificacoes');
    if (!btn) return;

    // No iOS Safari fora do modo instalado, mantém botão visível para mostrar o guia de instalação
    if (!('Notification' in window) && !this.isIOS()) {
      btn.style.display = 'none';
      return;
    }

    if ('Notification' in window && Notification.permission === 'granted') {
      btn.title = this.pushSubscribed
        ? 'Push Real Ativo (iOS/Android) — Clique para enviar um alerta de teste'
        : 'Notificações Ativas — Clique para testar um lembrete';
      btn.classList.add('text-emerald-700', 'bg-emerald-50', 'border-emerald-200');
      btn.classList.remove('text-slate-500', 'bg-white', 'border-slate-200');
      btn.innerHTML = `
        <svg class="w-3.5 h-3.5 text-emerald-700" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
        </svg>
        <span class="text-[11px] font-semibold text-emerald-800">${this.pushSubscribed ? 'Push Ativo (Testar)' : 'Alertas Ativos'}</span>
      `;
    } else {
      btn.title = 'Ativar notificações no celular (iOS & Android) mesmo com o site fechado';
      btn.classList.remove('text-emerald-700', 'bg-emerald-50', 'border-emerald-200');
      btn.classList.add('text-slate-600', 'bg-white', 'border-slate-200');
      btn.innerHTML = `
        <svg class="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        <span class="text-[11px] font-semibold text-slate-700">Ativar Alertas</span>
      `;
    }
  }
};

window.ConvergeNotifications = ConvergeNotifications;

document.addEventListener('DOMContentLoaded', () => {
  ConvergeNotifications.init();
});
