<?php
declare(strict_types=1);

function party_parse_env_file(string $path): array
{
    if (!is_file($path)) {
        return [];
    }

    $values = [];
    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if (!$lines) {
        return [];
    }

    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#')) {
            continue;
        }

        $separator = strpos($line, '=');
        if ($separator === false) {
            continue;
        }

        $key = trim(substr($line, 0, $separator));
        $value = trim(substr($line, $separator + 1));
        if ($value !== '' && (($value[0] === '"' && str_ends_with($value, '"')) || ($value[0] === "'" && str_ends_with($value, "'")))) {
            $value = substr($value, 1, -1);
        }

        $values[$key] = $value;
    }

    return $values;
}

function party_env_value(string $key, array $fileValues, ?string $default = null): ?string
{
    $value = $_ENV[$key] ?? $_SERVER[$key] ?? getenv($key);
    if ($value === false || $value === null || $value === '') {
        $value = $fileValues[$key] ?? null;
    }

    return $value === null || $value === '' ? $default : (string)$value;
}

function party_server_config_values(): ?array
{
    $path = dirname(__DIR__, 2) . '/_server-config/server-config.php';
    if (!is_file($path)) {
        return null;
    }

    $values = require $path;
    if (!is_array($values)) {
        throw new RuntimeException('Invalid private server configuration.');
    }

    return $values;
}

function party_connect(array $config): PDO
{
    $port = max(1, min(65535, (int)($config['db_port'] ?? 3306)));
    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
        $config['db_host'],
        $port,
        $config['db_name']
    );

    $pdo = new PDO($dsn, $config['db_user'], $config['db_pass'] ?? '', [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    $pdo->exec('SET NAMES utf8mb4 COLLATE utf8mb4_polish_ci');

    return $pdo;
}

function party_get_pdo(): array
{
    $fileValues = party_parse_env_file(dirname(__DIR__, 2) . '/.env');
    try {
        $serverValues = party_server_config_values();
    } catch (Throwable $error) {
        return ['pdo' => null, 'error' => 'Nie udało się odczytać prywatnej konfiguracji serwera.'];
    }
    $localConfig = __DIR__ . '/config.php';
    if (is_file($localConfig)) {
        try {
            $config = require $localConfig;
            if (is_array($config) && ($config['use_shared_db'] ?? false) === true) {
                $sharedConfig = party_shared_db_config($fileValues, (string)($config['shared_db_name'] ?? ''), $serverValues);
                if ($sharedConfig === null) {
                    return ['pdo' => null, 'error' => 'Konfiguracja wspólnej bazy Trybu Party jest niezgodna.'];
                }
                return ['pdo' => party_connect($sharedConfig), 'error' => null];
            }
            if (is_array($config) && !empty($config['db_host']) && !empty($config['db_name']) && !empty($config['db_user'])) {
                if (party_uses_shared_db($config, $fileValues, $serverValues)) {
                    return ['pdo' => null, 'error' => 'Baza Trybu Party musi być inna niż wspólna baza aplikacji.'];
                }
                return ['pdo' => party_connect($config), 'error' => null];
            }
        } catch (Throwable $error) {
            return ['pdo' => null, 'error' => 'Nie udało się połączyć z bazą przez party/config.php.'];
        }
    }

    $config = party_dedicated_db_config($fileValues);
    if ($config === null) {
        return ['pdo' => null, 'error' => 'Brakuje osobnej konfiguracji bazy dla Trybu Party.'];
    }
    if (party_uses_shared_db($config, $fileValues, $serverValues)) {
        return ['pdo' => null, 'error' => 'Baza Trybu Party musi być inna niż wspólna baza aplikacji.'];
    }

    try {
        return ['pdo' => party_connect($config), 'error' => null];
    } catch (Throwable $error) {
        return ['pdo' => null, 'error' => 'Nie udało się połączyć z bazą Trybu Party.'];
    }
}

function party_dedicated_db_config(array $fileValues): ?array
{
    // Dedicated settings never fall back to DB_*; shared mode requires an explicit config.php.
    $host = party_env_value('PARTY_DB_HOST', $fileValues);
    $port = party_env_value('PARTY_DB_PORT', $fileValues, '3306');
    $name = party_env_value('PARTY_DB_NAME', $fileValues);
    $user = party_env_value('PARTY_DB_USER', $fileValues);
    $pass = party_env_value('PARTY_DB_PASS', $fileValues, '');

    if (!$host || !$name || !$user) {
        return null;
    }

    return [
        'db_host' => $host,
        'db_port' => (int)$port,
        'db_name' => $name,
        'db_user' => $user,
        'db_pass' => $pass,
    ];
}

function party_uses_shared_db(array $config, array $fileValues, ?array $serverValues = null): bool
{
    $partyName = trim((string)($config['db_name'] ?? ''));
    if ($partyName === '') {
        return false;
    }
    foreach ([party_env_value('DB_NAME', $fileValues), $serverValues['DB_NAME'] ?? null] as $sharedName) {
        if ($sharedName !== null && strcasecmp($partyName, trim((string)$sharedName)) === 0) {
            return true;
        }
    }
    return false;
}

function party_shared_db_config(array $fileValues, string $expectedName, ?array $serverValues = null): ?array
{
    $value = static function (string $key, ?string $default = null) use ($fileValues, $serverValues): ?string {
        if ($serverValues === null) {
            return party_env_value($key, $fileValues, $default);
        }
        $raw = $serverValues[$key] ?? null;
        return $raw === null || $raw === '' ? $default : (string)$raw;
    };

    $name = $value('DB_NAME');
    $host = $value('DB_HOST');
    $user = $value('DB_USER');
    if ($name === null || $host === null || $user === null
        || $expectedName === '' || strcasecmp(trim($name), trim($expectedName)) !== 0) {
        return null;
    }

    return [
        'db_host' => $host,
        'db_port' => (int)$value('DB_PORT', '3306'),
        'db_name' => $name,
        'db_user' => $user,
        'db_pass' => $value('DB_PASS', ''),
    ];
}

// DDL is executed explicitly by the administrator, never by an API request.
function party_schema_statements(): array
{
    return array_values(array_filter(array_map('trim', explode(';', file_get_contents(__DIR__ . '/setup.sql')))));
}

function party_ensure_schema(PDO $pdo): void
{
    foreach (party_schema_statements() as $statement) {
        $pdo->exec($statement);
    }
}

function party_check_schema(PDO $pdo): void
{
    // Read every declared column. No CREATE/ALTER privileges are needed by the API.
    foreach (party_schema_statements() as $statement) {
        preg_match('/CREATE TABLE IF NOT EXISTS (gk_party_[a-z_]+) \((.*)\) ENGINE=/s', $statement, $table);
        if (!$table) {
            throw new RuntimeException('Invalid Party schema definition.');
        }
        preg_match_all('/^    ([a-z][a-z_]+) [A-Z]/m', $table[2], $columns);
        $pdo->query('SELECT ' . implode(', ', $columns[1]) . ' FROM ' . $table[1] . ' LIMIT 0');
    }
}
