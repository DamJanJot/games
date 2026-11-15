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
  const copyLinkButton = document.querySelector('[data-copy-link]');
  const leaveButton = document.querySelector('[data-leave]');
  const installButton = document.querySelector('[data-install]');
  const message = document.querySelector('[data-message]');

  let currentRoomCode = '';
  let currentToken = '';
  let pollTimer = null;
  let installPrompt = null;

  function sessionKey(code) {
    return `gierkoteka.party.${code}`;
  }

  function setMessage(text, error = false) {
    message.textContent = text;
    message.classList.toggle('is-error', error);
  }

  function setBusy(form, busy) {
    const button = form.querySelector('button[type="submit"]');
    form.querySelectorAll('input, button').forEach((control) => {
      control.disabled = busy;
    });
    if (button) {
      button.dataset.label ||= button.textContent;
      button.textContent = busy ? 'Chwila…' : button.dataset.label;
    }
  }

  async function request(action, options = {}) {
    const method = options.method || 'GET';
    const headers = { Accept: 'application/json' };
    if (options.token) headers['X-Party-Token'] = options.token;
    if (options.body) headers['Content-Type'] = 'application/json';

    const response = await fetch(`${apiUrl}?action=${encodeURIComponent(action)}${options.query || ''}`, {
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({
      ok: false,
      error: { message: 'Serwer zwrócił nieprawidłową odpowiedź.' },
    }));

    if (!response.ok || !payload.ok) {
      throw new Error(payload.error?.message || 'Nie udało się połączyć z pokojem.');
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
    renderState(state);
    schedulePoll();
  }

  function renderState(state) {
    const { room, players, you } = state;
    roomCodeElement.textContent = room.code;
    playerCount.textContent = `${players.length}/${room.max_players}`;
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
      detail.textContent = player.role === 'host' ? 'Gospodarz' : 'Gracz';
      name.append(strong, detail);

      const online = document.createElement('span');
      online.className = `online-dot${player.is_online ? ' is-online' : ''}`;
      online.title = player.is_online ? 'Online' : 'Brak aktywności';

      item.append(avatar, name, online);
      return item;
    }));
  }

  async function pollRoom() {
    if (!currentRoomCode || !currentToken) return;
    try {
      const payload = await request('state', {
        token: currentToken,
        query: `&room=${encodeURIComponent(currentRoomCode)}`,
      });
      renderState(payload.state);
      setMessage('Pokój zsynchronizowany.');
    } catch (error) {
      setMessage(error.message, true);
    } finally {
      schedulePoll();
    }
  }

  function schedulePoll() {
    window.clearTimeout(pollTimer);
    pollTimer = window.setTimeout(pollRoom, 2000);
  }

  createForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setBusy(createForm, true);
    setMessage('Tworzę pokój…');
    const data = new FormData(createForm);
    try {
      const payload = await request('create', {
        method: 'POST',
        body: {
          nickname: data.get('nickname'),
          mode: data.get('mode'),
        },
      });
      enterRoom(payload.state.room.code, payload.token, payload.state);
      setMessage('Pokój gotowy. Wyślij link pozostałym graczom.');
    } catch (error) {
      setMessage(error.message, true);
    } finally {
      setBusy(createForm, false);
    }
  });

  joinForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setBusy(joinForm, true);
    setMessage('Dołączam do pokoju…');
    const data = new FormData(joinForm);
    try {
      const payload = await request('join', {
        method: 'POST',
        body: {
          room_code: data.get('room_code'),
          nickname: data.get('nickname'),
        },
      });
      enterRoom(payload.state.room.code, payload.token, payload.state);
      setMessage('Jesteś w pokoju.');
    } catch (error) {
      setMessage(error.message, true);
    } finally {
      setBusy(joinForm, false);
    }
  });

  joinForm.elements.room_code.addEventListener('input', (event) => {
    event.target.value = event.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 6);
  });

  copyLinkButton.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(roomLink(currentRoomCode));
      setMessage('Link do pokoju skopiowany.');
    } catch {
      setMessage(`Link: ${roomLink(currentRoomCode)}`);
    }
  });

  leaveButton.addEventListener('click', async () => {
    leaveButton.disabled = true;
    try {
      await request('leave', {
        method: 'POST',
        token: currentToken,
        body: { room_code: currentRoomCode },
      });
    } catch (error) {
      setMessage(error.message, true);
      leaveButton.disabled = false;
      return;
    }

    localStorage.removeItem(sessionKey(currentRoomCode));
    window.location.href = window.location.pathname;
  });

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    installButton.hidden = false;
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
      const payload = await request('state', {
        token,
        query: `&room=${encodeURIComponent(code)}`,
      });
      enterRoom(code, token, payload.state);
      setMessage('Pokój przywrócony.');
    } catch (error) {
      localStorage.removeItem(sessionKey(code));
      setMessage(`${error.message} Możesz dołączyć ponownie.`, true);
    }
  }

  restoreSession();
})();
