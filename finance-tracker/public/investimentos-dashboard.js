/**
 * FASE 3: script corporativo para o Dashboard de Investimentos
 * Consumo das rotas /api/investimentos, renderização dos cards,
 * gráfico de rosca (Doughnut) de distribuição e gráficos de barras agrupadas isoladas por ativo.
 */

// Estado global do módulo
let chartDoughnutDistribuicao = null;
let chartBarrasCDB = null;
let chartBarrasTesouroSelic = null;

// Paleta de cores sóbria e empresarial (tons neutros, ardósia, marinho corporativo e esmeralda para rendimento)
const CORES_CORPORATIVAS = {
  cdb: {
    bg: '#334155',         // Slate 700
    border: '#1e293b',     // Slate 800
    light: '#64748b'       // Slate 500
  },
  tesouroSelic: {
    bg: '#475569',         // Slate 600
    border: '#0f172a',     // Slate 900
    light: '#94a3b8'       // Slate 400
  },
  outros: {
    bg: '#64748b',         // Slate 500
    border: '#334155',
    light: '#cbd5e1'
  },
  rendimento: {
    bg: '#059669',         // Emerald 600 (Corporativo)
    border: '#047857',
    light: 'rgba(5, 150, 105, 0.2)'
  },
  aplicado: {
    bg: '#1e293b',         // Slate 800
    border: '#0f172a'
  }
};

// Formatação padronizada de moeda BRL
function formatarMoeda(valor) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number(valor) || 0);
}

// Helper para chamadas autenticadas via Bearer Token
async function fetchInvestimentos(url, options = {}) {
  const token = localStorage.getItem('token') || 'financas-inteligente-jwt-secret-key-2026';
  const headers = {
    'Accept': 'application/json',
    'Authorization': 'Bearer ' + token,
    ...(options.headers || {})
  };
  return fetch(url, { ...options, headers });
}

// Carregamento principal e atualização de tela
async function carregarDashboardInvestimentos() {
  const inputMes = document.getElementById('filtroCompetenciaMes');
  const mes = inputMes ? inputMes.value : '2026-11';

  try {
    const res = await fetchInvestimentos(`/api/investimentos?mes=${encodeURIComponent(mes)}`);
    if (!res.ok) {
      throw new Error(`Falha na requisição: ${res.statusText}`);
    }

    const data = await res.json();
    atualizarCardsResumo(data.resumo);
    renderizarGraficoDoughnut(data.distribuicao, data.resumo.patrimonioTotal);
    renderizarTabelaPosicao(data.porAtivo, data.resumo.patrimonioTotal);
    renderizarGraficosIndividuaisBarras(data.porAtivo);

    const rodapeMes = document.getElementById('rodapeCompetenciaAtiva');
    if (rodapeMes) rodapeMes.textContent = `Competência: ${data.mes}`;

  } catch (err) {
    console.error('Erro ao carregar dashboard de investimentos:', err);
  }
}

// 1. Atualização dos Cards de Resumo
function atualizarCardsResumo(resumo) {
  if (!resumo) return;

  const elPatrimonio = document.getElementById('cardPatrimonioTotal');
  const elAplicado = document.getElementById('cardTotalAplicado');
  const elRendimento = document.getElementById('cardRendimentoTotal');
  const elRendPct = document.getElementById('cardRendimentoPercentual');

  if (elPatrimonio) elPatrimonio.textContent = formatarMoeda(resumo.patrimonioTotal);
  if (elAplicado) elAplicado.textContent = formatarMoeda(resumo.totalAplicado);
  if (elRendimento) elRendimento.textContent = `+ ${formatarMoeda(resumo.rendimentoTotal)}`;

  if (elRendPct) {
    const pct = resumo.totalAplicado > 0
      ? ((resumo.rendimentoTotal / resumo.totalAplicado) * 100).toFixed(2)
      : '0.00';
    elRendPct.textContent = `+ ${pct}% sobre o capital aportado`;
  }
}

