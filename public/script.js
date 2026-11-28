/**
 * script.js - LMS Corporativo com Cronograma Semanal & YouTube IFrame API
 */

const DIAS_SEMANA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

const state = {
  topics: [],
  videos: [],
  allVideos: [],
  agendamentos: [],
  selectedTopicId: null,
  activeVideo: null,
  activeVideoNotes: [],
  currentView: 'inicio', // 'inicio' | 'grid' | 'schedule' | 'lesson' | 'financas' | 'rotina' | 'metas'
  previousView: 'inicio', // Para retorno inteligente do botão "Voltar"
  
  // YouTube API
  player: null,
  isPlayerReady: false,
  timerInterval: null,
  capturedTimestampOverride: null
};

// Função auxiliar para requisições autenticadas com o token JWT do usuário logado
async function fetchAuth(url, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { ...(options.headers || {}) };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return fetch(url, { ...options, headers });
}

document.getElementById('btn-exportar-meus-dados')?.addEventListener('click', async (evento) => {
  const botao = evento.currentTarget;
  const status = document.getElementById('status-exportar-meus-dados');
  botao.disabled = true;
  status.textContent = 'Preparando exportação…';
  try {
    const resposta = await fetchAuth('/api/meus-dados', { cache: 'no-store' });
    if (!resposta.ok) {
      const dados = await resposta.json();
      throw new Error(dados.error || 'Não foi possível exportar seus dados.');
    }
    const url = URL.createObjectURL(await resposta.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = 'converge-meus-dados.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = 'Arquivo preparado para download.';
  } catch (erro) {
    status.textContent = erro.message;
  } finally {
    botao.disabled = false;
  }
});

// ================= 1. INTEGRAÇÃO DA YOUTUBE IFRAME API ================= //

function loadYouTubeIframeAPI() {
  if (window.YT && window.YT.Player) return;
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  const firstScriptTag = document.getElementsByTagName('script')[0];
  firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
}

window.onYouTubeIframeAPIReady = function () {
  console.log('[YouTube IFrame API] Inicializada com sucesso.');
};

let lastSavedSeconds = -1;

async function salvarProgressoVideo(segundoAtual, concluido) {
  if (!state.activeVideo || !state.activeVideo.id) return;
  
  const payload = {};
  if (typeof segundoAtual === 'number' && !isNaN(segundoAtual)) {
    payload.segundo_atual = segundoAtual;
    state.activeVideo.segundo_atual = segundoAtual;
  }
  if (typeof concluido === 'boolean') {
    payload.concluido = concluido;
    state.activeVideo.concluido = concluido;
  }

  // Atualiza nos caches locais
  const vAll = state.allVideos.find(v => v.id === state.activeVideo.id);
  if (vAll) {
    if (payload.segundo_atual !== undefined) vAll.segundo_atual = payload.segundo_atual;
    if (payload.concluido !== undefined) vAll.concluido = payload.concluido;
  }
  const vList = state.videos.find(v => v.id === state.activeVideo.id);
  if (vList) {
    if (payload.segundo_atual !== undefined) vList.segundo_atual = payload.segundo_atual;
    if (payload.concluido !== undefined) vList.concluido = payload.concluido;
  }

  try {
    await fetchAuth(`/api/videos/${state.activeVideo.id}/progresso`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.error('Erro ao salvar progresso do vídeo:', err);
  }
}

function updateCompletedButtonUI(isCompleted) {
  const btn = document.getElementById('btn-toggle-completed');
  const icon = document.getElementById('btn-completed-icon');
  const text = document.getElementById('btn-completed-text');
  if (!btn || !icon || !text) return;

  if (isCompleted) {
    btn.className = 'flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-300 rounded-lg text-xs font-semibold shadow-xs hover:bg-emerald-100 transition';
    icon.textContent = '✓';
    icon.classList.remove('nx-check-pop');
    void icon.offsetWidth;
    icon.classList.add('nx-check-pop');
    text.textContent = 'Concluído';
  } else {
    btn.className = 'flex items-center space-x-1.5 px-3 py-1.5 bg-white text-slate-700 border border-slate-200 rounded-lg text-xs font-medium shadow-xs hover:bg-slate-50 transition';
    icon.textContent = '○';
    icon.classList.remove('nx-check-pop');
    text.textContent = 'Marcar Concluído';
  }
}

function createOrUpdatePlayer(youtubeId) {
  const startSeconds = Math.max(0, Number(state.activeVideo?.segundo_atual) || 0);
  if (!state.player) {
    state.player = new YT.Player('youtube-player', {
      videoId: youtubeId,
      playerVars: {
        playsinline: 1,
        modestbranding: 1,
        rel: 0,
        controls: 1,
        fs: 1,
        start: Math.floor(startSeconds)
      },
      events: {
        onReady: onPlayerReady,
        onStateChange: onPlayerStateChange
      }
    });
  } else {
    state.player.loadVideoById({ videoId: youtubeId, startSeconds });
  }
}

function onPlayerReady() {
  state.isPlayerReady = true;
  
  // Se houver minuto/segundo registrado salvo anteriormente, retoma a aula nele
  if (state.activeVideo && state.activeVideo.segundo_atual && state.activeVideo.segundo_atual > 0) {
    try {
      state.player.seekTo(state.activeVideo.segundo_atual, true);
    } catch (e) {
      console.warn('Não foi possível retomar timestamp salvo:', e);
    }
  }

  startTimeTracking();
  updatePlayButtonUI('pause');
  updateStatusBadge('Reproduzindo Aula', 'bg-emerald-500');
}

function onPlayerStateChange(event) {
  if (event.data === YT.PlayerState.PLAYING) {
    updatePlayButtonUI('pause');
    updateStatusBadge('Em Reprodução', 'bg-emerald-500');
  } else if (event.data === YT.PlayerState.PAUSED) {
    updatePlayButtonUI('play');
    updateStatusBadge('Em Pausa', 'bg-amber-500');
    // Salva o instante exato da pausa
    if (state.player && typeof state.player.getCurrentTime === 'function') {
      const sec = Math.floor(state.player.getCurrentTime());
      salvarProgressoVideo(sec);
    }
  } else if (event.data === YT.PlayerState.ENDED) {
    updatePlayButtonUI('replay');
    updateStatusBadge('Aula Concluída', 'bg-blue-500');
    // Marca como concluído automaticamente ao terminar
    if (state.activeVideo && !state.activeVideo.concluido) {
      salvarProgressoVideo(0, true);
      updateCompletedButtonUI(true);
    }
  }
}

function updateStatusBadge(label, dotColorClass) {
  const badge = document.getElementById('player-status-badge');
  if (!badge) return;
  badge.textContent = label;
  const dot = badge.previousElementSibling;
  if (dot) {
    dot.className = `w-2 h-2 rounded-full ${dotColorClass}`;
  }
}

function updatePlayButtonUI(mode) {
  const icon = document.getElementById('btn-play-icon');
  const text = document.getElementById('btn-play-text');
  if (!icon || !text) return;

  if (mode === 'pause') {
    icon.textContent = '⏸';
    text.textContent = 'Pausar';
  } else if (mode === 'replay') {
    icon.textContent = '↺';
    text.textContent = 'Recomeçar';
  } else {
    icon.textContent = '▶';
    text.textContent = 'Reproduzir';
  }
}

function togglePlayPause() {
  if (!state.player || !state.isPlayerReady) return;
  const s = state.player.getPlayerState();
  if (s === YT.PlayerState.PLAYING) {
    state.player.pauseVideo();
  } else {
    state.player.playVideo();
  }
}

function seekToSeconds(seconds) {
  if (!state.player || !state.isPlayerReady) return;
  state.player.seekTo(seconds, true);
  state.player.playVideo();
}

function getCurrentVideoTime() {
  if (state.capturedTimestampOverride !== null) {
    const val = state.capturedTimestampOverride;
    state.capturedTimestampOverride = null;
    return val;
  }
  if (!state.player || !state.isPlayerReady || typeof state.player.getCurrentTime !== 'function') {
    return 0;
  }
  return Math.floor(state.player.getCurrentTime());
}

function formatSeconds(totalSeconds) {
  const sec = Math.max(0, Math.floor(totalSeconds || 0));
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const remSec = sec % 60;

  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(remSec).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(remSec).padStart(2, '0')}`;
}

let secondsCounter = 0;
function startTimeTracking() {
  if (state.timerInterval) clearInterval(state.timerInterval);

  state.timerInterval = setInterval(() => {
    if (!state.player || !state.isPlayerReady || typeof state.player.getCurrentTime !== 'function') return;
    const currentSeconds = Math.floor(state.player.getCurrentTime());
    const formatted = formatSeconds(currentSeconds);

    const currentTimeDisplay = document.getElementById('current-time-display');
    if (currentTimeDisplay) currentTimeDisplay.textContent = formatted;

    const formNoteTimestamp = document.getElementById('form-note-timestamp');
    if (formNoteTimestamp && state.capturedTimestampOverride === null) {
      formNoteTimestamp.textContent = formatted;
    }

    // A cada ~4 segundos de reprodução, salva o progresso discretamente para caso o usuário feche a página
    secondsCounter++;
    if (secondsCounter >= 8) { // 8 * 500ms = 4s
      secondsCounter = 0;
      if (Math.abs(currentSeconds - lastSavedSeconds) >= 3) {
        lastSavedSeconds = currentSeconds;
        salvarProgressoVideo(currentSeconds);
      }
    }
  }, 500);
}

function parseYouTubeId(url, fallback = 'M7lc1UVf-VE') {
  const valor = String(url || '').trim();
  const idValido = /^[\w-]{11}$/;
  if (idValido.test(valor)) return valor;
  try {
    const link = new URL(valor);
    if (!['https:', 'http:'].includes(link.protocol)) return fallback;
    const host = link.hostname.replace(/^(www\.|m\.)/, '');
    const [, rota, trecho] = link.pathname.split('/');
    const id = host === 'youtu.be' ? rota : host === 'youtube.com'
      ? link.searchParams.get('v') || (['embed', 'v', 'shorts', 'live'].includes(rota) ? trecho : '')
      : '';
    return id && idValido.test(id) ? id : fallback;
  } catch {
    return fallback;
  }
}

// ================= 2. CONSUMO DA API REST DO BACKEND ================= //

async function fetchTopics() {
  try {
    const response = await fetchAuth('/api/topicos');
    const result = await response.json();
    if (result.success) {
      state.topics = result.data;
      renderSidebarTopics();
      renderTopicSelectOptions();

      const countBadge = document.getElementById('sidebar-topic-count');
      if (countBadge) {
        countBadge.textContent = state.topics.length;
        countBadge.hidden = state.topics.length === 0;
      }

      if (state.selectedTopicId === undefined && state.currentView === 'grid') {
        state.selectedTopicId = null; // Padrão: Catálogo Geral Organizado por tópicos
        showGridView();
        renderVideosGrid();
      }
    }
  } catch (error) {
    console.error('Erro ao buscar tópicos:', error);
  }
}

async function fetchAllVideos() {
  try {
    const response = await fetchAuth('/api/videos');
    const result = await response.json();
    if (result.success) {
      state.allVideos = result.data;
    }
  } catch (error) {
    console.error('Erro ao buscar catálogo completo de vídeos:', error);
  }
}

async function fetchVideos(topicId) {
  try {
    const url = topicId ? `/api/videos?id_topico=${topicId}` : '/api/videos';
    const response = await fetchAuth(url);
    const result = await response.json();
    if (result.success) {
      state.videos = result.data;
      renderVideosGrid();
    }
  } catch (error) {
    console.error('Erro ao carregar vídeos do tópico:', error);
  }
}

async function fetchSchedule() {
  try {
    const response = await fetchAuth('/api/agendamentos');
    const result = await response.json();
    if (result.success) {
      state.agendamentos = result.data;
      
      const badge = document.getElementById('sidebar-schedule-count');
      if (badge) {
        badge.textContent = state.agendamentos.length;
        badge.hidden = state.agendamentos.length === 0;
      }

      const totalBadge = document.getElementById('schedule-total-badge');
      if (totalBadge) {
        totalBadge.textContent = `${state.agendamentos.length} ${state.agendamentos.length === 1 ? 'aula agendada' : 'aulas agendadas'}`;
      }

      if (state.currentView === 'schedule') {
        renderScheduleGrid();
      }
    }
  } catch (error) {
    console.error('Erro ao carregar cronograma:', error);
  }
}

async function fetchNotes(videoId) {
  try {
    const response = await fetchAuth(`/api/notas?id_video=${videoId}`);
    const result = await response.json();
    if (result.success) {
      state.activeVideoNotes = result.data;
      renderNotesList();
    }
  } catch (error) {
    console.error('Erro ao carregar notas:', error);
  }
}

async function createTopic(nome) {
  try {
    const response = await fetchAuth('/api/topicos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome })
    });
    const result = await response.json();
    if (result.success) {
      await fetchTopics();
      selectTopic(result.data.id);
      return result.data;
    } else {
      alert(`Erro: ${result.message}`);
      return false;
    }
  } catch (error) {
    console.error('Erro ao cadastrar tópico:', error);
    return false;
  }
}

async function updateTopic(id, nome) {
  try {
    const response = await fetchAuth(`/api/topicos/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome })
    });
    const result = await response.json();
    if (result.success) {
      await fetchTopics();
      await fetchAllVideos();
      if (state.selectedTopicId === id) {
        selectTopic(id);
      } else {
        renderVideosGrid();
      }
      return true;
    } else {
      alert(`Erro: ${result.message}`);
      return false;
    }
  } catch (error) {
    console.error('Erro ao atualizar tópico:', error);
    return false;
  }
}

async function deleteTopic(id) {
  const topico = state.topics.find(t => t.id === id);
  const nome = topico ? `"${topico.nome}"` : 'este tópico';
  const qtdAulas = state.allVideos.filter(v => v.id_topico === id).length;

  const msgAviso = qtdAulas > 0
    ? `Tem certeza que deseja excluir o tópico ${nome}?\n\nATENÇÃO: Ele contém ${qtdAulas} aula(s) associada(s) que também serão removidas do catálogo!`
    : `Tem certeza que deseja excluir o tópico ${nome}?`;

  const confirmado = typeof window.nxConfirmarExclusao === 'function'
    ? await window.nxConfirmarExclusao({
        titulo: 'Excluir trilha de estudos?',
        nomeItem: topico ? topico.nome : 'esta trilha',
        descricao: qtdAulas > 0 ? `Atenção: ${qtdAulas} aula(s) associada(s) também serão removidas do catálogo.` : 'Esta trilha será removida do catálogo.',
        textoConfirmar: 'Excluir trilha'
      })
    : confirm(msgAviso);
  if (!confirmado) return false;

  try {
    const response = await fetchAuth(`/api/topicos/${id}`, { method: 'DELETE' });
    const result = await response.json();
    if (result.success) {
      await fetchTopics();
      await fetchAllVideos();
      await fetchSchedule();
      if (state.selectedTopicId === id) {
        state.selectedTopicId = null; // volta para visão geral
      }
      showGridView();
      return true;
    } else {
      alert(`Erro: ${result.message}`);
      return false;
    }
  } catch (error) {
    console.error('Erro ao excluir tópico:', error);
    return false;
  }
}

