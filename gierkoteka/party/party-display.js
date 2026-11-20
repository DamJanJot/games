/* Fullscreen changes presentation only; the room and its live state stay mounted. */
class PartyDisplay {
  constructor(view) {
    this.view = view;
    this.button = view.querySelector('[data-fullscreen]');
    this.status = view.querySelector('[data-display-status]');
    this.active = false;
    this.lock = null;
    this.pending = false;
    this.attempted = false;
    this.generation = 0;
    this.wanted = false;

    this.button.addEventListener('click', async () => {
      this.button.disabled = true;
      this.status.hidden = true;
      try {
        if (document.fullscreenElement === this.view) await document.exitFullscreen();
        else await this.view.requestFullscreen();
      } catch {
        this.status.textContent = 'Przeglądarka nie pozwoliła zmienić pełnego ekranu. Możesz kontynuować grę w tym widoku.';
        this.status.hidden = false;
      } finally {
        this.button.disabled = false;
        this.syncFullscreen();
      }
    });
    document.addEventListener('fullscreenchange', () => {
      this.syncFullscreen();
      this.attempted = false;
      this.syncWakeLock();
    });
    document.addEventListener('visibilitychange', () => this.syncWakeLock());
    window.addEventListener('pagehide', () => {
      this.active = false;
      this.syncWakeLock();
    });
    window.addEventListener('pageshow', () => this.update(this.state));
  }

  update(state) {
    this.state = state;
    const hostScreen = state?.you.is_host && state.room.mode === 'screen';
    this.button.hidden = !hostScreen || !document.fullscreenEnabled || !this.view.requestFullscreen;
    this.active = Boolean(hostScreen && state.room.status === 'active');
    this.syncWakeLock();
    this.syncFullscreen();
  }

  syncFullscreen() {
    const fullscreen = document.fullscreenElement === this.view;
    this.button.textContent = fullscreen ? 'Wyjdź z pełnego ekranu' : 'Pełny ekran';
    this.button.setAttribute('aria-pressed', String(fullscreen));
  }

  async syncWakeLock() {
    const wanted = this.active && !document.hidden;
    if (wanted !== this.wanted) {
      this.wanted = wanted;
      this.generation += 1;
      this.attempted = false;
    }
    if (!wanted) {
      const lock = this.lock;
      this.lock = null;
      if (lock) await lock.release().catch(() => {});
      return;
    }
    if (!navigator.wakeLock || this.lock || this.pending || this.attempted) return;
    this.pending = true;
    this.attempted = true;
    const generation = this.generation;
    try {
      const lock = await navigator.wakeLock.request('screen');
      if (generation !== this.generation || !this.wanted) {
        await lock.release().catch(() => {});
      } else {
        this.lock = lock;
        lock.addEventListener('release', () => {
          if (this.lock === lock) this.lock = null;
        });
      }
    } catch {
      // Unsupported policy, battery saving or denied permission must not interrupt play.
    } finally {
      this.pending = false;
      if (generation !== this.generation) this.syncWakeLock();
    }
  }
}
