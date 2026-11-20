# Procedura przedprodukcyjna Party

Ta procedura przygotowuje zmianę do sprawdzenia. Nie stanowi zgody na połączenie
z produkcją, migrację ani wdrożenie. Faktyczne wykonanie produkcyjne wymaga
osobnego zatwierdzenia operatora. Jeżeli projekt jest objęty Centrum wdrożeń,
zadanie pozostaje do sprawdzenia do potwierdzonego wdrożenia produkcyjnego.

## Jawny schemat

Jedynym źródłem DDL jest `gierkoteka/party/setup.sql`: sześć tabel `gk_party_*`,
InnoDB, utf8mb4, indeksy, klucze obce i ograniczenia unikalności. API sprawdza
dostępność kolumn przez SELECT, bez CREATE/ALTER; brak schematu daje HTTP 503
`schema_unavailable`. Konto aplikacji powinno mieć tylko SELECT/INSERT/UPDATE/DELETE
na tych sześciu tabelach. Nie przyznawać mu CREATE, ALTER, DROP ani dostępu do
pozostałych danych wspólnej bazy.

`scripts/party_db.py` używa wyłącznie jawnego pliku klienta. Nie odczytuje `.env`,
`party/config.php`, `_server-config` ani zmiennych `DB_*` i `PARTY_DB_*`.
Wymaga Python 3.11+, klienta MariaDB `mysql` i `mysqldump` z tej samej wersji co serwer.
Testowy runner wymaga Windows i `mysql_install_db.exe`, `mysqld.exe`, `mysqladmin.exe`.

## Przygotowanie izolowanej próby

1. Uruchom tymczasową instancję MariaDB na 127.0.0.1 z nowym katalogiem danych,
   losowym portem, `--no-defaults` i `--event-scheduler=OFF`. Nie używaj tunelu do
   produkcji, usługi współdzielonej ani istniejącego katalogu danych. W przykładach
   źródłem jest wyłącznie testowa `gk_party_source_test`.
2. Utwórz poza repozytorium i katalogiem WWW prywatny plik `source.cnf`:

   ```ini
   [client]
   host=127.0.0.1
   port=PORT_TYMCZASOWEJ_INSTANCJI
   user=UZYTKOWNIK_TESTOWY
   password=HASLO_TESTOWE
   ```

   Zastąp wartości testowymi ustawieniami. Uprawnienia pliku i katalogu kopii:
   wyłącznie operator (na Windows jawny ACL, na Unix katalog 0700, plik 0600).
   Nie umieszczaj plików ani zrzutów w repozytorium, logach lub ticketach.
   Hasło nie trafia do argumentów klienta. Wymagane są jawne host, port i user;
   akceptowany jest wyłącznie minimalny dział `[client]`.
3. Zablokuj wszystkich zapisujących klientów i DDL na czas całej procedury,
   również dla innych modułów współdzielonej bazy. Zachowaj blokadę od kopii
   do decyzji po migracji. `--maintenance-confirmed` jest deklaracją operatora,
   skrypt sam nie wprowadza trybu serwisowego. Bez zatrzymania zapisów nie kontynuuj.

## Kopia, odtworzenie, migracja

Polecenia PowerShell dotyczą wyłącznie izolowanej instancji testowej:

```powershell
$tool = 'scripts/party_db.py'
$clientBin = 'C:\xampp\mysql\bin'
$sourceConfig = 'C:\private\party-test\source.cnf'
$restoreConfig = 'C:\private\party-test\restore.cnf'
$backupDir = 'C:\private\party-test\backup-before'

python $tool backup --defaults-file $sourceConfig --client-bin $clientBin --database gk_party_source_test --backup $backupDir --maintenance-confirmed
python $tool restore --defaults-file $restoreConfig --client-bin $clientBin --database gk_party_restore_before --confirm-database gk_party_restore_before --backup $backupDir --isolated-server-confirmed
python $tool migrate --defaults-file $sourceConfig --client-bin $clientBin --database gk_party_source_test --confirm-database gk_party_source_test --backup $backupDir --maintenance-confirmed
```

Po KAŻDYM poleceniu wymagany jest kod wyjścia 0. Przy innym kodzie zatrzymaj
procedurę. `restore.cnf` wskazuje wyłącznie tymczasową instancję na 127.0.0.1
(może to być ta sama izolowana instancja co źródło testowe), z wyłączonym
harmonogramem zdarzeń i kontem administracyjnym tylko tej instancji.
Nie wolno podstawić konfiguracji produkcyjnej do restore.

Kopia obejmuje całą wybraną bazę, także tabele spoza Party, widoki, triggery,
procedury i zdarzenia. Obejmuje schemat i dane; nie obejmuje kont serwera,
grantów, konfiguracji serwera ani binlogów/PITR. Granty i konfigurację zabezpiecz
osobno według procedury administratora. `--single-transaction` zapewnia spójność
InnoDB; skrypt odrzuca inne silniki. Używa też hex BLOB i uporządkowanych INSERT.
Nie dopisuje DROP TABLE. Katalog kopii musi być nowy; nie nadpisuje istniejących kopii.
Kopia zawiera dane osobowe i hashe sesji: przechowuj ją na szyfrowanym nośniku
z ograniczonym dostępem i retencją ustaloną przez administratora.

