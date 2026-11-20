// Requires Playwright and a local API configured with an isolated test database.
// Run through tests/run_party_api_local.ps1 -BrowserTests.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const baseUrl = process.argv[2];
assert(baseUrl && /^http:\/\/127\.0\.0\.1:\d+\//.test(baseUrl), 'Use a local test server');

(async () => {
  const browser = await chromium.launch({ channel: process.env.PARTY_BROWSER_CHANNEL || 'chrome', headless: true });
  const errors = [];
  try {
    const contexts = [];
    const pages = [];
    for (const width of [360, 390, 320, 412]) {
      const context = await browser.newContext({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true });
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      page.on('pageerror', (error) => errors.push(error.message));
      contexts.push(context);
      pages.push(page);
    }
    const [host, ...guests] = pages;
    async function stage(name) {
      for (const page of pages) {
        await page.locator(`[data-room-stage="${name}"]`).waitFor({ state: 'visible' });
        assert.equal(await page.locator('[data-room-mode]').textContent(), 'Same telefony');
        assert.equal(await page.locator('[data-room-guidance]').isVisible(), true);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow');
        if (name !== 'lobby') {
          assert.equal(await page.locator(`[data-room-stage="${name}"] .score-item.is-you`).count(), 1, 'Own ranking entry');
        }
      }
    }
    async function advance(name) {
      const area = host.locator(`[data-room-stage="${name}"]`);
      await area.locator('[data-tournament-advance], [data-game-advance]').click();
    }
    await host.goto(baseUrl);
    await host.locator('[data-create-form] [name="nickname"]').fill('Host');
    await host.locator('[name="mode"][value="phones"]').check();
    await host.locator('[data-create-form] button[type="submit"]').click();
    await host.locator('[data-view="room"]').waitFor({ state: 'visible' });
    const room = await host.locator('[data-room-code]').textContent();
    for (let index = 0; index < guests.length; index++) {
      const page = guests[index];
      await page.goto(`${baseUrl}?room=${room}`);
      await page.locator('[data-join-form] [name="nickname"]').fill(`Guest ${index + 1}`);
      await page.locator('[data-join-form] button[type="submit"]').click();
      await page.locator('[data-view="room"]').waitFor({ state: 'visible' });
    }
    await stage('lobby');
    assert.equal(await host.locator('[data-room-role]').textContent(), 'Grasz jako gospodarz');

    const offlineGuest = guests[0];
    await contexts[1].setOffline(true);
    await offlineGuest.locator('[data-connection-status] strong').waitFor({ state: 'visible' });
    await offlineGuest.waitForFunction(() => (
      document.querySelector('[data-connection-status] strong')?.textContent === 'Brak sieci'
      && !document.querySelector('[data-network-note]')?.hidden
      && document.querySelector('[data-ready-button]')?.disabled
    ));
    assert.match(await offlineGuest.locator('[data-network-note]').textContent(), /Akcje są wstrzymane/);
    await contexts[1].setOffline(false);
    await offlineGuest.waitForFunction(() => (
      document.querySelector('[data-connection-status] strong')?.textContent === 'Połączono'
      && document.querySelector('[data-network-note]')?.hidden
      && !document.querySelector('[data-ready-button]')?.disabled
    ));

    await host.locator('[name="question_seconds"]').selectOption('10');
    await host.locator('[data-plan-form] button[type="submit"]').click();
    await host.waitForFunction(() => document.querySelector('[data-plan-duration]')?.textContent.startsWith('10 sekund'));
    for (const page of pages) await page.locator('[data-ready-button]').click();
    await host.waitForFunction(() => !document.querySelector('[data-start-button]').disabled);
    await host.locator('[data-start-button]').click();
    await stage('preparation');
    await advance('preparation');

    for (const game of ['quiz', 'higher_lower']) {
      const prefix = game === 'quiz' ? 'quiz' : 'higher';
      const questionSelector = `[data-${prefix}-question]`;
      const answerSelector = game === 'quiz' ? '[data-answer-index]' : '[data-choice]';
      for (let number = 1; number <= 5; number++) {
        await stage(game);
        for (const page of pages) {
          await page.waitForFunction(({ prefix, number }) => {
            const progress = document.querySelector(`[data-${prefix}-progress]`).textContent;
            const answer = document.querySelector(prefix === 'quiz' ? '[data-answer-index]' : '[data-choice]');
            return progress.includes(`${number}/5`) && answer && !answer.disabled;
          }, { prefix, number });
        }
        if (number === 1) {
          // Both roles recover the current question and controls after refresh.
          await host.reload();
          await guests[0].reload();
          await stage(game);
        }
        const question = await host.locator(questionSelector).textContent();
        assert(question.length > 0);
        for (const page of pages) assert.equal(await page.locator(questionSelector).textContent(), question);
        assert.equal(await host.locator(`[data-room-stage="${game}"] [data-game-host-controls]`).isVisible(), true);
        for (const page of guests) assert.equal(await page.locator(`[data-room-stage="${game}"] [data-game-host-controls]`).isVisible(), false);
        if (game === 'quiz' && number === 1) {
          const token = await host.evaluate((code) => localStorage.getItem(`gierkoteka.party.${code}`), room);
          await host.locator('[data-quiz-result]').waitFor({ state: 'visible', timeout: 15000 });
          const lateAnswer = await host.evaluate(async ({ roomCode, roomToken }) => {
            const response = await fetch('api.php?action=submit_answer', {
              method: 'POST',
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'X-Party-Token': roomToken,
              },
              body: JSON.stringify({ room_code: roomCode, answer: 0 }),
            });
            return { status: response.status, payload: await response.json() };
          }, { roomCode: room, roomToken: token });
          assert.equal(lateAnswer.status, 409, 'Late answer rejected');
          assert.equal(lateAnswer.payload.error.code, 'question_closed');
          for (const page of pages) {
            await page.locator('[data-quiz-result]').waitFor({ state: 'visible' });
            assert.equal(await page.locator(`${answerSelector}:enabled`).count(), 0, 'Answers locked after timeout');
          }
          await advance(game);
          continue;
        }
        for (let index = 0; index < pages.length; index++) {
          await pages[index].locator(answerSelector).nth(index % (game === 'quiz' ? 4 : 2)).click();
        }
        for (const page of pages) {
          await page.locator(`[data-${prefix}-result]`).waitFor({ state: 'visible' });
          assert((await page.locator(`[data-${prefix}-your-points]`).textContent()).length > 0, 'Personal result');
          assert.equal(await page.locator(`${answerSelector}:enabled`).count(), 0, 'Answers locked after result');
          assert.equal(await page.locator(`[data-room-stage="${game}"] .is-selected`).count(), 1, 'Personal answer retained');
        }
        await advance(game);
      }
      await stage('round_result');
      await advance('round_result');
      await stage('leaderboard');
      await advance('leaderboard');
      if (game === 'quiz') {
        await stage('preparation');
        await advance('preparation');
      }
    }
    await stage('results');
    const ranking = await host.locator('[data-final-score-list]').textContent();
    assert(ranking.includes('Host') && ranking.includes('Guest 3'));
    // Personal markers differ, while ranking order and points must match.
    const normalizedRanking = ranking.replaceAll(' (Ty)', '');
    for (const page of guests) {
      assert.equal((await page.locator('[data-final-score-list]').textContent()).replaceAll(' (Ty)', ''), normalizedRanking);
    }
    await guests[1].reload();
    await stage('results');
    assert.deepEqual(errors, [], 'No browser errors');
    console.log(JSON.stringify({ result: 'PASS', mode: 'phones', mobile_sessions: 4, quiz_questions: 5, comparisons: 5, restored_host_and_guest: true, offline_reconnect: true, late_answer_rejected: true, personal_results_and_rankings: true }));
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