// 2. Gráfico de Rosca (Doughnut): Distribuição Percentual de Todo o Capital
function renderizarGraficoDoughnut(distribuicao, patrimonioTotal) {
  const canvas = document.getElementById('graficoDoughnutDistribuicao');
  if (!canvas) return;

  const lista = (distribuicao && distribuicao.length > 0) ? distribuicao : [
    { tipo_ativo: 'Tesouro Selic', patrimonio: 4000, percentual: 60 },
    { tipo_ativo: 'CDB', patrimonio: 3000, percentual: 40 }
  ];

  const labels = lista.map(i => i.tipo_ativo);
  const dataValues = lista.map(i => i.patrimonio);
  const backgroundColors = lista.map(i => {
    const n = i.tipo_ativo.toUpperCase();
    if (n.includes('SELIC') || n.includes('TESOURO')) return CORES_CORPORATIVAS.tesouroSelic.bg;
    if (n.includes('CDB')) return CORES_CORPORATIVAS.cdb.bg;
    return CORES_CORPORATIVAS.outros.bg;
  });

  if (chartDoughnutDistribuicao) {
    chartDoughnutDistribuicao.destroy();
  }

  const ctx = canvas.getContext('2d');
  chartDoughnutDistribuicao = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: dataValues,
        backgroundColor: backgroundColors,
        borderColor: '#ffffff',
        borderWidth: 2,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '70%',
      plugins: {
        legend: {
          display: false // Legenda renderizada via DOM limpo abaixo
        },
        tooltip: {
          backgroundColor: '#0f172a',
          titleFont: { size: 12, weight: 'bold' },
          bodyFont: { size: 11 },
          padding: 10,
          callbacks: {
            label: function(context) {
              const valor = context.raw || 0;
              const pct = patrimonioTotal > 0 ? ((valor / patrimonioTotal) * 100).toFixed(1) : 0;
              return ` ${context.label}: ${formatarMoeda(valor)} (${pct}%)`;
            }
          }
        }
      }
    }
  });

  // Legenda customizada em HTML limpo
  const containerLegenda = document.getElementById('legendaCustomizadaDoughnut');
  if (containerLegenda) {
    containerLegenda.innerHTML = lista.map(item => {
      const n = item.tipo_ativo.toUpperCase();
      const cor = (n.includes('SELIC') || n.includes('TESOURO')) ? '#475569' : (n.includes('CDB') ? '#334155' : '#64748b');
      return `
        <div class="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-100">
          <div class="flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full" style="background-color: ${cor}"></span>
            <span class="font-medium text-slate-700">${item.tipo_ativo}</span>
          </div>
          <span class="font-bold text-slate-900 font-mono-num">${item.percentual}%</span>
        </div>
      `;
    }).join('');
  }
}

// 3. Tabela Corporativa Resumida
function renderizarTabelaPosicao(porAtivo, patrimonioTotal) {
  const tbody = document.getElementById('tabelaPosicaoConsolidada');
  const badgeTotal = document.getElementById('badgeTotalAtivosCadastrados');
  if (!tbody) return;

  const lista = porAtivo || [];
  if (badgeTotal) badgeTotal.textContent = `${lista.length} ativo(s) alocado(s)`;

  if (lista.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="py-6 text-center text-slate-400">
          Nenhuma movimentação de investimento registrada para este mês.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = lista.map(ativo => {
    const vPatrimonio = (ativo.valor_aplicado || 0) + (ativo.rendimento_atual || 0);
    const pct = patrimonioTotal > 0 ? ((vPatrimonio / patrimonioTotal) * 100).toFixed(1) : '0.0';

    return `
      <tr class="hover:bg-slate-50/70 transition">
        <td class="py-3 px-3 font-semibold text-slate-900">${ativo.tipo_ativo}</td>
        <td class="py-3 px-3 text-right text-slate-700 font-mono-num">${formatarMoeda(ativo.valor_aplicado)}</td>
        <td class="py-3 px-3 text-right font-semibold text-emerald-700 font-mono-num">+ ${formatarMoeda(ativo.rendimento_atual)}</td>
        <td class="py-3 px-3 text-right font-bold text-slate-900 font-mono-num">${formatarMoeda(vPatrimonio)}</td>
        <td class="py-3 px-3 text-right font-medium text-slate-600 font-mono-num">${pct}%</td>
      </tr>
    `;
  }).join('');
}

// 4. Gráficos de Resultados Isolados por Ativo (Barras Agrupadas: Valor Aplicado vs Rendimento Atual)
function renderizarGraficosIndividuaisBarras(porAtivo) {
  const lista = porAtivo || [];

  // Dados CDB
  const ativoCDB = lista.find(a => a.tipo_ativo.toUpperCase().includes('CDB')) || {
    valor_aplicado: 0,
    rendimento_atual: 0
  };

  // Dados Tesouro Selic
  const ativoSelic = lista.find(a => a.tipo_ativo.toUpperCase().includes('SELIC') || a.tipo_ativo.toUpperCase().includes('TESOURO')) || {
    valor_aplicado: 0,
    rendimento_atual: 0
  };

  // Atualiza indicadores de texto nos cards
  const elResumoCDB = document.getElementById('resumoCDBRendimento');
  if (elResumoCDB) elResumoCDB.textContent = `+ ${formatarMoeda(ativoCDB.rendimento_atual)}`;

  const elResumoSelic = document.getElementById('resumoTesouroRendimento');
  if (elResumoSelic) elResumoSelic.textContent = `+ ${formatarMoeda(ativoSelic.rendimento_atual)}`;

  // Opções de configuração empresarial comum para os gráficos de barras
  const gerarOpcoesBarras = () => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: {
          boxWidth: 12,
          font: { size: 11, family: 'Inter', weight: 500 },
          color: '#475569'
        }
      },
      tooltip: {
        backgroundColor: '#0f172a',
        padding: 10,
        callbacks: {
          label: function(context) {
            return ` ${context.dataset.label}: ${formatarMoeda(context.raw)}`;
          }
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { size: 11, family: 'Inter' }, color: '#64748b' }
      },
      y: {
        beginAtZero: true,
        grid: { color: '#f1f5f9' },
        ticks: {
          font: { size: 10, family: 'Inter' },
          color: '#64748b',
          callback: function(value) {
            if (value >= 1000) return 'R$ ' + (value / 1000).toFixed(1) + 'k';
            return 'R$ ' + value;
          }
        }
      }
    }
  });

  // Instância 1: Gráfico do CDB
  const canvasCDB = document.getElementById('graficoBarrasCDB');
  if (canvasCDB) {
    if (chartBarrasCDB) chartBarrasCDB.destroy();
    const ctx = canvasCDB.getContext('2d');
    chartBarrasCDB = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['CDB'],
        datasets: [
          {
            label: 'Valor Aplicado',
            data: [ativoCDB.valor_aplicado],
            backgroundColor: '#1e293b', // Slate 800
            borderRadius: 4,
            maxBarThickness: 50
          },
          {
            label: 'Rendimento Atual',
            data: [ativoCDB.rendimento_atual],
            backgroundColor: '#059669', // Emerald 600
            borderRadius: 4,
            maxBarThickness: 50
          }
        ]
      },
      options: gerarOpcoesBarras()
    });
  }

  // Instância 2: Gráfico do Tesouro Selic
  const canvasSelic = document.getElementById('graficoBarrasTesouroSelic');
  if (canvasSelic) {
    if (chartBarrasTesouroSelic) chartBarrasTesouroSelic.destroy();
    const ctx = canvasSelic.getContext('2d');
    chartBarrasTesouroSelic = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Tesouro Selic'],
        datasets: [
          {
            label: 'Valor Aplicado',
            data: [ativoSelic.valor_aplicado],
            backgroundColor: '#334155', // Slate 700
            borderRadius: 4,
            maxBarThickness: 50
          },
          {
            label: 'Rendimento Atual',
            data: [ativoSelic.rendimento_atual],
            backgroundColor: '#059669', // Emerald 600
            borderRadius: 4,
            maxBarThickness: 50
          }
        ]
      },
      options: gerarOpcoesBarras()
    });
  }
}

