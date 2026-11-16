(() => {
  'use strict';

  const apiUrl = 'api.php';
  const landingView = document.querySelector('[data-view="landing"]');
  const roomView = document.querySelector('[data-view="room"]');
  const createForm = document.querySelector('[data-create-form]');
  const joinForm = document.querySelector('[data-join-form]');
  const roomCodeElement = document.querySelector('[data-room-code]');
  const playerList = document.querySelector('[data-player-list]');
  const emptyPlayers = document.querySelector('[data-empty-players]');
  const playerCount = document.querySelector('[data-player-count]');
  const modeTitle = document.querySelector('[data-mode-title]');
  const modeDescription = document.querySelector('[data-mode-description]');
  const readyButton = document.querySelector('[data-ready-button]');
  const startButton = document.querySelector('[data-start-button]');
  const startRequirements = document.querySelector('[data-start-requirements]');
  const installButton = document.querySelector('[data-install]');
  const message = document.querySelector('[data-message]');
  const connectionStatus = document.querySelector('[data-connection-status]');
  const quizProgress = document.querySelector('[data-quiz-progress]');
  const quizTimer = document.querySelector('[data-quiz-timer]');
  const quizAnswersCount = document.querySelector('[data-quiz-answers-count]');
  const quizQuestion = document.querySelector('[data-quiz-question]');
  const quizAnswers = document.querySelector('[data-quiz-answers]');
  const quizResult = document.querySelector('[data-quiz-result]');
  const quizResultTitle = document.querySelector('[data-quiz-result-title]');
  const quizExplanation = document.querySelector('[data-quiz-explanation]');
  const quizYourPoints = document.querySelector('[data-quiz-your-points]');
  const quizWaiting = document.querySelector('[data-quiz-waiting]');
  const quizAdvance = document.querySelector('[data-quiz-advance]');
  const scoreList = document.querySelector('[data-score-list]');
  const finalScoreList = document.querySelector('[data-final-score-list]');

  let currentRoomCode = '';
  let currentToken = '';
  let currentState = null;
  let pollTimer = null;
  let polling = false;
  let installPrompt = null;
  let localDeadline = 0;
  let pollFailures = 0;

  class PartyRequestError extends Error {
    constructor(text, status = 0, code = 'request_failed') {
      super(text);
      this.name = 'PartyRequestError';
      this.status = status;
      this.code = code;
    }
  }

  function sessionKey(code) {
    return `gierkoteka.party.${code}`;
  }

  function setMessage(text, error = false) {
    message.textContent = text;
    message.classList.toggle('is-error', error);
  }

  function setConnectionState(state) {
    if (!connectionStatus) return;
    const labels = {
      connected: 'Połączono',
      reconnecting: 'Łączenie ponownie…',
      offline: 'Brak sieci',
    };
    connectionStatus.classList.toggle('is-reconnecting', state === 'reconnecting');
    connectionStatus.classList.toggle('is-offline', state === 'offline');
    connectionStatus.querySelector('strong').textContent = labels[state] || labels.connected;
  }

  function setButtonBusy(button, busy, busyLabel = 'Chwila…') {
    if (!button) return;
    button.dataset.label ||= button.textContent;
    button.disabled = busy;
    button.textContent = busy ? busyLabel : button.dataset.label;
  }

  function setFormBusy(form, busy) {
    const button = form.querySelector('button[type="submit"]');
    form.querySelectorAll('input, button').forEach((control) => {
      control.disabled = busy;
    });
    setButtonBusy(button, busy);
  }

  async function request(action, options = {}) {
    const headers = { Accept: 'application/json' };
    if (options.token) headers['X-Party-Token'] = options.token;
    if (options.body) headers['Content-Type'] = 'application/json';
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    let response;
    try {
      response = await fetch(`${apiUrl}?action=${encodeURIComponent(action)}${options.query || ''}`, {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        cache: 'no-store',
        signal: controller.signal,
      });
    } catch (error) {
      const offline = !navigator.onLine;
      setConnectionState(offline ? 'offline' : 'reconnecting');
      throw new PartyRequestError(
        offline ? 'Brak połączenia z internetem. Pokój zostanie przywrócony po powrocie sieci.' : 'Serwer nie odpowiada. Ponawiam połączenie…',
        0,
        offline ? 'offline' : error.name === 'AbortError' ? 'timeout' : 'network_error',
      );
    } finally {
      window.clearTimeout(timeout);
    }
    const payload = await response.json().catch(() => ({
      ok: false,
      error: { message: 'Serwer zwrócił nieprawidłową odpowiedź.' },
    }));
    setConnectionState('connected');
    if (!response.ok || !payload.ok) {
      throw new PartyRequestError(
        payload.error?.message || 'Nie udało się połączyć z pokojem.',
        response.status,
        payload.error?.code || 'request_failed',
      );
    }
    return payload;
  }

  function roomLink(code) {
    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set('room', code);
    return url.toString();
  }

  function enterRoom(code, token, state) {
    currentRoomCode = code;
    currentToken = token;
    localStorage.setItem(sessionKey(code), token);
    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set('room', code);
    window.history.replaceState({}, '', url);
    landingView.hidden = true;
    roomView.hidden = false;
    pollFailures = 0;
    setConnectionState('connected');
    renderState(state);
    schedulePoll(900);
  }

  function showRoomStage(name) {
    document.querySelectorAll('[data-room-stage]').forEach((element) => {
      element.hidden = element.dataset.roomStage !== name;
    });
  }

  function renderState(state) {
    currentState = state;
    const { room, players, you, game, leaderboard } = state;
    roomCodeElement.textContent = room.code;
    playerCount.textContent = `${players.length}/${room.max_players}`;

    if (room.status === 'lobby') {
      showRoomStage('lobby');
      renderLobby(state);
    } else if (room.status === 'results') {
      showRoomStage('results');
      renderScoreList(finalScoreList, leaderboard, true);
    } else {
      showRoomStage('quiz');
      renderQuiz(state);
      renderScoreList(scoreList, leaderboard, false);
    }

    const ownPlayer = players.find((player) => player.id === you.id);
    if (ownPlayer) you.is_ready = ownPlayer.is_ready;
  }

  function renderLobby({ room, players, you }) {
    emptyPlayers.hidden = players.length > 1;
    const screenMode = room.mode === 'screen';
    modeTitle.textContent = screenMode ? 'Wspólny ekran' : 'Same telefony';
    modeDescription.textContent = screenMode
      ? 'Telewizor lub laptop pokaże pytania i tabelę, a telefony będą kontrolerami.'
      : 'Każdy gracz zobaczy przebieg gry na swoim telefonie. Dodatkowy ekran nie jest potrzebny.';

    playerList.replaceChildren(...players.map((player) => {
      const item = document.createElement('li');
      item.className = 'player-item';
      const avatar = document.createElement('span');
      avatar.className = 'player-avatar';
      avatar.style.setProperty('--player-color', player.color);
      avatar.textContent = player.nickname.slice(0, 1).toLocaleUpperCase('pl');
      const name = document.createElement('span');
      name.className = 'player-name';
      const strong = document.createElement('strong');
      strong.textContent = `${player.nickname}${player.id === you.id ? ' (Ty)' : ''}`;
      const detail = document.createElement('small');
      const role = player.role === 'host' ? 'Gospodarz' : 'Gracz';
      detail.textContent = `${role} · ${player.is_ready ? 'gotowy' : 'czeka'} · ${player.is_online ? 'online' : 'offline'}`;
      name.append(strong, detail);
      const presence = document.createElement('span');
      presence.className = 'player-presence';
      const onlineStatus = document.createElement('span');
      onlineStatus.className = `online-dot${player.is_online ? ' is-online' : ''}`;
      onlineStatus.title = player.is_online ? 'Połączony' : 'Brak połączenia';
      const readyStatus = document.createElement('span');
      readyStatus.className = `ready-dot${player.is_ready ? ' is-ready' : ''}`;
      readyStatus.title = player.is_ready ? 'Gotowy' : 'Jeszcze niegotowy';
      presence.append(onlineStatus, readyStatus);
      item.append(avatar, name, presence);
      return item;
    }));

    readyButton.textContent = you.is_ready ? 'Wycofaj gotowość' : 'Jestem gotowy';
    readyButton.classList.toggle('is-ready', you.is_ready);
    const readyCount = players.filter((player) => player.is_ready).length;
    const onlineCount = players.filter((player) => player.is_online).length;
    const canStart = players.length >= 2 && readyCount === players.length && onlineCount === players.length;
    startButton.hidden = !you.is_host;
    startButton.disabled = !canStart;
    startRequirements.textContent = you.is_host
      ? (players.length < 2
        ? 'Dołącz jeszcze co najmniej jeden gracz.'
        : onlineCount !== players.length
          ? `Online: ${onlineCount}/${players.length}. Poczekaj na powrót pozostałych.`
          : canStart ? 'Wszyscy są gotowi — można zaczynać.' : `Gotowi: ${readyCount}/${players.length}.`)
      : 'Gospodarz uruchomi Quiz, gdy wszyscy będą gotowi.';
  }

  function renderQuiz({ game, you, server_time_ms: serverTimeMs }) {
    if (!game) return;
    quizProgress.textContent = `Pytanie ${game.question_number}/${game.question_count}`;
    quizAnswersCount.textContent = `${game.answers_received}/${game.players_expected} odpowiedzi`;
    quizQuestion.textContent = game.question;
    localDeadline = game.ends_at_ms ? Date.now() + (game.ends_at_ms - serverTimeMs) : 0;
    updateTimer();

    const showingResult = game.round_status !== 'active';
    quizAnswers.replaceChildren(...game.answers.map((answer, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'quiz-answer';
      button.dataset.answerIndex = String(index);
      button.disabled = !game.can_answer;
      if (game.your_answer_index === index) button.classList.add('is-selected');
      if (showingResult && game.correct_answer_index === index) button.classList.add('is-correct');
      if (showingResult && game.your_answer_index === index && game.correct_answer_index !== index) {
        button.classList.add('is-wrong');
      }
      const marker = document.createElement('span');
      marker.textContent = String.fromCharCode(65 + index);
      const label = document.createElement('strong');
      label.textContent = answer;
      button.append(marker, label);
      if (showingResult) {
        const count = document.createElement('small');
        count.textContent = `${game.answer_distribution?.[index] || 0} gł.`;
        button.append(count);
      }
      return button;
    }));

    quizResult.hidden = !showingResult;
    quizExplanation.textContent = showingResult ? game.explanation : '';
    quizYourPoints.textContent = showingResult && game.your_points !== null
      ? `Zdobywasz ${game.your_points} pkt.`
      : showingResult ? 'Tym razem bez punktów.' : '';
    quizResultTitle.textContent = game.your_answer_index === game.correct_answer_index
      ? 'Dobra odpowiedź!' : 'Wynik pytania';

    if (game.round_status === 'active') {
      quizWaiting.textContent = game.your_answer_index === null
        ? 'Wybierz odpowiedź przed końcem czasu.'
        : 'Odpowiedź zapisana. Czekamy na pozostałych graczy.';
    } else {
      quizWaiting.textContent = you.is_host
        ? 'Sprawdź ranking i przejdź dalej.'
        : 'Czekamy, aż gospodarz przejdzie dalej.';
    }

    quizAdvance.hidden = !you.is_host;
    quizAdvance.textContent = game.round_status === 'active'
      ? 'Pokaż wyniki'
      : game.question_number < game.question_count ? 'Następne pytanie' : 'Zakończ Quiz';
  }

  function renderScoreList(container, leaderboard, final) {
    container.replaceChildren(...leaderboard.map((player, index) => {
      const item = document.createElement('li');
      item.className = 'score-item';
      const place = document.createElement('span');
      place.className = 'score-place';
      place.textContent = index < 3 && final ? ['🥇', '🥈', '🥉'][index] : `${index + 1}.`;
      const name = document.createElement('strong');
      name.textContent = player.nickname;
      const points = document.createElement('span');
      points.textContent = `${player.score_total} pkt`;
      item.append(place, name, points);
      return item;
    }));
  }

  function updateTimer() {
    if (!quizTimer) return;
    if (!localDeadline) {
      quizTimer.textContent = '—';
      return;
    }
    const seconds = Math.max(0, Math.ceil((localDeadline - Date.now()) / 1000));
    quizTimer.textContent = String(seconds);
    quizTimer.classList.toggle('is-ending', seconds <= 5);
  }

  async function pollRoom() {
    if (!currentRoomCode || !currentToken || polling) return;
    polling = true;
    try {
      const payload = await request('state', {
        token: currentToken,
        query: `&room=${encodeURIComponent(currentRoomCode)}`,
      });
      renderState(payload.state);
      pollFailures = 0;
    } catch (error) {
      pollFailures += 1;
      setMessage(error.message, true);
    } finally {
      polling = false;
      const normalDelay = document.hidden ? 5000 : 1200;
      const retryDelay = Math.min(10000, normalDelay * (2 ** Math.min(pollFailures, 3)));
      schedulePoll(retryDelay);
    }
  }

  function schedulePoll(delay = 1200) {
    window.clearTimeout(pollTimer);
    pollTimer = window.setTimeout(pollRoom, delay);
  }

  createForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setFormBusy(createForm, true);
    setMessage('Tworzę pokój…');
    const data = new FormData(createForm);
    try {
      const payload = await request('create', {
        method: 'POST',
        body: { nickname: data.get('nickname'), mode: data.get('mode') },
      });
      enterRoom(payload.state.room.code, payload.token, payload.state);
      setMessage('Pokój gotowy. Wyślij link pozostałym graczom.');
    } catch (error) {
      setMessage(error.message, true);
    } finally {
      setFormBusy(createForm, false);
    }
  });

  joinForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setFormBusy(joinForm, true);
    setMessage('Dołączam do pokoju…');
    const data = new FormData(joinForm);
    try {
      const payload = await request('join', {
        method: 'POST',
        body: { room_code: data.get('room_code'), nickname: data.get('nickname') },
      });
      enterRoom(payload.state.room.code, payload.token, payload.state);
      setMessage('Jesteś w pokoju. Oznacz gotowość, gdy możesz zaczynać.');
    } catch (error) {
      setMessage(error.message, true);
    } finally {
      setFormBusy(joinForm, false);
    }
  });

  joinForm.elements.room_code.addEventListener('input', (event) => {
    event.target.value = event.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 6);
  });

  readyButton.addEventListener('click', async () => {
    setButtonBusy(readyButton, true);
    try {
      const payload = await request('ready', {
        method: 'POST', token: currentToken,
        body: { room_code: currentRoomCode, ready: !currentState.you.is_ready },
      });
      renderState(payload.state);
      setMessage(payload.state.you.is_ready ? 'Gotowość zaznaczona.' : 'Gotowość wycofana.');
    } catch (error) {
      setMessage(error.message, true);
    } finally {
      setButtonBusy(readyButton, false);
    }
  });

  startButton.addEventListener('click', async () => {
    setButtonBusy(startButton, true, 'Uruchamiam…');
    try {
      const payload = await request('start_quiz', {
        method: 'POST', token: currentToken, body: { room_code: currentRoomCode },
      });
      renderState(payload.state);
      setMessage('Quiz rozpoczęty!');
    } catch (error) {
      setMessage(error.message, true);
    } finally {
      setButtonBusy(startButton, false);
    }
  });

  quizAnswers.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-answer-index]');
    if (!button || button.disabled) return;
    quizAnswers.querySelectorAll('button').forEach((item) => { item.disabled = true; });
    try {
      const payload = await request('answer_quiz', {
        method: 'POST', token: currentToken,
        body: { room_code: currentRoomCode, answer_index: Number(button.dataset.answerIndex) },
      });
      renderState(payload.state);
      setMessage('Odpowiedź zapisana.');
    } catch (error) {
      setMessage(error.message, true);
      schedulePoll(0);
    }
  });

  quizAdvance.addEventListener('click', async () => {
    setButtonBusy(quizAdvance, true);
    try {
      const payload = await request('advance_quiz', {
        method: 'POST', token: currentToken, body: { room_code: currentRoomCode },
      });
      renderState(payload.state);
    } catch (error) {
      setMessage(error.message, true);
    } finally {
      setButtonBusy(quizAdvance, false);
    }
  });

  document.querySelectorAll('[data-copy-link]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(roomLink(currentRoomCode));
        setMessage('Link do pokoju skopiowany.');
      } catch {
        setMessage(`Link: ${roomLink(currentRoomCode)}`);
      }
    });
  });

  document.querySelectorAll('[data-leave]').forEach((button) => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await request('leave', {
          method: 'POST', token: currentToken, body: { room_code: currentRoomCode },
        });
        localStorage.removeItem(sessionKey(currentRoomCode));
        window.location.href = window.location.pathname;
      } catch (error) {
        setMessage(error.message, true);
        button.disabled = false;
      }
    });
  });

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    installButton.hidden = false;
  });

  window.addEventListener('offline', () => {
    setConnectionState('offline');
    setMessage('Brak sieci. Zachowujemy ten pokój i połączymy się ponownie automatycznie.', true);
  });

  window.addEventListener('online', () => {
    setConnectionState('reconnecting');
    pollFailures = 0;
    if (currentRoomCode) {
      schedulePoll(0);
    } else {
      restoreSession();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && currentRoomCode) {
      pollFailures = 0;
      schedulePoll(0);
    }
  });

  installButton.addEventListener('click', async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    installButton.hidden = true;
  });

  async function restoreSession() {
    const params = new URLSearchParams(window.location.search);
    const code = (params.get('room') || '').replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 6);
    if (!code) return;
    joinForm.elements.room_code.value = code;
    const token = localStorage.getItem(sessionKey(code));
    if (!token) {
      joinForm.elements.nickname.focus();
      setMessage('Wpisz pseudonim, aby dołączyć do pokoju.');
      return;
    }
    setMessage('Przywracam pokój…');
    try {
      const payload = await request('state', { token, query: `&room=${encodeURIComponent(code)}` });
      enterRoom(code, token, payload.state);
      setMessage('Pokój przywrócony.');
    } catch (error) {
      const sessionEnded = error.status === 401 || error.status === 410
        || ['session_expired', 'room_closed'].includes(error.code);
      if (sessionEnded) {
        localStorage.removeItem(sessionKey(code));
        setMessage(`${error.message} Możesz dołączyć ponownie.`, true);
      } else {
        setMessage(`${error.message} Sesja jest zachowana.`, true);
      }
    }
  }

  window.setInterval(updateTimer, 250);
  restoreSession();
})();
