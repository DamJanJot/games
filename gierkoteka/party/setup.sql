CREATE TABLE IF NOT EXISTS party_rooms (
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
    INDEX idx_party_rooms_expires (expires_at),
    INDEX idx_party_rooms_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_polish_ci;

CREATE TABLE IF NOT EXISTS party_players (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    room_id BIGINT UNSIGNED NOT NULL,
    token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
    nickname VARCHAR(24) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'player',
    color CHAR(7) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    seat SMALLINT UNSIGNED NOT NULL,
    score_total INT NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'connected',
    last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_party_players_room FOREIGN KEY (room_id) REFERENCES party_rooms(id) ON DELETE CASCADE,
    UNIQUE KEY uniq_party_player_seat (room_id, seat),
    INDEX idx_party_players_room_status (room_id, status),
    INDEX idx_party_players_last_seen (last_seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_polish_ci;
