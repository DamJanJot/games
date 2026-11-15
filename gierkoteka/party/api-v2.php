<?php
declare(strict_types=1);

if (realpath((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) {
    http_response_code(404);
    exit;
}

require __DIR__ . '/lib.php';
require __DIR__ . '/bootstrap.php';
require __DIR__ . '/quiz.php';

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
    match ($action) {
        'create' => party_dispatch('POST', fn() => party_create_room($pdo, $body)),
        'join' => party_dispatch('POST', fn() => party_join_room($pdo, $body)),
        'state' => party_dispatch('GET', fn() => party_get_state($pdo)),
        'heartbeat' => party_dispatch('POST', fn() => party_heartbeat($pdo, $body)),
        'ready' => party_dispatch('POST', fn() => party_set_ready($pdo, $body)),
        'start_quiz' => party_dispatch('POST', fn() => party_start_quiz($pdo, $body)),
        'answer_quiz' => party_dispatch('POST', fn() => party_answer_quiz($pdo, $body)),
        'advance_quiz' => party_dispatch('POST', fn() => party_advance_quiz($pdo, $body)),
        'leave' => party_dispatch('POST', fn() => party_leave_room($pdo, $body)),
        default => party_fail('Nieznana akcja API.', 404, 'unknown_action'),
    };
} catch (PDOException $error) {
    party_fail('Wystąpił błąd bazy. Spróbuj ponownie.', 500, 'database_error');
} catch (Throwable $error) {
    party_fail('Nie udało się wykonać operacji.', 500, 'server_error');
}

function party_dispatch(string $method, callable $callback): never
{
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== $method) {
        party_fail('Metoda niedozwolona.', 405, 'method_not_allowed');
    }
    $callback();
    party_fail('Operacja nie zwróciła odpowiedzi.', 500, 'missing_response');
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
            "INSERT INTO party_players (room_id, token_hash, nickname, role, color, seat, is_ready)
             VALUES (?, ?, ?, 'host', ?, 0, 0)"
        );
        $playerQuery->execute([$roomId, party_hash_token($token), $nickname, party_player_color(0)]);
        $playerId = (int)$pdo->lastInsertId();

        $hostQuery = $pdo->prepare('UPDATE party_rooms SET host_player_id = ? WHERE id = ?');
        $hostQuery->execute([$playerId, $roomId]);
        $pdo->commit();
    } catch (Throwable $error) {
        party_roll_back($pdo);
        throw $error;
    }

    $session = party_load_session($pdo, $roomCode, $token);
    party_json(['ok' => true, 'token' => $token, 'state' => party_state_payload($pdo, $session)], 201);
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

        if (party_connected_player_count($pdo, (int)$room['id']) >= (int)$room['max_players']) {
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
            "INSERT INTO party_players (room_id, token_hash, nickname, role, color, seat, is_ready)
             VALUES (?, ?, ?, 'player', ?, ?, 0)"
        );
        $insert->execute([(int)$room['id'], party_hash_token($token), $nickname, party_player_color($seat), $seat]);
        party_bump_room_version($pdo, (int)$room['id']);
        $pdo->commit();
    } catch (Throwable $error) {
        party_roll_back($pdo);
        throw $error;
    }

    $session = party_load_session($pdo, $roomCode, $token);
    party_json(['ok' => true, 'token' => $token, 'state' => party_state_payload($pdo, $session)], 201);
}

function party_get_state(PDO $pdo): never
{
    $roomCode = party_normalize_room_code((string)($_GET['room'] ?? ''));
    $session = party_load_session($pdo, $roomCode, party_token_from_request());
    party_touch_player($pdo, (int)$session['player_id']);
    party_refresh_quiz_round($pdo, (int)$session['room_id']);
    party_json(['ok' => true, 'state' => party_state_payload($pdo, $session)]);
}

function party_heartbeat(PDO $pdo, array $body): never
{
    $roomCode = party_normalize_room_code((string)($body['room_code'] ?? ''));
    $session = party_load_session($pdo, $roomCode, party_token_from_request());
    party_touch_player($pdo, (int)$session['player_id']);
    party_refresh_quiz_round($pdo, (int)$session['room_id']);
    party_json(['ok' => true, 'state' => party_state_payload($pdo, $session)]);
}

