import fs from 'fs';

const filePath = 'C:/Users/ADM/.gemini/antigravity/scratch/finance-tracker/public/index.html';
let html = fs.readFileSync(filePath, 'utf8');

// Topbar refinements
html = html.replace(
  'class="bg-white border-b border-slate-200 h-16 px-6 flex items-center justify-between shadow-xs"',
  'class="bg-white/95 backdrop-blur-md border-b border-slate-200/70 h-16 px-8 flex items-center justify-between sticky top-0 z-10 shadow-xs"'
);
html = html.replace(
  'class="flex items-center gap-2 bg-slate-50 border border-slate-300 px-3 py-1.5 rounded-md shadow-2xs"',
  'class="flex items-center gap-2 bg-slate-50/80 border border-slate-200 px-3.5 py-1.5 rounded-lg shadow-2xs"'
);
html = html.replace(
  'class="text-xs text-slate-800 bg-slate-100 border border-slate-300 px-3.5 py-2 rounded-md flex items-center gap-2 font-medium shadow-2xs"',
  'class="text-xs text-slate-700 bg-slate-100/70 border border-slate-200/80 px-4 py-2 rounded-lg flex items-center gap-2.5 font-medium shadow-2xs"'
);

// Main padding
html = html.replace(
  '<main class="p-6 overflow-y-auto flex-grow space-y-6">',
  '<main class="p-8 overflow-y-auto flex-grow space-y-8">'
);

// Card Receita Bruta Total
html = html.replace(
  'class="bg-white border-2 border-blue-600/70 rounded-md p-4 shadow-sm flex flex-col justify-between relative group"',
  'class="bg-white border border-blue-500/40 rounded-xl p-6 shadow-sm hover:shadow transition-shadow flex flex-col justify-between relative group"'
);

// Cards Essenciais, Desejos, Reserva, Despesas Totais
html = html.replace(
  '<!-- Card: Essenciais (50%) -->\n          <div class="bg-white border border-slate-300 rounded-md p-4 shadow-sm flex flex-col justify-between">',
  '<!-- Card: Essenciais (50%) -->\n          <div class="bg-white border border-slate-200/80 rounded-xl p-6 shadow-sm hover:shadow transition-shadow flex flex-col justify-between">'
);
html = html.replace(
  '<!-- Card: Desejos (30%) -->\n          <div class="bg-white border border-slate-300 rounded-md p-4 shadow-sm flex flex-col justify-between">',
  '<!-- Card: Desejos (30%) -->\n          <div class="bg-white border border-slate-200/80 rounded-xl p-6 shadow-sm hover:shadow transition-shadow flex flex-col justify-between">'
);
html = html.replace(
  '<!-- Card: Reserva (20%) -->\n          <div class="bg-white border border-slate-300 rounded-md p-4 shadow-sm flex flex-col justify-between">',
  '<!-- Card: Reserva (20%) -->\n          <div class="bg-white border border-slate-200/80 rounded-xl p-6 shadow-sm hover:shadow transition-shadow flex flex-col justify-between">'
);
html = html.replace(
  '<!-- Card: Total Geral Despesas -->\n          <div class="bg-white border border-slate-300 rounded-md p-4 shadow-sm flex flex-col justify-between">',
  '<!-- Card: Total Geral Despesas -->\n          <div class="bg-white border border-slate-200/80 rounded-xl p-6 shadow-sm hover:shadow transition-shadow flex flex-col justify-between">'
);

// Gráfico de Rosca & Métricas
html = html.replace(
  '<div class="lg:col-span-2 bg-white border border-slate-200 rounded-md shadow-sm">',
  '<div class="lg:col-span-2 bg-white border border-slate-200/70 rounded-xl shadow-sm overflow-hidden">'
);
html = html.replace(
  '<div class="px-4 py-3 border-b border-slate-200 bg-slate-50/70 flex justify-between items-center">',
  '<div class="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">'
);

html = html.replace(
  '<div class="bg-white border border-slate-300 rounded-md shadow-sm flex flex-col justify-between">',
  '<div class="bg-white border border-slate-200/70 rounded-xl shadow-sm overflow-hidden flex flex-col justify-between">'
);
html = html.replace(
  '<div class="px-4 py-3 border-b border-slate-200 bg-slate-100 flex items-center justify-between">',
  '<div class="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">'
);