// 5. Gerenciamento do Modal de Aportes
function inicializarEventosModal() {
  const modal = document.getElementById('modalAporte');
  const btnAbrir = document.getElementById('btnAbrirModalAporte');
  const btnFechar = document.getElementById('btnFecharModalAporte');
  const btnCancelar = document.getElementById('btnCancelarModalAporte');
  const form = document.getElementById('formNovoAporte');
  const inputMesFiltro = document.getElementById('filtroCompetenciaMes');

  const abrir = () => {
    if (modal) modal.classList.remove('hidden');
    const inputAporteMes = document.getElementById('inputAporteMes');
    if (inputAporteMes && inputMesFiltro) {
      inputAporteMes.value = inputMesFiltro.value;
    }
  };

  const fechar = () => {
    if (modal) modal.classList.add('hidden');
    if (form) form.reset();
  };

  if (btnAbrir) btnAbrir.addEventListener('click', abrir);
  if (btnFechar) btnFechar.addEventListener('click', fechar);
  if (btnCancelar) btnCancelar.addEventListener('click', fechar);

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) fechar();
    });
  }

  if (inputMesFiltro) {
    inputMesFiltro.addEventListener('change', carregarDashboardInvestimentos);
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const tipo_ativo = document.getElementById('inputAporteAtivo').value;
      const mes = document.getElementById('inputAporteMes').value;
      const valor_aplicado = parseFloat(document.getElementById('inputValorAplicado').value);
      const rendimento_atual = parseFloat(document.getElementById('inputRendimentoAtual').value) || 0;
      const btnSalvar = document.getElementById('btnSalvarAporte');

      if (!tipo_ativo || isNaN(valor_aplicado)) return;

      btnSalvar.disabled = true;
      btnSalvar.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i><span>Salvando...</span>`;

      try {
        const res = await fetchInvestimentos('/api/investimentos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tipo_ativo,
            mes,
            valor_aplicado,
            rendimento_atual
          })
        });

        if (res.ok) {
          fechar();
          if (inputMesFiltro) inputMesFiltro.value = mes;
          await carregarDashboardInvestimentos();
        } else {
          const err = await res.json();
          alert('Erro ao registrar investimento: ' + (err.error || 'Falha no servidor.'));
        }
      } catch (err) {
        alert('Erro de comunicação: ' + err.message);
      } finally {
        btnSalvar.disabled = false;
        btnSalvar.innerHTML = `<i class="fa-solid fa-check text-[11px]"></i><span>Salvar Movimentação</span>`;
      }
    });
  }
}

// Inicialização após o carregamento do DOM
document.addEventListener('DOMContentLoaded', () => {
  inicializarEventosModal();
  carregarDashboardInvestimentos();
});
