/**
 * notifications.js - Motor Inteligente de Notificações Locais & Push do CONVERGE
 * Monitora compromissos da Agenda, alertas prévios de 10 min e horário exato.
 */

const ConvergeNotifications = {
  notificados: new Set(), // IDs ou chaves de eventos já notificados no ciclo para evitar repetição
  intervalId: null,

  // Inicializa o Service Worker e o monitor de lembretes
  async init() {
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('/sw.js');
      } catch (err) {
        console.warn('[PWA] Service Worker não registrado:', err);
      }
    }

    this.iniciarMonitor();
    this.atualizarStatusUI();
  },

  // Solicita permissão nativa ao usuário
  async solicitarPermissao() {
    if (!('Notification' in window)) {
      alert('Seu navegador não suporta notificações de área de trabalho.');
      return false;
    }

    const permissao = await Notification.requestPermission();
    this.atualizarStatusUI();

    if (permissao === 'granted') {
      this.dispararNotificacao({
        titulo: '🔔 Notificações Ativadas!',
        corpo: 'O CONVERGE irá avisar você na hora de cada compromisso e tarefa da sua rotina.',
        tag: 'boas-vindas'
      });
      return true;
    }
    return false;
  },

  // Dispara uma notificação nativa com som suave
  async dispararNotificacao({ titulo, corpo, tag, icone = '/logo-converge.jpg' }) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    // Toca som de alerta suave via Web Audio API (sem dependência de arquivo de áudio externo)
    this.tocarSomAlerta();

    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
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

    // Fallback nativo
    new Notification(titulo, {
      body: corpo,
      icon: icone,
      tag: tag || 'converge-alerta'
    });
  },

  // Sintetizador de áudio nativo suave (bip elegante de notificação)
  tocarSomAlerta() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      // Melodia ascendente suave (Dó5 -> Sol5)
      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(783.99, ctx.currentTime + 0.15);

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch (e) {
      // Ignora erro de autoplay
    }
  },

  // Monitora a cada 15 segundos os compromissos de hoje
  iniciarMonitor() {
    if (this.intervalId) clearInterval(this.intervalId);

    // Executa imediatamente e depois a cada 15s
    this.verificarCompromissos();
    this.intervalId = setInterval(() => {
      this.verificarCompromissos();
    }, 15000);
  },

  verificarCompromissos() {
    if (Notification.permission !== 'granted') return;
    if (typeof rotinaState === 'undefined') return;

    const agora = new Date();
    const horaAtual = agora.getHours();
    const minutoAtual = agora.getMinutes();
    const minutoAtualTotal = horaAtual * 60 + minutoAtual;
    const hojeIso = agora.toISOString().slice(0, 10);

    // 1. Monitorar compromissos da rotinaState.compromissos
    const listaCompromissos = (rotinaState.compromissos || []).concat(rotinaState.agendaHoje || []);

    listaCompromissos.forEach((comp) => {
      // Se tiver data e não for hoje, ignora
      if (comp.data && comp.data !== hojeIso) return;

      const horarioStr = comp.horario;
      if (!horarioStr || typeof horarioStr !== 'string' || !horarioStr.includes(':')) return;

      const [h, m] = horarioStr.split(':').map(Number);
      if (isNaN(h) || isNaN(m)) return;

      const minutoCompTotal = h * 60 + m;
      const diferencaMin = minutoCompTotal - minutoAtualTotal;

      const chaveAlertaExato = `exato_${comp.id || comp.titulo}_${hojeIso}_${h}:${m}`;
      const chaveAlertaPrevio = `previo_${comp.id || comp.titulo}_${hojeIso}_${h}:${m}`;

      // A) Alerta no horário exato (diferença de 0 minutos)
      if (diferencaMin === 0 && !this.notificados.has(chaveAlertaExato)) {
        this.notificados.add(chaveAlertaExato);
        this.dispararNotificacao({
          titulo: `⏰ Começando Agora: ${comp.titulo}`,
          corpo: `Horário agendado: ${horarioStr} (${comp.categoria ? comp.categoria.toUpperCase() : 'COMPROMISSO'})`,
          tag: chaveAlertaExato
        });
      }

      // B) Alerta prévio (10 minutos antes)
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

  // Atualiza visual do botão de sino no cabeçalho
  atualizarStatusUI() {
    const btn = document.getElementById('btn-toggle-notificacoes');
    if (!btn) return;

    if (!('Notification' in window)) {
      btn.style.display = 'none';
      return;
    }

    if (Notification.permission === 'granted') {
      btn.title = 'Notificações Ativas (Clique para testar um lembrete)';
      btn.classList.add('text-emerald-700', 'bg-emerald-50', 'border-emerald-200');
      btn.classList.remove('text-slate-500', 'bg-white', 'border-slate-200');
      btn.innerHTML = `
        <svg class="w-3.5 h-3.5 text-emerald-700" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
        </svg>
        <span class="text-[11px] font-semibold text-emerald-800">Alertas Ativos</span>
      `;
    } else {
      btn.title = 'Ativar notificações de compromissos e horários';
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

// Inicia automaticamente quando a página carrega
document.addEventListener('DOMContentLoaded', () => {
  ConvergeNotifications.init();
});
