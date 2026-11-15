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
                <strong>Pierwszy etap</strong>
                <span>Pokój i gracze są gotowi do testów. Pierwszą grą będzie Quiz.</span>
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
                        <span><strong>Same telefony</strong><small>Nie potrzebujesz dodatkowego ekranu.</small></span>
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
                <button type="button" class="small-button" data-copy-link>Kopiuj link</button>
                <button type="button" class="small-button quiet" data-install hidden>Zainstaluj</button>
            </div>
        </div>

        <div class="room-layout">
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
            </section>

            <aside class="host-card">
                <span class="eyebrow">Ustawienia pokoju</span>
                <h2 data-mode-title>Wspólny ekran</h2>
                <p data-mode-description>Telewizor lub laptop pokaże pytania i tabelę, a telefony będą kontrolerami.</p>
                <div class="next-step">
                    <span>Następny etap</span>
                    <strong>Quiz</strong>
                    <p>Pytania, odpowiedzi, limit czasu i pierwsza wspólna punktacja.</p>
                </div>
                <button class="primary-button" type="button" disabled data-start-button>Start turnieju — wkrótce</button>
                <button class="text-button" type="button" data-leave>Opuść pokój</button>
            </aside>
        </div>
    </section>

    <p class="party-message" role="status" aria-live="polite" data-message></p>
</main>
<script src="party.js" defer></script>
</body>
</html>
