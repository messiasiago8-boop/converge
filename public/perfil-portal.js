(() => {
  const campo = id => document.getElementById(id);
  const token = () => localStorage.getItem('token');
  let perfil = {};
  let metas = [];
  let fotoPendente;
  let carregamento;
  let sugestao;

  async function api(url, method = 'GET', body) {
    const resposta = await fetchAuth(url, {
      method, cache: 'no-store',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined
    });
    const json = await resposta.json();
    if (!resposta.ok) throw new Error(json.error || json.message || 'Não foi possível concluir a ação.');
    return json;
  }

  function carregar() {
    carregamento ||= api('/api/perfil-portal').then(({ data }) => {
      perfil = data;
      atualizarFoto();
    }).catch(erro => { carregamento = undefined; throw erro; });
    return carregamento;
  }

  async function salvar(body) {
    ({ data: perfil } = await api('/api/perfil-portal', 'PATCH', body));
    atualizarFoto();
  }

  function atualizarFoto() {
    const nome = localStorage.getItem('usuarioNome') || 'Pessoa';
    const email = (localStorage.getItem('usuarioEmail') || '').trim().toLowerCase();
    const iniciais = nome.trim().split(/\s+/).slice(0, 2).map(palavra => palavra[0]).join('').toUpperCase();
    if (perfil.foto) {
      localStorage.setItem('usuarioFoto', perfil.foto);
      if (email) localStorage.setItem('usuarioFoto_' + email, perfil.foto);
    } else {
      localStorage.removeItem('usuarioFoto');
      if (email) localStorage.removeItem('usuarioFoto_' + email);
    }
    for (const id of ['perfil-avatar', 'sidebar-user-avatar']) {
      const destino = campo(id);
      if (!destino) continue;
      destino.textContent = iniciais;
      if (perfil.foto) {
        const foto = new Image();
        foto.src = perfil.foto;
        foto.alt = '';
        foto.className = 'h-full w-full object-cover';
        destino.replaceChildren(foto);
      }
    }
  }

  async function comprimirFoto(arquivo) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(arquivo.type) || arquivo.size > 10 * 1024 * 1024) {
      throw new Error('Escolha uma foto JPEG, PNG ou WebP de até 10 MB.');
    }
    const url = URL.createObjectURL(arquivo);
    try {
      const imagem = new Image();
      imagem.src = url;
      await imagem.decode();
      const lado = Math.min(imagem.naturalWidth, imagem.naturalHeight);
      const tela = document.createElement('canvas');
      tela.width = tela.height = 240;
      const contexto = tela.getContext('2d');
      contexto.fillStyle = '#fff';
      contexto.fillRect(0, 0, 240, 240);
      contexto.drawImage(imagem, (imagem.naturalWidth - lado) / 2, (imagem.naturalHeight - lado) / 2, lado, lado, 0, 0, 240, 240);
      return tela.toDataURL('image/jpeg', .75);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function mostrarMeta() {
    const meta = metas.find(item => item.id === perfil.meta);
    const progresso = campo('perfil-meta-progresso');
    campo('perfil-meta-titulo').textContent = meta?.titulo || 'Escolha uma das suas metas para acompanhar aqui.';
    progresso.hidden = campo('perfil-continuar-meta').hidden = !meta;
    progresso.value = Number(meta?.progresso) || 0;
    campo('perfil-meta-prazo').textContent = meta
      ? progresso.value + '% concluída' + (meta.prazo ? ' · até ' + formatarData(meta.prazo) : '')
      : '';
  }

  const formatarData = dia => new Date(dia + 'T12:00:00').toLocaleDateString('pt-BR');
  const diaDe = valor => valor && !Number.isNaN(new Date(valor).getTime())
    ? (valor.length === 10 ? valor : dataLocalRotina(new Date(valor))) : '';

  async function renderPerfil() {
    const [objetivos, aulas, tarefas, historico, habitos] = await Promise.all(
      ['/api/metas', '/api/videos', '/api/rotina/prioridades', '/api/rotina/historico-tarefas', '/api/rotina/habitos'].map(rota => api(rota))
    );
    metas = objetivos.data;
    campo('perfil-identidade').textContent = [localStorage.getItem('usuarioNome'), localStorage.getItem('usuarioEmail')].filter(Boolean).join(' · ');
    campo('perfil-foco').value = perfil.foco || '';
    campo('perfil-meta').replaceChildren(new Option('Sem destaque', ''), ...metas.map(meta => new Option(meta.titulo, meta.id)));
    campo('perfil-meta').value = metas.some(meta => meta.id === perfil.meta) ? perfil.meta : '';
    campo('perfil-remover-foto').hidden = !perfil.foto;
    mostrarMeta();

    const dias = obterDiasSemanaAtual().map(dia => dia.iso);
    const [inicio, fim] = [dias[0], dias.at(-1)];
    campo('perfil-periodo').textContent = formatarData(inicio) + ' a ' + formatarData(fim);
    const aulasFeitas = aulas.data.filter(aula => aula.concluido);
    const tarefasFeitas = new Map();
    for (const tarefa of historico.data.filter(item => item.status === 'concluida')) tarefasFeitas.set(tarefa.id + ':' + tarefa.criado_em, tarefa);
    for (const tarefa of tarefas.data) {
      const chave = tarefa.id + ':' + tarefa.criado_em;
      if (tarefa.concluida) tarefasFeitas.set(chave, tarefa);
      else tarefasFeitas.delete(chave);
    }
    const diasHabitos = new Set(habitos.data.flatMap(habito => habito.dias_concluidos || []).filter(dia => dias.includes(dia)));
    const metricas = [
      [aulasFeitas.filter(aula => dias.includes(diaDe(aula.concluido_em))).length, 'aulas concluídas', window.navIrParaLms],
      [[...tarefasFeitas.values()].filter(tarefa => dias.includes(diaDe(tarefa.concluida_em))).length, 'tarefas finalizadas', () => irParaRotina('checklist')],
      [diasHabitos.size, 'dias com hábitos registrados', () => irParaRotina('hoje')]
    ];
    campo('perfil-semana').replaceChildren(...metricas.map(([total, rotulo, acao]) => {
      const botao = document.createElement('button');
      botao.type = 'button';
      botao.className = 'rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-left text-sm font-semibold text-emerald-900';
      botao.textContent = total + ' ' + rotulo;
      botao.addEventListener('click', acao);
      return botao;
    }));

    const semanasEstudo = new Map();
    for (const aula of aulasFeitas) {
      const dia = diaDe(aula.concluido_em);
      if (!dia) continue;
      const primeira = obterDiasSemanaAtual(new Date(dia + 'T12:00:00'))[0].iso;
      if (!semanasEstudo.has(primeira)) semanasEstudo.set(primeira, new Set());
      semanasEstudo.get(primeira).add(dia);
    }
    const conquistas = [];
    if (metas.some(meta => meta.progresso >= 100)) conquistas.push('🏆 Primeira meta concluída');
    if ([...semanasEstudo.values()].some(semana => semana.size >= 3)) conquistas.push('📚 Primeira semana com três dias de estudo');
    campo('perfil-conquistas').replaceChildren(...(conquistas.length ? conquistas : ['Suas conquistas aparecem aqui conforme você avança.']).map(texto => {
      const item = document.createElement('li');
      item.textContent = texto;
      return item;
    }));

    const pendentes = aulas.data.filter(aula => !aula.concluido).slice(0, 2);
    const referencia = new Date();
    referencia.setDate(referencia.getDate() - (referencia.getDay() + 6) % 7);
    const inicioSugestao = dataLocalRotina(referencia);
    sugestao = pendentes.length && perfil.sugestaoDispensada !== inicioSugestao &&
      !metas.some(meta => meta.sugestao_semana === inicioSugestao)
      ? { inicio: inicioSugestao, aulas: pendentes } : null;
    campo('perfil-sugestao').classList.toggle('hidden', !sugestao);
    if (sugestao) {
      campo('perfil-sugestao-titulo').value = pendentes.length === 1 ? 'Concluir uma aula pendente' : 'Concluir duas aulas pendentes';
      campo('perfil-sugestao-prazo').value = fim;
    }
  }

  function irParaRotina(aba) {
    window.navIrParaRotina();
    campo('btn-subaba-' + aba).click();
  }

  async function inscricaoAtual() {
    const registro = await navigator.serviceWorker?.getRegistration('/');
    return registro?.pushManager?.getSubscription();
  }

  async function atualizarAlertas() {
    const inscricao = await inscricaoAtual();
    const ativos = Boolean(inscricao && localStorage.getItem('converge-push-pausado') !== '1' &&
      localStorage.getItem(ConvergeSessao.chaveContaPush) === localStorage.getItem('usuarioEmail'));
    campo('config-push-status').textContent = ativos ? 'Alertas ativos neste aparelho.' : 'Alertas desativados neste aparelho.';
    campo('config-push-ativar').disabled = ativos;
    campo('config-push-desativar').disabled = !ativos;
    campo('config-push-teste').disabled = !ativos;
  }

  async function renderConfiguracoes() {
    const { usuario, podeExcluir } = await api('/api/auth/perfil');
    campo('config-conta').elements.nome.value = usuario.nome;
    campo('config-conta').elements.email.value = usuario.email;
    campo('config-preferencias').elements.aba.value = perfil.aba || 'inicio';
    campo('config-preferencias').elements.semana.value = perfil.semana ?? 1;
    campo('config-exclusao').hidden = !podeExcluir;
    await atualizarAlertas();
  }

  function acao(id, evento, status, executar) {
    campo(id).addEventListener(evento, async e => {
      e.preventDefault();
      const botao = e.submitter || e.currentTarget;
      if (botao.disabled) return;
      botao.disabled = true;
      campo(status).textContent = '';
      try {
        await executar(e.currentTarget);
      } catch (erro) {
        campo(status).textContent = erro.message || 'Tente novamente.';
      } finally {
        botao.disabled = false;
        if (id.startsWith('config-push-')) await atualizarAlertas().catch(() => {});
      }
    });
  }

  acao('perfil-form', 'submit', 'perfil-status', async () => {
    const arquivo = campo('perfil-foto').files[0];
    if (arquivo) fotoPendente = await comprimirFoto(arquivo);
    await salvar({ foco: campo('perfil-foco').value.trim(), foto: fotoPendente, meta: Number(campo('perfil-meta').value) || null });
    campo('perfil-foto').value = '';
    fotoPendente = undefined;
    campo('perfil-remover-foto').hidden = !perfil.foto;
    mostrarMeta();
    campo('perfil-status').textContent = 'Perfil salvo.';
  });
  acao('perfil-remover-foto', 'click', 'perfil-status', async () => {
    await salvar({ foto: null });
    fotoPendente = undefined;
    campo('perfil-foto').value = '';
    campo('perfil-remover-foto').hidden = true;
    campo('perfil-status').textContent = 'Foto removida.';
  });
  acao('perfil-continuar-meta', 'click', 'perfil-status', async () => {
    document.querySelector('.btn-filtro-meta[data-tipo="todas"]')?.click();
    await window.navIrParaMetas();
    const card = campo('meta-portal-' + perfil.meta);
    card?.focus();
    card?.scrollIntoView({ block: 'center' });
  });
  acao('perfil-dispensar', 'click', 'perfil-status', async () => {
    await salvar({ sugestaoDispensada: sugestao.inicio });
    campo('perfil-sugestao').classList.add('hidden');
  });
  acao('perfil-sugestao', 'submit', 'perfil-status', async () => {
    await api('/api/metas', 'POST', {
      titulo: campo('perfil-sugestao-titulo').value.trim(), tipo: 'pessoal',
      prazo: campo('perfil-sugestao-prazo').value, sugestao_semana: sugestao.inicio,
      checklist: sugestao.aulas.map(aula => ({ texto: aula.titulo, concluido: false }))
    });
    campo('perfil-sugestao').classList.add('hidden');
    campo('perfil-status').textContent = 'Meta criada em Metas & Objetivos.';
  });
  acao('config-conta', 'submit', 'config-status', async form => {
    const { usuario, token: novoToken } = await api('/api/auth/perfil', 'PATCH', Object.fromEntries(new FormData(form)));
    const emailAnterior = localStorage.getItem('usuarioEmail');
    if (localStorage.getItem(ConvergeSessao.chaveContaPush) === emailAnterior) {
      localStorage.setItem(ConvergeSessao.chaveContaPush, usuario.email);
    }
    localStorage.setItem('token', novoToken);
    localStorage.setItem('usuarioNome', usuario.nome);
    localStorage.setItem('usuarioEmail', usuario.email);
    window.ConvergeNotifications.tokenSessao = novoToken;
    campo('sidebar-user-name').textContent = usuario.nome;
    campo('sidebar-user-email').textContent = usuario.email;
    form.elements.senhaAtual.value = form.elements.novaSenha.value = '';
    atualizarFoto();
    campo('config-status').textContent = 'Conta atualizada.';
  });
  acao('config-preferencias', 'submit', 'config-status', async form => {
    await salvar({ aba: form.elements.aba.value, semana: Number(form.elements.semana.value) });
    renderizarHabitos();
    campo('config-status').textContent = 'Preferências salvas.';
  });
  acao('config-excluir', 'submit', 'config-status', async form => {
    await api('/api/auth/perfil', 'DELETE', Object.fromEntries(new FormData(form)));
    await ConvergeSessao.sair('/login.html');
  });
  acao('config-push-ativar', 'click', 'config-status', async () => {
    await window.ConvergeNotifications.solicitarPermissao();
  });
  acao('config-push-desativar', 'click', 'config-status', async () => {
    localStorage.setItem('converge-push-pausado', '1');
    window.ConvergeNotifications.pushSubscribed = false;
    await ConvergeSessao.desvincularPush(token());
  });
  acao('config-push-teste', 'click', 'config-status', async () => {
    const inscricao = await inscricaoAtual();
    if (!inscricao?.endpoint || !await window.ConvergeNotifications.enviarPushTeste(inscricao.endpoint)) {
      throw new Error('Não foi possível entregar o teste neste aparelho.');
    }
    campo('config-status').textContent = 'Notificação de teste enviada para este aparelho.';
  });

  window.PerfilPortal = {
    primeiroDia: () => perfil.semana ?? 1,
    async iniciar(aindaNoInicio) {
      if (!token()) return;
      await carregar().catch(() => {});
      if (!aindaNoInicio()) return;
      if (perfil.aba === 'perfil') campo('nav-btn-perfil').click();
      if (perfil.aba === 'metas') window.navIrParaMetas();
      if (['agenda', 'checklist'].includes(perfil.aba)) irParaRotina(perfil.aba);
    },
    async abrir(aba) {
      const status = campo(aba === 'perfil' ? 'perfil-status' : 'config-status');
      status.textContent = 'Carregando…';
      try {
        await carregar();
        await (aba === 'perfil' ? renderPerfil() : renderConfiguracoes());
        status.textContent = '';
      } catch (erro) {
        status.textContent = erro.message;
      }
    }
  };
})();