function abrirModalEditarTopico(id, nomeAtual) {
  const modal = document.getElementById('modal-edit-topic');
  const inputId = document.getElementById('input-edit-topic-id');
  const inputNome = document.getElementById('input-edit-topic-name');
  if (modal && inputId && inputNome) {
    inputId.value = id;
    inputNome.value = nomeAtual;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    inputNome.focus();
  }
}

function fecharModalEditarTopico() {
  const modal = document.getElementById('modal-edit-topic');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

async function salvarEdicaoTopico(e) {
  if (e) e.preventDefault();
  const inputId = document.getElementById('input-edit-topic-id');
  const inputNome = document.getElementById('input-edit-topic-name');
  if (!inputId || !inputNome) return;
  const id = parseInt(inputId.value, 10);
  const nome = inputNome.value.trim();
  if (!id || !nome) return;

  const ok = await updateTopic(id, nome);
  if (ok) {
    fecharModalEditarTopico();
  }
}

async function createVideo(titulo, url_youtube, id_topico) {
  try {
    const response = await fetchAuth('/api/videos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titulo, url_youtube, id_topico })
    });
    const result = await response.json();
    if (result.success) {
      await fetchAllVideos();
      selectTopic(id_topico);
      return result.data;
    } else {
      alert(`Erro: ${result.message}`);
      return false;
    }
  } catch (error) {
    console.error('Erro ao cadastrar vídeo:', error);
    return false;
  }
}

async function deleteVideo(videoId) {
  const video = state.videos.find(v => v.id === videoId) || state.allVideos.find(v => v.id === videoId);
  const titulo = video ? `"${video.titulo}"` : 'este vídeo';
  
  const confirmado = typeof window.nxConfirmarExclusao === 'function'
    ? await window.nxConfirmarExclusao({
        titulo: 'Excluir aula permanentemente?',
        nomeItem: video ? video.titulo : 'este vídeo',
        descricao: 'As anotações e agendamentos ligados a este vídeo também serão removidos.',
        textoConfirmar: 'Excluir aula'
      })
    : confirm(`Tem certeza que deseja apagar permanentemente ${titulo}, além de suas anotações e agendamentos?`);
  if (!confirmado) {
    return false;
  }

  try {
    const response = await fetchAuth(`/api/videos/${videoId}`, { method: 'DELETE' });
    const result = await response.json();

    if (result.success) {
      if (state.activeVideo && state.activeVideo.id === videoId) {
        returnToPreviousView();
        state.activeVideo = null;
      }
      
      await fetchAllVideos();
      await fetchSchedule();
      if (state.selectedTopicId) {
        await fetchVideos(state.selectedTopicId);
      } else {
        renderVideosGrid();
      }
      return true;
    } else {
      alert(`Erro: ${result.message}`);
      return false;
    }
  } catch (error) {
    console.error('Erro ao excluir vídeo:', error);
    return false;
  }
}

async function createSchedule(dia_semana, id_video) {
  try {
    const response = await fetchAuth('/api/agendamentos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dia_semana, id_video })
    });
    const result = await response.json();
    if (result.success) {
      await fetchSchedule();
      return true;
    } else {
      alert(`Erro: ${result.message}`);
      return false;
    }
  } catch (error) {
    console.error('Erro ao agendar aula:', error);
    return false;
  }
}

async function deleteSchedule(scheduleId) {
  const confirmado = typeof window.nxConfirmarExclusao === 'function'
    ? await window.nxConfirmarExclusao({
        titulo: 'Desmarcar aula do cronograma?',
        nomeItem: 'Agendamento semanal',
        descricao: 'A aula continua disponível no catálogo de vídeos.',
        textoConfirmar: 'Desmarcar aula'
      })
    : confirm('Deseja desmarcar esta aula deste dia no cronograma?');
  if (!confirmado) return;
  try {
    const response = await fetchAuth(`/api/agendamentos/${scheduleId}`, { method: 'DELETE' });
    const result = await response.json();
    if (result.success) {
      await fetchSchedule();
    }
  } catch (error) {
    console.error('Erro ao desmarcar aula:', error);
  }
}

async function createNote(texto) {
  if (!state.activeVideo) return;
  const segundos = getCurrentVideoTime();

  try {
    const response = await fetchAuth('/api/notas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id_video: state.activeVideo.id,
        segundos,
        texto
      })
    });
    const result = await response.json();
    if (result.success) {
      await fetchNotes(state.activeVideo.id);
      return true;
    } else {
      alert(`Erro: ${result.message}`);
      return false;
    }
  } catch (error) {
    console.error('Erro ao salvar nota:', error);
    return false;
  }
}

async function deleteNote(noteId) {
  const confirmado = typeof window.nxConfirmarExclusao === 'function'
    ? await window.nxConfirmarExclusao({
        titulo: 'Excluir anotação?',
        nomeItem: 'Anotação da aula',
        descricao: 'Esta anotação com timestamp será removida permanentemente.',
        textoConfirmar: 'Excluir anotação'
      })
    : confirm('Deseja excluir esta anotação permanente da aula?');
  if (!confirmado) return;
  try {
    const response = await fetchAuth(`/api/notas/${noteId}`, { method: 'DELETE' });
    const result = await response.json();
    if (result.success && state.activeVideo) {
      await fetchNotes(state.activeVideo.id);
    }
  } catch (error) {
    console.error('Erro ao excluir anotação:', error);
  }
}

// ================= 3. RENDERIZAÇÃO DA INTERFACE ================= //

function selectTopic(topicId) {
  state.selectedTopicId = topicId;
  const currentTopic = state.topics.find(t => t.id === topicId);

  const breadcrumb = document.getElementById('breadcrumb-topic');
  const gridTopicTag = document.getElementById('grid-topic-tag');
  const gridTopicTitle = document.getElementById('grid-topic-title');

  if (currentTopic) {
    if (breadcrumb) breadcrumb.textContent = currentTopic.nome;
    if (gridTopicTag) gridTopicTag.textContent = `Trilha: ${currentTopic.nome}`;
    if (gridTopicTitle) gridTopicTitle.textContent = currentTopic.nome;
  }

  showGridView();
  renderSidebarTopics();
  updateScheduleButtonState(false);
  fetchVideos(topicId);
}

function updateScheduleButtonState(isActive) {
  const btn = document.getElementById('nav-btn-schedule');
  if (!btn) return;
  if (isActive) {
    btn.className = 'w-full text-left px-3 py-2.5 rounded-lg text-xs transition flex items-center justify-between group bg-brand-600 text-white font-semibold shadow-xs ring-1 ring-white/10';
    btn.querySelector('svg').className = 'w-4 h-4 text-white shrink-0';
  } else {
    btn.className = 'w-full text-left px-3 py-2.5 rounded-lg text-xs transition flex items-center justify-between group text-slate-300 hover:bg-slate-900 hover:text-white';
    btn.querySelector('svg').className = 'w-4 h-4 text-brand-400 shrink-0';
  }
}

function showScheduleView() {
  state.previousView = state.currentView === 'lesson' ? state.previousView : state.currentView;
  state.currentView = 'schedule';
  state.selectedTopicId = null;

  const viewDashboardGeral = document.getElementById('view-dashboard-geral');
  if (viewDashboardGeral) viewDashboardGeral.classList.add('hidden');
  document.getElementById('view-grid').classList.add('hidden');
  document.getElementById('view-schedule').classList.remove('hidden');
  document.getElementById('view-lesson').classList.add('hidden');
  document.getElementById('view-estudos-os')?.classList.add('hidden');
  const btnEstudosOs = document.getElementById('nav-btn-estudos-os');
  if (btnEstudosOs) btnEstudosOs.className = 'w-full text-left px-3 py-2.5 rounded-lg text-xs transition flex items-center justify-between group text-slate-300 hover:bg-slate-900 hover:text-white cursor-pointer';
  const viewRotinaEl = document.getElementById('view-rotina');
  if (viewRotinaEl) viewRotinaEl.classList.add('hidden');
  const viewMetasEl = document.getElementById('view-metas');
  if (viewMetasEl) viewMetasEl.classList.add('hidden');
  document.getElementById('btn-back-to-origin').classList.add('hidden');

  const breadcrumb = document.getElementById('breadcrumb-topic');
  if (breadcrumb) breadcrumb.textContent = 'Meu Cronograma Semanal';

  updateScheduleButtonState(true);
  renderSidebarTopics();
  renderScheduleGrid();

  if (state.player && state.isPlayerReady) {
    try { state.player.pauseVideo(); } catch (e) {}
  }
}

function renderSidebarTopics() {
  const container = document.getElementById('topics-list');
  if (!container) return;

  container.innerHTML = '';

  // Item "Todas as Trilhas"
  const isAllSelected = state.selectedTopicId === null && state.currentView === 'grid';
  const btnAll = document.createElement('button');
  btnAll.className = `w-full text-left px-3 py-2 rounded-lg text-xs transition flex items-center justify-between group ${
    isAllSelected
      ? 'bg-brand-600 text-white font-semibold shadow-xs ring-1 ring-white/10'
      : 'text-slate-300 hover:bg-slate-900 hover:text-white'
  }`;
  btnAll.innerHTML = `
    <div class="flex items-center space-x-2 truncate">
      <span class="text-xs">📂</span>
      <span class="truncate font-medium">Todas as Trilhas</span>
    </div>
    <span class="text-[10px] font-mono px-1.5 py-0.5 rounded ${isAllSelected ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400'}">${state.allVideos.length}</span>
  `;
  btnAll.addEventListener('click', () => {
    state.selectedTopicId = null;
    showGridView();
    renderSidebarTopics();
    updateScheduleButtonState(false);
    renderVideosGrid();
    const breadcrumb = document.getElementById('breadcrumb-topic');
    if (breadcrumb) breadcrumb.textContent = 'Todas as Trilhas';
  });
  container.appendChild(btnAll);

  state.topics.forEach(topic => {
    const isSelected = topic.id === state.selectedTopicId && state.currentView === 'grid';
    const topicVideos = state.allVideos.filter(v => v.id_topico === topic.id);
    const qtd = topicVideos.length;

    const row = document.createElement('div');
    row.className = `w-full rounded-lg text-xs transition flex items-center justify-between group ${
      isSelected
        ? 'bg-brand-600 text-white font-semibold shadow-xs ring-1 ring-white/10'
        : 'text-slate-300 hover:bg-slate-900 hover:text-white'
    }`;

    row.innerHTML = `
      <button type="button" class="flex-1 text-left px-3 py-2 flex items-center space-x-2 truncate cursor-pointer">
        <span class="w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-slate-600 group-hover:bg-slate-400'} shrink-0"></span>
        <span class="truncate">${escapeHTML(topic.nome)}</span>
      </button>
      <div class="flex items-center gap-1 pr-2 shrink-0">
        <span class="text-[10px] font-mono px-1.5 py-0.5 rounded ${isSelected ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400'}">
          ${qtd}
        </span>
        <button type="button" class="btn-action-edit-topic p-1 rounded hover:bg-black/20 text-slate-400 hover:text-white transition opacity-60 group-hover:opacity-100" title="Editar nome do tópico">
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </button>
        <button type="button" class="btn-action-delete-topic p-1 rounded hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 transition opacity-60 group-hover:opacity-100" title="Excluir tópico">
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    `;

    // Clique no corpo seleciona o tópico
    row.querySelector('button').addEventListener('click', () => selectTopic(topic.id));

    // Clique em editar
    row.querySelector('.btn-action-edit-topic').addEventListener('click', (e) => {
      e.stopPropagation();
      abrirModalEditarTopico(topic.id, topic.nome);
    });

    // Clique em excluir
    row.querySelector('.btn-action-delete-topic').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteTopic(topic.id);
    });

    container.appendChild(row);
  });
}

function renderTopicSelectOptions() {
  const select = document.getElementById('select-video-topic');
  if (!select) return;

  select.innerHTML = '';
  state.topics.forEach(topic => {
    const opt = document.createElement('option');
    opt.value = topic.id;
    opt.textContent = topic.nome;
    if (topic.id === state.selectedTopicId) opt.selected = true;
    select.appendChild(opt);
  });
}

function criarElementoCardVideo(video) {
  const ytid = parseYouTubeId(video.url_youtube);
  const card = document.createElement('div');
  card.className = 'bg-white rounded-xl border border-slate-200/90 hover:border-slate-300 overflow-hidden shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col group';
  
  const thumbUrl = `https://img.youtube.com/vi/${ytid}/hqdefault.jpg`;
  const isDone = !!video.concluido;
  const hasProgress = !isDone && video.segundo_atual && video.segundo_atual > 0;
  const topico = state.topics.find(t => t.id === video.id_topico);

  card.innerHTML = `
    <div class="relative w-full pb-[56.25%] bg-slate-950 overflow-hidden">
      <img src="${thumbUrl}" alt="${escapeHTML(video.titulo)}" class="absolute inset-0 w-full h-full object-cover group-hover:scale-102 transition duration-300" />
      <div class="absolute inset-0 bg-slate-900/10 group-hover:bg-slate-900/0 transition"></div>
      <div class="absolute bottom-2.5 right-2.5 bg-slate-950/85 text-white text-[10px] font-mono px-2 py-0.5 rounded shadow-xs flex items-center space-x-1">
        <span class="w-1.5 h-1.5 rounded-full ${isDone ? 'bg-emerald-400' : 'bg-brand-500'}"></span>
        <span>${isDone ? 'Concluído' : 'Aula'}</span>
      </div>
      ${isDone ? `
        <div class="absolute top-2.5 left-2.5 bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-sm flex items-center space-x-1 border border-emerald-400/40">
          <span>✓ Concluída</span>
        </div>
      ` : ''}
      ${hasProgress ? `
        <div class="badge-parou-em absolute top-2.5 left-2.5 bg-[#172522]/95 text-[#f1efe8] text-[11px] font-semibold px-2.5 py-1 rounded-lg shadow-md flex items-center gap-1.5 border border-[#437268]/40 backdrop-blur-md">
          <span class="text-[#7ee1c7] text-xs">⏱</span>
          <span class="opacity-85 font-sans tracking-wide text-[10.5px]">Parou em</span>
          <span class="font-mono font-bold text-[#7ee1c7] text-[11.5px]">${formatSeconds(video.segundo_atual)}</span>
        </div>
      ` : ''}
    </div>
    <div class="p-5 flex-1 flex flex-col justify-between">
      <div>
        <div class="flex items-center justify-between">
          <span class="text-[10px] font-semibold ${isDone ? 'text-emerald-700' : 'text-brand-700'} uppercase tracking-wider">
            ${topico ? escapeHTML(topico.nome) : 'Conteúdo'}
          </span>
          <button class="btn-delete-grid-video text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-1 rounded transition opacity-80 group-hover:opacity-100" data-id="${video.id}" title="Excluir este vídeo">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
        <h4 class="text-xs font-semibold text-slate-900 mt-1 line-clamp-2 leading-relaxed group-hover:text-brand-600 transition">
          ${escapeHTML(video.titulo)}
        </h4>
      </div>
      <div class="mt-5 pt-3.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
        <span class="font-medium text-slate-600">${isDone ? 'Rever Treinamento' : (hasProgress ? 'Continuar Aula' : 'Acessar Treinamento')}</span>
        <div class="w-6 h-6 rounded-full ${isDone ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 group-hover:bg-brand-50 group-hover:text-brand-600'} flex items-center justify-center transition">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/>
          </svg>
        </div>
      </div>
    </div>
  `;

  const btnDelete = card.querySelector('.btn-delete-grid-video');
  btnDelete.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteVideo(video.id);
  });

  card.addEventListener('click', () => openLessonView(video, 'grid'));
  return card;
}

