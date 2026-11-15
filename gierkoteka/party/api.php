<?php
declare(strict_types=1);

require __DIR__ . '/lib.php';
require __DIR__ . '/bootstrap.php';

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');

$connection = party_get_pdo();
if (!$connection['pdo'] instanceof PDO) {
    party_fail($connection['error'] ?? 'Baza Trybu Party jest niedostępna.', 503, 'database_unavailable');
}

$pdo = $connection['pdo'];
try {
    party_ensure_schema($pdo);
} catch (Throwable $error) {
    party_fail('Nie udało się przygotować tabel Trybu Party.', 503, 'schema_unavailable');
}

$action = trim((string)($_GET['action'] ?? 'state'));
$body = party_read_json_body();

try {
    if ($action === 'create' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        party_create_room($pdo, $body);
    }

    if ($action === 'join' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        party_join_room($pdo, $body);
    }

    if ($action === 'state' && $_SERVER['REQUEST_METHOD'] === 'GET') {
        party_get_state($pdo);
    }

    if ($action === 'heartbeat' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        party_heartbeat($pdo, $body);
    }

    if ($action === 'leave' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        party_leave_room($pdo, $body);
    }

    party_fail('Nieznana akcja API.', 404, 'unknown_action');
} catch (PDOException $error) {
    party_fail('Wystąpił błąd bazy. Spróbuj ponownie.', 500, 'database_error');
} catch (Throwable $error) {
    party_fail('Nie udało się wykonać operacji.', 500, 'server_error');
}

function party_create_room(PDO $pdo, array $body): never
{
    $nickname = party_normalize_nickname((string)($body['nickname'] ?? ''));
    if ($message = party_validate_nickname($nickname)) {
        party_fail($message, 422, 'invalid_nickname');
    }

    $mode = (string)($body['mode'] ?? 'screen');
    if (!in_array($mode, ['screen', 'phones'], true)) {
        party_fail('Wybierz poprawny tryb rozgrywki.', 422, 'invalid_mode');
    }

    $maxPlayers = max(2, min(20, (int)($body['max_players'] ?? 8)));
    $token = party_random_token();

    $pdo->beginTransaction();
    try {
        $roomCode = party_generate_room_code(function (string $candidate) use ($pdo): bool {
            $query = $pdo->prepare('SELECT 1 FROM party_rooms WHERE room_code = ? LIMIT 1');
            $query->execute([$candidate]);
            return (bool)$query->fetchColumn();
        });

        $roomQuery = $pdo->prepare(
            "INSERT INTO party_rooms (room_code, play_mode, max_players, expires_at)
             VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 12 HOUR))"
        );
        $roomQuery->execute([$roomCode, $mode, $maxPlayers]);
        $roomId = (int)$pdo->lastInsertId();

        $playerQuery = $pdo->prepare(
            "INSERT INTO party_players (room_id, token_hash, nickname, role, color, seat)
             VALUES (?, ?, ?, 'host', ?, 0)"
        );
        $playerQuery->execute([$roomId, party_hash_token($token), $nickname, party_player_color(0)]);
        $playerId = (int)$pdo->lastInsertId();

        $hostQuery = $pdo->prepare('UPDATE party_rooms SET host_player_id = ? WHERE id = ?');
        $hostQuery->execute([$playerId, $roomId]);
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $error;
    }

    $session = party_load_session($pdo, $roomCode, $token);
    party_json([
        'ok' => true,
        'token' => $token,
        'state' => party_state_payload($pdo, $session),
    ], 201);
}

