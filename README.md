# Gieroteka

Zbiór przeglądarkowych gier i eksperymentów logicznych. Repozytorium zawiera statyczną Gierotekę oraz sieciową wersję gry Makao opartą na PHP i bazie danych.

![Gieroteka](https://github.com/user-attachments/assets/916ca4f7-6be6-4825-87fd-c4a70cbb0a93)

## Podgląd

[Otwórz Gierotekę](https://code-d.j.pl/game/)

## Zawartość

- `gierkoteka/` — hub gier napisany w HTML, CSS i JavaScript
- `gierkoteka/party/` — rozwijana poczekalnia turniejowa z pokojami, kodami zaproszeń i synchronizacją graczy
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

Tryb Party wymaga PHP i MySQL. Może użyć tych samych zmiennych `DB_*` co Makao albo osobnych `PARTY_DB_*`. Plan kolejnych etapów znajduje się w [`docs/PARTY_MODE_ROADMAP.md`](docs/PARTY_MODE_ROADMAP.md).

## Technologie

HTML, CSS, JavaScript, PHP i MySQL.

## Licencja

Projekt jest dostępny na licencji [MIT](LICENSE).