function renderVideosGrid() {
  const container = document.getElementById('videos-grid-container');
  const countBadge = document.getElementById('video-count-badge');
  const gridTopicTag = document.getElementById('grid-topic-tag');
  const gridTopicTitle = document.getElementById('grid-topic-title');
  const gridTopicSubtitle = document.getElementById('grid-topic-subtitle');
  if (!container) return;

  // Caso 1: Tópico específico selecionado
  if (state.selectedTopicId !== null) {
    const topic = state.topics.find(t => t.id === state.selectedTopicId);
    const topicVideos = state.allVideos.filter(v => v.id_topico === state.selectedTopicId);
    
    if (gridTopicTag) gridTopicTag.textContent = `Trilha: ${topic ? topic.nome : 'Selecionada'}`;
    if (gridTopicTitle) gridTopicTitle.textContent = topic ? topic.nome : 'Catálogo de Vídeos';
    if (gridTopicSubtitle) gridTopicSubtitle.textContent = `Visualizando todas as aulas organizadas no tópico ${topic ? topic.nome : ''}.`;
    if (countBadge) {
      countBadge.textContent = `${topicVideos.length} ${topicVideos.length === 1 ? 'aula disponível' : 'aulas disponíveis'}`;
    }

    container.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6';
    container.innerHTML = '';

    if (topicVideos.length === 0) {
      container.innerHTML = `
        <div class="col-span-full py-16 text-center bg-white rounded-xl border border-dashed border-slate-300 p-8">
          <div class="w-12 h-12 mx-auto bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mb-3">
            <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
            </svg>
          </div>
          <p class="text-sm font-semibold text-slate-800">Nenhuma videoaula nesta trilha</p>
          <p class="text-xs text-slate-500 mt-1">Clique em "Novo Vídeo" na barra lateral para cadastrar o primeiro conteúdo.</p>
        </div>
      `;
      return;
    }

    topicVideos.forEach(video => {
      container.appendChild(criarElementoCardVideo(video));
    });
    return;
  }

  // Caso 2: Visão Geral com TODOS os tópicos separados e suas contagens
  if (gridTopicTag) gridTopicTag.textContent = 'Trilhas & Módulos Separados';
  if (gridTopicTitle) gridTopicTitle.textContent = 'Catálogo Geral Organizado';
  if (gridTopicSubtitle) gridTopicSubtitle.textContent = 'Cada trilha de aprendizado separada com a quantidade exata de aulas disponíveis.';
  if (countBadge) {
    const totalAulas = state.allVideos.length;
    countBadge.textContent = `${totalAulas} ${totalAulas === 1 ? 'aula no total' : 'aulas no total'}`;
  }

  container.className = 'space-y-10 col-span-full';
  container.innerHTML = '';

  if (state.topics.length === 0) {
    container.innerHTML = `
      <div class="py-16 text-center bg-white rounded-xl border border-dashed border-slate-300 p-8">
        <p class="text-sm font-semibold text-slate-800">Nenhum tópico cadastrado</p>
        <p class="text-xs text-slate-500 mt-1">Clique em "Novo Tópico" para começar.</p>
      </div>
    `;
    return;
  }

  state.topics.forEach(topic => {
    const topicVideos = state.allVideos.filter(v => v.id_topico === topic.id);
    const qtd = topicVideos.length;
    const concluidasTopico = topicVideos.filter(v => !!v.concluido).length;
    const pctTopico = qtd > 0 ? Math.round((concluidasTopico / qtd) * 100) : 0;

    const section = document.createElement('div');
    section.className = 'nx-card-alive bg-[#fbfaf6] border border-[#1f2a27]/10 rounded-2xl p-6 shadow-xs space-y-4';

    section.innerHTML = `
      <!-- Cabeçalho do Tópico -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between pb-3.5 border-b border-[#1f2a27]/10 gap-3">
        <div class="flex items-center space-x-3">
          <div class="w-8 h-8 rounded-xl bg-[#e3efe9] border border-[#a8cfc2]/70 text-[#23453e] flex items-center justify-center font-bold text-xs shadow-2xs">
            🎓
          </div>
          <div>
            <h3 class="text-base font-bold text-[#1f2a27] font-serif tracking-tight flex items-center gap-2">
              <span>${escapeHTML(topic.nome)}</span>
            </h3>
            <div class="flex items-center gap-2.5 mt-1">
              <div class="nx-bar-track w-28 sm:w-36 h-1.5 rounded-full bg-[#e4dfd3]/80 overflow-hidden">
                <div class="nx-bar-fill h-full rounded-full bg-emerald-600" style="width: ${pctTopico}%;"></div>
              </div>
              <span class="text-[11px] font-semibold text-[#437268] tabular-nums">${concluidasTopico}/${qtd} concluídas (${pctTopico}%)</span>
            </div>
          </div>
        </div>

        <div class="flex items-center space-x-2">
          <!-- Badge com a quantidade exata -->
          <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#e3efe9] text-[#23453e] border border-[#a8cfc2]/60">
            <span class="w-1.5 h-1.5 rounded-full bg-[#5b9086]"></span>
            <span>${qtd} ${qtd === 1 ? 'aula disponível' : 'aulas disponíveis'}</span>
          </span>

          <!-- Botão Editar Tópico -->
          <button type="button" class="btn-topico-editar px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 transition shadow-2xs flex items-center gap-1" title="Editar nome deste tópico">
            <svg class="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            <span class="hidden sm:inline">Editar</span>
          </button>

          <!-- Botão Excluir Tópico -->
          <button type="button" class="btn-topico-excluir px-2.5 py-1 rounded-lg text-xs font-medium text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition shadow-2xs flex items-center gap-1" title="Excluir este tópico">
            <svg class="w-3 h-3 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span class="hidden sm:inline">Excluir</span>
          </button>
        </div>
      </div>

      <!-- Grade de Vídeos deste Tópico -->
      <div class="grid-topico-videos grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 pt-1">
        ${qtd === 0 ? `
          <div class="col-span-full py-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl bg-white/70">
            Nenhuma aula cadastrada nesta trilha ainda.
          </div>
        ` : ''}
      </div>
    `;

    // Botões de ação no cabeçalho do tópico
    section.querySelector('.btn-topico-editar').addEventListener('click', () => {
      abrirModalEditarTopico(topic.id, topic.nome);
    });
    section.querySelector('.btn-topico-excluir').addEventListener('click', () => {
      deleteTopic(topic.id);
    });

    // Inserção dos cards
    const gridEl = section.querySelector('.grid-topico-videos');
    topicVideos.forEach(v => {
      gridEl.appendChild(criarElementoCardVideo(v));
    });

    container.appendChild(section);
  });
}

// ================= RENDERIZAÇÃO DO CRONOGRAMA (SEMANAL & MENSAL) ================= //

let scheduleViewMode = 'semana'; // 'semana' | 'mes'
let scheduleMesOffset = 0;

function renderScheduleMonthGrid() {
  const container = document.getElementById('schedule-month-grid');
  if (!container) return;

  const hoje = new Date();
  const ref = new Date(hoje.getFullYear(), hoje.getMonth() + scheduleMesOffset, 1);
  const ano = ref.getFullYear();
  const mes = ref.getMonth();
  const nomeMes = ref.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const primeiroDiaSemana = (ref.getDay() + 6) % 7; // 0 = Segunda .. 6 = Domingo
  const totalDiasMes = new Date(ano, mes + 1, 0).getDate();
  const nomesSemana = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const cabecalhoCols = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

  let celulas = '';
  for (let i = 0; i < primeiroDiaSemana; i++) {
    celulas += '<div class="min-h-[104px] rounded-xl bg-slate-50/60 border border-slate-200/50"></div>';
  }

  for (let diaNum = 1; diaNum <= totalDiasMes; diaNum++) {
    const dt = new Date(ano, mes, diaNum);
    const diaSemana = nomesSemana[dt.getDay()];
    const ehHoje = dt.getFullYear() === hoje.getFullYear() && dt.getMonth() === hoje.getMonth() && dt.getDate() === hoje.getDate();
    const aulasDia = state.agendamentos.filter(a => a.dia_semana === diaSemana && a.video);

    celulas += `
      <div class="min-h-[104px] rounded-xl border p-2 flex flex-col justify-between transition ${ehHoje ? 'bg-emerald-50/70 border-emerald-400 shadow-2xs' : 'bg-white border-slate-200/90 hover:border-emerald-300'}">
        <div class="flex items-center justify-between gap-1 mb-1">
          <span class="text-xs font-bold tabular-nums ${ehHoje ? 'text-emerald-800' : 'text-slate-700'}">${diaNum}</span>
          <div class="flex items-center gap-1">
            ${ehHoje ? '<span class="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-emerald-600 text-white">Hoje</span>' : ''}
            <button type="button" class="btn-month-add-aula w-5 h-5 rounded-md bg-slate-100 hover:bg-emerald-600 text-slate-600 hover:text-white text-[11px] font-bold flex items-center justify-center transition cursor-pointer" data-day="${diaSemana}" title="Programar aula para ${diaSemana}">+</button>
          </div>
        </div>
        <div class="space-y-1 overflow-y-auto max-h-[72px]">
          ${aulasDia.length === 0
            ? '<p class="text-[10px] text-slate-300 italic">Livre</p>'
            : aulasDia.map(item => `
                <button type="button" class="btn-month-open-aula w-full text-left px-1.5 py-1 rounded-md text-[10px] font-medium truncate border transition cursor-pointer ${item.video.concluido ? 'bg-emerald-50 text-emerald-800 border-emerald-200 line-through' : 'bg-slate-50 hover:bg-emerald-50 text-slate-800 border-slate-200'}" data-video-id="${item.video.id}" title="${escapeHTML(item.video.titulo)}">
                  ${item.video.concluido ? '✓ ' : '▶ '}${escapeHTML(item.video.titulo)}
                </button>
              `).join('')}
        </div>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="text-sm font-bold text-slate-900 capitalize">${nomeMes}</h3>
        <div class="flex items-center gap-1.5">
          <button type="button" id="btn-sched-mes-prev" class="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer">‹</button>
          <button type="button" id="btn-sched-mes-hoje" class="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 cursor-pointer">Mês atual</button>
          <button type="button" id="btn-sched-mes-next" class="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer">›</button>
        </div>
      </div>
      <div class="overflow-x-auto pb-1">
        <div class="min-w-[640px] space-y-2">
          <div class="grid grid-cols-7 gap-2 text-center text-[11px] font-bold uppercase tracking-wider text-slate-500">
            ${cabecalhoCols.map(c => `<div>${c}</div>`).join('')}
          </div>
          <div class="grid grid-cols-7 gap-2">
            ${celulas}
          </div>
        </div>
      </div>
    </div>
  `;

  container.querySelector('#btn-sched-mes-prev')?.addEventListener('click', () => {
    scheduleMesOffset -= 1;
    renderScheduleMonthGrid();
  });
  container.querySelector('#btn-sched-mes-hoje')?.addEventListener('click', () => {
    scheduleMesOffset = 0;
    renderScheduleMonthGrid();
  });
  container.querySelector('#btn-sched-mes-next')?.addEventListener('click', () => {
    scheduleMesOffset += 1;
    renderScheduleMonthGrid();
  });
  container.querySelectorAll('.btn-month-add-aula').forEach(btn => {
    btn.addEventListener('click', () => openScheduleModal(btn.getAttribute('data-day')));
  });
  container.querySelectorAll('.btn-month-open-aula').forEach(btn => {
    btn.addEventListener('click', () => {
      const vid = Number(btn.getAttribute('data-video-id'));
      const found = state.agendamentos.find(a => a.video && a.video.id === vid);
      if (found?.video) openLessonView(found.video, 'schedule');
    });
  });
}

function alternarVisaoCronograma(modo) {
  scheduleViewMode = modo === 'mes' ? 'mes' : 'semana';
  const gridSem = document.getElementById('schedule-days-grid');
  const gridMes = document.getElementById('schedule-month-grid');
  const btnSem = document.getElementById('btn-schedule-view-semana');
  const btnMes = document.getElementById('btn-schedule-view-mes');
  const pill = document.getElementById('schedule-periodo-pill');

  if (scheduleViewMode === 'mes') {
    gridSem?.classList.add('hidden');
    gridMes?.classList.remove('hidden');
    if (btnSem) btnSem.className = 'px-3 py-1.5 rounded-md text-slate-500 hover:text-slate-800 transition cursor-pointer';
    if (btnMes) btnMes.className = 'px-3 py-1.5 rounded-md bg-white text-slate-900 shadow-2xs cursor-pointer';
    if (pill) pill.textContent = 'Planejamento Mensal';
    renderScheduleMonthGrid();
  } else {
    gridSem?.classList.remove('hidden');
    gridMes?.classList.add('hidden');
    if (btnSem) btnSem.className = 'px-3 py-1.5 rounded-md bg-white text-slate-900 shadow-2xs cursor-pointer';
    if (btnMes) btnMes.className = 'px-3 py-1.5 rounded-md text-slate-500 hover:text-slate-800 transition cursor-pointer';
    if (pill) pill.textContent = 'Planejamento Semanal';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-schedule-view-semana')?.addEventListener('click', () => alternarVisaoCronograma('semana'));
  document.getElementById('btn-schedule-view-mes')?.addEventListener('click', () => alternarVisaoCronograma('mes'));
});

function renderScheduleGrid() {
  const container = document.getElementById('schedule-days-grid');
  if (!container) return;

  container.innerHTML = '';

  const diaHojeNome = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][new Date().getDay()];

  DIAS_SEMANA.forEach(dia => {
    const agendadosDoDia = state.agendamentos.filter(a => a.dia_semana === dia);
    const ehHoje = dia === diaHojeNome;
    const dayCard = document.createElement('div');
    dayCard.className = `nx-card-alive bg-white rounded-xl border border-slate-200/90 shadow-xs flex flex-col overflow-hidden min-h-[300px] ${ehHoje ? 'nx-schedule-today' : ''}`;

    dayCard.innerHTML = `
      <!-- Cabeçalho do Dia -->
      <div class="px-4 py-3 border-b border-slate-200/80 bg-slate-50/80 flex items-center justify-between ${ehHoje ? 'nx-schedule-today-head' : ''}">
        <div class="flex items-center space-x-2">
          ${ehHoje ? '<span class="nx-status-pulse" title="Dia de hoje"></span>' : `<span class="w-2 h-2 rounded-full ${agendadosDoDia.length > 0 ? 'bg-brand-500' : 'bg-slate-300'}"></span>`}
          <h3 class="text-xs font-bold text-slate-800 uppercase tracking-wider">${dia}</h3>
          ${ehHoje ? '<span class="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-600 text-white">Hoje</span>' : ''}
        </div>
        <span class="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">
          ${agendadosDoDia.length} ${agendadosDoDia.length === 1 ? 'aula' : 'aulas'}
        </span>
      </div>

      <!-- Lista de Aulas Programadas -->
      <div class="flex-1 p-3 space-y-2.5 overflow-y-auto max-h-[360px]" id="day-list-${dia}">
        ${
          agendadosDoDia.length === 0
            ? `<div class="h-36 flex flex-col items-center justify-center text-center p-3 text-slate-400 text-xs border border-dashed border-slate-200 rounded-lg">
                <span class="text-lg opacity-60">☕</span>
                <span class="mt-1 font-medium text-slate-500">Sem aula planejada</span>
                <span class="text-[10px] text-slate-400">Clique abaixo para agendar</span>
               </div>`
            : ''
        }
      </div>

      <!-- Rodapé: Botão de Programar Aula no Dia -->
      <div class="p-3 border-t border-slate-100 bg-white">
        <button class="btn-schedule-day w-full py-2 px-3 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-brand-50 hover:text-brand-700 hover:border-brand-300 rounded-lg border border-slate-200 transition flex items-center justify-center space-x-1.5 focus:outline-none focus:ring-1 focus:ring-brand-400" data-day="${dia}">
          <span class="font-bold text-brand-600">+</span>
          <span>Programar Aula</span>
        </button>
      </div>
    `;

    // Renderiza cada aula agendada no respectivo dia
    const listContainer = dayCard.querySelector(`#day-list-${dia}`);
    if (agendadosDoDia.length > 0) {
      agendadosDoDia.forEach(item => {
        if (!item.video) return;

        const ytid = parseYouTubeId(item.video.url_youtube);
        const itemCard = document.createElement('div');
        itemCard.className = 'group p-2.5 bg-slate-50 hover:bg-white border border-slate-200 hover:border-brand-300 rounded-lg shadow-2xs hover:shadow-xs transition cursor-pointer flex flex-col';
        
        const isDone = !!item.video.concluido;
        const hasProgress = !isDone && item.video.segundo_atual && item.video.segundo_atual > 0;

        itemCard.innerHTML = `
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-[10px] font-bold ${isDone ? 'text-emerald-700 bg-emerald-50 border-emerald-300' : (hasProgress ? 'text-[#23453e] bg-[#e3efe9] border-[#a8cfc2] font-semibold' : 'text-slate-700 bg-slate-100 border-slate-200')} px-2 py-0.5 rounded border truncate max-w-[150px]">
              ${isDone ? '✓ Concluído' : (hasProgress ? `⏱ Parou em ${formatSeconds(item.video.segundo_atual)}` : escapeHTML(item.topico || 'Trilha'))}
            </span>
            <button class="btn-delete-schedule text-slate-400 hover:text-rose-600 p-1 rounded transition opacity-60 group-hover:opacity-100" data-id="${item.id}" title="Remover aula deste dia">
              ✕
            </button>
          </div>
          
          <div class="flex items-center space-x-2.5">
            <div class="relative w-12 h-9 shrink-0">
              <img src="https://img.youtube.com/vi/${ytid}/default.jpg" class="w-full h-full object-cover rounded bg-slate-900 border border-slate-200" />
              ${isDone ? '<div class="absolute inset-0 bg-emerald-700/40 rounded flex items-center justify-center text-white text-[10px] font-bold">✓</div>' : ''}
            </div>
            <p class="text-xs font-medium text-slate-800 line-clamp-2 leading-snug group-hover:text-brand-600 transition">
              ${escapeHTML(item.video.titulo)}
            </p>
          </div>
        `;

        // Clique no item abre a Visão de Aula com o player e anotações
        itemCard.addEventListener('click', (e) => {
          if (e.target.closest('.btn-delete-schedule')) return;
          openLessonView(item.video, 'schedule');
        });

        // Clique para remover do cronograma
        const btnDelete = itemCard.querySelector('.btn-delete-schedule');
        btnDelete.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteSchedule(item.id);
        });

        listContainer.appendChild(itemCard);
      });
    }

    // Botão de programar aula no dia específico
    const btnSchedule = dayCard.querySelector('.btn-schedule-day');
    btnSchedule.addEventListener('click', () => {
      openScheduleModal(dia);
    });

    container.appendChild(dayCard);
  });

  if (scheduleViewMode === 'mes') {
    renderScheduleMonthGrid();
  }
}

