const ConvergeSessao = {
  encerrando: false,
  chaveContaPush: 'converge-conta-push',

  async permitirPush(permitir, sessaoAtiva) {
    if (!('caches' in window)) return;
    const cache = await caches.open('converge-sessao');
    const bloqueio = '/converge-push-bloqueado';
    if (permitir) {
      if (sessaoAtiva()) await cache.delete(bloqueio);
    } else {
      await cache.put(bloqueio, new Response('1'));
    }
  },

  async desvincularPush(token) {
    if (!('serviceWorker' in navigator)) return;
    await this.permitirPush(false).catch(() => {});
    const registro = await navigator.serviceWorker.getRegistration('/');
    if (!registro) return;
    const cancelar = async () => {
      const inscricao = await registro.pushManager?.getSubscription();
      if (!inscricao) return;
      const removerServidor = token && fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: inscricao.endpoint }),
        keepalive: true
      });
      await Promise.allSettled([removerServidor, inscricao.unsubscribe()]);
    };
    const fecharNotificacoes = async () => {
      for (const alerta of await registro.getNotifications()) alerta.close();
    };
    await Promise.allSettled([cancelar(), fecharNotificacoes()]);
  },

  async sair(destino) {
    if (this.encerrando) return;
    this.encerrando = true;
    const token = localStorage.getItem('token');
    for (const chave of ['token', 'usuarioNome', 'usuarioEmail', this.chaveContaPush]) {
      localStorage.removeItem(chave);
    }
    let prazo;
    try {
      await Promise.race([
        this.desvincularPush(token).catch(() => {}),
        new Promise(resolve => { prazo = setTimeout(resolve, 3000); })
      ]);
    } finally {
      clearTimeout(prazo);
      const pagina = window.parent === window ? window : window.parent;
      pagina.location.replace(destino);
    }
  }
};
