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

function party_ensure_schema(PDO $pdo): void
{
    $pdo->exec(<<<'SQL'
CREATE TABLE IF NOT EXISTS gk_party_rooms (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    room_code CHAR(6) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'lobby',
    play_mode VARCHAR(20) NOT NULL DEFAULT 'screen',
    host_player_id BIGINT UNSIGNED NULL,
    current_game_key VARCHAR(40) NULL,
    round_number INT UNSIGNED NOT NULL DEFAULT 0,
    state_version BIGINT UNSIGNED NOT NULL DEFAULT 1,
    max_players TINYINT UNSIGNED NOT NULL DEFAULT 8,
    settings_json JSON NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_gk_party_rooms_expires (expires_at),
    INDEX idx_gk_party_rooms_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_polish_ci
SQL);

    $pdo->exec(<<<'SQL'
CREATE TABLE IF NOT EXISTS gk_party_players (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    room_id BIGINT UNSIGNED NOT NULL,
    token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
    nickname VARCHAR(24) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'player',
    color CHAR(7) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    seat SMALLINT UNSIGNED NOT NULL,
    score_total INT NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'connected',
    is_ready TINYINT(1) NOT NULL DEFAULT 0,
    last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_gk_party_players_room FOREIGN KEY (room_id) REFERENCES gk_party_rooms(id) ON DELETE CASCADE,
    UNIQUE KEY uniq_party_player_seat (room_id, seat),
    INDEX idx_gk_party_players_room_status (room_id, status),
    INDEX idx_gk_party_players_last_seen (last_seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_polish_ci
SQL);

    $pdo->exec(<<<'SQL'
CREATE TABLE IF NOT EXISTS gk_party_rounds (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    room_id BIGINT UNSIGNED NOT NULL,
    round_number INT UNSIGNED NOT NULL,
    game_key VARCHAR(40) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    current_step INT UNSIGNED NOT NULL DEFAULT 0,
    config_json JSON NULL,
    state_json JSON NULL,
    started_at DATETIME(3) NULL,
    ends_at DATETIME(3) NULL,
    finished_at DATETIME(3) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_gk_party_rounds_room FOREIGN KEY (room_id) REFERENCES gk_party_rooms(id) ON DELETE CASCADE,
    UNIQUE KEY uniq_party_room_round (room_id, round_number),
    INDEX idx_gk_party_rounds_room_status (room_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_polish_ci
SQL);

    $pdo->exec(<<<'SQL'
CREATE TABLE IF NOT EXISTS gk_party_round_scores (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    round_id BIGINT UNSIGNED NOT NULL,
    player_id BIGINT UNSIGNED NOT NULL,
    points INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_gk_party_round_scores_round FOREIGN KEY (round_id) REFERENCES gk_party_rounds(id) ON DELETE CASCADE,
    CONSTRAINT fk_gk_party_round_scores_player FOREIGN KEY (player_id) REFERENCES gk_party_players(id) ON DELETE CASCADE,
    UNIQUE KEY uniq_party_round_player_score (round_id, player_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_polish_ci
SQL);

    $pdo->exec(<<<'SQL'
CREATE TABLE IF NOT EXISTS gk_party_quiz_answers (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    round_id BIGINT UNSIGNED NOT NULL,
    player_id BIGINT UNSIGNED NOT NULL,
    question_index INT UNSIGNED NOT NULL,
    answer_index TINYINT UNSIGNED NOT NULL,
    is_correct TINYINT(1) NOT NULL DEFAULT 0,
    points INT NOT NULL DEFAULT 0,
    points_applied TINYINT(1) NOT NULL DEFAULT 0,
    response_ms INT UNSIGNED NOT NULL DEFAULT 0,
    answered_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_gk_party_quiz_answers_round FOREIGN KEY (round_id) REFERENCES gk_party_rounds(id) ON DELETE CASCADE,
    CONSTRAINT fk_gk_party_quiz_answers_player FOREIGN KEY (player_id) REFERENCES gk_party_players(id) ON DELETE CASCADE,
    UNIQUE KEY uniq_party_quiz_answer (round_id, player_id, question_index),
    INDEX idx_party_quiz_question (round_id, question_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_polish_ci
SQL);

    $pdo->exec(<<<'SQL'
CREATE TABLE IF NOT EXISTS gk_party_higher_lower_answers (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    round_id BIGINT UNSIGNED NOT NULL,
    player_id BIGINT UNSIGNED NOT NULL,
    card_index INT UNSIGNED NOT NULL,
    choice_value VARCHAR(10) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    is_correct TINYINT(1) NOT NULL DEFAULT 0,
    points INT NOT NULL DEFAULT 0,
    points_applied TINYINT(1) NOT NULL DEFAULT 0,
    response_ms INT UNSIGNED NOT NULL DEFAULT 0,
    answered_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_gk_party_higher_lower_answers_round FOREIGN KEY (round_id) REFERENCES gk_party_rounds(id) ON DELETE CASCADE,
    CONSTRAINT fk_gk_party_higher_lower_answers_player FOREIGN KEY (player_id) REFERENCES gk_party_players(id) ON DELETE CASCADE,
    UNIQUE KEY uniq_party_higher_lower_answer (round_id, player_id, card_index),
    INDEX idx_party_higher_lower_card (round_id, card_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_polish_ci
SQL);
}