// Auditoria IA button (Indigo sofisticado: bg-indigo-600 hover:bg-indigo-700 shadow-md font-medium)
html = html.replace(
  'id="btnAiAnalyze" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded text-xs tracking-wide transition shadow-sm flex items-center justify-center gap-2 cursor-pointer"',
  'id="btnAiAnalyze" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-5 rounded-lg text-xs tracking-wide transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer"'
);

// AI feedback panel
html = html.replace(
  'id="aiFeedbackPanel" class="hidden bg-white border border-slate-200 rounded-md shadow-sm overflow-hidden"',
  'id="aiFeedbackPanel" class="hidden bg-white border border-indigo-200/60 rounded-xl shadow-md overflow-hidden"'
);

// Tabelas lado a lado no Dashboard
html = html.replace(
  '<!-- Entradas -->\n          <div class="bg-white border border-slate-200 rounded-md shadow-sm overflow-hidden flex flex-col">',
  '<!-- Entradas -->\n          <div class="bg-white border border-slate-200/70 rounded-xl shadow-sm overflow-hidden flex flex-col">'
);
html = html.replace(
  '<!-- Despesas do Dashboard -->\n          <div class="bg-white border border-slate-200 rounded-md shadow-sm overflow-hidden flex flex-col">',
  '<!-- Despesas do Dashboard -->\n          <div class="bg-white border border-slate-200/70 rounded-xl shadow-sm overflow-hidden flex flex-col">'
);

// Aba Planilha
html = html.replace(
  '<div class="bg-white border border-slate-200 rounded-md p-5 shadow-sm">',
  '<div class="bg-white border border-slate-200/70 rounded-xl p-6 shadow-sm">'
);
html = html.replace(
  '<div class="bg-white border border-slate-200 rounded-md shadow-sm overflow-hidden">',
  '<div class="bg-white border border-slate-200/70 rounded-xl shadow-sm overflow-hidden">'
);

// Aba Investimentos (Evolução Patrimonial)
html = html.replace(
  '<div class="bg-white border border-slate-200 rounded-md p-5 shadow-sm">\n            <span class="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1">Total Geral Acumulado</span>',
  '<div class="bg-white border border-slate-200/70 rounded-xl p-6 shadow-sm">\n            <span class="text-xs font-semibold uppercase tracking-wider text-slate-500 block mb-1">Total Geral Acumulado</span>'
);
html = html.replace(
  '<div class="bg-white border border-slate-200 rounded-md p-5 shadow-sm">\n            <span class="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1">Média de Aporte Mensal</span>',
  '<div class="bg-white border border-slate-200/70 rounded-xl p-6 shadow-sm">\n            <span class="text-xs font-semibold uppercase tracking-wider text-slate-500 block mb-1">Média de Aporte Mensal</span>'
);
html = html.replace(
  '<div class="bg-white border border-slate-200 rounded-md p-5 shadow-sm">\n            <span class="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1">Aporte Deste Mês</span>',
  '<div class="bg-white border border-slate-200/70 rounded-xl p-6 shadow-sm">\n            <span class="text-xs font-semibold uppercase tracking-wider text-slate-500 block mb-1">Aporte Deste Mês</span>'
);

html = html.replace(
  '<div class="bg-white border border-slate-200 rounded-md shadow-sm p-6">',
  '<div class="bg-white border border-slate-200/70 rounded-xl shadow-sm p-6">'
);

// Aba Relatorios
html = html.replace(
  '<div id="abaRelatorios" class="hidden space-y-6">\n        <div class="bg-white border border-slate-200 rounded-md shadow-sm p-6">',
  '<div id="abaRelatorios" class="hidden space-y-6">\n        <div class="bg-white border border-slate-200/70 rounded-xl shadow-sm p-8">'
);