function party_join_room(PDO $pdo, array $body): never
{
    $roomCode = party_normalize_room_code((string)($body['room_code'] ?? ''));
    $nickname = party_normalize_nickname((string)($body['nickname'] ?? ''));

    if (strlen($roomCode) !== 6) {
        party_fail('Kod pokoju powinien mieć 6 znaków.', 422, 'invalid_room_code');
    }

    if ($message = party_validate_nickname($nickname)) {
        party_fail($message, 422, 'invalid_nickname');
    }

    $token = party_random_token();
    $pdo->beginTransaction();
    try {
        $roomQuery = $pdo->prepare('SELECT * FROM party_rooms WHERE room_code = ? FOR UPDATE');
        $roomQuery->execute([$roomCode]);
        $room = $roomQuery->fetch();
        if (!$room || strtotime((string)$room['expires_at']) <= time()) {
            party_fail('Ten pokój nie istnieje albo już wygasł.', 404, 'room_not_found');
        }
        if ($room['status'] !== 'lobby') {
            party_fail('Rozgrywka już się rozpoczęła.', 409, 'room_already_started');
        }

        $countQuery = $pdo->prepare("SELECT COUNT(*) FROM party_players WHERE room_id = ? AND status = 'connected'");
        $countQuery->execute([(int)$room['id']]);
        if ((int)$countQuery->fetchColumn() >= (int)$room['max_players']) {
            party_fail('W tym pokoju nie ma już wolnych miejsc.', 409, 'room_full');
        }

        $nameQuery = $pdo->prepare("SELECT 1 FROM party_players WHERE room_id = ? AND status = 'connected' AND nickname = ? LIMIT 1");
        $nameQuery->execute([(int)$room['id'], $nickname]);
        if ($nameQuery->fetchColumn()) {
            party_fail('Ten pseudonim jest już zajęty w pokoju.', 409, 'nickname_taken');
        }

        $seatQuery = $pdo->prepare('SELECT COALESCE(MAX(seat), -1) + 1 FROM party_players WHERE room_id = ?');
        $seatQuery->execute([(int)$room['id']]);
        $seat = (int)$seatQuery->fetchColumn();

        $insert = $pdo->prepare(
            "INSERT INTO party_players (room_id, token_hash, nickname, role, color, seat)
             VALUES (?, ?, ?, 'player', ?, ?)"
        );
        $insert->execute([(int)$room['id'], party_hash_token($token), $nickname, party_player_color($seat), $seat]);

        $version = $pdo->prepare('UPDATE party_rooms SET state_version = state_version + 1 WHERE id = ?');
        $version->execute([(int)$room['id']]);
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $error;
    }

    $session = party_load_session($pdo, $roomCode, $token);
    party_json([
        'ok' => true,
        'token' => $token,
        'state' => party_state_payload($pdo, $session),
    ], 201);
}

function party_get_state(PDO $pdo): never
{
    $roomCode = party_normalize_room_code((string)($_GET['room'] ?? ''));
    $token = party_token_from_request();
    $session = party_load_session($pdo, $roomCode, $token);

    $touch = $pdo->prepare("UPDATE party_players SET last_seen_at = NOW(), status = 'connected' WHERE id = ?");
    $touch->execute([(int)$session['player_id']]);

    party_json(['ok' => true, 'state' => party_state_payload($pdo, $session)]);
}

function party_heartbeat(PDO $pdo, array $body): never
{
    $roomCode = party_normalize_room_code((string)($body['room_code'] ?? ''));
    $session = party_load_session($pdo, $roomCode, party_token_from_request());
    $touch = $pdo->prepare("UPDATE party_players SET last_seen_at = NOW(), status = 'connected' WHERE id = ?");
    $touch->execute([(int)$session['player_id']]);
    party_json(['ok' => true, 'state' => party_state_payload($pdo, $session)]);
}

