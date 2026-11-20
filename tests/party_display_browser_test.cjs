// Local browser regression tests; API responses are fixtures, no database is used.
// node tests/party_display_browser_test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');

(async () => {
  const browser = await chromium.launch({ channel: process.env.PARTY_BROWSER_CHANNEL || 'chrome', headless: true });
  const errors = [];
  let checks = 0;
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      window.wakeRequests = 0;
      window.wakeReleases = 0;
      Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: {
        request: async () => {
          window.wakeRequests++;
          const lock = new EventTarget();
          lock.release = async () => { window.wakeReleases++; lock.dispatchEvent(new Event('release')); };
          return lock;
        },
      } });
    });
    const state = {
      room: { code: 'ABC234', mode: 'screen', status: 'active', max_players: 8 },
      you: { id: 1, is_host: true }, players: [], leaderboard: [], tournament: {},
      game: { key: 'quiz', round_status: 'active', question_number: 2, question_count: 5,
        question: 'Który wynik?', answers: ['A', 'B'], answers_received: 1, players_expected: 2,
        your_answer_index: 1, can_answer: false },
    };
    let requests = 0;
    await page.route('http://127.0.0.1/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('api.php')) {
        requests++;
        return route.fulfill({ json: { ok: true, token: 'local-test-session', state } });
      }
      const file = path.join(root, decodeURIComponent(url.pathname));
      const contentType = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.php') ? 'text/html' : 'image/svg+xml';
      return route.fulfill({ body: fs.readFileSync(file), contentType });
    });
    await page.goto('http://127.0.0.1/gierkoteka/party/index.php');
    await page.locator('[data-create-form] [name=nickname]').fill('Host');
    await page.locator('[data-create-form] button[type=submit]').click();
    await page.locator('[data-quiz-question]').waitFor({ state: 'visible' });
    await page.waitForFunction(() => wakeRequests === 1);
    const button = page.locator('[data-fullscreen]');
    const sessionBefore = await page.evaluate(() => ({ url: location.href, storage: { ...localStorage }, question: document.querySelector('[data-quiz-question]').textContent }));
    await page.evaluate(() => { window.originalRoom = document.querySelector('[data-view=room]'); });
    await button.click();
    await page.waitForFunction(() => document.fullscreenElement === window.originalRoom);
    assert.equal(await button.getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => document.fullscreenElement.scrollWidth <= innerWidth), true);
    checks++;
    await page.waitForTimeout(1400); // A real polling response must preserve fullscreen.
    assert(requests >= 2);
    assert.equal(await page.evaluate(() => document.fullscreenElement === window.originalRoom), true);
    checks++;
    await button.click();
    await page.waitForFunction(() => !document.fullscreenElement);
    assert.equal(await button.getAttribute('aria-pressed'), 'false');
    const sessionAfter = await page.evaluate(() => ({ url: location.href, storage: { ...localStorage }, question: document.querySelector('[data-quiz-question]').textContent }));
    assert.deepEqual(sessionAfter, sessionBefore);
    assert.equal(await page.locator('[data-answer-index].is-selected').getAttribute('data-answer-index'), '1');
    checks++;
    await button.click();
    await page.evaluate(() => document.exitFullscreen()); // Browser-initiated exit uses the same fullscreenchange path as Escape.
    await page.waitForFunction(() => document.querySelector('[data-fullscreen]').getAttribute('aria-pressed') === 'false');
    checks++;
    // Exercise lifecycle edge cases directly on the production controller in a separate view.
    await page.evaluate(async () => {
      window.testView = document.createElement('section');
      testView.innerHTML = '<button data-fullscreen></button><p data-display-status></p>';
      document.body.append(testView);
      window.controller = new PartyDisplay(testView);
      window.activeState = { room: { mode: 'screen', status: 'active' }, you: { is_host: true } };
      controller.update(activeState);
    });
    await page.waitForFunction(() => controller.lock !== null);
    for (const status of ['round_result', 'leaderboard', 'finished', 'lobby', 'preparation']) {
      await page.evaluate((status) => controller.update({ ...activeState, room: { mode: 'screen', status } }), status);
      assert.equal(await page.evaluate(() => controller.lock), null);
      checks++;
    }
    await page.evaluate(async () => {
      controller.update(activeState);
      await new Promise((resolve) => setTimeout(resolve, 0));
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    assert.equal(await page.evaluate(() => controller.lock), null);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForFunction(() => controller.lock !== null);
    checks++;
    await page.evaluate(() => controller.update({ ...activeState, you: { is_host: false } }));
    assert.equal(await page.locator('section:last-child [data-fullscreen]').isVisible(), false);
    assert.equal(await page.evaluate(() => controller.lock), null);
    await page.evaluate(() => controller.update({ ...activeState, room: { mode: 'phones', status: 'active' } }));
    assert.equal(await page.evaluate(() => controller.active), false);
    checks++;
    await page.evaluate(async () => {
      navigator.wakeLock.request = () => new Promise((resolve) => { window.resolveWake = resolve; });
      controller.update(activeState);
      controller.update({ ...activeState, room: { mode: 'screen', status: 'finished' } });
      const lock = new EventTarget();
      lock.release = async () => { window.staleReleased = true; };
      resolveWake(lock);
    });
    await page.waitForFunction(() => window.staleReleased === true && !controller.pending);
    assert.equal(await page.evaluate(() => controller.lock), null);
    checks++;
    await page.evaluate(async () => {
      navigator.wakeLock.request = async () => { throw new Error('Denied'); };
      controller.update(activeState);
      await new Promise((resolve) => setTimeout(resolve, 0));
      Object.defineProperty(testView, 'requestFullscreen', { value: async () => { throw new Error('Denied'); } });
    });
    await page.locator('section:last-child [data-fullscreen]').click();
    assert.match(await page.locator('section:last-child [data-display-status]').textContent(), /nie pozwoliła/);
    checks++;
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'wakeLock', { value: undefined });
      Object.defineProperty(document, 'fullscreenEnabled', { value: false });
      controller.update(activeState);
    });
    assert.equal(await page.locator('section:last-child [data-fullscreen]').isVisible(), false);
    checks++;
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: 'PASS', checks, real_fullscreen: true, state_preserved: true, wake_lock: 'mocked API lifecycle, denial, unsupported, stale request' }));
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