function party_set_ready(PDO $pdo, array $body): never
{
    $roomCode = party_normalize_room_code((string)($body['room_code'] ?? ''));
    $session = party_load_session($pdo, $roomCode, party_token_from_request());
    if ($session['room_status'] !== 'lobby') {
        party_fail('Gotowość można zmienić tylko w poczekalni.', 409, 'room_already_started');
    }

    $ready = filter_var($body['ready'] ?? false, FILTER_VALIDATE_BOOL);
    $update = $pdo->prepare('UPDATE party_players SET is_ready = ?, last_seen_at = NOW() WHERE id = ?');
    $update->execute([$ready ? 1 : 0, (int)$session['player_id']]);
    party_bump_room_version($pdo, (int)$session['room_id']);
    $session['is_ready'] = $ready ? 1 : 0;
    party_json(['ok' => true, 'state' => party_state_payload($pdo, $session)]);
}

function party_start_quiz(PDO $pdo, array $body): never
{
    $roomCode = party_normalize_room_code((string)($body['room_code'] ?? ''));
    $token = party_token_from_request();
    $pdo->beginTransaction();
    try {
        $session = party_load_session($pdo, $roomCode, $token, true);
        party_require_host($session);
        if ($session['room_status'] !== 'lobby') {
            party_fail('Ten pokój nie jest już w poczekalni.', 409, 'room_already_started');
        }

        $playersQuery = $pdo->prepare(
            "SELECT COUNT(*) AS total, SUM(CASE WHEN is_ready = 1 THEN 1 ELSE 0 END) AS ready_count
             FROM party_players WHERE room_id = ? AND status = 'connected'"
        );
        $playersQuery->execute([(int)$session['room_id']]);
        $counts = $playersQuery->fetch();
        if ((int)$counts['total'] < 2) {
            party_fail('Do startu potrzebnych jest co najmniej dwóch graczy.', 409, 'not_enough_players');
        }
        if ((int)$counts['ready_count'] !== (int)$counts['total']) {
            party_fail('Wszyscy gracze muszą najpierw oznaczyć gotowość.', 409, 'players_not_ready');
        }

        $config = json_encode([
            'question_ids' => party_quiz_question_order(),
            'question_limit_ms' => PARTY_QUIZ_LIMIT_MS,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        $roundNumber = (int)$session['round_number'] + 1;
        $insert = $pdo->prepare(
            "INSERT INTO party_rounds
                (room_id, round_number, game_key, status, current_step, config_json, state_json, started_at, ends_at)
             VALUES (?, ?, 'quiz', 'active', 0, ?, '{}', NOW(3), DATE_ADD(NOW(3), INTERVAL 20 SECOND))"
        );
        $insert->execute([(int)$session['room_id'], $roundNumber, $config]);
        $roomUpdate = $pdo->prepare(
            "UPDATE party_rooms
             SET status = 'active', current_game_key = 'quiz', round_number = ?, state_version = state_version + 1
             WHERE id = ?"
        );
        $roomUpdate->execute([$roundNumber, (int)$session['room_id']]);
        $pdo->commit();
    } catch (Throwable $error) {
        party_roll_back($pdo);
        throw $error;
    }

    $session = party_load_session($pdo, $roomCode, $token);
    party_json(['ok' => true, 'state' => party_state_payload($pdo, $session)]);
}

function party_answer_quiz(PDO $pdo, array $body): never
{
    $roomCode = party_normalize_room_code((string)($body['room_code'] ?? ''));
    $token = party_token_from_request();
    $answerIndex = filter_var($body['answer_index'] ?? null, FILTER_VALIDATE_INT, FILTER_NULL_ON_FAILURE);
    if ($answerIndex === null || $answerIndex < 0 || $answerIndex > 3) {
        party_fail('Wybierz poprawną odpowiedź.', 422, 'invalid_answer');
    }

    $pdo->beginTransaction();
    try {
        $session = party_load_session($pdo, $roomCode, $token, true);
        if ($session['room_status'] !== 'active' || $session['current_game_key'] !== 'quiz') {
            party_fail('Quiz nie jest teraz aktywny.', 409, 'quiz_not_active');
        }
        $round = party_current_round($pdo, (int)$session['room_id'], true);
        if (!$round || $round['game_key'] !== 'quiz' || $round['status'] !== 'active') {
            party_fail('To pytanie jest już zamknięte.', 409, 'question_closed');
        }

        $timingQuery = $pdo->prepare(
            "SELECT NOW(3) <= ends_at AS can_answer,
                    GREATEST(0, TIMESTAMPDIFF(MICROSECOND, started_at, NOW(3)) DIV 1000) AS elapsed_ms
             FROM party_rounds WHERE id = ?"
        );
        $timingQuery->execute([(int)$round['id']]);
        $timing = $timingQuery->fetch();
        if (!(bool)$timing['can_answer']) {
            party_close_quiz_question($pdo, $round, (int)$session['room_id']);
            $pdo->commit();
            party_fail('Czas na odpowiedź już minął.', 409, 'question_closed');
        }

        $existingQuery = $pdo->prepare(
            'SELECT 1 FROM party_quiz_answers WHERE round_id = ? AND player_id = ? AND question_index = ? LIMIT 1'
        );
        $existingQuery->execute([(int)$round['id'], (int)$session['player_id'], (int)$round['current_step']]);
        if ($existingQuery->fetchColumn()) {
            party_fail('Odpowiedź została już zapisana.', 409, 'answer_already_submitted');
        }

        $config = party_json_object((string)$round['config_json']);
        $question = party_quiz_question((int)($config['question_ids'][(int)$round['current_step']] ?? 0));
        if (!$question) {
            party_fail('Nie udało się odnaleźć pytania.', 500, 'quiz_question_missing');
        }

        $correct = $answerIndex === (int)$question['correct'];
        $limitMs = (int)($config['question_limit_ms'] ?? PARTY_QUIZ_LIMIT_MS);
        $elapsedMs = min((int)$timing['elapsed_ms'], $limitMs);
        $points = party_quiz_score($correct, $elapsedMs, $limitMs);
        $insert = $pdo->prepare(
            "INSERT INTO party_quiz_answers
                (round_id, player_id, question_index, answer_index, is_correct, points, response_ms)
             VALUES (?, ?, ?, ?, ?, ?, ?)"
        );
        $insert->execute([
            (int)$round['id'], (int)$session['player_id'], (int)$round['current_step'],
            $answerIndex, $correct ? 1 : 0, $points, $elapsedMs,
        ]);

        $answerCount = party_question_answer_count($pdo, (int)$round['id'], (int)$round['current_step']);
        if ($answerCount >= party_connected_player_count($pdo, (int)$session['room_id'])) {
            party_close_quiz_question($pdo, $round, (int)$session['room_id']);
        } else {
            party_bump_room_version($pdo, (int)$session['room_id']);
        }
        $pdo->commit();
    } catch (Throwable $error) {
        party_roll_back($pdo);
        throw $error;
    }

    $session = party_load_session($pdo, $roomCode, $token);
    party_json(['ok' => true, 'state' => party_state_payload($pdo, $session)]);
}

function party_advance_quiz(PDO $pdo, array $body): never
{
    $roomCode = party_normalize_room_code((string)($body['room_code'] ?? ''));
    $token = party_token_from_request();
    $pdo->beginTransaction();
    try {
        $session = party_load_session($pdo, $roomCode, $token, true);
        party_require_host($session);
        $round = party_current_round($pdo, (int)$session['room_id'], true);
        if (!$round || $round['game_key'] !== 'quiz' || !in_array($round['status'], ['active', 'result'], true)) {
            party_fail('Nie ma aktywnego etapu Quizu.', 409, 'quiz_not_active');
        }

        if ($round['status'] === 'active') {
            party_close_quiz_question($pdo, $round, (int)$session['room_id']);
        } else {
            $config = party_json_object((string)$round['config_json']);
            $nextStep = (int)$round['current_step'] + 1;
            $questionCount = count($config['question_ids'] ?? []);
            if ($nextStep < $questionCount) {
                $update = $pdo->prepare(
                    "UPDATE party_rounds
                     SET status = 'active', current_step = ?, started_at = NOW(3),
                         ends_at = DATE_ADD(NOW(3), INTERVAL 20 SECOND)
                     WHERE id = ?"
                );
                $update->execute([$nextStep, (int)$round['id']]);
                party_bump_room_version($pdo, (int)$session['room_id']);
            } else {
                $finishRound = $pdo->prepare(
                    "UPDATE party_rounds SET status = 'finished', ends_at = NULL, finished_at = NOW(3) WHERE id = ?"
                );
                $finishRound->execute([(int)$round['id']]);
                $finishRoom = $pdo->prepare(
                    "UPDATE party_rooms SET status = 'results', state_version = state_version + 1 WHERE id = ?"
                );
                $finishRoom->execute([(int)$session['room_id']]);
            }
        }
        $pdo->commit();
    } catch (Throwable $error) {
        party_roll_back($pdo);
        throw $error;
    }

    $session = party_load_session($pdo, $roomCode, $token);
    party_json(['ok' => true, 'state' => party_state_payload($pdo, $session)]);
}

function party_leave_room(PDO $pdo, array $body): never
{
    $roomCode = party_normalize_room_code((string)($body['room_code'] ?? ''));
    $pdo->beginTransaction();
    try {
        $session = party_load_session($pdo, $roomCode, party_token_from_request(), true);
        $leave = $pdo->prepare("UPDATE party_players SET status = 'left', is_ready = 0, last_seen_at = NOW() WHERE id = ?");
        $leave->execute([(int)$session['player_id']]);

        if ((int)$session['host_player_id'] === (int)$session['player_id']) {
            $nextHostQuery = $pdo->prepare(
                "SELECT id FROM party_players
                 WHERE room_id = ? AND status = 'connected' AND id <> ? ORDER BY seat ASC LIMIT 1"
            );
            $nextHostQuery->execute([(int)$session['room_id'], (int)$session['player_id']]);
            $nextHostId = $nextHostQuery->fetchColumn();
            if ($nextHostId) {
                $pdo->prepare("UPDATE party_players SET role = 'host' WHERE id = ?")->execute([(int)$nextHostId]);
                $pdo->prepare('UPDATE party_rooms SET host_player_id = ?, state_version = state_version + 1 WHERE id = ?')
                    ->execute([(int)$nextHostId, (int)$session['room_id']]);
            } else {
                $pdo->prepare("UPDATE party_rooms SET status = 'finished', state_version = state_version + 1 WHERE id = ?")
                    ->execute([(int)$session['room_id']]);
            }
        } else {
            party_bump_room_version($pdo, (int)$session['room_id']);
        }
        $pdo->commit();
    } catch (Throwable $error) {
        party_roll_back($pdo);
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
                r.id AS room_id, r.room_code, r.status AS room_status, r.play_mode,
                r.host_player_id, r.current_game_key, r.round_number, r.state_version,
                r.max_players, r.expires_at,
                p.id AS player_id, p.nickname, p.role, p.color, p.seat,
                p.score_total, p.status AS player_status, p.is_ready
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
    $room = party_room($pdo, (int)$session['room_id']);
    $playersQuery = $pdo->prepare(
        "SELECT id, nickname, role, color, seat, score_total, is_ready,
                CASE WHEN last_seen_at >= DATE_SUB(NOW(), INTERVAL 20 SECOND) THEN 1 ELSE 0 END AS is_online
         FROM party_players WHERE room_id = ? AND status = 'connected' ORDER BY seat ASC"
    );
    $playersQuery->execute([(int)$session['room_id']]);
    $players = array_map(static fn(array $player): array => [
        'id' => (int)$player['id'],
        'nickname' => $player['nickname'],
        'role' => $player['role'],
        'color' => $player['color'],
        'seat' => (int)$player['seat'],
        'score_total' => (int)$player['score_total'],
        'is_ready' => (bool)$player['is_ready'],
        'is_online' => (bool)$player['is_online'],
    ], $playersQuery->fetchAll());

    $leaderboard = $players;
    usort($leaderboard, static fn(array $left, array $right): int =>
        $right['score_total'] <=> $left['score_total'] ?: $left['seat'] <=> $right['seat']
    );
    $serverTimeMs = (int)$pdo->query('SELECT CAST(UNIX_TIMESTAMP(NOW(3)) * 1000 AS UNSIGNED)')->fetchColumn();

    return [
        'room' => [
            'code' => $room['room_code'], 'status' => $room['status'], 'mode' => $room['play_mode'],
            'host_player_id' => (int)$room['host_player_id'], 'current_game' => $room['current_game_key'],
            'round_number' => (int)$room['round_number'], 'version' => (int)$room['state_version'],
            'max_players' => (int)$room['max_players'], 'expires_at' => $room['expires_at'],
        ],
        'you' => [
            'id' => (int)$session['player_id'], 'nickname' => $session['nickname'], 'role' => $session['role'],
            'is_host' => (int)$room['host_player_id'] === (int)$session['player_id'],
            'is_ready' => (bool)$session['is_ready'],
        ],
        'players' => $players,
        'leaderboard' => $leaderboard,
        'game' => party_quiz_payload($pdo, $room, (int)$session['player_id'], count($players)),
        'server_time_ms' => $serverTimeMs,
    ];
}

function party_quiz_payload(PDO $pdo, array $room, int $playerId, int $playerCount): ?array
{
    if ($room['current_game_key'] !== 'quiz') return null;
    $round = party_current_round($pdo, (int)$room['id']);
    if (!$round || $round['game_key'] !== 'quiz') return null;

    $config = party_json_object((string)$round['config_json']);
    $questionIds = is_array($config['question_ids'] ?? null) ? $config['question_ids'] : [];
    $questionIndex = (int)$round['current_step'];
    $question = party_quiz_question((int)($questionIds[$questionIndex] ?? 0));
    if (!$question) return null;

    $answerQuery = $pdo->prepare(
        'SELECT answer_index, points FROM party_quiz_answers WHERE round_id = ? AND player_id = ? AND question_index = ?'
    );
    $answerQuery->execute([(int)$round['id'], $playerId, $questionIndex]);
    $yourAnswer = $answerQuery->fetch();
    $endsAtMs = null;
    if ($round['ends_at'] !== null) {
        $endQuery = $pdo->prepare('SELECT CAST(UNIX_TIMESTAMP(ends_at) * 1000 AS UNSIGNED) FROM party_rounds WHERE id = ?');
        $endQuery->execute([(int)$round['id']]);
        $endsAtMs = (int)$endQuery->fetchColumn();
    }

    $payload = [
        'key' => 'quiz', 'round_id' => (int)$round['id'], 'round_status' => $round['status'],
        'question_index' => $questionIndex, 'question_number' => $questionIndex + 1,
        'question_count' => count($questionIds), 'question' => $question['question'],
        'answers' => $question['answers'],
        'answers_received' => party_question_answer_count($pdo, (int)$round['id'], $questionIndex),
        'players_expected' => $playerCount, 'ends_at_ms' => $endsAtMs,
        'your_answer_index' => $yourAnswer ? (int)$yourAnswer['answer_index'] : null,
        'your_points' => $round['status'] !== 'active' && $yourAnswer ? (int)$yourAnswer['points'] : null,
        'can_answer' => $round['status'] === 'active' && !$yourAnswer,
    ];

    if (in_array($round['status'], ['result', 'finished'], true)) {
        $distributionQuery = $pdo->prepare(
            'SELECT answer_index, COUNT(*) AS total FROM party_quiz_answers WHERE round_id = ? AND question_index = ? GROUP BY answer_index'
        );
        $distributionQuery->execute([(int)$round['id'], $questionIndex]);
        $distribution = [0, 0, 0, 0];
        foreach ($distributionQuery->fetchAll() as $row) {
            $distribution[(int)$row['answer_index']] = (int)$row['total'];
        }
        $payload['correct_answer_index'] = (int)$question['correct'];
        $payload['explanation'] = $question['explanation'];
        $payload['answer_distribution'] = $distribution;
    }
    return $payload;
}

function party_refresh_quiz_round(PDO $pdo, int $roomId): void
{
    if ($pdo->inTransaction()) return;
    $pdo->beginTransaction();
    try {
        $round = party_current_round($pdo, $roomId, true);
        if ($round && $round['game_key'] === 'quiz' && $round['status'] === 'active') {
            $expiredQuery = $pdo->prepare('SELECT NOW(3) >= ends_at FROM party_rounds WHERE id = ?');
            $expiredQuery->execute([(int)$round['id']]);
            if ((bool)$expiredQuery->fetchColumn()) party_close_quiz_question($pdo, $round, $roomId);
        }
        $pdo->commit();
    } catch (Throwable $error) {
        party_roll_back($pdo);
        throw $error;
    }
}

function party_close_quiz_question(PDO $pdo, array $round, int $roomId): void
{
    if ($round['status'] !== 'active') return;
    $answersQuery = $pdo->prepare(
        'SELECT id, player_id, points FROM party_quiz_answers WHERE round_id = ? AND question_index = ? AND points_applied = 0 FOR UPDATE'
    );
    $answersQuery->execute([(int)$round['id'], (int)$round['current_step']]);
    $playerScore = $pdo->prepare('UPDATE party_players SET score_total = score_total + ? WHERE id = ?');
    $roundScore = $pdo->prepare(
        'INSERT INTO party_round_scores (round_id, player_id, points) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE points = points + VALUES(points)'
    );
    foreach ($answersQuery->fetchAll() as $answer) {
        $points = (int)$answer['points'];
        $playerScore->execute([$points, (int)$answer['player_id']]);
        $roundScore->execute([(int)$round['id'], (int)$answer['player_id'], $points]);
    }
    $pdo->prepare(
        'UPDATE party_quiz_answers SET points_applied = 1 WHERE round_id = ? AND question_index = ? AND points_applied = 0'
    )->execute([(int)$round['id'], (int)$round['current_step']]);
    $pdo->prepare("UPDATE party_rounds SET status = 'result', ends_at = NULL WHERE id = ? AND status = 'active'")
        ->execute([(int)$round['id']]);
    party_bump_room_version($pdo, $roomId);
}

function party_current_round(PDO $pdo, int $roomId, bool $forUpdate = false): ?array
{
    $query = $pdo->prepare(
        'SELECT * FROM party_rounds WHERE room_id = ? ORDER BY round_number DESC LIMIT 1' . ($forUpdate ? ' FOR UPDATE' : '')
    );
    $query->execute([$roomId]);
    $round = $query->fetch();
    return $round ?: null;
}

function party_room(PDO $pdo, int $roomId): array
{
    $query = $pdo->prepare('SELECT * FROM party_rooms WHERE id = ? LIMIT 1');
    $query->execute([$roomId]);
    $room = $query->fetch();
    if (!$room) party_fail('Pokój nie istnieje.', 404, 'room_not_found');
    return $room;
}

function party_connected_player_count(PDO $pdo, int $roomId): int
{
    $query = $pdo->prepare("SELECT COUNT(*) FROM party_players WHERE room_id = ? AND status = 'connected'");
    $query->execute([$roomId]);
    return (int)$query->fetchColumn();
}

function party_question_answer_count(PDO $pdo, int $roundId, int $questionIndex): int
{
    $query = $pdo->prepare('SELECT COUNT(*) FROM party_quiz_answers WHERE round_id = ? AND question_index = ?');
    $query->execute([$roundId, $questionIndex]);
    return (int)$query->fetchColumn();
}

function party_touch_player(PDO $pdo, int $playerId): void
{
    $pdo->prepare("UPDATE party_players SET last_seen_at = NOW(), status = 'connected' WHERE id = ?")->execute([$playerId]);
}

function party_require_host(array $session): void
{
    if ((int)$session['host_player_id'] !== (int)$session['player_id']) {
        party_fail('Tę akcję może wykonać tylko gospodarz.', 403, 'host_required');
    }
}

function party_bump_room_version(PDO $pdo, int $roomId): void
{
    $pdo->prepare('UPDATE party_rooms SET state_version = state_version + 1 WHERE id = ?')->execute([$roomId]);
}

function party_json_object(string $json): array
{
    $value = json_decode($json, true);
    return is_array($value) ? $value : [];
}

function party_roll_back(PDO $pdo): void
{
    if ($pdo->inTransaction()) $pdo->rollBack();
}
