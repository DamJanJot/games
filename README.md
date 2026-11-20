# Gieroteka

Zbiór przeglądarkowych gier i eksperymentów logicznych. Repozytorium zawiera statyczną Gierotekę oraz sieciową wersję gry Makao opartą na PHP i bazie danych.

![Gieroteka](https://github.com/user-attachments/assets/916ca4f7-6be6-4825-87fd-c4a70cbb0a93)

## Podgląd

[Otwórz Gierotekę](https://code-d.j.pl/game/)

## Zawartość

- `gierkoteka/` — hub gier napisany w HTML, CSS i JavaScript
- `gierkoteka/party/` — poczekalnia i turniej z jedną lub dwiema rundami (Quiz, Więcej czy mniej), wyborem kolejności i czasu odpowiedzi, wspólną punktacją oraz odzyskiwaniem sesji po utracie sieci
- Sudoku
- Pasjans
- gry logiczne Blocks, Lines i Arrows
- `makao/` — gra karciana z backendem PHP, API i zapisem stanu w MySQL

## Uruchomienie lokalne

Gieroteka nie wymaga procesu budowania. Uruchom lokalny serwer w katalogu repozytorium:

```bash
php -S localhost:8000
```

Następnie otwórz `http://localhost:8000/gierkoteka/`.

Makao wymaga PHP, MySQL oraz lokalnego pliku konfiguracyjnego utworzonego na podstawie `makao/config.example.php`. Schemat bazy znajduje się w `makao/setup.sql`.

Tryb Party wymaga PHP i bazy MySQL. Preferuje osobną bazę wskazaną przez `PARTY_DB_*` (opcjonalnie `PARTY_DB_PORT`) albo niewersjonowany `gierkoteka/party/config.php`. Jeśli hosting dopuszcza tylko jedną bazę, można po wykonaniu kopii użyć wariantu z `config.shared.example.php`: plik `config.php` musi jawnie wskazywać nazwę bazy z kopii. W tym trybie dane połączenia są pobierane najpierw z prywatnego `_server-config/server-config.php` używanego przez portal; dopiero gdy tego pliku nie ma, z `DB_*`. Schemat Party obejmuje wyłącznie własne tabele `gk_party_*`; istniejących `party_*` ani starszego katalogu `runtime/party-games` nie używa. Bez jawnej konfiguracji wspólna baza jest zablokowana. Przed uruchomieniem API administrator jawnie stosuje `gierkoteka/party/setup.sql` po sprawdzeniu kopii przez odtworzenie w osobnej bazie. API nie wykonuje DDL; brak schematu zwraca 503. Procedura i test izolowanego backup/restore: [`docs/PARTY_PREPRODUCTION.md`](docs/PARTY_PREPRODUCTION.md). Plan kolejnych etapów znajduje się w [`docs/PARTY_MODE_ROADMAP.md`](docs/PARTY_MODE_ROADMAP.md).

## Technologie

HTML, CSS, JavaScript, PHP i MySQL.

## Licencja

Projekt jest dostępny na licencji [MIT](LICENSE).
