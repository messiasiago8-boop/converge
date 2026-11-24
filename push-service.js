const fs = require('fs');
const path = require('path');

let webpush = null;
try {
  webpush = require('web-push');
} catch (err) {
  console.warn('[WebPush] Pacote web-push não carregado:', err.message);
}

function getLocalDateParts(date, timeZone) {
  const tz = timeZone || 'America/Sao_Paulo';
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const parts = {};
    formatter.formatToParts(date).forEach(p => {
      parts[p.type] = p.value;
    });
    const hour = parts.hour === '24' ? 0 : parseInt(parts.hour, 10);
    const minute = parseInt(parts.minute, 10);
    const isoDate = `${parts.year}-${parts.month}-${parts.day}`;
    return { isoDate, hour, minute, totalMinutes: hour * 60 + minute };
  } catch (e) {
    // Fallback para UTC-3 (Brasília) caso timezone inválido
    const br = new Date(date.getTime() - 3 * 60 * 60 * 1000);
    const isoDate = br.toISOString().slice(0, 10);
    const hour = br.getUTCHours();
    const minute = br.getUTCMinutes();
    return { isoDate, hour, minute, totalMinutes: hour * 60 + minute };
  }
}

function initPushService({ dataDir, obterBancoUsuario, salvarBancoUsuario }) {
  let vapidKeys = null;
  let enabled = false;
  let hasVapidEnv = false;

  const vapidFile = path.join(dataDir, 'vapid-keys.json');
  const subject = process.env.VAPID_SUBJECT || 'mailto:suporte@converge.app';

  if (webpush) {
    try {
      if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
        vapidKeys = {
          publicKey: process.env.VAPID_PUBLIC_KEY.trim(),
          privateKey: process.env.VAPID_PRIVATE_KEY.trim()
        };
        hasVapidEnv = true;
      } else if (fs.existsSync(vapidFile)) {
        const parsed = JSON.parse(fs.readFileSync(vapidFile, 'utf-8'));
        if (parsed.publicKey && parsed.privateKey) {
          vapidKeys = parsed;
        }
      }

      if (!vapidKeys) {
        vapidKeys = webpush.generateVAPIDKeys();
        try {
          if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
          fs.writeFileSync(vapidFile, JSON.stringify(vapidKeys, null, 2), 'utf-8');
        } catch (errWrite) {
          console.warn('[WebPush] Não foi possível salvar vapid-keys.json:', errWrite.message);
        }
      }

      webpush.setVapidDetails(subject, vapidKeys.publicKey, vapidKeys.privateKey);
      enabled = true;
      console.log('[WebPush] Motor VAPID pronto (iOS & Android Push ativo).');
    } catch (errInit) {
      console.error('[WebPush] Erro ao configurar chaves VAPID:', errInit.message);
      enabled = false;
    }
  }

  function isEnabled() {
    return enabled && Boolean(vapidKeys?.publicKey);
  }

  function getPublicKey() {
    return isEnabled() ? vapidKeys.publicKey : null;
  }

  function subscribeUser(usuarioId, subscription, meta = {}) {
    if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      throw new Error('Inscrição Push inválida (endpoint ou chaves ausentes).');
    }

    const dbUser = obterBancoUsuario(usuarioId);
    if (!Array.isArray(dbUser.push_subscriptions)) dbUser.push_subscriptions = [];

    const timezone = typeof meta.timezone === 'string' && meta.timezone.trim()
      ? meta.timezone.trim()
      : 'America/Sao_Paulo';
    const device = typeof meta.device === 'string' && meta.device.trim()
      ? meta.device.trim()
      : 'web';

    const existente = dbUser.push_subscriptions.find(s => s.endpoint === subscription.endpoint);
    if (existente) {
      existente.keys = subscription.keys;
      existente.timezone = timezone;
      existente.device = device;
      existente.atualizado_em = new Date().toISOString();
    } else {
      dbUser.push_subscriptions.push({
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        timezone,
        device,
        criado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString()
      });
    }

    salvarBancoUsuario(dbUser, usuarioId);
    return { subscribedCount: dbUser.push_subscriptions.length };
  }

  function unsubscribeUser(usuarioId, endpoint) {
    const dbUser = obterBancoUsuario(usuarioId);
    if (!Array.isArray(dbUser.push_subscriptions)) dbUser.push_subscriptions = [];
    const antes = dbUser.push_subscriptions.length;
    dbUser.push_subscriptions = endpoint
      ? dbUser.push_subscriptions.filter(s => s.endpoint !== endpoint)
      : [];
    if (dbUser.push_subscriptions.length !== antes) {
      salvarBancoUsuario(dbUser, usuarioId);
    }
    return { subscribedCount: dbUser.push_subscriptions.length };
  }

  function getStatusForUser(usuarioId) {
    const dbUser = obterBancoUsuario(usuarioId);
    const subs = Array.isArray(dbUser.push_subscriptions) ? dbUser.push_subscriptions : [];
    return {
      enabled: isEnabled(),
      subscribedCount: subs.length,
      hasVapidEnv
    };
  }

  async function sendPushToUser(usuarioId, payload) {
    if (!isEnabled()) {
      return { sent: 0, failed: 0, removed: 0, error: 'Web Push desabilitado no servidor.' };
    }

    const dbUser = obterBancoUsuario(usuarioId);
    const subs = Array.isArray(dbUser.push_subscriptions) ? dbUser.push_subscriptions : [];
    if (subs.length === 0) {
      return { sent: 0, failed: 0, removed: 0 };
    }

    const message = JSON.stringify({
      title: payload.title || 'CONVERGE',
      body: payload.body || '',
      tag: payload.tag || 'converge-push',
      url: payload.url || '/',
      icon: payload.icon || '/icon-192.png'
    });

    let sent = 0;
    let failed = 0;
    const endpointsParaRemover = new Set();

    await Promise.all(subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          message,
          { TTL: 3600 }
        );
        sent += 1;
      } catch (err) {
        failed += 1;
        const statusCode = err && err.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          endpointsParaRemover.add(sub.endpoint);
        } else {
          console.warn(`[WebPush] Falha ao enviar para usuário ${usuarioId} (${statusCode || err.message})`);
        }
      }
    }));

    if (endpointsParaRemover.size > 0) {
      dbUser.push_subscriptions = subs.filter(s => !endpointsParaRemover.has(s.endpoint));
      salvarBancoUsuario(dbUser, usuarioId);
    }

    return { sent, failed, removed: endpointsParaRemover.size };
  }

  async function checkAndDispatchDueNotifications() {
    if (!isEnabled()) {
      return { checkedUsers: 0, sent: 0, failed: 0, skipped: true };
    }

    let files = [];
    try {
      files = fs.readdirSync(dataDir).filter(f => /^database_user_\d+\.json$/.test(f));
    } catch (err) {
      return { checkedUsers: 0, sent: 0, failed: 0, error: err.message };
    }

    const agora = new Date();
    const agoraMs = agora.getTime();
    const limiteLimpezaMs = 48 * 60 * 60 * 1000; // 48h

    let checkedUsers = 0;
    let totalSent = 0;
    let totalFailed = 0;

    for (const file of files) {
      const match = file.match(/^database_user_(\d+)\.json$/);
      if (!match) continue;
      const usuarioId = parseInt(match[1], 10);

      let dbUser;
      try {
        dbUser = obterBancoUsuario(usuarioId);
      } catch (e) {
        continue;
      }

      const subs = Array.isArray(dbUser.push_subscriptions) ? dbUser.push_subscriptions : [];
      if (subs.length === 0) continue;

      checkedUsers += 1;
      if (!dbUser.push_notificados || typeof dbUser.push_notificados !== 'object') {
        dbUser.push_notificados = {};
      }

      // Limpa chaves antigas (>48h) para manter o JSON leve
      let alterou = false;
      for (const [k, ts] of Object.entries(dbUser.push_notificados)) {
        if (typeof ts !== 'number' || agoraMs - ts > limiteLimpezaMs) {
          delete dbUser.push_notificados[k];
          alterou = true;
        }
      }

      const tz = subs[0].timezone || 'America/Sao_Paulo';
      const localNow = getLocalDateParts(agora, tz);
      const compromissos = Array.isArray(dbUser.compromissos) ? dbUser.compromissos : [];

      for (const comp of compromissos) {
        if (!comp || !comp.horario || typeof comp.horario !== 'string' || !comp.horario.includes(':')) continue;
        if (comp.data && comp.data.slice(0, 10) !== localNow.isoDate) continue;

        const [h, m] = comp.horario.split(':').map(Number);
        if (Number.isNaN(h) || Number.isNaN(m)) continue;

        const minutoComp = h * 60 + m;
        const diferencaMin = minutoComp - localNow.totalMinutes;

        const chavePrevio = `previo_${comp.id || comp.titulo}_${localNow.isoDate}_${comp.horario}`;
        const chaveExato = `exato_${comp.id || comp.titulo}_${localNow.isoDate}_${comp.horario}`;

        // Janela de 10 minutos antes (compatível com cron de 5 em 5 min: entre 6 e 12 min antes)
        if (diferencaMin >= 6 && diferencaMin <= 12 && !dbUser.push_notificados[chavePrevio]) {
          dbUser.push_notificados[chavePrevio] = agoraMs;
          alterou = true;
          salvarBancoUsuario(dbUser, usuarioId);

          const res = await sendPushToUser(usuarioId, {
            title: `⏳ Em ${diferencaMin} min: ${comp.titulo}`,
            body: `Compromisso agendado para às ${comp.horario}${comp.local ? ' • ' + comp.local : ''}`,
            tag: chavePrevio,
            url: '/'
          });
          totalSent += res.sent;
          totalFailed += res.failed;
        }

        // Janela do horário exato (compatível com cron de 5 em 5 min: entre -3 e +2 min)
        if (diferencaMin >= -3 && diferencaMin <= 2 && !dbUser.push_notificados[chaveExato]) {
          dbUser.push_notificados[chaveExato] = agoraMs;
          alterou = true;
          salvarBancoUsuario(dbUser, usuarioId);

          const res = await sendPushToUser(usuarioId, {
            title: `⏰ Começando agora: ${comp.titulo}`,
            body: `Horário: ${comp.horario}${comp.local ? ' • ' + comp.local : ''}`,
            tag: chaveExato,
            url: '/'
          });
          totalSent += res.sent;
          totalFailed += res.failed;
        }
      }

      if (alterou) {
        try {
          // Recarrega para não sobrescrever limpeza de subscriptions feita em sendPushToUser
          const atualizado = obterBancoUsuario(usuarioId);
          atualizado.push_notificados = dbUser.push_notificados;
          salvarBancoUsuario(atualizado, usuarioId);
        } catch (e) {}
      }
    }

    return {
      checkedUsers,
      sent: totalSent,
      failed: totalFailed,
      timestamp: agora.toISOString()
    };
  }

  return {
    isEnabled,
    getPublicKey,
    subscribeUser,
    unsubscribeUser,
    getStatusForUser,
    sendPushToUser,
    checkAndDispatchDueNotifications
  };
}

module.exports = { initPushService, getLocalDateParts };