function openLessonView(video, fromView = 'grid') {
  state.activeVideo = video;
  state.previousView = fromView;
  state.currentView = 'lesson';

  const viewDashboardGeral = document.getElementById('view-dashboard-geral');
  if (viewDashboardGeral) viewDashboardGeral.classList.add('hidden');
  document.getElementById('view-grid').classList.add('hidden');
  document.getElementById('view-schedule').classList.add('hidden');
  document.getElementById('view-lesson').classList.remove('hidden');
  document.getElementById('view-estudos-os')?.classList.add('hidden');

  const btnBack = document.getElementById('btn-back-to-origin');
  const btnBackText = document.getElementById('btn-back-text');
  if (btnBack) btnBack.classList.remove('hidden');
  if (btnBackText) {
    btnBackText.textContent = fromView === 'revisao' ? 'Voltar à Revisão' : fromView === 'schedule' ? 'Voltar ao Cronograma' : 'Voltar ao Catálogo';
  }

  const currentTopic = state.topics.find(t => t.id === video.id_topico);
  const lessonTopicTag = document.getElementById('lesson-topic-tag');
  const lessonVideoTitle = document.getElementById('lesson-video-title');
  const breadcrumb = document.getElementById('breadcrumb-topic');

  if (lessonTopicTag) lessonTopicTag.textContent = currentTopic ? currentTopic.nome : 'Trilha';
  if (lessonVideoTitle) lessonVideoTitle.textContent = video.titulo;
  if (breadcrumb) {
    breadcrumb.textContent = `${fromView === 'schedule' ? 'Cronograma' : (currentTopic ? currentTopic.nome : 'Trilha')} › ${video.titulo}`;
  }

  // Atualiza estado do botão Concluído
  updateCompletedButtonUI(!!video.concluido);

  const ytid = parseYouTubeId(video.url_youtube);
  createOrUpdatePlayer(ytid);
  fetchNotes(video.id);
}

function returnToPreviousView() {
  // Salva o último instante antes de sair
  if (state.player && state.isPlayerReady && typeof state.player.getCurrentTime === 'function') {
    const sec = Math.floor(state.player.getCurrentTime());
    salvarProgressoVideo(sec);
  }

  if (state.previousView === 'revisao') {
    window.navIrParaRevisao();
  } else if (state.previousView === 'schedule') {
    showScheduleView();
  } else {
    if (state.selectedTopicId) {
      selectTopic(state.selectedTopicId);
    } else if (state.topics.length > 0) {
      selectTopic(state.topics[0].id);
    } else {
      showGridView();
    }
  }
}

function showGridView() {
  state.currentView = 'grid';
  const viewDashboardGeral = document.getElementById('view-dashboard-geral');
  if (viewDashboardGeral) viewDashboardGeral.classList.add('hidden');
  document.getElementById('view-grid').classList.remove('hidden');
  document.getElementById('view-schedule').classList.add('hidden');
  document.getElementById('view-lesson').classList.add('hidden');
  document.getElementById('view-estudos-os')?.classList.add('hidden');
  const btnEstudosOs = document.getElementById('nav-btn-estudos-os');
  if (btnEstudosOs) btnEstudosOs.className = 'w-full text-left px-3 py-2.5 rounded-lg text-xs transition flex items-center justify-between group text-slate-300 hover:bg-slate-900 hover:text-white cursor-pointer';
  const viewRotinaEl = document.getElementById('view-rotina');
  if (viewRotinaEl) viewRotinaEl.classList.add('hidden');
  const viewMetasEl = document.getElementById('view-metas');
  if (viewMetasEl) viewMetasEl.classList.add('hidden');
  document.getElementById('btn-back-to-origin').classList.add('hidden');

  const currentTopic = state.topics.find(t => t.id === state.selectedTopicId);
  const breadcrumb = document.getElementById('breadcrumb-topic');
  if (breadcrumb) {
    breadcrumb.textContent = currentTopic ? currentTopic.nome : 'Todas as Trilhas';
  }

  if (state.player && state.isPlayerReady) {
    try { state.player.pauseVideo(); } catch (e) {}
  }
}