// Aba Investimentos & Futuro
html = html.replace(
  '<!-- CARD 1: RESERVA DE EMERGÊNCIA DINÂMICA -->\n          <div class="bg-white border border-slate-200 rounded-md shadow-sm p-6 flex flex-col justify-between">',
  '<!-- CARD 1: RESERVA DE EMERGÊNCIA DINÂMICA -->\n          <div class="bg-white border border-slate-200/70 rounded-xl shadow-sm p-6 flex flex-col justify-between">'
);
html = html.replace(
  '<!-- CARD 2: CARTEIRA ATUAL (MEUS POTES) -->\n          <div class="bg-white border border-slate-200 rounded-md shadow-sm p-6 flex flex-col justify-between">',
  '<!-- CARD 2: CARTEIRA ATUAL (MEUS POTES) -->\n          <div class="bg-white border border-slate-200/70 rounded-xl shadow-sm p-6 flex flex-col justify-between">'
);
html = html.replace(
  '<!-- CARD 3: PROJEÇÃO DE LIBERDADE FINANCEIRA (10 ANOS - CHART.JS) -->\n          <div class="bg-white border border-slate-200 rounded-md shadow-sm p-6 flex flex-col justify-between">',
  '<!-- CARD 3: PROJEÇÃO DE LIBERDADE FINANCEIRA (10 ANOS - CHART.JS) -->\n          <div class="bg-white border border-slate-200/70 rounded-xl shadow-sm p-6 flex flex-col justify-between">'
);
html = html.replace(
  '<!-- CARD 4: ASSESSOR DE ALOCAÇÃO IA -->\n          <div class="bg-white border border-slate-200 rounded-md shadow-sm p-6 flex flex-col justify-between">',
  '<!-- CARD 4: ASSESSOR DE ALOCAÇÃO IA -->\n          <div class="bg-white border border-slate-200/70 rounded-xl shadow-sm p-6 flex flex-col justify-between">'
);

// Botão Analisar Alocação com IA
html = html.replace(
  'id="btnAnalisarAlocacaoIa" onclick="solicitarConselhoInvestimento()" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded text-xs tracking-wider uppercase transition shadow-sm flex items-center justify-center gap-2 cursor-pointer"',
  'id="btnAnalisarAlocacaoIa" onclick="solicitarConselhoInvestimento()" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-5 rounded-lg text-xs tracking-wider uppercase transition shadow-md hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer"'
);

// Aba Meus Projetos & Compras
html = html.replace(
  '<!-- Painel de Criação: Formulário Limpo Corporativo / SaaS -->\n        <div class="bg-white border border-slate-200 rounded-md p-6 shadow-sm">',
  '<!-- Painel de Criação: Formulário Limpo Corporativo / SaaS -->\n        <div class="bg-white border border-slate-200/70 rounded-xl p-6 shadow-sm">'
);

// JS renderizarCartoesProjetos card styling
html = html.replace(
  '<div class="bg-white border border-slate-200 rounded-md shadow-sm p-5 flex flex-col justify-between hover:shadow transition-shadow">',
  '<div class="bg-white border border-slate-200/70 rounded-xl shadow-sm p-6 flex flex-col justify-between hover:shadow-md transition-shadow">'
);

// Aba IA & Chat
html = html.replace(
  '<!-- COLUNA ESQUERDA: SIMULADOR "POSSO COMPRAR?" -->\n          <div class="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-md shadow-md text-white p-6 flex flex-col justify-between">',
  '<!-- COLUNA ESQUERDA: SIMULADOR "POSSO COMPRAR?" -->\n          <div class="lg:col-span-5 bg-slate-950 border border-slate-800/80 rounded-xl shadow-lg text-white p-6 flex flex-col justify-between">'
);
html = html.replace(
  'id="btnSimularImpacto" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded text-xs tracking-wider uppercase transition shadow-sm flex items-center justify-center gap-2 cursor-pointer"',
  'id="btnSimularImpacto" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-5 rounded-lg text-xs tracking-wider uppercase transition shadow-md hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer"'
);
html = html.replace(
  '<!-- COLUNA DIREITA: CHAT CONSULTOR ESTILO TERMINAL / SAAS -->\n          <div class="lg:col-span-7 bg-white border border-slate-200 rounded-md shadow-sm flex flex-col h-[650px] overflow-hidden">',
  '<!-- COLUNA DIREITA: CHAT CONSULTOR ESTILO TERMINAL / SAAS -->\n          <div class="lg:col-span-7 bg-white border border-slate-200/70 rounded-xl shadow-sm flex flex-col h-[650px] overflow-hidden">'
);
html = html.replace(
  'id="btnChatEnviar" class="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 text-xs rounded transition flex items-center gap-1.5 cursor-pointer"',
  'id="btnChatEnviar" class="bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-5 py-2.5 text-xs rounded-lg transition shadow-sm hover:shadow flex items-center gap-1.5 cursor-pointer"'
);

fs.writeFileSync(filePath, html, 'utf8');
console.log('UI/UX design elevation completed successfully');
