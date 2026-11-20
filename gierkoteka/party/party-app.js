(() => {
  'use strict';

  const apiUrl = 'api.php';
  const landingView = document.querySelector('[data-view="landing"]');
  const roomView = document.querySelector('[data-view="room"]');
  const createForm = document.querySelector('[data-create-form]');
  const joinForm = document.querySelector('[data-join-form]');
  const roomCodeElement = document.querySelector('[data-room-code]');
  const roomMode = document.querySelector('[data-room-mode]');
  const roomRole = document.querySelector('[data-room-role]');
  const roomGuidance = document.querySelector('[data-room-guidance]');
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
  const networkNote = document.querySelector('[data-network-note]');
  const planOrder = document.querySelector('[data-plan-order]');
  const planDuration = document.querySelector('[data-plan-duration]');
  const planForm = document.querySelector('[data-plan-form]');
  const firstGameSelect = planForm.elements.first_game;
  const secondGameSelect = planForm.elements.second_game;
  const includeSecond = planForm.elements.include_second;
  const questionSecondsSelect = planForm.elements.question_seconds;
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
  const scoreList = document.querySelector('[data-score-list]');
  const higherProgress = document.querySelector('[data-higher-progress]');
  const higherTimer = document.querySelector('[data-higher-timer]');
  const higherAnswersCount = document.querySelector('[data-higher-answers-count]');
  const higherCategory = document.querySelector('[data-higher-category]');
  const higherReferenceLabel = document.querySelector('[data-higher-reference-label]');
  const higherReferenceValue = document.querySelector('[data-higher-reference-value]');
  const higherQuestion = document.querySelector('[data-higher-question]');
  const higherChoices = document.querySelector('[data-higher-choices]');
  const higherResult = document.querySelector('[data-higher-result]');
  const higherResultTitle = document.querySelector('[data-higher-result-title]');
  const higherTargetValue = document.querySelector('[data-higher-target-value]');
  const higherExplanation = document.querySelector('[data-higher-explanation]');
  const higherYourPoints = document.querySelector('[data-higher-your-points]');
  const higherWaiting = document.querySelector('[data-higher-waiting]');
  const higherScoreList = document.querySelector('[data-higher-score-list]');
  const preparationProgress = document.querySelector('[data-preparation-progress]');
  const preparationTitle = document.querySelector('[data-preparation-title]');
  const preparationDescription = document.querySelector('[data-preparation-description]');
  const preparationWaiting = document.querySelector('[data-preparation-waiting]');
  const preparationScoreList = document.querySelector('[data-preparation-score-list]');
  const tournamentOrder = document.querySelector('[data-tournament-order]');
  const roundResultProgress = document.querySelector('[data-round-result-progress]');
  const roundResultTitle = document.querySelector('[data-round-result-title]');
  const roundResultWaiting = document.querySelector('[data-round-result-waiting]');
  const roundScoreList = document.querySelector('[data-round-score-list]');
  const leaderboardTitle = document.querySelector('[data-leaderboard-title]');
  const leaderboardWaiting = document.querySelector('[data-leaderboard-waiting]');
  const tournamentScoreList = document.querySelector('[data-tournament-score-list]');
  const finalScoreList = document.querySelector('[data-final-score-list]');
  const finalTitle = document.querySelector('[data-final-title]');
  const finalSummary = document.querySelector('[data-final-summary]');

  let currentRoomCode = '';
  let currentToken = '';
  let currentState = null;
  let pollTimer = null;
  let polling = false;
  let installPrompt = null;
  let localDeadline = 0;
  let activeTimerElement = null;
  let pollFailures = 0;
  let connectionMode = navigator.onLine ? 'connected' : 'offline';
  let renderedPlanFingerprint = '';

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
    connectionMode = state;
    const labels = {
      connected: 'Połączono',
      reconnecting: 'Łączenie ponownie…',
      offline: 'Brak sieci',
    };
    if (connectionStatus) {
      connectionStatus.classList.toggle('is-reconnecting', state === 'reconnecting');
      connectionStatus.classList.toggle('is-offline', state === 'offline');
      connectionStatus.querySelector('strong').textContent = labels[state] || labels.connected;
    }
    if (networkNote) {
      networkNote.hidden = state === 'connected';
      networkNote.textContent = state === 'offline'
        ? 'Brak połączenia. Akcje są wstrzymane; po powrocie sieci pobierzemy aktualny stan pokoju.'
        : 'Sprawdzam aktualny stan pokoju. Akcje odblokują się po potwierdzeniu połączenia.';
    }
    syncNetworkActions();
  }

  function syncNetworkActions() {
    const blocked = connectionMode !== 'connected';
    const controls = document.querySelectorAll(
      '[data-create-form] button, [data-join-form] button, [data-plan-form] button, '
      + '[data-ready-button], [data-start-button], [data-game-advance], '
      + '[data-tournament-advance], [data-leave], [data-answer-index], [data-choice]',
    );
    controls.forEach((control) => {
      if (blocked) {
        if (!control.disabled) control.dataset.networkLocked = '1';
        control.disabled = true;
      } else if (control.dataset.networkLocked === '1') {
        control.disabled = false;
        delete control.dataset.networkLocked;
      }
    });
  }

  function setButtonBusy(button, busy, busyLabel = 'Chwila…') {
    if (!button) return;
    if (busy) {
      button.dataset.idleLabel = button.textContent;
      button.dataset.busyLabel = busyLabel;
      button.disabled = true;
      button.textContent = busyLabel;
      return;
    }
    if (button.textContent === button.dataset.busyLabel) {
      button.textContent = button.dataset.idleLabel || button.textContent;
    }
    button.disabled = false;
    delete button.dataset.busyLabel;
    syncNetworkActions();
  }

  function setFormBusy(form, busy) {
    const button = form.querySelector('button[type="submit"]');
    form.querySelectorAll('input, select, button').forEach((control) => {
      control.disabled = busy;
    });
    setButtonBusy(button, busy);
    if (form === planForm && !busy) secondGameSelect.disabled = !includeSecond.checked;
    syncNetworkActions();
  }

  async function request(action, options = {}) {
    if (!navigator.onLine) {
      setConnectionState('offline');
      throw new PartyRequestError('Brak połączenia z internetem. Spróbuj po powrocie sieci.', 0, 'offline');
    }
    if ((options.method || 'GET') !== 'GET' && connectionMode !== 'connected') {
      throw new PartyRequestError('Poczekaj, aż pobierzemy aktualny stan pokoju.', 0, 'reconnecting');
    }
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
    if (!response.ok || !payload.ok) {
      throw new PartyRequestError(
        payload.error?.message || 'Nie udało się połączyć z pokojem.',
        response.status,
        payload.error?.code || 'request_failed',
      );
    }
    if (navigator.onLine) setConnectionState('connected');
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
    const { room, players, you, game, leaderboard, tournament } = state;
    roomCodeElement.textContent = room.code;
    roomView.dataset.mode = room.mode;
    roomMode.textContent = room.mode === 'phones' ? 'Same telefony' : 'Wspólny ekran';
    roomRole.textContent = you.is_host ? 'Grasz jako gospodarz' : 'Grasz jako uczestnik';
    roomGuidance.hidden = room.mode !== 'phones';
    roomGuidance.textContent = you.is_host
      ? 'Odpowiadasz i zdobywasz punkty jak każdy gracz. Dodatkowo uruchamiasz rundy i przechodzisz dalej po wynikach. Poczekaj, aż wszyscy je przeczytają.'
      : 'Pytania, Twoje wyniki i ranking zobaczysz tutaj. Odpowiadaj na swoim telefonie; gospodarz przechodzi do kolejnych etapów.';
    playerCount.textContent = `${players.length}/${room.max_players}`;
    const ownPlayer = players.find((player) => player.id === you.id);
    if (ownPlayer) you.is_ready = ownPlayer.is_ready;

    activeTimerElement = null;
    localDeadline = 0;
    if (room.status === 'lobby') {
      showRoomStage('lobby');
      renderLobby(state);
    } else if (room.status === 'preparation') {
      showRoomStage('preparation');
      renderPreparation(tournament, leaderboard, you);
    } else if (room.status === 'round_result') {
      showRoomStage('round_result');
      renderRoundResult(tournament, you);
    } else if (room.status === 'leaderboard') {
      showRoomStage('leaderboard');
      renderTournamentLeaderboard(tournament, leaderboard, you);
    } else if (room.status === 'finished' || room.status === 'results') {
      showRoomStage('results');
      renderFinal(tournament, leaderboard);
    } else if (game?.key === 'higher_lower') {
      showRoomStage('higher_lower');
      renderHigherLower(state);
      renderScoreList(higherScoreList, leaderboard);
    } else {
      showRoomStage('quiz');
      renderQuiz(state);
      renderScoreList(scoreList, leaderboard);
    }
    updateTimer();
    syncNetworkActions();
  }

  function renderLobby({ room, players, you, tournament }) {
    emptyPlayers.hidden = players.length > 1;
    const screenMode = room.mode === 'screen';
    modeTitle.textContent = screenMode ? 'Wspólny ekran' : 'Same telefony';
    modeDescription.textContent = screenMode
      ? 'Telewizor lub laptop pokaże pytania i tabelę, a telefony będą kontrolerami.'
      : 'Każdy gracz zobaczy przebieg gry na swoim telefonie. Dodatkowy ekran nie jest potrzebny.';

    const order = tournament.order;
    planOrder.replaceChildren(...order.map((game, index) => {
      const item = document.createElement('li');
      item.textContent = `${index + 1}. ${game.label}`;
      return item;
    }));
    planDuration.textContent = `${tournament.question_limit_seconds} sekund na odpowiedź · jeden wspólny ranking.`;
    planForm.hidden = !you.is_host;
    const fingerprint = JSON.stringify([order.map((game) => game.key), tournament.question_limit_seconds]);
    if (fingerprint !== renderedPlanFingerprint) {
      firstGameSelect.value = order[0]?.key || 'quiz';
      includeSecond.checked = order.length > 1;
      secondGameSelect.value = order[1]?.key || (firstGameSelect.value === 'quiz' ? 'higher_lower' : 'quiz');
      questionSecondsSelect.value = String(tournament.question_limit_seconds);
      secondGameSelect.disabled = !includeSecond.checked;
      renderedPlanFingerprint = fingerprint;
    }

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
      : 'Gospodarz uruchomi turniej, gdy wszyscy będą gotowi.';
  }

  function renderPreparation(tournament, leaderboard, you) {
    const round = tournament.current_round;
    preparationProgress.textContent = `Runda ${round.number}/${tournament.total_rounds}`;
    preparationTitle.textContent = round.label;
    preparationDescription.textContent = round.description;
    tournamentOrder.replaceChildren(...tournament.order.map((game, index) => {
      const item = document.createElement('li');
      item.className = index < tournament.current_index ? 'is-complete' : index === tournament.current_index ? 'is-current' : '';
      item.innerHTML = `<span>${index + 1}</span><strong></strong>`;
      item.querySelector('strong').textContent = game.label;
      return item;
    }));
    preparationWaiting.textContent = you.is_host
      ? 'Gdy wszyscy widzą ten ekran, rozpocznij rundę.'
      : 'Czekamy, aż gospodarz rozpocznie rundę.';
    renderScoreList(preparationScoreList, leaderboard);
    setStageAdvanceButton('preparation', you, 'Rozpocznij rundę');
  }

  function renderQuiz({ game, you, server_time_ms: serverTimeMs }) {
    if (!game) return;
    quizProgress.textContent = `Pytanie ${game.question_number}/${game.question_count}`;
    quizAnswersCount.textContent = `${game.answers_received}/${game.players_expected} odpowiedzi`;
    quizQuestion.textContent = game.question;
    activeTimerElement = quizTimer;
    localDeadline = game.ends_at_ms ? Date.now() + (game.ends_at_ms - serverTimeMs) : 0;

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
    quizWaiting.textContent = game.round_status === 'active'
      ? (game.your_answer_index === null
        ? 'Wybierz odpowiedź przed końcem czasu.'
        : 'Odpowiedź zapisana. Czekamy na pozostałych graczy.')
      : you.is_host ? 'Sprawdź wynik i przejdź dalej.' : 'Czekamy, aż gospodarz przejdzie dalej.';
    setGameAdvanceButton('quiz', you, game, 'question_number', 'question_count', 'Zakończ rundę');
  }

  function renderHigherLower({ game, you, server_time_ms: serverTimeMs }) {
    if (!game) return;
    higherProgress.textContent = `Porównanie ${game.card_number}/${game.card_count}`;
    higherAnswersCount.textContent = `${game.answers_received}/${game.players_expected} odpowiedzi`;
    higherCategory.textContent = game.category;
    higherReferenceLabel.textContent = game.reference_label;
    higherReferenceValue.textContent = game.reference_value;
    higherQuestion.textContent = game.question;
    activeTimerElement = higherTimer;
    localDeadline = game.ends_at_ms ? Date.now() + (game.ends_at_ms - serverTimeMs) : 0;

    const showingResult = game.round_status !== 'active';
    higherChoices.replaceChildren(...game.choices.map((choice) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `higher-choice higher-choice--${choice.key}`;
      button.dataset.choice = choice.key;
      button.disabled = !game.can_answer;
      if (game.your_choice === choice.key) button.classList.add('is-selected');
      if (showingResult && game.correct_choice === choice.key) button.classList.add('is-correct');
      if (showingResult && game.your_choice === choice.key && game.correct_choice !== choice.key) {
        button.classList.add('is-wrong');
      }
      const symbol = document.createElement('span');
      symbol.textContent = choice.key === 'more' ? '↑' : '↓';
      const label = document.createElement('strong');
      label.textContent = choice.label;
      button.append(symbol, label);
      if (showingResult) {
        const count = document.createElement('small');
        count.textContent = `${game.answer_distribution?.[choice.key] || 0} gł.`;
        button.append(count);
      }
      return button;
    }));

    higherResult.hidden = !showingResult;
    higherTargetValue.textContent = showingResult ? `${game.target_label}: ${game.target_value}` : '';
    higherExplanation.textContent = showingResult ? game.explanation : '';
    higherYourPoints.textContent = showingResult && game.your_points !== null
      ? `Zdobywasz ${game.your_points} pkt.`
      : showingResult ? 'Tym razem bez punktów.' : '';
    higherResultTitle.textContent = game.your_choice === game.correct_choice
      ? 'Dobre porównanie!' : 'Wynik porównania';
    higherWaiting.textContent = game.round_status === 'active'
      ? (game.your_choice === null
        ? 'Wybierz więcej albo mniej przed końcem czasu.'
        : 'Odpowiedź zapisana. Czekamy na pozostałych graczy.')
      : you.is_host ? 'Sprawdź wynik i przejdź dalej.' : 'Czekamy, aż gospodarz przejdzie dalej.';
    setGameAdvanceButton('higher_lower', you, game, 'card_number', 'card_count', 'Zakończ rundę');
  }

  function setGameAdvanceButton(stage, you, game, numberKey, countKey, finishLabel) {
    const button = document.querySelector(`[data-room-stage="${stage}"] [data-game-advance]`);
    button.hidden = !you.is_host;
    button.closest('[data-game-host-controls]').hidden = !you.is_host;
    button.textContent = game.round_status === 'active'
      ? (currentState.room.mode === 'phones' ? 'Zakończ pytanie wcześniej' : 'Pokaż wyniki')
      : game[numberKey] < game[countKey] ? 'Następne pytanie' : finishLabel;
  }

  function setStageAdvanceButton(stage, you, label) {
    const button = document.querySelector(`[data-room-stage="${stage}"] [data-tournament-advance]`);
    button.hidden = !you.is_host;
    button.textContent = label;
  }

  function renderRoundResult(tournament, you) {
    const round = tournament.current_round;
    roundResultProgress.textContent = `Runda ${round.number}/${tournament.total_rounds} zakończona`;
    roundResultTitle.textContent = `Wyniki: ${round.label}`;
    roundResultWaiting.textContent = you.is_host
      ? 'Pokaż wspólną tabelę po tej rundzie.'
      : 'Czekamy na tabelę turnieju.';
    renderScoreList(roundScoreList, tournament.round_leaderboard, { field: 'round_score', final: true });
    setStageAdvanceButton('round_result', you, 'Pokaż tabelę turnieju');
  }

  function renderTournamentLeaderboard(tournament, leaderboard, you) {
    const round = tournament.current_round;
    leaderboardTitle.textContent = `Wyniki po rundzie ${round.number}/${tournament.total_rounds}`;
    leaderboardWaiting.textContent = you.is_host
      ? (tournament.has_next_round ? 'Przejdź do przygotowania następnej gry.' : 'Zakończ turniej i pokaż zwycięzców.')
      : (tournament.has_next_round ? 'Czekamy na następną rundę.' : 'Czekamy na zakończenie turnieju.');
    renderScoreList(tournamentScoreList, leaderboard, { final: true });
    setStageAdvanceButton('leaderboard', you, tournament.has_next_round ? 'Następna runda' : 'Zakończ turniej');
  }

  function renderFinal(tournament, leaderboard) {
    renderScoreList(finalScoreList, leaderboard, { final: true });
    if (!leaderboard.length) return;
    const winners = leaderboard.filter((player) => tournament.winner_ids.includes(player.id));
    if (tournament.has_winner_tie) {
      finalTitle.textContent = 'Remis na szczycie!';
      finalSummary.textContent = `${winners.map((player) => player.nickname).join(' i ')} kończą turniej z takim samym wynikiem.`;
    } else {
      finalTitle.textContent = `Wygrywa ${leaderboard[0].nickname}!`;
      finalSummary.textContent = tournament.order.length === 1
        ? `Runda ${tournament.order[0].label} zakończona. Oto wspólna tabela punktów.`
        : `Rundy ${tournament.order.map((game) => game.label).join(' i ')} zakończone. Oto wspólna tabela punktów.`;
    }
  }

  function renderScoreList(container, leaderboard, options = {}) {
    const { final = false, field = 'score_total' } = options;
    container.replaceChildren(...leaderboard.map((player) => {
      const item = document.createElement('li');
      item.className = 'score-item';
      const place = document.createElement('span');
      place.className = 'score-place';
      const rank = player.rank || leaderboard.findIndex((entry) => entry[field] === player[field]) + 1;
      const isYou = player.id === currentState?.you.id;
      item.classList.toggle('is-you', isYou);
      place.textContent = final && rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : `${rank}.`;
      const name = document.createElement('strong');
      name.textContent = `${player.nickname}${isYou ? ' (Ty)' : ''}`;
      const points = document.createElement('span');
      points.textContent = `${player[field] || 0} pkt`;
      item.append(place, name, points);
      return item;
    }));
  }

  function updateTimer() {
    [quizTimer, higherTimer].forEach((timer) => timer?.classList.remove('is-ending'));
    if (!activeTimerElement) return;
    if (!localDeadline) {
      activeTimerElement.textContent = '—';
      return;
    }
    const seconds = Math.max(0, Math.ceil((localDeadline - Date.now()) / 1000));
    activeTimerElement.textContent = String(seconds);
    activeTimerElement.classList.toggle('is-ending', seconds <= 5);
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
    const data = new FormData(createForm);
    setFormBusy(createForm, true);
    setMessage('Tworzę pokój…');
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
    const data = new FormData(joinForm);
    setFormBusy(joinForm, true);
    setMessage('Dołączam do pokoju…');
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

  firstGameSelect.addEventListener('change', () => {
    if (secondGameSelect.value === firstGameSelect.value) {
      secondGameSelect.value = firstGameSelect.value === 'quiz' ? 'higher_lower' : 'quiz';
    }
  });

  includeSecond.addEventListener('change', () => {
    secondGameSelect.disabled = !includeSecond.checked;
  });

  planForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const order = [firstGameSelect.value];
    if (includeSecond.checked) order.push(secondGameSelect.value);
    if (new Set(order).size !== order.length) {
      setMessage('Wybierz dwie różne gry.', true);
      return;
    }
    setFormBusy(planForm, true);
    try {
      const payload = await request('update_plan', {
        method: 'POST', token: currentToken,
        body: {
          room_code: currentRoomCode,
          round_order: order,
          question_limit_seconds: Number(questionSecondsSelect.value),
        },
      });
      renderState(payload.state);
      setMessage(payload.changed
        ? 'Plan zapisany. Gracze mogą ponownie oznaczyć gotowość.'
        : 'Plan nie wymagał zmian.');
    } catch (error) {
      setMessage(error.message, true);
    } finally {
      setFormBusy(planForm, false);
    }
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
      const payload = await request('start_tournament', {
        method: 'POST', token: currentToken, body: { room_code: currentRoomCode },
      });
      renderState(payload.state);
      setMessage('Turniej rozpoczęty. Czas na pierwszą rundę!');
    } catch (error) {
      setMessage(error.message, true);
    } finally {
      setButtonBusy(startButton, false);
      if (currentState?.room.status === 'lobby') renderState(currentState);
    }
  });

  quizAnswers.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-answer-index]');
    if (!button || button.disabled) return;
    quizAnswers.querySelectorAll('button').forEach((item) => { item.disabled = true; });
    await submitGameAnswer({ answer: Number(button.dataset.answerIndex) });
  });

  higherChoices.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-choice]');
    if (!button || button.disabled) return;
    higherChoices.querySelectorAll('button').forEach((item) => { item.disabled = true; });
    await submitGameAnswer({ choice: button.dataset.choice });
  });

  async function submitGameAnswer(answer) {
    try {
      const payload = await request('submit_answer', {
        method: 'POST', token: currentToken,
        body: { room_code: currentRoomCode, ...answer },
      });
      renderState(payload.state);
      setMessage('Odpowiedź zapisana.');
    } catch (error) {
      setMessage(error.message, true);
      schedulePoll(0);
    }
  }

  document.querySelectorAll('[data-tournament-advance], [data-game-advance]').forEach((button) => {
    button.addEventListener('click', async () => {
      setButtonBusy(button, true);
      try {
        const payload = await request('advance_tournament', {
          method: 'POST', token: currentToken, body: { room_code: currentRoomCode },
        });
        renderState(payload.state);
      } catch (error) {
        setMessage(error.message, true);
      } finally {
        setButtonBusy(button, false);
      }
    });
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
    pollFailures = 0;
    if (currentRoomCode || new URLSearchParams(window.location.search).has('room')) {
      setConnectionState('reconnecting');
      if (currentRoomCode) schedulePoll(0);
      else restoreSession();
    } else {
      setConnectionState('connected');
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
      if (navigator.onLine) setConnectionState('connected');
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
  setConnectionState(connectionMode);
  restoreSession();
})();