function renderNotesList() {
  const container = document.getElementById('lesson-notes-list');
  const counter = document.getElementById('lesson-notes-count');
  if (!container) return;

  if (counter) {
    counter.textContent = `${state.activeVideoNotes.length} ${state.activeVideoNotes.length === 1 ? 'nota' : 'notas'}`;
  }

  if (state.activeVideoNotes.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 text-slate-400 text-xs border border-dashed border-slate-200 rounded-lg p-6">
        <p class="font-medium text-slate-600">Nenhuma anotação nesta aula</p>
        <p class="mt-1 text-slate-400">Capture pontos-chave preenchendo o campo acima.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = '';

  state.activeVideoNotes.forEach(note => {
    const item = document.createElement('div');
    item.className = 'group p-3 bg-slate-50 hover:bg-white border border-slate-200 hover:border-brand-300 rounded-lg shadow-2xs hover:shadow-xs transition';
    item.innerHTML = `
      <div class="flex items-center justify-between mb-1.5">
        <button class="btn-jump-time flex items-center space-x-1.5 px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 hover:bg-brand-100 font-mono text-[11px] font-bold transition focus:outline-none focus:ring-1 focus:ring-brand-400" data-seconds="${note.segundos}" title="Pular vídeo para este instante">
          <span>⏱</span>
          <span>${note.tempo_formatado}</span>
        </button>
        <button class="btn-delete-note text-slate-400 hover:text-rose-600 text-xs px-1.5 py-0.5 rounded transition opacity-0 group-hover:opacity-100" data-id="${note.id}" title="Excluir anotação">
          ✕
        </button>
      </div>
      <p class="text-xs text-slate-700 leading-relaxed break-words whitespace-pre-wrap">${escapeHTML(note.texto)}</p>
    `;

    item.querySelector('.btn-jump-time').addEventListener('click', () => {
      seekToSeconds(note.segundos);
    });

    item.querySelector('.btn-delete-note').addEventListener('click', () => {
      deleteNote(note.id);
    });

    container.appendChild(item);
  });
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ================= 4. GERENCIAMENTO DE MODAIS E EVENTOS ================= //

function openScheduleModal(dia) {
  const modal = document.getElementById('modal-schedule');
  const dayLabel = document.getElementById('modal-schedule-day-label');
  const inputDay = document.getElementById('input-schedule-day');
  const selectVideo = document.getElementById('select-schedule-video');

  if (dayLabel) dayLabel.textContent = dia;
  if (inputDay) inputDay.value = dia;

  // Popula o select com todos os vídeos disponíveis de todas as categorias
  if (selectVideo) {
    selectVideo.innerHTML = '';
    if (state.allVideos.length === 0) {
      selectVideo.innerHTML = '<option value="">Nenhum vídeo cadastrado no sistema</option>';
    } else {
      state.allVideos.forEach(v => {
        const topico = state.topics.find(t => t.id === v.id_topico);
        const opt = document.createElement('option');
        opt.value = v.id;
        opt.textContent = `[${topico ? topico.nome : 'Geral'}] ${v.titulo}`;
        selectVideo.appendChild(opt);
      });
    }
  }

  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

function closeScheduleModal() {
  const modal = document.getElementById('modal-schedule');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

function setupModals() {
  // Modal 1: Tópico
  const modalTopic = document.getElementById('modal-topic');
  const btnOpenTopic = document.getElementById('btn-open-modal-topic');
  const btnCloseTopic = document.getElementById('btn-close-modal-topic');
  const btnCancelTopic = document.getElementById('btn-cancel-modal-topic');
  const formTopic = document.getElementById('form-add-topic');

  const openTopicModal = () => {
    modalTopic.classList.remove('hidden');
    modalTopic.classList.add('flex');
    document.getElementById('input-topic-name').focus();
  };

  const closeTopicModal = () => {
    modalTopic.classList.add('hidden');
    modalTopic.classList.remove('flex');
    formTopic.reset();
  };

  if (btnOpenTopic) btnOpenTopic.addEventListener('click', openTopicModal);
  if (btnCloseTopic) btnCloseTopic.addEventListener('click', closeTopicModal);
  if (btnCancelTopic) btnCancelTopic.addEventListener('click', closeTopicModal);

  if (formTopic) {
    formTopic.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nome = document.getElementById('input-topic-name').value.trim();
      if (!nome) return;
      const success = await createTopic(nome);
      if (success) closeTopicModal();
    });
  }

  // Modal 2: Vídeo
  const modalVideo = document.getElementById('modal-video');
  const btnOpenVideo = document.getElementById('btn-open-modal-video');
  const btnCloseVideo = document.getElementById('btn-close-modal-video');
  const btnCancelVideo = document.getElementById('btn-cancel-modal-video');
  const formVideo = document.getElementById('form-add-video');
  const selectVideoTopic = document.getElementById('select-video-topic');
  const statusVideo = document.getElementById('status-video-form');
  selectVideoTopic.required = false;

  const openVideoModal = () => {
    renderTopicSelectOptions();
    statusVideo.textContent = '';
    modalVideo.classList.remove('hidden');
    modalVideo.classList.add('flex');
    document.getElementById('input-video-title').focus();
  };

  const closeVideoModal = () => {
    modalVideo.classList.add('hidden');
    modalVideo.classList.remove('flex');
    formVideo.reset();
  };

  if (btnOpenVideo) btnOpenVideo.addEventListener('click', openVideoModal);
  if (btnCloseVideo) btnCloseVideo.addEventListener('click', closeVideoModal);
  if (btnCancelVideo) btnCancelVideo.addEventListener('click', closeVideoModal);

  if (formVideo) {
    formVideo.addEventListener('submit', async (e) => {
      e.preventDefault();
      let id_topico = selectVideoTopic.value;
      const titulo = document.getElementById('input-video-title').value.trim();
      const url_youtube = document.getElementById('input-video-url').value.trim();
      const youtubeId = parseYouTubeId(url_youtube, null);
      const novaTrilha = document.getElementById('input-video-new-topic');
      const dia = document.getElementById('select-video-schedule-day').value;
      if (!titulo || !youtubeId || (!id_topico && !novaTrilha.value.trim())) {
        statusVideo.textContent = 'Informe título, um link válido e uma trilha.';
        return;
      }
      const submit = formVideo.querySelector('[type=submit]');
      submit.disabled = true;
      try {
        if (novaTrilha.value.trim()) {
          const trilha = await createTopic(novaTrilha.value.trim());
          if (!trilha) {
            statusVideo.textContent = 'Não foi possível criar a trilha.';
            return;
          }
          id_topico = trilha.id;
          novaTrilha.value = '';
          renderTopicSelectOptions();
          selectVideoTopic.value = id_topico;
        }
        const aula = await createVideo(titulo, `https://www.youtube.com/watch?v=${youtubeId}`, Number(id_topico));
        if (!aula) {
          statusVideo.textContent = 'Não foi possível salvar a aula.';
          return;
        }
        closeVideoModal();
        if (dia && !await createSchedule(dia, aula.id)) {
          alert('A aula foi salva. Você pode agendá-la em Meu Cronograma.');
        }
      } finally {
        submit.disabled = false;
      }
    });
  }

  // Modal 3: Cronograma
  const btnCloseSchedule = document.getElementById('btn-close-modal-schedule');
  const btnCancelSchedule = document.getElementById('btn-cancel-modal-schedule');
  const formSchedule = document.getElementById('form-add-schedule');

  if (btnCloseSchedule) btnCloseSchedule.addEventListener('click', closeScheduleModal);
  if (btnCancelSchedule) btnCancelSchedule.addEventListener('click', closeScheduleModal);

  if (formSchedule) {
    formSchedule.addEventListener('submit', async (e) => {
      e.preventDefault();
      const dia_semana = document.getElementById('input-schedule-day').value;
      const id_video = document.getElementById('select-schedule-video').value;

      if (!dia_semana || !id_video) return;

      const success = await createSchedule(dia_semana, id_video);
      if (success) closeScheduleModal();
    });
  }

  // Drawer de Chat com IA
  const drawer = document.getElementById('ai-chat-drawer');
  const btnToggleAi = document.getElementById('btn-toggle-ai-chat');
  const btnCloseAi = document.getElementById('btn-close-ai-chat');
  const formAi = document.getElementById('form-ai-chat');
  const inputAi = document.getElementById('input-ai-prompt');
  const messagesContainer = document.getElementById('ai-messages-container');

  const openAiChat = () => {
    if (drawer) drawer.classList.remove('translate-x-full');
    if (inputAi) inputAi.focus();
  };

  const closeAiChat = () => {
    if (drawer) drawer.classList.add('translate-x-full');
  };

  if (btnToggleAi) btnToggleAi.addEventListener('click', openAiChat);
  if (btnCloseAi) btnCloseAi.addEventListener('click', closeAiChat);

  // Sugestões de prompt
  document.querySelectorAll('.ai-quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (inputAi) {
        inputAi.value = btn.getAttribute('data-text');
        inputAi.focus();
      }
    });
  });

  if (formAi) {
    formAi.addEventListener('submit', async (e) => {
      e.preventDefault();
      const prompt = inputAi.value.trim();
      if (!prompt) return;

      // Adiciona mensagem do usuário na tela
      appendChatMessage('user', prompt);
      inputAi.value = '';

      // Mostra mensagem de carregamento
      const loadingId = appendChatMessage('ai', 'Pensando e organizando seu ambiente...', true);

      try {
        const response = await fetchAuth('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt })
        });
        const result = await response.json();

        // Remove loading e adiciona resposta real
        removeChatMessage(loadingId);

        if (result.success) {
          let respostaFinal = result.mensagem;
          if (result.acoesExecutadas && result.acoesExecutadas.length > 0) {
            respostaFinal += `\n\n**Ações executadas:**\n• ` + result.acoesExecutadas.join('\n• ');
          }
          appendChatMessage('ai', respostaFinal, false, result.opcoesSugeridas, result.diasAlvo);
          if (result.previa) {
            const painel = document.getElementById('ai-messages-container');
            const proposta = document.createElement('div');
            proposta.className = 'space-y-2 rounded border border-slate-200 p-2 text-xs';
            const lista = document.createElement('ul');
            for (const acao of result.previa.acoes) {
              const item = document.createElement('li');
              item.textContent = acao;
              lista.append(item);
            }
            const aplicar = document.createElement('button');
            aplicar.type = 'button';
            aplicar.className = 'font-semibold text-emerald-800 underline';
            aplicar.textContent = 'Confirmar alterações';
            aplicar.onclick = async () => {
              aplicar.disabled = true;
              try {
                const resposta = await fetchAuth('/api/ai/chat', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ propostaId: result.previa.id })
                });
                const dados = await resposta.json();
                appendChatMessage('ai', dados.mensagem || dados.message || 'Não foi possível aplicar a proposta.');
                if (resposta.ok) {
                  await fetchAllVideos();
                  await fetchTopics();
                  await fetchSchedule();
                }
              } catch {
                appendChatMessage('ai', 'A confirmação não foi concluída. Consulte o cronograma antes de tentar novamente.');
              }
            };
            proposta.append(lista, aplicar);
            painel.append(proposta);
          }

          // Atualiza dados na tela em tempo real
          await fetchAllVideos();
          await fetchTopics();
          await fetchSchedule();
        } else {
          appendChatMessage('ai', `Erro: ${result.message}`);
        }
      } catch (err) {
        console.error('Erro no chat de IA:', err);
        removeChatMessage(loadingId);
        appendChatMessage('ai', 'Não foi possível se comunicar com o assistente de IA.');
      }
    });
  }
}

function appendChatMessage(sender, text, isLoading = false, opcoesSugeridas = null, diasAlvo = []) {
  const container = document.getElementById('ai-messages-container');
  if (!container) return null;

  const id = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
  const msgDiv = document.createElement('div');
  msgDiv.id = id;
  msgDiv.className = 'flex flex-col space-y-1';

  if (sender === 'user') {
    msgDiv.innerHTML = `
      <span class="text-[10px] font-semibold text-brand-600 text-right uppercase tracking-wider">Você</span>
      <div class="p-3 bg-brand-600 text-white rounded-xl rounded-tr-none shadow-2xs text-xs leading-relaxed self-end max-w-[85%] whitespace-pre-wrap">
        ${escapeHTML(text)}
      </div>
    `;
  } else {
    let optionsHtml = '';
    if (Array.isArray(opcoesSugeridas) && opcoesSugeridas.length > 0) {
      optionsHtml = `
        <div class="mt-3 space-y-2 border-t border-slate-200/80 pt-2.5">
          <fieldset class="flex flex-wrap gap-2 text-[11px]">
            <legend class="font-semibold">Dias propostos (você pode alterar)</legend>
            ${DIAS_SEMANA.map(dia => `<label><input type="checkbox" class="dia-proposta-aula" value="${dia}" ${(diasAlvo.length ? diasAlvo : ['Segunda']).includes(dia) ? 'checked' : ''} /> ${dia}</label>`).join('')}
          </fieldset>
          <p class="text-[11px] font-semibold text-slate-700">Selecione a aula para confirmar:</p>
          <div class="space-y-1.5">
            ${opcoesSugeridas.map((item, idx) => `
              <button class="btn-confirm-option w-full text-left p-2 rounded-lg bg-slate-50 hover:bg-brand-50 border border-slate-200 hover:border-brand-300 transition flex items-center space-x-2.5 group" data-idx="${idx}">
                <img src="https://img.youtube.com/vi/${item.youtubeId}/default.jpg" class="w-12 h-9 object-cover rounded bg-slate-900 shrink-0 border border-slate-200" />
                <div class="truncate flex-1">
                  <div class="text-xs font-semibold text-slate-800 group-hover:text-brand-700 truncate leading-snug">
                    ${idx + 1}. ${escapeHTML(item.titulo)}
                  </div>
                  <div class="text-[10px] text-slate-400 mt-0.5 flex items-center space-x-2">
                    <span>${item.canal || 'YouTube'}</span>
                    ${item.duracao ? `<span>&middot; ${item.duracao}</span>` : ''}
                  </div>
                </div>
                <span class="text-xs font-bold text-brand-600 px-2 py-1 rounded bg-white border border-brand-200 shrink-0 group-hover:bg-brand-600 group-hover:text-white transition">
                  Escolher
                </span>
              </button>
            `).join('')}
          </div>
        </div>
      `;
    }

    msgDiv.innerHTML = `
      <span class="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Copiloto Nexus</span>
      <div class="p-3 bg-white border border-slate-200/90 rounded-xl rounded-tl-none shadow-2xs text-xs text-slate-800 leading-relaxed max-w-[95%] whitespace-pre-wrap ${isLoading ? 'animate-pulse text-slate-500' : ''}">
        ${escapeHTML(text)}
        ${optionsHtml}
      </div>
    `;

    // Bind dos cliques nas opções sugeridas
    if (Array.isArray(opcoesSugeridas) && opcoesSugeridas.length > 0) {
      const buttons = msgDiv.querySelectorAll('.btn-confirm-option');
      buttons.forEach(btn => {
        btn.addEventListener('click', async () => {
          const idx = parseInt(btn.getAttribute('data-idx'), 10);
          const videoEscolhido = opcoesSugeridas[idx];
          const diasEscolhidos = Array.from(msgDiv.querySelectorAll('.dia-proposta-aula:checked'), input => input.value);
          if (!diasEscolhidos.length) {
            alert('Selecione pelo menos um dia para agendar.');
            return;
          }
          
          btn.disabled = true;
          btn.classList.add('opacity-50');

          // Envia confirmação ao backend
          try {
            const resp = await fetchAuth('/api/ai/confirmar-video', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ videoSelecionado: videoEscolhido, diasAlvo: diasEscolhidos })
            });
            const data = await resp.json();

            if (data.success) {
              appendChatMessage('ai', `${data.mensagem}\n\n• ${data.acoesExecutadas.join('\n• ')}`);
              await fetchAllVideos();
              await fetchTopics();
              await fetchSchedule();
            }
          } catch (e) {
            console.error('Erro ao confirmar vídeo:', e);
          }
        });
      });
    }
  }

  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;
  return id;
}

function removeChatMessage(id) {
  if (!id) return;
  const el = document.getElementById(id);
  if (el) el.remove();
}

// ================= 5. INICIALIZAÇÃO DA APLICAÇÃO ================= //