`database.sql` i `manifest.json` powstają przed zmianą. Manifest zawiera SHA-256,
tożsamość źródła i skrót `setup.sql`. Odtworzenie wymaga nowej bazy o nazwie
`gk_party_restore_*`, innej niż źródło; istniejący cel jest odrzucany nawet gdy pusty.
Nie zmienia pliku zrzutu ani nazw obiektów przez zastępowanie tekstu.
Po imporcie ponowny pełny zrzut musi mieć identyczny SHA-256. Dopiero wtedy
powstaje `restore-verified.json`, wymagany do migracji. Weryfikację można powtórzyć:

```powershell
python $tool verify --defaults-file $restoreConfig --client-bin $clientBin --database gk_party_restore_before --backup $backupDir
```

Nie traktuj samego istnienia pliku kopii ani powodzenia importu jako testu kopii.
Kontrola obejmuje definicje i dane dzięki ponownemu zrzutowi. Zależności widoków
i procedur od innych baz, DEFINER, rozszerzenia lub różnice wersji wymagają
osobnego przeglądu administratora. Nie poprawiaj zrzutu, aby wymusić zgodność.
Pełna weryfikacja zależności biznesowych może wymagać dodatkowych testów aplikacji.

Migracja sprawdza kopię i potwierdzenie restore, zgodność konfiguracji źródła,
niezmieniony schemat SQL i niezmienione dane źródłowe. Zastane tabele `gk_party_*`
powodują zatrzymanie i konieczność przeglądu, także po przerwanym zastosowaniu DDL.
Nie nadpisuje ich. `setup.sql` zawiera wyłącznie CREATE TABLE IF NOT EXISTS;
nie ma DROP/DELETE/ALTER. MySQL/MariaDB zatwierdza DDL niejawnie, dlatego nie
zakładaj transakcyjnego cofnięcia całego pliku. Istniejących `party_*`, Makao
i innych danych nie zmienia się. Ręczne ponowienie SQL wymaga przeglądu zgodności
zastanego schematu; IF NOT EXISTS nie naprawia starej lub niezgodnej tabeli.

Po migracji sprawdź liczbę tabel, granty, API, utworzenie pokoju, dołączenie,
wyniki obu gier i zachowanie danych innych modułów. Zrób osobną kopię po migracji
i sprawdź ją tak samo przez restore w kolejnej nowej bazie. Zapisz wersję MariaDB,
commit, skróty kopii, czas próby, kody wyjścia i wyniki bez sekretów. Dopiero
wyniki tych kontroli są materiałem do osobnego zatwierdzenia wykonania produkcyjnego.

## Wycofanie bez usuwania danych

1. Zablokuj ruch do Party i wszystkie jego zapisy. Przy wspólnej bazie nie
   uruchamiaj automatycznego sprzątania ani skryptu cofającego schemat.
2. Zachowaj aktualną bazę i wykonaj dodatkową pełną kopię stanu po błędzie.
   Nie importuj starej kopii nad obecną bazą: utraciłoby to nowsze dane.
3. Wycofaj udostępnienie Party/kafelek i skierowanie do API. Przywrócenie
   poprzedniego wydania aplikacji wymaga oddzielnej decyzji; poprzednie API
   mogło samo wykonywać DDL. Pozostaw wszystkie tabele `gk_party_*` i inne dane.
   Pozostałe moduły mogą działać po sprawdzeniu przez operatora.
4. Jeśli potrzebne jest odtworzenie, wykonaj je wyłącznie do nowej, osobnej,
   izolowanej bazy. Zweryfikuj kopię i porównaj ją z zachowanym stanem po błędzie.
   Uzgodnij przeniesienie nowszych zapisów i wskaż ewentualną utratę danych.
5. Ewentualne przełączenie aplikacji do odtworzonej bazy i wznowienie zapisów
   wymaga osobnego zatwierdzenia. Zachowaj bazę pierwotną, kopie i dziennik decyzji.
   Ta procedura nie zawiera usuwania danych ani automatycznego przełączenia.

## Testy powtarzalne

```powershell
python -B tests/party_db_integration.py --mariadb-bin C:\xampp\mysql\bin
php tests/party_lib_test.php
powershell -NoProfile -ExecutionPolicy Bypass -File tests/run_party_api_local.ps1
```

Pierwszy test sam tworzy nowy katalog tymczasowy, losowe hasło i port, uruchamia
MariaDB wyłącznie na loopback bez domyślnej konfiguracji i z wyłączonym event
scheduler. Nie ładuje konfiguracji aplikacji ani produkcji. Sprawdza kopię
przed migracją i po niej, dane sześciu tabel Party oraz innych modułów, Unicode,
BLOB, widok, procedurę, zdarzenie, trigger, FK/UNIQUE, ochronę istniejącego celu,
uszkodzoną i nieaktualną kopię, odrzucenie silnika MyISAM, zdalnego celu i
niepoprawnych opcji oraz kontrolę schematu kontem bez DDL. Testuje też rzeczywiste
HTTP 503 bez schematu i przejście do kontroli sesji HTTP 401 z poprawnym schematem.
Po teście
zamyka tylko własny proces i usuwa wyłącznie własny katalog tymczasowy.
Runner API również przygotowuje jawny schemat przed uruchomieniem HTTP.
