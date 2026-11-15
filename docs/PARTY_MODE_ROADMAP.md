# Tryb Party — plan wdrożenia

## Cel

Tryb Party ma połączyć kilka krótkich gier w jeden turniej. Gracze dołączają telefonami za pomocą kodu pokoju albo linku, zdobywają punkty w kolejnych rundach, a na końcu widzą wspólną tabelę wyników.

Pierwsza wersja obsłuży dwa sposoby prowadzenia rozgrywki:

- **Wspólny ekran** — telewizor, laptop lub tablet pokazuje pytania, przebieg rundy i tabelę. Telefony służą jako kontrolery.
- **Same telefony** — każdy gracz widzi potrzebne informacje na swoim urządzeniu, bez dodatkowego ekranu.

## Decyzje techniczne

- Backend: PHP 8.1+ i MySQL, zgodnie z obecnym hostingiem.
- Synchronizacja: lekkie odpytywanie API co około 2 sekundy. WebSockety nie są wymagane na pierwszą wersję.
- Pokój: sześci znakowy kod bez mylących znaków, np. `7KPM2R`.
- Tożsamość: losowy token gracza. W bazie przechowywany jest wyłącznie jego skrót SHA-256.
- Czas życia pokoju: 12 godzin.
- Limit początkowy: 2–20 graczy, domyślnie 8.
- Gry będą modułami korzystającymi ze wspólnego pokoju, rund i punktacji.
- PWA będzie obejmować Gierkotekę i Tryb Party, ale połączenie z pokojem zawsze wymaga sieci.

## Etapy

### 1. Fundament pokoju — rozpoczęty

- utworzenie pokoju przez gospodarza;
- wybór trybu: wspólny ekran albo same telefony;
- dołączenie kodem i linkiem;
- bezpieczne tokeny gospodarza i graczy;
- lista uczestników i podstawowa obecność online;
- ponowne wejście do pokoju z tego samego urządzenia;
- opuszczenie pokoju i automatyczne przekazanie roli gospodarza.

### 2. Quiz — pierwszy pełny test

- kreator prostego zestawu pytań;
- pytanie i 2–4 odpowiedzi;
- osobny ekran gospodarza oraz widok telefonu gracza;
- limit czasu i blokada wielokrotnej odpowiedzi;
- punkty za poprawność oraz opcjonalny bonus za szybkość;
- ekran wyniku rundy.

Quiz będzie pierwszą grą, ponieważ najszybciej sprawdzi synchronizację, sterowanie telefonami, wynik rundy i ranking całego turnieju.

### 3. Silnik turnieju

- lista rund i wybór kolejności gier;
- stany: poczekalnia, przygotowanie, gra, wynik rundy, tabela, koniec;
- sumowanie punktów ze wszystkich gier;
- remis i dogrywka;
- możliwość wznowienia pokoju po odświeżeniu strony;
- podsumowanie końcowe.

### 4. Następne gry

Każda gra dostanie adapter zwracający punkty w tym samym formacie:

1. **Więcej czy mniej** — szybki drugi moduł, mało treści i prosty wynik.
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

- `party_rooms` — kod, tryb, status, gospodarz, aktualna gra, numer rundy i wersja stanu.
- `party_players` — pokój, pseudonim, rola, kolor, miejsce, punkty i ostatnia aktywność.
- `party_rounds` — gra, numer rundy, stan i dane modułu gry (etap 2/3).
- `party_round_scores` — punkty gracza w konkretnej rundzie (etap 2/3).

## Kryterium pierwszej wersji testowej

Pierwszy kamień milowy jest gotowy, gdy gospodarz tworzy pokój, trzy telefony dołączają linkiem lub kodem, każdy widzi tę samą listę graczy, a po odświeżeniu wszyscy wracają do właściwego pokoju. Następnie dokładamy Quiz i dopiero na nim potwierdzamy naliczanie punktów.
