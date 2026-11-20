<!doctype html>
<html lang="pl">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <title>Tryb Party — Gierkoteka</title>
    <meta name="description" content="Utwórz pokój i zaproś znajomych do wspólnego turnieju gier.">
    <meta name="theme-color" content="#132238">
    <link rel="icon" type="image/svg+xml" href="../icon.svg">
    <link rel="manifest" href="../manifest.json">
    <link rel="stylesheet" href="../styles.css">
    <link rel="stylesheet" href="party.css">
</head>
<body>
<main class="party-shell">
    <header class="game-top party-top">
        <a class="home-link" href="../" aria-label="Wróć do Gierkoteki"><span>GK</span></a>
        <div class="title-group">
            <p>Gierkoteka</p>
            <h1>Tryb Party</h1>
        </div>
        <span class="party-stage">Alpha</span>
    </header>

    <section class="party-landing" data-view="landing">
        <div class="party-hero">
            <span class="eyebrow">Wspólny turniej</span>
            <h2>Jeden pokój, kilka telefonów i seria krótkich gier.</h2>
            <p>Utwórz pokój jako gospodarz albo wpisz sześci znakowy kod otrzymany od znajomego.</p>
            <div class="foundation-note">
                <strong>Wybierz rundy, zbieraj punkty</strong>
                <span>Quiz i Więcej czy mniej możesz rozegrać osobno albo połączyć w turniej ze wspólną tabelą.</span>
            </div>
        </div>

        <div class="party-actions">
            <form class="party-card" data-create-form>
                <span class="card-number">01</span>
                <h3>Utwórz pokój</h3>
                <label>
                    Twój pseudonim
                    <input name="nickname" maxlength="24" autocomplete="nickname" placeholder="np. Damian" required>
                </label>
                <fieldset>
                    <legend>Jak gramy?</legend>
                    <label class="mode-choice">
                        <input type="radio" name="mode" value="screen" checked>
                        <span><strong>Wspólny ekran</strong><small>TV lub laptop pokazuje przebieg gry.</small></span>
                    </label>
                    <label class="mode-choice">
                        <input type="radio" name="mode" value="phones">
                        <span><strong>Same telefony</strong><small>Pytania, wyniki i ranking na każdym telefonie. Gospodarz też gra.</small></span>
                    </label>
                </fieldset>
                <button class="primary-button" type="submit">Utwórz pokój</button>
            </form>

            <form class="party-card" data-join-form>
                <span class="card-number">02</span>
                <h3>Dołącz do gry</h3>
                <label>
                    Kod pokoju
                    <input class="code-input" name="room_code" maxlength="6" inputmode="text" autocomplete="off" placeholder="ABC234" required>
                </label>
                <label>
                    Twój pseudonim
                    <input name="nickname" maxlength="24" autocomplete="nickname" placeholder="np. Ola" required>
                </label>
                <button class="secondary-button" type="submit">Dołącz</button>
            </form>
        </div>
    </section>

    <section class="party-room" data-view="room" hidden>
        <div class="room-summary">
            <div>
                <span class="eyebrow">Kod pokoju</span>
                <strong class="room-code" data-room-code>------</strong>
            </div>
            <div class="room-summary-actions">
                <span class="connection-status" data-connection-status role="status" aria-live="polite">
                    <span aria-hidden="true"></span>
                    <strong>Połączono</strong>
                </span>
                <button type="button" class="small-button" data-copy-link>Kopiuj link</button>
                <button type="button" class="small-button" data-fullscreen aria-pressed="false" hidden>Pełny ekran</button>
                <button type="button" class="small-button quiet" data-install hidden>Zainstaluj</button>
            </div>
        </div>
        <div class="room-context">
            <strong data-room-mode></strong>
            <span data-room-role></span>
        </div>
        <p class="display-status" data-display-status role="status" aria-live="polite" hidden></p>
        <p class="room-guidance" data-room-guidance hidden></p>
        <p class="network-note" data-network-note role="status" aria-live="polite" hidden>Połączenie przerwane. Akcje są wstrzymane do czasu pobrania aktualnego stanu pokoju.</p>

        <div class="room-layout" data-room-stage="lobby">
            <section class="lobby-card">
                <div class="section-heading">
                    <div>
                        <span class="eyebrow">Poczekalnia</span>
                        <h2>Gracze</h2>
                    </div>
                    <span class="player-count" data-player-count>0/8</span>
                </div>
                <ul class="player-list" data-player-list></ul>
                <p class="empty-players" data-empty-players>Zaproś pierwszego gracza linkiem lub kodem.</p>
                <button class="secondary-button ready-button" type="button" data-ready-button>Jestem gotowy</button>
            </section>

            <aside class="host-card">
                <span class="eyebrow">Ustawienia pokoju</span>
                <h2 data-mode-title>Wspólny ekran</h2>
                <p data-mode-description>Telewizor lub laptop pokaże pytania i tabelę, a telefony będą kontrolerami.</p>
                <div class="next-step">
                    <span>Kolejność rund</span>
                    <ol data-plan-order></ol>
                    <p data-plan-duration>20 sekund na odpowiedź · jeden wspólny ranking.</p>
                </div>
                <form class="plan-editor" data-plan-form hidden>
                    <strong>Ułóż turniej</strong>
                    <label>Pierwsza gra
                        <select name="first_game">
                            <option value="quiz">Quiz</option>
                            <option value="higher_lower">Więcej czy mniej</option>
                        </select>
                    </label>
                    <label class="plan-second-toggle"><input type="checkbox" name="include_second" checked> Dodaj drugą rundę</label>
                    <label>Druga gra
                        <select name="second_game">
                            <option value="higher_lower">Więcej czy mniej</option>
                            <option value="quiz">Quiz</option>
                        </select>
                    </label>
                    <label>Czas na jedną odpowiedź
                        <select name="question_seconds">
                            <option value="10">10 sekund</option>
                            <option value="20" selected>20 sekund</option>
                            <option value="30">30 sekund</option>
                            <option value="45">45 sekund</option>
                            <option value="60">60 sekund</option>
                        </select>
                    </label>
                    <p>Zmiana planu wycofa gotowość graczy. Każdy zobaczy nową kolejność przed startem.</p>
                    <button type="submit" class="small-button">Zapisz plan</button>
                </form>
                <button class="primary-button" type="button" disabled data-start-button>Uruchom turniej</button>
                <p class="start-requirements" data-start-requirements>Potrzeba minimum dwóch gotowych graczy.</p>
                <button class="text-button" type="button" data-leave>Opuść pokój</button>
            </aside>
        </div>

        <div class="tournament-layout" data-room-stage="preparation" hidden>
            <section class="tournament-card preparation-card">
                <span class="eyebrow" data-preparation-progress>Runda 1/2</span>
                <h2 data-preparation-title>Quiz</h2>
                <p data-preparation-description></p>
                <ol class="tournament-order" data-tournament-order></ol>
                <p class="quiz-waiting" data-preparation-waiting></p>
                <button class="primary-button" type="button" data-tournament-advance hidden>Rozpocznij rundę</button>
            </section>

            <aside class="score-card">
                <span class="eyebrow">Ranking turnieju</span>
                <ol class="score-list" data-preparation-score-list></ol>
                <button class="text-button" type="button" data-leave>Opuść pokój</button>
            </aside>
        </div>

        <div class="quiz-layout" data-room-stage="quiz" hidden>
            <section class="quiz-card">
                <div class="quiz-progress">
                    <span data-quiz-progress>Pytanie 1/5</span>
                    <strong data-quiz-timer>20</strong>
                    <span data-quiz-answers-count>0/0 odpowiedzi</span>
                </div>
                <h2 class="quiz-question" data-quiz-question></h2>
                <div class="quiz-answers" data-quiz-answers></div>
                <div class="quiz-result" data-quiz-result hidden>
                    <strong data-quiz-result-title>Wynik pytania</strong>
                    <p data-quiz-explanation></p>
                    <p class="quiz-your-points" data-quiz-your-points></p>
                </div>
                <p class="quiz-waiting" data-quiz-waiting></p>
                <div class="game-host-controls" data-game-host-controls hidden>
                    <strong>Sterowanie gospodarza</strong>
                    <p>Wynik pojawi się po wszystkich odpowiedziach lub po upływie czasu. Możesz też zakończyć pytanie wcześniej.</p>
                    <button class="primary-button quiz-advance" type="button" data-game-advance hidden>Pokaż wyniki</button>
                </div>
            </section>

            <aside class="score-card">
                <span class="eyebrow">Ranking turnieju</span>
                <ol class="score-list" data-score-list></ol>
                <button class="text-button" type="button" data-leave>Opuść pokój</button>
            </aside>
        </div>

        <div class="quiz-layout higher-lower-layout" data-room-stage="higher_lower" hidden>
            <section class="quiz-card higher-lower-card">
                <div class="quiz-progress">
                    <span data-higher-progress>Porównanie 1/5</span>
                    <strong data-higher-timer>20</strong>
                    <span data-higher-answers-count>0/0 odpowiedzi</span>
                </div>
                <span class="eyebrow higher-category" data-higher-category></span>
                <div class="comparison-reference">
                    <span>Punkt odniesienia</span>
                    <strong data-higher-reference-label></strong>
                    <small data-higher-reference-value></small>
                </div>
                <h2 class="quiz-question higher-question" data-higher-question></h2>
                <div class="higher-choices" data-higher-choices></div>
                <div class="quiz-result" data-higher-result hidden>
                    <strong data-higher-result-title>Wynik porównania</strong>
                    <p data-higher-target-value></p>
                    <p data-higher-explanation></p>
                    <p class="quiz-your-points" data-higher-your-points></p>
                </div>
                <p class="quiz-waiting" data-higher-waiting></p>
                <div class="game-host-controls" data-game-host-controls hidden>
                    <strong>Sterowanie gospodarza</strong>
                    <p>Wynik pojawi się po wszystkich odpowiedziach lub po upływie czasu. Możesz też zakończyć pytanie wcześniej.</p>
                    <button class="primary-button quiz-advance" type="button" data-game-advance hidden>Pokaż wyniki</button>
                </div>
            </section>

            <aside class="score-card">
                <span class="eyebrow">Ranking turnieju</span>
                <ol class="score-list" data-higher-score-list></ol>
                <button class="text-button" type="button" data-leave>Opuść pokój</button>
            </aside>
        </div>

        <div class="tournament-layout" data-room-stage="round_result" hidden>
            <section class="tournament-card round-result-card">
                <span class="eyebrow" data-round-result-progress>Wynik rundy</span>
                <h2 data-round-result-title></h2>
                <p>Punkty z tej rundy zostały dodane do wspólnego wyniku.</p>
                <ol class="score-list score-list--round" data-round-score-list></ol>
                <p class="quiz-waiting" data-round-result-waiting></p>
                <button class="primary-button" type="button" data-tournament-advance hidden>Pokaż tabelę turnieju</button>
            </section>
        </div>

        <div class="tournament-layout" data-room-stage="leaderboard" hidden>
            <section class="tournament-card leaderboard-card">
                <span class="eyebrow">Tabela turnieju</span>
                <h2 data-leaderboard-title>Wyniki po rundzie</h2>
                <ol class="score-list score-list--final" data-tournament-score-list></ol>
                <p class="quiz-waiting" data-leaderboard-waiting></p>
                <button class="primary-button" type="button" data-tournament-advance hidden>Następna runda</button>
            </section>
        </div>

        <div class="final-card" data-room-stage="results" hidden>
            <span class="eyebrow">Koniec turnieju</span>
            <h2 data-final-title>Wyniki turnieju</h2>
            <p data-final-summary>Oto wspólna tabela punktów z rozegranych rund.</p>
            <ol class="score-list score-list--final" data-final-score-list></ol>
            <div class="final-actions">
                <button class="small-button" type="button" data-copy-link>Kopiuj link</button>
                <button class="text-button" type="button" data-leave>Opuść pokój</button>
            </div>
        </div>
    </section>

    <p class="party-message" role="status" aria-live="polite" data-message></p>
</main>
<script src="party-display.js" defer></script>
<script src="party-app.js" defer></script>
</body>
</html>
