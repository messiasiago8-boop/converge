(() => {
  const campo = id => document.getElementById(id);
  const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const diaCurto = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  const categorias = { 50: 'Essenciais', 30: 'Desejos', 20: 'Reserva' };
  let carregamento = 0;
  let dadosAtuais = null;

  function elemento(tag, texto = '', classe = '') {
    const el = document.createElement(tag);
    el.textContent = texto;
    el.className = classe;
    return el;
  }

  function adicionarDias(data, dias) {
    return new Date(data.getFullYear(), data.getMonth(), data.getDate() + dias, 12);
  }

  function segunda(offset = 0) {
    const hoje = new Date();
    return adicionarDias(hoje, -((hoje.getDay() + 6) % 7) + offset * 7);
  }

  const iso = data => dataLocalRotina(data);
  const periodo = inicio => `${diaCurto.format(inicio)} a ${diaCurto.format(adicionarDias(inicio, 6))}`;
  const vencimento = valor => diaCurto.format(new Date(`${valor}T12:00:00`));

  function dataEvento(valor) {
    if (typeof valor !== 'string' || !valor) return '';
    if (!valor.includes('T')) return valor.slice(0, 10);
    const data = new Date(valor);
    return Number.isFinite(data.getTime()) ? iso(data) : '';
  }

  async function api(rota, options) {
    const resposta = await fetchAuth(rota, options);
    const json = await resposta.json();
    if (!resposta.ok || !json.success) throw new Error(json.message || json.error || 'Não foi possível carregar os dados.');
    return json;
  }

  function adicionarLista(pai, itens, vazio) {
    if (!itens.length) {
      pai.append(elemento('p', vazio, 'text-sm text-slate-600'));
      return;
    }
    const lista = elemento('ul', '', 'list-disc space-y-1 pl-5 text-sm text-slate-700');
    for (const item of itens) lista.append(elemento('li', item));
    pai.append(lista);
  }

  function botao(texto, acao) {
    const el = elemento('button', texto, 'rounded-md border border-emerald-300 px-3 py-1.5 text-sm font-semibold text-emerald-900 hover:bg-emerald-50');
    el.type = 'button';
    el.addEventListener('click', acao);
    return el;
  }

  function cartao(titulo) {
    const secao = elemento('section', '', 'space-y-3 rounded-xl border border-slate-200 bg-white p-4');
    secao.append(elemento('h2', titulo, 'text-lg font-semibold text-slate-900'));
    campo('cards-revisao').append(secao);
    return secao;
  }

  function renderizar(dados) {
    const { inicio, diaInicial, diaFinal, tarefas, historico, aulas, metas, despesas, planos, atual } = dados;
    const pertence = dia => dia >= diaInicial && dia <= diaFinal;
    campo('cards-revisao').replaceChildren();

    const rotina = cartao('Rotina');
    if (tarefas && historico) {
      const concluidas = historico.filter(item => item.status === 'concluida' && pertence(dataEvento(item.concluida_em)));
      const abertas = tarefas.filter(item => !item.concluida && dataEvento(item.criado_em) <= diaFinal);
      rotina.append(elemento('p', `${concluidas.length} tarefas concluídas no período · ${abertas.length} pendências ainda abertas`, 'font-medium'));
      adicionarLista(rotina, abertas.slice(0, 5).map(item => item.texto), 'Nenhuma pendência em aberto.');
      rotina.append(botao('Abrir Rotina', () => window.navIrParaRotina()));
    } else rotina.append(elemento('p', 'Não foi possível carregar a rotina.'));

    const estudos = cartao('Estudos');
    if (aulas) {
      const concluidas = aulas.filter(aula => aula.concluido && pertence(dataEvento(aula.concluido_em)));
      const emCurso = aulas.filter(aula => !aula.concluido && Number(aula.segundo_atual) > 0
        && (atual || pertence(dataEvento(aula.progresso_atualizado_em))));
      const recente = [...emCurso].sort((a, b) => (b.progresso_atualizado_em || '').localeCompare(a.progresso_atualizado_em || ''))[0];
      estudos.append(elemento('p', `${concluidas.length} concluídas no período · ${emCurso.length} em andamento`, 'font-medium'));
      adicionarLista(estudos, concluidas.slice(0, 5).map(aula => aula.titulo), 'Nenhuma conclusão com data registrada nesta semana.');
      if (recente) estudos.append(botao(`Retomar ${recente.titulo} em ${formatSeconds(Number(recente.segundo_atual))}`, () => window.abrirAulaDaRevisao(recente)));
    } else estudos.append(elemento('p', 'Não foi possível carregar as aulas.'));

    const financas = cartao('Finanças');
    if (despesas) {
      const gastos = despesas.filter(item => pertence(String(item.data || '').slice(0, 10)));
      const total = gastos.reduce((soma, item) => soma + (Number(item.valor) || 0), 0);
      financas.append(elemento('p', `${moeda.format(total)} em gastos registrados`, 'font-medium'));
      const totais = new Map();
      for (const { categoria, valor } of gastos) {
        const nome = categorias[categoria] || 'Outras categorias';
        totais.set(nome, (totais.get(nome) || 0) + (Number(valor) || 0));
      }
      adicionarLista(financas, [...totais].map(([nome, valor]) => `${nome}: ${moeda.format(valor)}`), 'Nenhum gasto registrado no período.');
      if (gastos.length) {
        financas.append(elemento('h3', 'Lançamentos recentes', 'font-semibold'));
        adicionarLista(financas, [...gastos].sort((a, b) => String(b.data).localeCompare(String(a.data))).slice(0, 4)
          .map(item => `${item.descricao} · ${moeda.format(Number(item.valor) || 0)}`), '');
      }
      financas.append(botao('Abrir Planilha de Gastos', () => window.abrirAcaoFinanceira('planilha')));
    } else financas.append(elemento('p', 'Não foi possível carregar todos os gastos deste período.'));

    const objetivos = cartao('Metas');
    if (metas) {
      const avancos = metas.flatMap(meta => (meta.avancos || []).filter(avanco => pertence(dataEvento(avanco.data)))
        .map(avanco => `${meta.titulo}: ${avanco.de}% → ${avanco.para}%`));
      adicionarLista(objetivos, avancos.slice(-5), 'Nenhum avanço com data registrada nesta semana.');
      const prazoLimite = iso(adicionarDias(inicio, 13));
      const proximas = metas.filter(meta => /^\d{4}-\d{2}-\d{2}$/.test(meta.prazo || '')
        && Number(meta.progresso) < 100 && meta.prazo >= diaInicial && meta.prazo <= prazoLimite
        && Number.isFinite(new Date(`${meta.prazo}T12:00:00`).getTime()))
        .sort((a, b) => a.prazo.localeCompare(b.prazo));
      objetivos.append(elemento('h3', 'Prazos próximos', 'font-semibold'));
      adicionarLista(objetivos, proximas.slice(0, 5).map(meta =>
        `${meta.titulo} · ${vencimento(meta.prazo)} · faltam ${Math.max(0, 100 - Number(meta.progresso || 0))} pontos percentuais`), 'Nenhum prazo próximo registrado.');
      objetivos.append(botao('Abrir Metas', () => window.navIrParaMetas()));
    } else objetivos.append(elemento('p', 'Não foi possível carregar as metas.'));

    const container = campo('planos-revisao');
    container.replaceChildren();
    for (const inicioPlano of [inicio, segunda(1)].filter((data, indice) => indice === 0 || atual)) {
      const plano = planos?.find(item => item.semana === iso(inicioPlano));
      const grupo = elemento('div', '', 'space-y-1');
      grupo.append(elemento('h3', periodo(inicioPlano), 'font-semibold'));
      adicionarLista(grupo, [...(plano?.tarefas || []).map(tarefa => `Prioridade: ${tarefa.texto}`),
        ...(plano?.aulas || []).map(aula => `Aula: ${aula.titulo}`)], planos ? 'Nenhum plano salvo.' : 'Planos indisponíveis.');
      container.append(grupo);
    }
    campo('preparar-revisao').disabled = !tarefas || !aulas || !planos;
  }

  window.carregarRevisaoSemanal = async () => {
    const pedido = ++carregamento;
    dadosAtuais = null;
    campo('preparar-revisao').disabled = true;
    campo('editor-revisao').classList.add('hidden');
    campo('editor-revisao').replaceChildren();
    campo('cards-revisao').replaceChildren();
    campo('planos-revisao').replaceChildren();
    const offset = Number(campo('semana-revisao').value);
    const inicio = segunda(offset);
    const diaInicial = iso(inicio);
    const diaFinal = iso(adicionarDias(inicio, 6));
    campo('periodo-revisao').textContent = periodo(inicio);
    campo('status-revisao').textContent = 'Carregando a revisão…';
    const meses = [...new Set([diaInicial.slice(0, 7), diaFinal.slice(0, 7)])];
    const respostas = await Promise.allSettled([
      api('/api/rotina/prioridades'), api('/api/rotina/historico-tarefas'), api('/api/videos'),
      api('/api/metas'), api('/api/revisao-semanal/planos'),
      Promise.all(meses.map(mes => api(`/api/dados?mes=${mes}`)))
    ]);
    if (pedido !== carregamento) return;
    const [tarefas, historico, aulas, metas, planos, mesesFinanceiros] = respostas.map(item => item.value);
    dadosAtuais = {
      inicio, diaInicial, diaFinal, atual: offset === 0, tarefas: tarefas?.data, historico: historico?.data,
      aulas: aulas?.data, metas: metas?.data, planos: planos?.data,
      despesas: mesesFinanceiros?.flatMap(mes => mes.despesas || [])
    };
    renderizar(dadosAtuais);
    campo('status-revisao').textContent = respostas.some(item => item.status === 'rejected') ? 'Alguns dados não puderam ser carregados.' : '';
  };

  function listaDeEscolha(titulo, itens, selecionados, texto, limite) {
    const grupo = elemento('fieldset', '', 'max-h-52 space-y-1 overflow-y-auto rounded border border-slate-200 p-3');
    grupo.append(elemento('legend', `${titulo} (até ${limite})`, 'font-semibold'));
    for (const item of itens) {
      const rotulo = elemento('label', '', 'flex items-start gap-2 text-sm');
      const caixa = elemento('input', '', 'mt-1');
      caixa.type = 'checkbox';
      caixa.value = String(item.id);
      caixa.checked = selecionados.has(item.id);
      rotulo.append(caixa, elemento('span', texto(item)));
      grupo.append(rotulo);
    }
    if (!itens.length) grupo.append(elemento('p', 'Nenhum item disponível.', 'text-sm text-slate-600'));
    return grupo;
  }

  campo('semana-revisao').addEventListener('change', window.carregarRevisaoSemanal);
  campo('preparar-revisao').addEventListener('click', () => {
    if (!dadosAtuais) return;
    const { tarefas, aulas, planos } = dadosAtuais;
    const inicio = segunda(1);
    const semana = iso(inicio);
    const salvo = planos.find(plano => plano.semana === semana);
    const editor = campo('editor-revisao');
    const prioridades = tarefas.filter(tarefa => !tarefa.concluida);
    const estudos = aulas.filter(aula => !aula.concluido);
    const listaTarefas = listaDeEscolha('Prioridades', prioridades, new Set(salvo?.tarefas.map(tarefa => tarefa.id)), t => t.texto, 3);
    const listaAulas = listaDeEscolha('Aulas', estudos, new Set(salvo?.aulas.map(aula => aula.id)), aula => aula.titulo, 7);
    const status = elemento('p', '', 'text-sm text-slate-700');
    status.setAttribute('role', 'status');
    const selecao = grupo => [...grupo.querySelectorAll('input:checked')].map(input => Number(input.value));
    const previa = botao('Ver prévia', () => {
      const tarefaIds = selecao(listaTarefas);
      const aulaIds = selecao(listaAulas);
      if (tarefaIds.length > 3 || aulaIds.length > 7) {
        status.textContent = 'Selecione até três prioridades e sete aulas.';
        return;
      }
      const resumo = elemento('div', '', 'space-y-2');
      resumo.append(elemento('h3', 'Prévia do plano', 'font-semibold'));
      adicionarLista(resumo, [
        ...prioridades.filter(tarefa => tarefaIds.includes(tarefa.id)).map(tarefa => `Prioridade: ${tarefa.texto}`),
        ...estudos.filter(aula => aulaIds.includes(aula.id)).map(aula => `Aula: ${aula.titulo}`)
      ], salvo ? 'A confirmação vai limpar o plano salvo.' : 'Nenhum item selecionado.');
      if (!salvo && !tarefaIds.length && !aulaIds.length) {
        status.textContent = 'Selecione pelo menos uma tarefa ou aula.';
        return;
      }
      const confirmar = botao('Salvar plano', async () => {
        confirmar.disabled = true;
        try {
          await api(`/api/revisao-semanal/planos/${semana}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tarefas: tarefaIds, aulas: aulaIds })
          });
          campo('semana-revisao').value = '0';
          await window.carregarRevisaoSemanal();
          campo('status-revisao').textContent = tarefaIds.length || aulaIds.length ? 'Plano da próxima semana salvo.' : 'Plano da próxima semana limpo.';
        } catch (error) {
          status.textContent = error.message;
          confirmar.disabled = false;
        }
      });
      editor.replaceChildren(elemento('p', periodo(inicio), 'font-semibold'), resumo, confirmar, botao('Voltar à seleção', montar), status);
    });
    function montar() {
      status.textContent = '';
      editor.replaceChildren(elemento('p', periodo(inicio), 'font-semibold'), listaTarefas, listaAulas, previa, status);
    }
    montar();
    editor.classList.remove('hidden');
  });
})();
