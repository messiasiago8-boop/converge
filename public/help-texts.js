/**
 * help-texts.js — Catálogo centralizado de ajuda contextual do CONVERGE
 * Todos os textos de explicação para abas, módulos e seções internas (Portal + Finanças).
 */
window.CONVERGE_HELP = {
  /* ==================== INÍCIO / VISÃO GERAL ==================== */
  'inicio-geral': {
    titulo: 'Visão Geral (Início)',
    descricao: 'Painel central do Life OS que reúne em uma única tela o resumo do seu dia: aulas em andamento, saldo disponível no mês, prioridades de hoje e metas ativas.',
    dica: 'Use os botões "Novo Gasto" e "Nova Tarefa" no topo para registrar itens em segundos sem trocar de aba.'
  },
  'inicio-progresso': {
    titulo: 'Progresso Geral',
    descricao: 'Mostra a porcentagem de aulas concluídas no seu catálogo de estudos e permite retomar exatamente do segundo onde você parou.',
    dica: 'Clique no card escuro abaixo do anel para voltar instantaneamente para sua última videoaula.'
  },
  'inicio-rotina': {
    titulo: 'Resumo de Rotina & Agenda',
    descricao: 'Exibe suas 3 prioridades principais do dia (Top 3), quantos hábitos você já cumpriu hoje e o próximo compromisso agendado.',
    dica: 'Você pode marcar prioridades como concluídas direto aqui ou clicar em "Abrir" para ver sua rotina completa.'
  },
  'inicio-financas': {
    titulo: 'Resumo de Finanças Inteligentes',
    descricao: 'Traz o saldo líquido disponível no mês, o total já gasto e alertas de contas a vencer ou equilíbrio orçamentário.',
    dica: 'Clique em "Acessar" para gerenciar limites 50/30/20, planilha de gastos e investimentos.'
  },
  'inicio-educacao': {
    titulo: 'Resumo de Educação & Treinamento',
    descricao: 'Indica sua próxima aula sugerida (ou em andamento) e o percentual total concluído nas suas trilhas de estudo.',
    dica: 'Clique em "Assistir" para abrir o player com anotações sincronizadas por minuto.'
  },
  'inicio-metas': {
    titulo: 'Resumo de Metas & Objetivos',
    descricao: 'Lista seus objetivos de médio e longo prazo com o progresso atual integrado às finanças e aos estudos.',
    dica: 'Clique em "Gerenciar" para criar novas metas, aportar valores ou usar modelos prontos.'
  },

  /* ==================== EDUCAÇÃO (LMS + STUDY OS) ==================== */
  'edu-catalogo': {
    titulo: 'Catálogo de Vídeos & Trilhas',
    descricao: 'Organiza todas as suas videoaulas do YouTube em trilhas/tópicos com barra de progresso individual e salvamento automático do minuto assistido.',
    dica: 'Use "Novo Tópico" para criar uma matéria/curso e "Novo Vídeo" para adicionar aulas.'
  },
  'edu-cronograma': {
    titulo: 'Meu Cronograma de Estudos',
    descricao: 'Distribui suas videoaulas pelos dias da semana (Segunda a Domingo), destacando automaticamente o dia de hoje.',
    dica: 'Clique em "+ Programar Aula" em qualquer dia para montar sua rotina semanal de estudos.'
  },
  'edu-aula': {
    titulo: 'Player de Aula & Notas Sincronizadas',
    descricao: 'Assista às aulas sem distrações enquanto cria anotações vinculadas ao instante exato do vídeo (timestamp).',
    dica: 'Use "Travar Minuto" para congelar o tempo atual enquanto escreve sua nota; depois clique no minuto salvo para pular direto àquele trecho.'
  },
  'edu-study-os': {
    titulo: 'Central Study OS',
    descricao: 'Ambiente completo de estudos inspirado no Notion: reúne matérias relacionais, caderno em blocos, repetição espaçada (SM-2), provas, leituras, foco e IA.',
    dica: 'Alterne pelas 5 abas logo abaixo do cabeçalho para navegar entre Foco, Bases, Caderno, Revisões e Desempenho.'
  },
  'eos-foco': {
    titulo: 'Ambiente de Foco (Pomodoro & Playlist)',
    descricao: 'Cronômetro Pomodoro (25 min foco / 5 min pausa) vinculado à matéria estudada, somando minutos nos gráficos de desempenho, com player embutido de Spotify/YouTube.',
    dica: 'Selecione a matéria antes de clicar em Iniciar para registrar automaticamente suas horas estudadas.'
  },
  'eos-ia': {
    titulo: 'IA de Estudos (Groq)',
    descricao: 'Assistente inteligente com 3 modos: Perguntar (busca semântica sobre seus dados reais), Estruturar Notas (gera blocos prontos) e Gerar Flashcards de Active Recall.',
    dica: 'No modo "Estruturar Notas", cole rascunhos soltos e clique em "+ Criar Página no Caderno" para organizar tudo automaticamente.'
  },
  'eos-bases': {
    titulo: 'Bases Relacionais & Múltiplas Visualizações',
    descricao: 'Exibe suas matérias e páginas sob 4 visões diferentes sobre os mesmos dados: Galeria (com % dominado), Tabela filtrável, Quadro Kanban arrastável e Calendário.',
    dica: 'No Kanban, arraste os cartões entre "A estudar", "Estudando", "Revisar" e "Dominado".'
  },
  'eos-hierarquia': {
    titulo: 'Hierarquia Infinita de Páginas',
    descricao: 'Organize conteúdos em níveis ilimitados (Matéria → Módulo → Aula → Subtópico).',
    dica: 'Passe o mouse sobre qualquer página e clique em "+" para criar uma subpágina dentro dela.'
  },
  'eos-editor': {
    titulo: 'Editor em Blocos Avançado',
    descricao: 'Cada item é um bloco independente que pode ser arrastado ou transformado em Texto, Títulos (H1–H3), Toggles, Callouts, Equações LaTeX, Código, Embeds ou Blocos Sincronizados.',
    dica: 'As alterações são salvas automaticamente após alguns instantes ou ao clicar em "Salvar".'
  },
  'eos-toc': {
    titulo: 'Sumário Automático (TOC)',
    descricao: 'Gera automaticamente um índice clicável a partir de todos os blocos de título (H1, H2 e H3) da página aberta.',
    dica: 'Clique em qualquer item do sumário para rolar suavemente até aquela seção.'
  },
  'eos-synced': {
    titulo: 'Blocos Sincronizados',
    descricao: 'Permite reutilizar um mesmo bloco (ex: fórmulas ou cronograma) em várias páginas. Ao editar em uma, todas são atualizadas juntas.',
    dica: 'Clique em "+ Inserir" em qualquer bloco listado para adicioná-lo à página atual.'
  },
  'eos-srs': {
    titulo: 'Revisões de Hoje (Algoritmo SM-2)',
    descricao: 'Sistema de Repetição Espaçada que calcula automaticamente a próxima data de revisão conforme seu nível de confiança (Difícil, Médio ou Fácil).',
    dica: 'Revise diariamente os itens pendentes aqui para maximizar sua retenção de longo prazo.'
  },
  'eos-flashcards': {
    titulo: 'Flashcards (Active Recall)',
    descricao: 'Cartões de pergunta e resposta (frente/verso) integrados ao algoritmo SM-2 para treinar memória ativa.',
    dica: 'Tente responder mentalmente antes de clicar em "Revelar verso" e depois avalie a dificuldade.'
  },
  'eos-erros': {
    titulo: 'Banco de Erros',
    descricao: 'Registre questões erradas em simulados com o motivo do erro e a resolução correta para acompanhar sua evolução.',
    dica: 'Ao refazer a questão, clique em "✓ Acertei na revisão" ou "✕ Errei" para atualizar sua taxa de acerto.'
  },
  'eos-graficos': {
    titulo: 'Gráficos de Desempenho',
    descricao: 'Mostra visualmente os minutos focados por matéria (via Pomodoro) e a distribuição do seu domínio sobre todos os tópicos cadastrados.',
    dica: 'Conclua sessões no Ambiente de Foco e atualize o status das páginas para manter os gráficos vivos.'
  },
  'eos-provas': {
    titulo: 'Rastreador de Provas & Notas',
    descricao: 'Acompanhe datas de exames com contagem regressiva (dias restantes) e cálculo automático de média ponderada por peso.',
    dica: 'Assim que sair o resultado, digite a nota direto no campo ao lado da prova para recalcular sua média.'
  },
  'eos-leituras': {
    titulo: 'Controle de Leituras (Livros & PDFs)',
    descricao: 'Gerencie livros, artigos e PDFs com barra de progresso por páginas lidas e vínculo à matéria.',
    dica: 'Clique em "+ Fichamento" para criar automaticamente uma página estruturada no Caderno em Blocos.'
  },

  /* ==================== ROTINA & AGENDA ==================== */
  'rotina-geral': {
    titulo: 'Rotina & Agenda',
    descricao: 'Central diária de produtividade com foco nas 3 prioridades essenciais, checklist rápido, linha do tempo do dia, agenda de compromissos e cronômetro Pomodoro.',
    dica: 'Alterne entre Foco de Hoje, Checklist e Agenda pelo menu lateral (ou barra superior no celular).'
  },
  'rotina-pomodoro': {
    titulo: 'Pomodoro Integrado (25/5)',
    descricao: 'Alterna blocos de 25 minutos de foco profundo com pausas de 5 minutos para manter sua concentração sem fadiga.',
    dica: 'Clique em ▶ para iniciar, ⏸ para pausar ou ↺ para reiniciar o ciclo.'
  },
  'rotina-top3': {
    titulo: 'Foco do Dia (Top 3 Prioridades)',
    descricao: 'Define até 3 tarefas inegociáveis que farão o seu dia valer a pena. Ao concluir todas as 3, você ativa sua sequência (ofensiva).',
    dica: 'Mantenha apenas o que é realmente prioritário aqui; use o Checklist para tarefas secundárias.'
  },
  'rotina-timeline': {
    titulo: 'Linha do Tempo de Hoje',
    descricao: 'Consolida em ordem cronológica compromissos da agenda, tarefas com horário e lacunas livres do dia, com botão "+ Preencher" direto nos espaços vagos.',
    dica: 'Arraste tarefas da coluna Sem Horário (Inbox) para uma lacuna livre para fazer Time Blocking.'
  },
  'rotina-capacidade': {
    titulo: 'Capacidade do Dia, Pico de Energia & Captura Natural',
    descricao: 'Soma a duração estimada de tudo que você planejou para hoje, destaca seu período de pico de foco (Manhã, Tarde ou Noite) com sugestões visuais na Timeline e entende data, hora, duração e energia na captura rápida.',
    dica: 'Escolha seu Pico de Energia ao lado da Meta de horas e digite ex.: "Estudar matemática hoje 09h 45m #alto".'
  },
  'rotina-timeblock': {
    titulo: 'Inbox & Time Blocking',
    descricao: 'Lista suas tarefas pendentes que ainda não têm horário marcado para que você possa reservá-las em blocos reais na agenda de hoje.',
    dica: 'No PC arraste o card para uma lacuna da Timeline; no celular toque no botão "⏰ Agendar".'
  },
  'rotina-checklist': {
    titulo: 'Checklist do Dia',
    descricao: 'Lista rápida das tarefas programadas para o dia em ordem de data e horário para você ir riscando conforme executa.',
    dica: 'Use o campo de entrada rápida para adicionar tarefas com data e hora sem sair da tela.'
  },
  'rotina-agenda': {
    titulo: 'Agenda & Compromissos',
    descricao: 'Calendário completo para agendar reuniões, eventos, entregas e lembretes com notificação push no celular.',
    dica: 'Compromissos com horário definido enviam alertas automáticos quando as notificações estão ativas.'
  },

  /* ==================== METAS & HÁBITOS ==================== */
  'metas-geral': {
    titulo: 'Painel de Metas & Objetivos',
    descricao: 'Acompanhe objetivos financeiros, de estudos e pessoais com anéis de progresso, contagem regressiva de prazos e sincronização automática.',
    dica: 'Use "Usar Modelo" para criar metas estruturadas em 1 clique ou filtre por categoria abaixo dos KPIs.'
  },
  'metas-habitos': {
    titulo: 'Metas de Hábitos & Força (%)',
    descricao: 'Rastreador semanal de consistência com Força do Hábito (💪 0%–100% nos últimos 30 dias), sequência ativa (🔥), janela flexível de horário e Modo Play guiado.',
    dica: 'Errar 1 dia não zera sua Força (%). Clique em ✎ para definir período, duração e janela flexível de qualquer hábito.'
  },
  'rotina-play': {
    titulo: 'Modo Play · Rotinas em Bloco',
    descricao: 'Agrupa seus hábitos por período (Manhã, Pós-Trabalho ou Noite) e abre uma tela limpa de foco com cronômetro etapa por etapa.',
    dica: 'Ao clicar em "Concluir & Avançar", o hábito recebe check-in automático no dia de hoje e a próxima etapa já começa.'
  },
  'rotina-rituais': {
    titulo: 'Rituais de Abertura e Encerramento',
    descricao: 'O Check-in Matinal (2 min) ajuda a revisar pendências e escolher suas 3 prioridades máximas; o Encerramento do Dia move sobras para amanhã e registra sua energia/humor para a Revisão Semanal.',
    dica: 'Use o Check-in ao começar o dia e o Encerramento à noite para fechar a mente sem pendências soltas.'
  },
  'rotina-reagendar': {
    titulo: 'Reagendar Atrasadas (1 Clique)',
    descricao: 'Detecta automaticamente tarefas atrasadas de dias anteriores ou de horários já passados hoje e permite encaixá-las nos espaços livres restantes do dia ou mover tudo para amanhã.',
    dica: 'Use "⚡ Encaixar hoje" para redistribuir sem colidir com seus compromissos atuais.'
  },

  /* ==================== REVISÃO, PERFIL, CONFIGURAÇÕES E TUTORIAL ==================== */
  'revisao-semanal': {
    titulo: 'Revisão Semanal',
    descricao: 'Mostra o balanço consolidado da sua semana (tarefas, hábitos, estudos e finanças) e permite montar seu Plano Semanal para os próximos dias.',
    dica: 'Use o seletor de período no canto direito para comparar a semana atual com a anterior.'
  },
  'perfil-geral': {
    titulo: 'Meu Perfil',
    descricao: 'Personalize sua foto (usada também na animação de boas-vindas ao entrar), defina seu foco atual, escolha uma meta em destaque e veja suas conquistas.',
    dica: 'Após alterar foto ou foco, clique em "Salvar perfil" para aplicar em toda a plataforma.'
  },
  'config-geral': {
    titulo: 'Configurações',
    descricao: 'Gerencie dados da sua conta (nome, e-mail e senha), aba inicial, primeiro dia da semana, notificações neste aparelho e exportação dos seus dados.',
    dica: 'Use "Enviar teste" em Notificações para confirmar que os alertas estão chegando no seu dispositivo.'
  },
  'tutorial-mobile': {
    titulo: 'Tutorial: App e Notificações Mobile',
    descricao: 'Ensina passo a passo como instalar o CONVERGE como aplicativo no iPhone (iOS) ou Android e ativar notificações na tela bloqueada.',
    dica: 'Escolha seu aparelho no seletor "iPhone (iOS)" ou "Android" para ver o vídeo narrado e o guia específico.'
  },

  /* ==================== FINANÇAS (IFRAME) ==================== */
  'fin-modelo': {
    titulo: 'Modelo de Gestão Orçamentária',
    descricao: 'Define como sua receita mensal é dividida entre Essenciais, Desejos e Reserva: Regra 50/30/20, Regra 60/20/20 ou Orçamento Livre (Manual).',
    dica: 'Clique no filtro para trocar o modelo; no modo Livre você pode editar manualmente o teto de cada categoria.'
  },
  'fin-kpis': {
    titulo: 'Indicadores do Orçamento',
    descricao: 'Mostra sua Receita Bruta, gastos e limites de Essenciais, Desejos, Reserva e Despesas Totais com barras de consumo em tempo real.',
    dica: 'Clique no valor da Receita Bruta para editá-la rapidamente e recalcular todo o mês.'
  },
  'fin-grafico': {
    titulo: 'Distribuição Orçamentária',
    descricao: 'Gráfico interativo que mostra a proporção real entre Essenciais, Desejos e Reserva frente à sua renda base.',
    dica: 'Passe o mouse sobre as linhas da legenda ao lado para destacar a fatia correspondente no gráfico.'
  },
  'fin-seguranca': {
    titulo: 'Métricas de Segurança & Liquidez',
    descricao: 'Calcula automaticamente seu Saldo Líquido Mensal Disponível e o valor ideal do Fundo de Emergência (6x seus custos fixos essenciais).',
    dica: 'Clique em "Solicitar Auditoria de IA" para receber um diagnóstico técnico personalizado do seu mês.'
  },
  'fin-planilha': {
    titulo: 'Planilha de Gestão de Gastos',
    descricao: 'Tabela detalhada para lançar, filtrar por categoria (50/30/20), revisar e excluir despesas individuais ou em lote.',
    dica: 'Marque as caixas de seleção à esquerda para apagar vários lançamentos de uma só vez.'
  },
  'fin-investimentos': {
    titulo: 'Investimentos & Evolução Patrimonial',
    descricao: 'Acompanha sua carteira de ativos (CDB, Tesouro Selic, LCI e outros), rendimentos mensais e curva de crescimento do patrimônio acumulado.',
    dica: 'Use os filtros por ativo para comparar valor aplicado versus rendimento atual.'
  },
  'fin-projetos': {
    titulo: 'Projetos & Grandes Compras',
    descricao: 'Organize reservas específicas para objetivos maiores (viagens, equipamentos, reserva) com controle de aportes e progresso visual.',
    dica: 'Os projetos criados aqui podem ser vinculados diretamente às suas Metas financeiras.'
  },
  'fin-relatorios': {
    titulo: 'Relatórios Anuais & Demonstrativos',
    descricao: 'Histórico consolidado mês a mês com receitas, despesas, investimentos e conformidade com sua regra orçamentária.',
    dica: 'Ideal para identificar meses de maior gasto e acompanhar sua consistência anual.'
  },
  'fin-ia': {
    titulo: 'Smart Assistant IA & Simulador',
    descricao: 'Consultor financeiro inteligente para tirar dúvidas sobre seu orçamento do mês e simular o impacto de compras antes de decidir.',
    dica: 'Pergunte por exemplo: "Posso parcelar uma compra de R$ 600 sem estourar meu orçamento?"'
  }
};