document.addEventListener('DOMContentLoaded', async () => {
  setupModals();
  loadYouTubeIframeAPI();

  // Carrega dados iniciais do backend
  await fetchAllVideos();
  await fetchTopics();
  await fetchSchedule();

  // Botão de navegação: "Meu Cronograma" na sidebar
  const navBtnSchedule = document.getElementById('nav-btn-schedule');
  if (navBtnSchedule) {
    navBtnSchedule.addEventListener('click', showScheduleView);
  }

  // Botão "Voltar" Inteligente no Topo
  const btnBack = document.getElementById('btn-back-to-origin');
  if (btnBack) {
    btnBack.addEventListener('click', returnToPreviousView);
  }

  // Alternância de Módulos (Início vs LMS vs Finanças vs Rotina vs Metas)
  const navBtnInicio = document.getElementById('nav-btn-inicio');
  const navBtnLms = document.getElementById('nav-btn-lms');
  const navBtnFinancas = document.getElementById('nav-btn-financas');
  const navBtnRotina = document.getElementById('nav-btn-rotina');
  const navBtnMetas = document.getElementById('nav-btn-metas');
  const navBtnTutorialIos = document.getElementById('nav-btn-tutorial-ios');
  const sectionModulos = document.getElementById('sidebar-section-modulos');
  const sectionLmsSubnav = document.getElementById('sidebar-section-lms-subnav');
  const sectionFinancasSubnav = document.getElementById('sidebar-section-financas-subnav');
  const sectionRotinaSubnav = document.getElementById('sidebar-section-rotina-subnav');
  const sectionMetasSubnav = document.getElementById('sidebar-section-metas-subnav');
  const navBtnRevisao = document.getElementById('nav-btn-revisao');
  const viewRevisao = document.getElementById('view-revisao');
  const ocultarRevisao = () => {
    for (const nome of ['perfil', 'configuracoes']) {
      document.getElementById('view-' + nome).classList.add('hidden');
      document.getElementById('nav-btn-' + nome).removeAttribute('aria-current');
    }
    viewRevisao.classList.add('hidden');
    navBtnRevisao.classList.remove('bg-emerald-800', 'text-white');
    navBtnRevisao.removeAttribute('aria-current');
  };
  const sectionPlanning = document.getElementById('sidebar-section-planning');
  const sectionTopics = document.getElementById('sidebar-section-topics');

  // Helper centralizado para o Drill-down da Sidebar (Opção 4 em todos os módulos)
  const atualizarSidebarDrilldown = (moduloAtivo) => {
    const subnavs = [sectionLmsSubnav, sectionFinancasSubnav, sectionRotinaSubnav, sectionMetasSubnav];
    subnavs.forEach(el => { if (el) el.classList.add('hidden'); });

    if (!moduloAtivo || moduloAtivo === 'inicio') {
      if (sectionModulos) sectionModulos.classList.remove('hidden');
      return;
    }

    if (sectionModulos) sectionModulos.classList.add('hidden');
    if (moduloAtivo === 'lms' && sectionLmsSubnav) sectionLmsSubnav.classList.remove('hidden');
    if (moduloAtivo === 'financas' && sectionFinancasSubnav) sectionFinancasSubnav.classList.remove('hidden');
    if (moduloAtivo === 'rotina' && sectionRotinaSubnav) sectionRotinaSubnav.classList.remove('hidden');
    if (moduloAtivo === 'metas' && sectionMetasSubnav) sectionMetasSubnav.classList.remove('hidden');
  };
  const viewDashboardGeral = document.getElementById('view-dashboard-geral');
  const viewFinancas = document.getElementById('view-financas');
  const viewRotina = document.getElementById('view-rotina');
  const viewMetas = document.getElementById('view-metas');
  const viewTutorialIos = document.getElementById('view-tutorial-ios');

  const pausarVideoTutorial = () => {
    const vid = document.getElementById('video-tutorial-ios');
    if (vid && !vid.paused) {
      try { vid.pause(); } catch (e) {}
    }
  };
  const btnOpenTopic = document.getElementById('btn-open-modal-topic');
  const btnOpenVideo = document.getElementById('btn-open-modal-video');

  const showInicioModule = () => {
    ocultarRevisao();
    state.currentView = 'inicio';
    if (viewDashboardGeral) viewDashboardGeral.classList.remove('hidden');
    document.getElementById('view-grid').classList.add('hidden');
    document.getElementById('view-schedule').classList.add('hidden');
    document.getElementById('view-lesson').classList.add('hidden');
    document.getElementById('view-estudos-os')?.classList.add('hidden');
    if (viewFinancas) viewFinancas.classList.add('hidden');
    if (viewRotina) viewRotina.classList.add('hidden');
    if (viewMetas) viewMetas.classList.add('hidden');
    if (viewTutorialIos) viewTutorialIos.classList.add('hidden');
    pausarVideoTutorial();
    if (btnBack) btnBack.classList.add('hidden');

    atualizarSidebarDrilldown('inicio');
    if (sectionPlanning) sectionPlanning.classList.add('hidden');
    if (sectionTopics) sectionTopics.classList.add('hidden');
    if (btnOpenTopic) btnOpenTopic.parentElement.classList.add('hidden');

    const breadcrumb = document.getElementById('breadcrumb-topic');
    if (breadcrumb) breadcrumb.textContent = 'Visão Geral do Life OS';

    if (navBtnInicio) {
      navBtnInicio.className = 'w-full text-left px-3 py-2.5 rounded-lg text-xs transition flex items-center justify-between group bg-brand-600 text-white font-semibold shadow-xs ring-1 ring-white/10';
    }
    if (navBtnLms) {
      navBtnLms.className = 'w-full text-left px-3 py-2.5 rounded-lg text-xs transition flex items-center justify-between group text-slate-300 hover:bg-slate-900 hover:text-white';
    }
    if (navBtnFinancas) {
      navBtnFinancas.className = 'w-full text-left px-3 py-2.5 rounded-lg text-xs transition flex items-center justify-between group text-slate-300 hover:bg-slate-900 hover:text-white';
    }
    if (navBtnRotina) {
      navBtnRotina.className = 'w-full text-left px-3 py-2.5 rounded-lg text-xs transition flex items-center justify-between group text-slate-300 hover:bg-slate-900 hover:text-white';
    }
    if (navBtnMetas) {
      navBtnMetas.className = 'w-full text-left px-3 py-2.5 rounded-lg text-xs transition flex items-center justify-between group text-slate-300 hover:bg-slate-900 hover:text-white';
    }
    if (navBtnTutorialIos) {
      navBtnTutorialIos.className = 'w-full text-left px-3 py-2.5 rounded-lg text-xs transition flex items-center justify-between group text-slate-300 hover:bg-slate-900 hover:text-white';
    }

    if (state.player && state.isPlayerReady) {
      try { state.player.pauseVideo(); } catch (e) {}
    }

    carregarDashboardGeral();
  };

  const showLmsModule = () => {
    ocultarRevisao();
    state.currentView = 'grid';
    if (viewDashboardGeral) viewDashboardGeral.classList.add('hidden');
    if (viewFinancas) viewFinancas.classList.add('hidden');
    const viewRotinaEl = document.getElementById('view-rotina');
    if (viewRotinaEl) viewRotinaEl.classList.add('hidden');
    const viewMetasEl = document.getElementById('view-metas');
    if (viewMetasEl) viewMetasEl.classList.add('hidden');
    if (viewTutorialIos) viewTutorialIos.classList.add('hidden');
    pausarVideoTutorial();

    atualizarSidebarDrilldown('lms');
    if (sectionPlanning) sectionPlanning.classList.remove('hidden');
    if (sectionTopics) sectionTopics.classList.remove('hidden');

    if (btnOpenTopic) btnOpenTopic.parentElement.classList.remove('hidden');

    if (navBtnInicio) {
      navBtnInicio.className = 'w-full text-left px-3 py-2.5 rounded-lg text-xs transition flex items-center justify-between group text-slate-300 hover:bg-slate-900 hover:text-white';
    }
    if (navBtnLms) {
      navBtnLms.className = 'w-full text-left px-3 py-2.5 rounded-lg text-xs transition flex items-center justify-between group bg-brand-600 text-white font-semibold shadow-xs ring-1 ring-white/10';
    }
    if (navBtnFinancas) {
      navBtnFinancas.className = 'w-full text-left px-3 py-2.5 rounded-lg text-xs transition flex items-center justify-between group text-slate-300 hover:bg-slate-900 hover:text-white';
    }
    const navBtnRotinaEl = document.getElementById('nav-btn-rotina');
    if (navBtnRotinaEl) {
      navBtnRotinaEl.className = 'w-full text-left px-3 py-2.5 rounded-lg text-xs transition flex items-center justify-between group text-slate-300 hover:bg-slate-900 hover:text-white';
    }
    const navBtnMetasEl = document.getElementById('nav-btn-metas');
    if (navBtnMetasEl) {
      navBtnMetasEl.className = 'w-full text-left px-3 py-2.5 rounded-lg text-xs transition flex items-center justify-between group text-slate-300 hover:bg-slate-900 hover:text-white';
    }
    if (navBtnTutorialIos) {
      navBtnTutorialIos.className = 'w-full text-left px-3 py-2.5 rounded-lg text-xs transition flex items-center justify-between group text-slate-300 hover:bg-slate-900 hover:text-white';
    }

    if (state.selectedTopicId) {
      selectTopic(state.selectedTopicId);
    } else {
      showGridView();
    }
  };

  const showFinancasModule = () => {
    const painel = document.getElementById('iframe-financas');
    if (!painel.hasAttribute('src')) painel.src = painel.dataset.src;

    ocultarRevisao();
    state.currentView = 'financas';
    if (viewDashboardGeral) viewDashboardGeral.classList.add('hidden');
    document.getElementById('view-grid').classList.add('hidden');
    document.getElementById('view-schedule').classList.add('hidden');
    document.getElementById('view-lesson').classList.add('hidden');
    document.getElementById('view-estudos-os')?.classList.add('hidden');
    const viewRotinaEl = document.getElementById('view-rotina');
    if (viewRotinaEl) viewRotinaEl.classList.add('hidden');
    const viewMetasEl = document.getElementById('view-metas');
    if (viewMetasEl) viewMetasEl.classList.add('hidden');
    if (viewTutorialIos) viewTutorialIos.classList.add('hidden');
    pausarVideoTutorial();
    if (btnBack) btnBack.classList.add('hidden');

    if (viewFinancas) viewFinancas.classList.remove('hidden');
    atualizarSidebarDrilldown('financas');
    if (sectionPlanning) sectionPlanning.classList.add('hidden');
    if (sectionTopics) sectionTopics.classList.add('hidden');

    if (btnOpenTopic) btnOpenTopic.parentElement.classList.add('hidden');

    const breadcrumb = document.getElementById('breadcrumb-topic');
    if (breadcrumb) breadcrumb.textContent = 'Finanças (Gestão Orçamentária & Patrimônio)';

    if (navBtnInicio) {
      navBtnInicio.className = 'w-full text-left px-3 py-2.5 rounded-lg text-xs transition flex items-center justify-between group text-slate-300 hover:bg-slate-900 hover:text-white';
    }
    if (navBtnFinancas) {
      navBtnFinancas.className = 'w-full text-left px-3 py-2.5 rounded-lg text-xs transition flex items-center justify-between group bg-emerald-600 text-white font-semibold shadow-xs ring-1 ring-white/10';
    }
    if (navBtnLms) {
      navBtnLms.className = 'w-full text-left px-3 py-2.5 rounded-lg text-xs transition flex items-center justify-between group text-slate-300 hover:bg-slate-900 hover:text-white';
    }
    const navBtnRotinaEl = document.getElementById('nav-btn-rotina');
    if (navBtnRotinaEl) {
      navBtnRotinaEl.className = 'w-full text-left px-3 py-2.5 rounded-lg text-xs transition flex items-center justify-between group text-slate-300 hover:bg-slate-900 hover:text-white';
    }
    const navBtnMetasEl = document.getElementById('nav-btn-metas');
    if (navBtnMetasEl) {
      navBtnMetasEl.className = 'w-full text-left px-3 py-2.5 rounded-lg text-xs transition flex items-center justify-between group text-slate-300 hover:bg-slate-900 hover:text-white';
    }
    if (navBtnTutorialIos) {
      navBtnTutorialIos.className = 'w-full text-left px-3 py-2.5 rounded-lg text-xs transition flex items-center justify-between group text-slate-300 hover:bg-slate-900 hover:text-white';
    }

    if (state.player && state.isPlayerReady) {
      try { state.player.pauseVideo(); } catch (e) {}
    }
  };

  // MÓDULO 3: ROTINA & AGENDA
  const showRotinaModule = () => {
    ocultarRevisao();
    state.currentView = 'rotina';
    if (viewDashboardGeral) viewDashboardGeral.classList.add('hidden');
    document.getElementById('view-grid').classList.add('hidden');
    document.getElementById('view-schedule').classList.add('hidden');
    document.getElementById('view-lesson').classList.add('hidden');
    document.getElementById('view-estudos-os')?.classList.add('hidden');
    if (viewFinancas) viewFinancas.classList.add('hidden');
    const viewMetasEl = document.getElementById('view-metas');
    if (viewMetasEl) viewMetasEl.classList.add('hidden');
    if (viewTutorialIos) viewTutorialIos.classList.add('hidden');
    pausarVideoTutorial();
    if (btnBack) btnBack.classList.add('hidden');

    if (viewRotina) viewRotina.classList.remove('hidden');
    atualizarSidebarDrilldown('rotina');
    if (sectionPlanning) sectionPlanning.classList.add('hidden');
    if (sectionTopics) sectionTopics.classList.add('hidden');
    if (btnOpenTopic) btnOpenTopic.parentElement.classList.add('hidden');

    const breadcrumb = document.getElementById('breadcrumb-topic');
    if (breadcrumb) breadcrumb.textContent = 'Rotina & Agenda (Foco do Dia, Hábitos & Planejamento)';

    if (navBtnInicio) {
      navBtnInicio.className = 'w-full text-left px-3 py-2.5 rounded-lg text-xs transition flex items-center justify-between group text-slate-300 hover:bg-slate-900 hover:text-white';
    }
    if (navBtnRotina) {
      navBtnRotina.className = 'w-full text-left px-3 py-2.5 rounded-lg text-xs transition flex items-center justify-between group bg-amber-600 text-white font-semibold shadow-xs ring-1 ring-white/10';
    }
    if (navBtnLms) {
      navBtnLms.className = 'w-full text-left px-3 py-2.5 rounded-lg text-xs transition flex items-center justify-between group text-slate-300 hover:bg-slate-900 hover:text-white';
    }
    if (navBtnFinancas) {
      navBtnFinancas.className = 'w-full text-left px-3 py-2.5 rounded-lg text-xs transition flex items-center justify-between group text-slate-300 hover:bg-slate-900 hover:text-white';
    }
    const navBtnMetasEl = document.getElementById('nav-btn-metas');
    if (navBtnMetasEl) {
      navBtnMetasEl.className = 'w-full text-left px-3 py-2.5 rounded-lg text-xs transition flex items-center justify-between group text-slate-300 hover:bg-slate-900 hover:text-white';
    }
    if (navBtnTutorialIos) {
      navBtnTutorialIos.className = 'w-full text-left px-3 py-2.5 rounded-lg text-xs transition flex items-center justify-between group text-slate-300 hover:bg-slate-900 hover:text-white';
    }

    if (state.player && state.isPlayerReady) {
      try { state.player.pauseVideo(); } catch (e) {}
    }

    // Carrega dados de Rotina
    if (typeof carregarPrioridades === 'function') carregarPrioridades();
    if (typeof carregarHabitos === 'function') carregarHabitos();
    if (typeof carregarAgendaHoje === 'function') carregarAgendaHoje();
    if (typeof carregarCompromissos === 'function') carregarCompromissos();
  };

  // MÓDULO 4: METAS & OBJETIVOS
  const showMetasModule = () => {
    ocultarRevisao();
    state.currentView = 'metas';
    if (viewDashboardGeral) viewDashboardGeral.classList.add('hidden');
    document.getElementById('view-grid').classList.add('hidden');
    document.getElementById('view-schedule').classList.add('hidden');
    document.getElementById('view-lesson').classList.add('hidden');
    document.getElementById('view-estudos-os')?.classList.add('hidden');
    if (viewFinancas) viewFinancas.classList.add('hidden');
    if (viewRotina) viewRotina.classList.add('hidden');
    if (viewTutorialIos) viewTutorialIos.classList.add('hidden');
    pausarVideoTutorial();
    if (btnBack) btnBack.classList.add('hidden');

    if (viewMetas) viewMetas.classList.remove('hidden');
    atualizarSidebarDrilldown('metas');
    if (sectionPlanning) sectionPlanning.classList.add('hidden');
    if (sectionTopics) sectionTopics.classList.add('hidden');
    if (btnOpenTopic) btnOpenTopic.parentElement.classList.add('hidden');

    const breadcrumb = document.getElementById('breadcrumb-topic');
    if (breadcrumb) breadcrumb.textContent = 'Metas & Objetivos (Financeiras, Estudos & Projetos)';

    if (navBtnInicio) {
      navBtnInicio.className = 'w-full text-left px-3 py-2.5 rounded-lg text-xs transition flex items-center justify-between group text-slate-300 hover:bg-slate-900 hover:text-white';
    }
    if (navBtnMetas) {
      navBtnMetas.className = 'w-full text-left px-3 py-2.5 rounded-lg text-xs transition flex items-center justify-between group bg-purple-600 text-white font-semibold shadow-xs ring-1 ring-white/10';
    }
    if (navBtnLms) {
      navBtnLms.className = 'w-full text-left px-3 py-2.5 rounded-lg text-xs transition flex items-center justify-between group text-slate-300 hover:bg-slate-900 hover:text-white';
    }
    if (navBtnFinancas) {
      navBtnFinancas.className = 'w-full text-left px-3 py-2.5 rounded-lg text-xs transition flex items-center justify-between group text-slate-300 hover:bg-slate-900 hover:text-white';
    }
    if (navBtnRotina) {
      navBtnRotina.className = 'w-full text-left px-3 py-2.5 rounded-lg text-xs transition flex items-center justify-between group text-slate-300 hover:bg-slate-900 hover:text-white';
    }
    if (navBtnTutorialIos) {
      navBtnTutorialIos.className = 'w-full text-left px-3 py-2.5 rounded-lg text-xs transition flex items-center justify-between group text-slate-300 hover:bg-slate-900 hover:text-white';
    }

    if (state.player && state.isPlayerReady) {
      try { state.player.pauseVideo(); } catch (e) {}
    }

    // Carrega dados de Metas
    return carregarMetas();
  };

  // ABA 5: TUTORIAL MOBILE (APP & ALERTAS iOS / ANDROID)
  const showTutorialIosModule = () => {
    ocultarRevisao();
    state.currentView = 'tutorial-ios';
    for (const id of ['view-dashboard-geral', 'view-grid', 'view-schedule', 'view-lesson', 'view-estudos-os', 'view-financas', 'view-rotina', 'view-metas']) {
      document.getElementById(id)?.classList.add('hidden');
    }
    if (viewTutorialIos) viewTutorialIos.classList.remove('hidden');
    if (btnBack) btnBack.classList.add('hidden');

    atualizarSidebarDrilldown('inicio');
    if (sectionPlanning) sectionPlanning.classList.add('hidden');
    if (sectionTopics) sectionTopics.classList.add('hidden');
    if (btnOpenTopic) btnOpenTopic.parentElement.classList.add('hidden');

    const breadcrumb = document.getElementById('breadcrumb-topic');
    if (breadcrumb) breadcrumb.textContent = 'Tutorial Mobile (App & Alertas iOS / Android)';

    for (const botao of [navBtnInicio, navBtnLms, navBtnFinancas, navBtnRotina, navBtnMetas]) {
      if (botao) {
        botao.className = 'w-full text-left px-3 py-2.5 rounded-lg text-xs transition flex items-center justify-between group text-slate-300 hover:bg-slate-900 hover:text-white';
      }
    }
    if (navBtnTutorialIos) {
      navBtnTutorialIos.className = 'w-full text-left px-3 py-2.5 rounded-lg text-xs transition flex items-center justify-between group bg-sky-600 text-white font-semibold shadow-xs ring-1 ring-white/10';
    }

    if (state.player && state.isPlayerReady) {
      try { state.player.pauseVideo(); } catch (e) {}
    }
  };

  // Expõe para chamadas globais inline dos cards
  window.navIrParaInicio = showInicioModule;
  window.navIrParaLms = showLmsModule;
  window.navIrParaEstudosOS = (subtab = 'overview') => {
    ocultarRevisao();
    state.currentView = 'estudos-os';
    state.selectedTopicId = null;
    for (const id of ['view-dashboard-geral', 'view-grid', 'view-schedule', 'view-lesson', 'view-financas', 'view-rotina', 'view-metas', 'view-tutorial-ios']) {
      document.getElementById(id)?.classList.add('hidden');
    }
    pausarVideoTutorial();
    if (btnBack) btnBack.classList.add('hidden');

    atualizarSidebarDrilldown('lms');
    if (sectionPlanning) sectionPlanning.classList.remove('hidden');
    if (sectionTopics) sectionTopics.classList.remove('hidden');
    if (btnOpenTopic) btnOpenTopic.parentElement.classList.add('hidden');

    updateScheduleButtonState(false);
    renderSidebarTopics();

    const btnEstudosOs = document.getElementById('nav-btn-estudos-os');
    if (btnEstudosOs) {
      btnEstudosOs.className = 'w-full text-left px-3 py-2.5 rounded-lg text-xs transition flex items-center justify-between group bg-brand-600 text-white font-semibold shadow-xs ring-1 ring-white/10 cursor-pointer';
    }

    document.getElementById('view-estudos-os')?.classList.remove('hidden');
    const breadcrumb = document.getElementById('breadcrumb-topic');
    if (breadcrumb) breadcrumb.textContent = 'Educação › Estudo Inteligente';

    if (state.player && state.isPlayerReady) {
      try { state.player.pauseVideo(); } catch (e) {}
    }
    if (window.EstudosOS) {
      window.EstudosOS.carregar().then(() => window.EstudosOS.irParaSubaba(subtab));
    }
  };
  document.getElementById('nav-btn-estudos-os')?.addEventListener('click', () => {
    if (typeof toggleSidebarPortal === 'function') toggleSidebarPortal(false);
    window.navIrParaEstudosOS('overview');
  });
  window.navIrParaFinancas = showFinancasModule;
  window.navIrParaRotina = showRotinaModule;
  window.navIrParaMetas = showMetasModule;
  window.navIrParaTutorialIos = showTutorialIosModule;
  window.navIrParaRevisao = () => {
    ocultarRevisao();
    state.currentView = 'revisao';
    pausarVideoTutorial();
    atualizarSidebarDrilldown('inicio');
    for (const id of ['view-dashboard-geral', 'view-grid', 'view-schedule', 'view-lesson', 'view-estudos-os', 'view-financas', 'view-rotina', 'view-metas', 'view-tutorial-ios']) {
      document.getElementById(id)?.classList.add('hidden');
    }
    for (const botao of [navBtnInicio, navBtnLms, navBtnFinancas, navBtnRotina, navBtnMetas, navBtnTutorialIos]) {
      if (botao) botao.className = 'w-full text-left px-3 py-2.5 rounded-lg text-xs transition flex items-center justify-between group text-slate-300 hover:bg-slate-900 hover:text-white';
    }
    sectionPlanning?.classList.add('hidden');
    sectionTopics?.classList.add('hidden');
    btnOpenTopic?.parentElement.classList.add('hidden');
    btnBack?.classList.add('hidden');
    if (state.player && state.isPlayerReady) state.player.pauseVideo();
    navBtnRevisao.classList.add('bg-emerald-800', 'text-white');
    navBtnRevisao.setAttribute('aria-current', 'page');
    viewRevisao.classList.remove('hidden');
    document.getElementById('breadcrumb-topic').textContent = 'Revisão Semanal';
    window.carregarRevisaoSemanal();
  };
  navBtnRevisao.addEventListener('click', window.navIrParaRevisao);
  for (const [nome, titulo] of [['perfil', 'Meu perfil'], ['configuracoes', 'Configurações']]) {
    const botao = document.getElementById('nav-btn-' + nome);
    botao.addEventListener('click', () => {
      showInicioModule();
      if (typeof toggleSidebarPortal === 'function') toggleSidebarPortal(false);
      state.currentView = nome;
      document.getElementById('view-dashboard-geral').classList.add('hidden');
      document.getElementById('view-' + nome).classList.remove('hidden');
      document.getElementById('breadcrumb-topic').textContent = titulo;
      botao.setAttribute('aria-current', 'page');
      window.PerfilPortal.abrir(nome);
    });
  }
  window.abrirAulaDaRevisao = video => {
    showLmsModule();
    openLessonView(video, 'revisao');
  };

  if (navBtnInicio) navBtnInicio.addEventListener('click', showInicioModule);

  if (navBtnRotina) navBtnRotina.addEventListener('click', showRotinaModule);
  if (navBtnMetas) navBtnMetas.addEventListener('click', showMetasModule);
  if (navBtnTutorialIos) navBtnTutorialIos.addEventListener('click', showTutorialIosModule);

  // Botões "Voltar aos Módulos" no submenu drill-down de todos os módulos
  const voltarAosModulos = () => atualizarSidebarDrilldown('inicio');
  const btnFinancasVoltarModulos = document.getElementById('btn-financas-voltar-modulos');
  if (btnFinancasVoltarModulos) {
    btnFinancasVoltarModulos.addEventListener('click', voltarAosModulos);
  }
  document.querySelectorAll('.btn-voltar-modulos').forEach(btn => {
    btn.addEventListener('click', voltarAosModulos);
  });

  // Sub-navegação Drill-down do Módulo Rotina & Agenda
  document.querySelectorAll('.btn-subnav-rotina').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-subnav-rotina').forEach(b => {
        b.className = 'btn-subnav-rotina w-full text-left px-3 py-2 rounded-lg text-xs transition flex items-center space-x-2.5 text-slate-300 hover:bg-slate-900 hover:text-white';
      });
      btn.className = 'btn-subnav-rotina w-full text-left px-3 py-2 rounded-lg text-xs transition flex items-center space-x-2.5 text-white bg-slate-800 font-semibold';

      const action = btn.getAttribute('data-rotina-action');
      if (['hoje', 'checklist', 'agenda'].includes(action)) {
        document.getElementById('btn-subaba-' + action)?.click();
      } else if (action === 'historico') {
        const el = document.getElementById('btn-abrir-historico-tarefas');
        if (el) el.click();
      } else if (action === 'excluir') {
        if (typeof window.abrirModalExcluirRotina === 'function') {
          window.abrirModalExcluirRotina();
        }
      }
    });
  });

  // Sub-navegação Drill-down do Módulo Metas
  document.querySelectorAll('.btn-subnav-metas').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-subnav-metas').forEach(b => {
        b.className = 'btn-subnav-metas w-full text-left px-3 py-2 rounded-lg text-xs transition flex items-center space-x-2.5 text-slate-300 hover:bg-slate-900 hover:text-white';
      });
      btn.className = 'btn-subnav-metas w-full text-left px-3 py-2 rounded-lg text-xs transition flex items-center space-x-2.5 text-white bg-slate-800 font-semibold';

      const action = btn.getAttribute('data-metas-action');
      if (action === 'modelos') {
        const el = document.getElementById('btn-metas-modelos');
        if (el) el.click();
      } else if (action === 'nova') {
        const el = document.getElementById('btn-nova-meta');
        if (el) el.click();
      } else if (action === 'excluir') {
        if (typeof window.abrirModalExcluirMetas === 'function') {
          window.abrirModalExcluirMetas();
        }
      }
    });
  });

  // Cliques nas sub-abas de Finanças controlam o iframe diretamente
  document.querySelectorAll('.btn-subnav-financas').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-subnav-financas').forEach(b => {
        b.className = 'btn-subnav-financas w-full text-left px-3 py-2 rounded-lg text-xs transition flex items-center space-x-2.5 text-slate-300 hover:bg-slate-900 hover:text-white';
      });
      btn.className = 'btn-subnav-financas w-full text-left px-3 py-2 rounded-lg text-xs transition flex items-center space-x-2.5 text-white bg-slate-800 font-semibold';

      const tab = btn.getAttribute('data-tab');
      const iframe = document.getElementById('iframe-financas');
      const selecionar = () => {
        if (btn.classList.contains('bg-slate-800')) iframe.contentWindow?.alternarAba?.(tab);
      };
      if (typeof iframe.contentWindow?.alternarAba === 'function') selecionar();
      else iframe.addEventListener('load', selecionar, { once: true });
    });
  });

  if (navBtnLms) navBtnLms.addEventListener('click', showLmsModule);
  if (navBtnFinancas) navBtnFinancas.addEventListener('click', showFinancasModule);

  // Mini card de Finanças no Hero e Botão de Ação Rápida no Topbar
  const cardFinancasHero = document.getElementById('nx-stat-finance-card');
  if (cardFinancasHero) {
    cardFinancasHero.addEventListener('click', () => {
      showFinancasModule();
    });
  }

  const abrirAcaoFinanceira = (aba, campo) => {
    showFinancasModule();
    const iframe = document.getElementById('iframe-financas');
    const abrir = () => {
      document.querySelector(`.btn-subnav-financas[data-tab="${aba}"]`)?.click();
      const input = iframe?.contentDocument?.getElementById(campo);
      if (input) {
        if (campo === 'btnEditReceita') input.click();
        else input.focus();
      }
    };
    if (typeof iframe?.contentWindow?.alternarAba === 'function') abrir();
    else iframe?.addEventListener('load', abrir, { once: true });
  };
  const abrirGasto = () => abrirAcaoFinanceira('planilha', 'descPlanilhaDespesa');
  const abrirTarefa = () => {
    showRotinaModule();
    document.getElementById('btn-subaba-checklist')?.click();
    document.getElementById('input-quick-task-text')?.focus();
  };
  const abrirAula = () => {
    showLmsModule();
    document.getElementById('btn-open-modal-video')?.click();
  };
  const acoesRapidas = {
    gasto: abrirGasto,
    tarefa: abrirTarefa,
    compromisso: () => {
      showRotinaModule();
      document.getElementById('btn-subaba-agenda')?.click();
      document.getElementById('btn-novo-compromisso')?.click();
    },
    aula: abrirAula
  };
  const menuAcoes = document.getElementById('menu-acoes-rapidas');
  for (const [nome, acao] of Object.entries(acoesRapidas)) {
    document.getElementById(`acao-rapida-${nome}`)?.addEventListener('click', () => {
      menuAcoes.open = false;
      acao();
    });
  }
  window.abrirAcaoFinanceira = abrirAcaoFinanceira;
  window.abrirPrimeiraAula = abrirAula;

  // Ações do Player na Visão de Aula
  const btnTogglePlay = document.getElementById('btn-toggle-play');
  if (btnTogglePlay) btnTogglePlay.addEventListener('click', togglePlayPause);

  const btnToggleCompleted = document.getElementById('btn-toggle-completed');
  if (btnToggleCompleted) {
    btnToggleCompleted.addEventListener('click', () => {
      if (!state.activeVideo) return;
      const novoStatus = !state.activeVideo.concluido;
      const sec = (state.player && typeof state.player.getCurrentTime === 'function') 
        ? Math.floor(state.player.getCurrentTime()) 
        : (state.activeVideo.segundo_atual || 0);
      salvarProgressoVideo(sec, novoStatus);
      updateCompletedButtonUI(novoStatus);
      if (novoStatus && typeof window.nxCelebrate === 'function') {
        window.nxCelebrate(btnToggleCompleted);
      }
    });
  }

  const btnDeleteCurrentVideo = document.getElementById('btn-delete-current-video');
  if (btnDeleteCurrentVideo) {
    btnDeleteCurrentVideo.addEventListener('click', () => {
      if (state.activeVideo) {
        deleteVideo(state.activeVideo.id);
      }
    });
  }

  const btnCaptureMinute = document.getElementById('btn-capture-minute');
  const noteTextInput = document.getElementById('input-note-text');
  if (btnCaptureMinute) {
    btnCaptureMinute.addEventListener('click', () => {
      if (!state.player || !state.isPlayerReady) return;
      const sec = Math.floor(state.player.getCurrentTime());
      state.capturedTimestampOverride = sec;

      const formTimestamp = document.getElementById('form-note-timestamp');
      if (formTimestamp) formTimestamp.textContent = `${formatSeconds(sec)} (Fixo)`;

      if (noteTextInput) noteTextInput.focus();
    });
  }

  const formAddNote = document.getElementById('form-add-note');
  if (formAddNote && noteTextInput) {
    formAddNote.addEventListener('submit', async (e) => {
      e.preventDefault();
      const texto = noteTextInput.value.trim();
      if (!texto) return;

      const success = await createNote(texto);
      if (success) noteTextInput.value = '';
    });
  }

  // Ações Rápidas do Topo do Painel Inicial
  const btnOverviewExpense = document.getElementById('btn-overview-quick-expense');
  if (btnOverviewExpense) {
    btnOverviewExpense.addEventListener('click', abrirGasto);
  }

  const btnOverviewTask = document.getElementById('btn-overview-quick-task');
  if (btnOverviewTask) {
    btnOverviewTask.addEventListener('click', abrirTarefa);
  }

  // Inicialização padrão do Life OS: Abre diretamente no Painel Inicial (Início / Visão Geral)
  showInicioModule();
  window.PerfilPortal.iniciar(() => state.currentView === 'inicio');
});

