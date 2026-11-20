# Tryb Party — plan wdrożenia

## Cel

Tryb Party ma połączyć kilka krótkich gier w jeden turniej. Gracze dołączają telefonami za pomocą kodu pokoju albo linku, zdobywają punkty w kolejnych rundach, a na końcu widzą wspólną tabelę wyników.

Pierwsza wersja obsłuży dwa sposoby prowadzenia rozgrywki:

- **Wspólny ekran** — telewizor, laptop lub tablet pokazuje pytania, przebieg rundy i tabelę. Telefony służą jako kontrolery.
- **Same telefony** — każdy gracz widzi potrzebne informacje na swoim urządzeniu, bez dodatkowego ekranu.

## Decyzje techniczne

- Backend: PHP 8.1+ i MySQL, zgodnie z obecnym hostingiem.
- Baza Trybu Party jest wskazywana jawnie przez `PARTY_DB_*` lub lokalny `party/config.php`. Przy limicie jednej bazy wariant `config.shared.example.php` wymaga kopii i podania jej nazwy; bez tego wspólna baza pozostaje zablokowana. Po aktywacji poświadczenia są odczytywane z prywatnego `_server-config/server-config.php` używanego przez portal, a `DB_*` służą jako wariant dla hostów bez tego pliku. Moduł tworzy tabele `gk_party_*`, których nazwy nie kolidują ze starszymi `party_*`; nie dotyka też dawnego `runtime/party-games`. Przed pierwszym wywołaniem API trzeba sprawdzić kopię i docelową nazwę bazy.
- Synchronizacja: lekkie odpytywanie API co około 2 sekundy. WebSockety nie są wymagane na pierwszą wersję.
- Pokój: sześci znakowy kod bez mylących znaków, np. `7KPM2R`.
- Tożsamość: losowy token gracza. W bazie przechowywany jest wyłącznie jego skrót SHA-256.
- Czas życia pokoju: 12 godzin.
- Limit początkowy: 2–20 graczy, domyślnie 8.
- Gry będą modułami korzystającymi ze wspólnego pokoju, rund i punktacji.
- PWA będzie obejmować Gierkotekę i Tryb Party, ale połączenie z pokojem zawsze wymaga sieci.

## Etapy

### 1. Fundament pokoju — zaimplementowany lokalnie

- utworzenie pokoju przez gospodarza;
- wybór trybu: wspólny ekran albo same telefony;
- dołączenie kodem i linkiem;
- bezpieczne tokeny gospodarza i graczy;
- lista uczestników i podstawowa obecność online;
- ponowne wejście do pokoju z tego samego urządzenia;
- opuszczenie pokoju i automatyczne przekazanie roli gospodarza.

Stan: kod i test integracyjny są gotowe. Test na izolowanym MariaDB 10.4 objął gospodarza i trzy dodatkowe sesje, wykrycie braku aktywności, blokadę startu z graczem offline, powrót wszystkich sesji tym samym tokenem, gotowość, synchronizację oraz przekazanie gospodarza. Klient zachowuje pokój przy chwilowym braku sieci i ponawia połączenie z rosnącym odstępem. Weryfikacja na prawdziwych telefonach i produkcyjnej konfiguracji pozostaje osobnym krokiem.

### 2. Quiz — grywalna wersja lokalna

- kreator prostego zestawu pytań;
- pytanie i 2–4 odpowiedzi;
- osobny ekran gospodarza oraz widok telefonu gracza;
- limit czasu i blokada wielokrotnej odpowiedzi;
- punkty za poprawność oraz opcjonalny bonus za szybkość;
- ekran wyniku rundy.

Stan: działa zestaw pięciu pytań, zegar serwerowy, pojedyncza odpowiedź gracza, automatyczne zamknięcie pytania, punkty 1000–1500 za poprawną odpowiedź oraz ranking. Pełny test dwóch sesji przeszedł wszystkie pięć pytań, zapisał 10 odpowiedzi i pozostawił 0 nienaliczonych wyników.

Quiz będzie pierwszą grą, ponieważ najszybciej sprawdzi synchronizację, sterowanie telefonami, wynik rundy i ranking całego turnieju.

### 3. Silnik turnieju — grywalna wersja lokalna

- lista rund i wybór kolejności gier;
- stany: poczekalnia, przygotowanie, gra, wynik rundy, tabela, koniec;
- sumowanie punktów ze wszystkich gier;
- remis i dogrywka;
- możliwość wznowienia pokoju po odświeżeniu strony;
- podsumowanie końcowe.