function party_leave_room(PDO $pdo, array $body): never
{
    $roomCode = party_normalize_room_code((string)($body['room_code'] ?? ''));
    $token = party_token_from_request();

    $pdo->beginTransaction();
    try {
        $session = party_load_session($pdo, $roomCode, $token, true);
        $leave = $pdo->prepare("UPDATE party_players SET status = 'left', last_seen_at = NOW() WHERE id = ?");
        $leave->execute([(int)$session['player_id']]);

        if ((int)$session['host_player_id'] === (int)$session['player_id']) {
            $nextHostQuery = $pdo->prepare(
                "SELECT id FROM party_players
                 WHERE room_id = ? AND status = 'connected' AND id <> ?
                 ORDER BY seat ASC LIMIT 1"
            );
            $nextHostQuery->execute([(int)$session['room_id'], (int)$session['player_id']]);
            $nextHostId = $nextHostQuery->fetchColumn();

            if ($nextHostId) {
                $promote = $pdo->prepare("UPDATE party_players SET role = 'host' WHERE id = ?");
                $promote->execute([(int)$nextHostId]);
                $roomUpdate = $pdo->prepare('UPDATE party_rooms SET host_player_id = ?, state_version = state_version + 1 WHERE id = ?');
                $roomUpdate->execute([(int)$nextHostId, (int)$session['room_id']]);
            } else {
                $roomUpdate = $pdo->prepare("UPDATE party_rooms SET status = 'finished', state_version = state_version + 1 WHERE id = ?");
                $roomUpdate->execute([(int)$session['room_id']]);
            }
        } else {
            $roomUpdate = $pdo->prepare('UPDATE party_rooms SET state_version = state_version + 1 WHERE id = ?');
            $roomUpdate->execute([(int)$session['room_id']]);
        }

        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $error;
    }

    party_json(['ok' => true]);
}

function party_load_session(PDO $pdo, string $roomCode, string $token, bool $forUpdate = false): array
{
    if (strlen($roomCode) !== 6 || $token === '') {
        party_fail('Brak dostępu do tego pokoju.', 401, 'session_required');
    }

    $sql = "SELECT
                r.id AS room_id,
                r.room_code,
                r.status AS room_status,
                r.play_mode,
                r.host_player_id,
                r.current_game_key,
                r.round_number,
                r.state_version,
                r.max_players,
                r.expires_at,
                p.id AS player_id,
                p.nickname,
                p.role,
                p.color,
                p.seat,
                p.score_total,
                p.status AS player_status
            FROM party_rooms r
            INNER JOIN party_players p ON p.room_id = r.id
            WHERE r.room_code = ? AND p.token_hash = ?
            LIMIT 1" . ($forUpdate ? ' FOR UPDATE' : '');
    $query = $pdo->prepare($sql);
    $query->execute([$roomCode, party_hash_token($token)]);
    $session = $query->fetch();

    if (!$session || $session['player_status'] === 'left') {
        party_fail('Sesja wygasła. Dołącz ponownie do pokoju.', 401, 'session_expired');
    }

    if (strtotime((string)$session['expires_at']) <= time() || $session['room_status'] === 'finished') {
        party_fail('Ten pokój jest już zamknięty.', 410, 'room_closed');
    }

    return $session;
}

function party_state_payload(PDO $pdo, array $session): array
{
    $playersQuery = $pdo->prepare(
        "SELECT id, nickname, role, color, seat, score_total,
                CASE WHEN last_seen_at >= DATE_SUB(NOW(), INTERVAL 20 SECOND) THEN 1 ELSE 0 END AS is_online
         FROM party_players
         WHERE room_id = ? AND status = 'connected'
         ORDER BY seat ASC"
    );
    $playersQuery->execute([(int)$session['room_id']]);
    $players = array_map(static function (array $player): array {
        return [
            'id' => (int)$player['id'],
            'nickname' => $player['nickname'],
            'role' => $player['role'],
            'color' => $player['color'],
            'seat' => (int)$player['seat'],
            'score_total' => (int)$player['score_total'],
            'is_online' => (bool)$player['is_online'],
        ];
    }, $playersQuery->fetchAll());

    return [
        'room' => [
            'code' => $session['room_code'],
            'status' => $session['room_status'],
            'mode' => $session['play_mode'],
            'host_player_id' => (int)$session['host_player_id'],
            'current_game' => $session['current_game_key'],
            'round_number' => (int)$session['round_number'],
            'version' => (int)$session['state_version'],
            'max_players' => (int)$session['max_players'],
            'expires_at' => $session['expires_at'],
        ],
        'you' => [
            'id' => (int)$session['player_id'],
            'nickname' => $session['nickname'],
            'role' => $session['role'],
            'is_host' => (int)$session['host_player_id'] === (int)$session['player_id'],
        ],
        'players' => $players,
        'server_time' => gmdate('c'),
    ];
}