// ========================================================================= //
// 6. CONTROLADOR DO PAINEL INICIAL (TORRE DE CONTROLE DO LIFE OS)
// ========================================================================= //

async function carregarDashboardGeral() {
  // 1. Saudação personalizada com primeiro nome do usuário e data formatada natural em português
  const nomeCompleto = localStorage.getItem('usuarioNome') || 'Estudante';
  const primeiroNome = nomeCompleto.trim().split(' ')[0] || 'Estudante';
  const elGreet = document.getElementById('overview-greeting');
  if (elGreet) {
    const hora = new Date().getHours();
    let saudacao = 'Olá';
    if (hora >= 5 && hora < 12) saudacao = 'Bom dia';
    else if (hora >= 12 && hora < 18) saudacao = 'Boa tarde';
    else saudacao = 'Boa noite';
    elGreet.innerHTML = `${saudacao}, <em>${escapeHTML(primeiroNome)}</em>`;
  }

  const elDate = document.getElementById('overview-date');
  if (elDate) {
    const agora = new Date();
    const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    const dias = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    elDate.textContent = `${dias[agora.getDay()]}, ${agora.getDate()} de ${meses[agora.getMonth()]}`;
  }

  // 2. Card 1 - Rotina & Agenda
  try {
    const [resPrio, resHab, resAgenda] = await Promise.all([
      fetchAuth('/api/rotina/prioridades'),
      fetchAuth('/api/rotina/habitos'),
      fetchAuth('/api/agenda/hoje-integrado')
    ]);
    const jsonPrio = await resPrio.json();
    const jsonHab = await resHab.json();
    const jsonAgenda = await resAgenda.json();

    // Top 3 Prioridades com checkbox interativo em 1 clique
    const top3ListEl = document.getElementById('overview-top3-list');
    const prioStatusEl = document.getElementById('overview-prio-status');
    const todasPrioridades = (jsonPrio.success && jsonPrio.data) ? jsonPrio.data : [];
    const prioridadesTop3 = todasPrioridades.filter(p => !!p.top3);
    const prioridades = (prioridadesTop3.length > 0 ? prioridadesTop3 : todasPrioridades).slice(0, 3);

    if (top3ListEl) {
      if (prioridades.length === 0) {
        top3ListEl.innerHTML = `
          <div class="p-3 bg-slate-50 border border-dashed border-slate-200 rounded-lg text-center">
            <p class="text-xs text-slate-500">Nenhuma prioridade definida para hoje.</p>
            <button type="button" onclick="window.navIrParaRotina()" class="mt-1 text-[11px] font-bold text-emerald-800 hover:underline cursor-pointer">
              + Definir prioridades
            </button>
          </div>
        `;
        if (prioStatusEl) prioStatusEl.textContent = '0/0';
      } else {
        const concluidas = prioridades.filter(p => !!(p.concluida || p.concluido)).length;
        if (prioStatusEl) prioStatusEl.textContent = `${concluidas}/${prioridades.length}`;

        top3ListEl.innerHTML = '';
        prioridades.forEach((p, idx) => {
          const isConcluida = !!(p.concluida || p.concluido);
          const tituloTexto = p.texto || p.titulo || 'Tarefa sem título';
          const row = document.createElement('div');
          row.className = `flex items-center gap-2.5 p-2 rounded-lg transition ${
            isConcluida ? 'bg-emerald-50/70 border border-emerald-200/60' : 'bg-slate-50 hover:bg-slate-100/80 border border-slate-200/80'
          }`;
          row.innerHTML = `
            <button type="button" class="btn-check-overview-prio w-5 h-5 rounded-md border flex items-center justify-center shrink-0 cursor-pointer transition ${
              isConcluida ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 bg-white hover:border-emerald-500'
            }" data-id="${p.id}" data-concluida="${isConcluida ? 'true' : 'false'}">
              ${isConcluida ? '✓' : ''}
            </button>
            <span class="text-xs font-medium flex-1 truncate ${isConcluida ? 'line-through text-slate-400' : 'text-slate-800'}">
              <span class="font-bold text-[10px] text-emerald-800 bg-emerald-50 px-1 py-0.2 rounded border border-emerald-200 mr-1.5">#${idx + 1}</span>
              ${escapeHTML(tituloTexto)}
            </span>
          `;
          row.querySelector('.btn-check-overview-prio').addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = p.id;
            const novoStatus = !isConcluida;
            try {
              await salvarRotina(`/api/rotina/prioridades/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ concluida: novoStatus })
              });
              carregarDashboardGeral();
            } catch (err) {
              avisarFalhaRotina(err);
            }
          });
          top3ListEl.appendChild(row);
        });
      }
    }

    // Mini KPI de Hábitos
    const habitosEl = document.getElementById('overview-habitos-count');
    if (habitosEl) {
      const habitos = (jsonHab.success && jsonHab.data) ? jsonHab.data : [];
      if (habitos.length === 0) {
        habitosEl.textContent = 'Nenhum criado';
      } else {
        const hojeIso = new Date().toISOString().slice(0, 10);
        const feitos = habitos.filter(h => {
          if (h.feito_hoje) return true;
          if (Array.isArray(h.dias_concluidos) && h.dias_concluidos.includes(hojeIso)) return true;
          return false;
        }).length;
        habitosEl.textContent = `${feitos} de ${habitos.length} feitos`;
      }
    }

    // Mini KPI de Próximo Evento / Vencimento
    const proxEventoEl = document.getElementById('overview-proximo-evento');
    if (proxEventoEl) {
      const eventos = (jsonAgenda.success && jsonAgenda.data) ? jsonAgenda.data : [];
      if (eventos.length === 0) {
        proxEventoEl.textContent = 'Nenhum hoje';
      } else {
        const primeiro = eventos[0];
        proxEventoEl.textContent = `${primeiro.horario ? primeiro.horario + ' - ' : ''}${primeiro.titulo}`;
        proxEventoEl.title = primeiro.titulo;
      }
    }
  } catch (err) {
    console.warn('Erro ao carregar card de Rotina no Dashboard:', err);
  }

  // 3. Card 2 - Finanças Inteligentes (Dados reais consolidados)
  try {
    const hoje = new Date();
    const mes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
    const resFin = await fetchAuth(`/api/dados?mes=${mes}`);
    if (!resFin.ok) throw new Error('Orçamento indisponível');
    if (resFin.ok) {
      const jsonFin = await resFin.json();
      const disponivelEl = document.getElementById('overview-finance-disponivel');
      const gastoEl = document.getElementById('overview-finance-gasto');
      const alertaEl = document.getElementById('overview-finance-alerta');

      const formatarMoeda = (val) => Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

      const setMoedaAnimada = (el, val) => {
        if (!el) return;
        if (typeof window.nxAnimateCurrency === 'function') window.nxAnimateCurrency(el, val);
        else el.textContent = formatarMoeda(val);
      };

      if (jsonFin && jsonFin.indicadores) {
        const saldoLivre = jsonFin.indicadores.saldoLivreTotal ?? jsonFin.indicadores.saldoDisponivel ?? 0;
        const totalGasto = jsonFin.indicadores.gastosTotal ?? jsonFin.indicadores.totalGastos ?? 0;
        setMoedaAnimada(disponivelEl, saldoLivre);
        setMoedaAnimada(gastoEl, totalGasto);
      } else if (jsonFin && typeof jsonFin.saldoDisponivel !== 'undefined') {
        setMoedaAnimada(disponivelEl, jsonFin.saldoDisponivel);
        setMoedaAnimada(gastoEl, jsonFin.totalGastos || 0);
      } else {
        const somar = itens => (itens || []).reduce((total, item) => total + (Number(item.valor) || 0), 0);
        const gasto = somar(jsonFin.despesas);
        setMoedaAnimada(disponivelEl, somar(jsonFin.entradas) - gasto);
        setMoedaAnimada(gastoEl, gasto);
      }

      // Vencimentos pendentes ou saúde financeira
      if (alertaEl) {
        const contas = jsonFin.contas || jsonFin.planejamento || [];
        const pendentes = contas.filter(c => !c.pago && c.vencimento);
        if (!jsonFin.entradas?.length && !jsonFin.despesas?.length && !pendentes.length) {
          alertaEl.className = 'p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs flex flex-wrap gap-2 text-slate-700';
          alertaEl.innerHTML = '<span>Mês sem lançamentos.</span><button type="button" class="font-semibold underline">Registrar receita</button>';
          alertaEl.querySelector('button').onclick = () => window.abrirAcaoFinanceira('dashboard', 'btnEditReceita');
        } else if (pendentes.length > 0) {
          const proxConta = pendentes[0];
          alertaEl.className = 'p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs flex items-center gap-2 text-amber-800';
          alertaEl.innerHTML = `
            <svg class="w-4 h-4 text-amber-700 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
            <span class="truncate">Conta a vencer: <strong>${escapeHTML(proxConta.nome || proxConta.descricao || 'Fatura')}</strong> (${escapeHTML(proxConta.vencimento)})</span>
          `;
        } else {
          alertaEl.className = 'p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs flex items-center gap-2 text-emerald-800';
          alertaEl.innerHTML = `
            <svg class="w-4 h-4 text-emerald-700 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span>Resumo com base nas receitas e despesas registradas no mês.</span>
          `;
        }
      }
    }
  } catch (err) {
    console.warn('Erro ao carregar card de Finanças no Dashboard:', err);
    const alerta = document.getElementById('overview-finance-alerta');
    if (alerta) alerta.textContent = 'Não foi possível carregar o orçamento do mês.';
    for (const id of ['overview-finance-disponivel', 'overview-finance-gasto']) {
      const campo = document.getElementById(id);
      if (campo) campo.textContent = '—';
    }
  }

  // 4. Card 3 - Educação (Continuar Aula & Progresso Geral)
  try {
    const totalAulas = state.allVideos.length;
    const concluidas = state.allVideos.filter(v => !!v.concluido).length;
    const pct = totalAulas > 0 ? Math.round((concluidas / totalAulas) * 100) : 0;

    const pctEl = document.getElementById('overview-lms-pct');
    const barEl = document.getElementById('overview-lms-bar');
    if (pctEl) {
      if (typeof window.nxAnimateNumber === 'function') window.nxAnimateNumber(pctEl, pct, '%');
      else pctEl.textContent = `${pct}%`;
    }
    if (barEl) barEl.style.width = `${pct}%`;

    const proximaAulaTitulo = document.getElementById('overview-lms-aula-titulo');
    const btnAssistir = document.getElementById('btn-overview-assistir-aula');

    if (totalAulas === 0) {
      if (proximaAulaTitulo) proximaAulaTitulo.textContent = 'Nenhuma aula cadastrada ainda.';
      if (btnAssistir) {
        btnAssistir.textContent = 'Cadastrar aula';
        btnAssistir.onclick = () => window.abrirPrimeiraAula();
      }
    } else {
      // Prioridade 1: Aula em andamento (segundo_atual > 0 e não concluída)
      // Prioridade 2: Primeira aula não concluída
      // Prioridade 3: Primeira aula da lista
      const emAndamento = state.allVideos.find(v => !v.concluido && v.segundo_atual && v.segundo_atual > 0);
      const naoConcluida = state.allVideos.find(v => !v.concluido);
      const aulaSugerida = emAndamento || naoConcluida || state.allVideos[0];

      if (aulaSugerida) {
        if (proximaAulaTitulo) {
          proximaAulaTitulo.textContent = aulaSugerida.titulo;
          proximaAulaTitulo.title = aulaSugerida.titulo;
        }
        if (btnAssistir) {
          btnAssistir.textContent = emAndamento ? `Continuar em ${formatSeconds(Number(emAndamento.segundo_atual))}` : 'Assistir ▶';
          btnAssistir.onclick = () => {
            window.navIrParaLms();
            openLessonView(aulaSugerida, 'grid');
          };
        }
      }
    }
  } catch (err) {
    console.warn('Erro ao carregar card de Educação no Dashboard:', err);
  }

  // 5. Card 4 - Metas & Objetivos (Até 3 metas com barras de progresso)
  try {
    const resMetas = await fetchAuth('/api/metas');
    const jsonMetas = await resMetas.json();
    const metasListEl = document.getElementById('overview-metas-list');

    if (metasListEl) {
      const metas = (jsonMetas.success && jsonMetas.data) ? jsonMetas.data.slice(0, 3) : [];
      if (metas.length === 0) {
        metasListEl.innerHTML = `
          <div class="p-3 bg-slate-50 border border-dashed border-slate-200 rounded-lg text-center">
            <p class="text-xs text-slate-500">Nenhum objetivo ou meta ativa definida.</p>
            <button type="button" onclick="window.navIrParaMetas()" class="mt-1 text-[11px] font-bold text-emerald-800 hover:underline cursor-pointer">
              + Criar primeira meta
            </button>
          </div>
        `;
      } else {
        metasListEl.innerHTML = '';
        metas.forEach(meta => {
          const rawPct = meta.progresso ?? meta.progresso_pct ?? 0;
          const pct = Math.min(100, Math.max(0, Math.round(Number(rawPct) || 0)));
          const tipoLabel = meta.tipo === 'financeira' ? 'Financeiro' : (meta.tipo === 'estudo' || meta.tipo === 'estudos' ? 'Estudos' : 'Projeto');
          const item = document.createElement('div');
          item.className = 'p-2.5 rounded-lg bg-slate-50 border border-slate-200/90 space-y-1.5';
          item.innerHTML = `
            <div class="flex items-center justify-between text-xs">
              <span class="font-semibold text-slate-800 truncate flex items-center gap-1.5">
                <span class="text-[9px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">${tipoLabel}</span>
                <span class="truncate">${escapeHTML(meta.titulo)}</span>
              </span>
              <span class="font-sans font-bold tabular-nums text-emerald-800 shrink-0 ml-2">${pct}%</span>
            </div>
            <div class="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden">
              <div class="h-full rounded-full bg-emerald-600 transition-all duration-500" style="width: ${pct}%;"></div>
            </div>
          `;
          metasListEl.appendChild(item);
        });
      }
    }
  } catch (err) {
    console.warn('Erro ao carregar card de Metas no Dashboard:', err);
  }
}