Stan: turniej prowadzi graczy przez poczekalnię, przygotowanie rundy, aktywną grę, wynik rundy, tabelę i ekran końcowy. Gospodarz wybiera jedną lub dwie różne gry, ich kolejność oraz limit 10–60 sekund na odpowiedź. Plan zapisuje się w pokoju i jest widoczny dla graczy; zmiana planu przed startem wycofuje gotowość. Odświeżenie odtwarza bieżący stan, a wspólny adapter punktów sumuje wyniki wszystkich modułów. Ranking zachowuje wspólne miejsce przy remisie; osobna runda dogrywkowa pozostaje kolejnym rozszerzeniem.

### 4. Następne gry

Każda gra dostanie adapter zwracający punkty w tym samym formacie:

1. **Więcej czy mniej** — zaimplementowane lokalnie: pięć porównań, zegar, wynik odpowiedzi i wspólna punktacja.
2. **Czółko** — telefon gracza pokazuje hasło, pozostali udzielają podpowiedzi.
3. **Familiada** — gospodarz odsłania odpowiedzi i przyznaje punkty drużynom.

### 5. Szybkie dołączanie i PWA

- prawdziwy kod QR generowany lokalnie, bez wysyłania linku do obcej usługi;
- instalacja na ekranie głównym;
- pełny ekran dla wspólnego wyświetlacza;
- cache plików statycznych i czytelny komunikat po utracie sieci;
- blokada wygaszania ekranu tam, gdzie przeglądarka na to pozwala.

### 6. Stabilizacja i produkcja

- test dwóch przeglądarek i minimum czterech jednoczesnych graczy;
- walidacja wyścigów: dołączenie, start rundy, odpowiedź i koniec czasu;
- limity żądań i sprzątanie wygasłych pokoi;
- test telefonu, tabletu i wspólnego ekranu;
- kopia bazy przed uruchomieniem migracji na produkcji;
- wdrożenie najpierw jako kontrolowany test, potem udostępnienie kafelka wszystkim.

## Model danych

- `gk_party_rooms` — kod, tryb, status, gospodarz, aktualna gra, numer rundy i wersja stanu.
- `gk_party_players` — pokój, pseudonim, rola, kolor, miejsce, punkty i ostatnia aktywność.
- `gk_party_rounds` — gra, numer rundy, stan i dane modułu gry (etap 2/3).
- `gk_party_round_scores` — punkty gracza w konkretnej rundzie (etap 2/3).

## Kryterium pierwszej wersji testowej

Pierwszy kamień milowy jest gotowy, gdy gospodarz tworzy pokój, trzy telefony dołączają linkiem lub kodem, każdy widzi tę samą listę graczy, a po odświeżeniu wszyscy wracają do właściwego pokoju. Następnie dokładamy Quiz i dopiero na nim potwierdzamy naliczanie punktów.

## Test lokalny

Po uruchomieniu aplikacji z testową bazą można wykonać pełny przepływ poleceniem:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests\party_api_integration.ps1
```

Skrypt nie korzysta z produkcji. Tworzy cztery sesje, czeka na próg offline, sprawdza bezpieczny powrót każdej sesji, rozgrywa pięć pytań i pięć porównań, sprawdza oba wyniki rund, ranking końcowy oraz przekazanie roli gospodarza. Sprawdza też uprawnienia do zmiany planu, reset gotowości, pojedynczą rundę i limit 10 sekund. Test trwa około 30 sekund ze względu na kontrolowaną przerwę w aktywności. Na Windows można uruchomić `tests\run_party_api_local.ps1`, który tworzy tymczasową, odizolowaną bazę MariaDB i lokalny serwer PHP, wykonuje test, a następnie usuwa dane testowe.


### Weryfikacja wariantu Same telefony

Wariant pokazuje pytanie, osobisty wynik i ranking na każdym urządzeniu. Własny wpis w tabeli jest wyróżniony; remisy zachowują wspólne miejsce również w wyniku rundy. Gospodarz odpowiada i zdobywa punkty, a osobna sekcja sterowania pozwala wcześniej zamknąć pytanie oraz przechodzić dalej po wynikach.

Lokalny runner wykonuje pełny test API osobno dla `screen` i `phones`. Opcja `-BrowserTests` dodaje test interfejsu w czterech niezależnych sesjach mobilnych Chrome (szerokości 320–412 px): tworzenie i dołączanie przez formularze, gotowość, obie gry, odpowiedzi gospodarza i gości, osobiste wyniki, tabele i koniec turnieju, odświeżenie sesji oraz brak poziomego przewijania. Wymaga modułu Node `playwright` i zainstalowanego Chrome; `PARTY_BROWSER_CHANNEL` pozwala wybrać inny kanał, np. `msedge`.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests\run_party_api_local.ps1 -BrowserTests
```

Testy używają tymczasowej bazy i lokalnego serwera. Weryfikacja na fizycznych telefonach oraz wdrożenie produkcyjne pozostają osobnymi krokami.
