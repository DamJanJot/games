<?php
declare(strict_types=1);

const PARTY_TOURNAMENT_ORDER = ['quiz', 'higher_lower'];
const PARTY_QUESTION_LIMIT_OPTIONS = [10, 20, 30, 45, 60];

function party_tournament_game_order(): array
{
    return PARTY_TOURNAMENT_ORDER;
}

function party_game_catalog(): array
{
    return [
        'quiz' => [
            'key' => 'quiz',
            'label' => 'Quiz',
            'description' => 'Pięć pytań, cztery odpowiedzi i bonus za szybkość.',
        ],
        'higher_lower' => [
            'key' => 'higher_lower',
            'label' => 'Więcej czy mniej',
            'description' => 'Porównuj liczby i zdecyduj, czy druga wartość jest większa, czy mniejsza.',
        ],
    ];
}

function party_game_definition(string $gameKey): ?array
{
    return party_game_catalog()[$gameKey] ?? null;
}

function party_timed_score(bool $correct, int $elapsedMs, int $limitMs): int
{
    if (!$correct) {
        return 0;
    }

    $limitMs = max(1, $limitMs);
    $elapsedMs = max(0, min($elapsedMs, $limitMs));
    $speedBonus = (int)round(500 * (1 - ($elapsedMs / $limitMs)));
    return 1000 + max(0, $speedBonus);
}

function party_game_config(string $gameKey, ?int $questionLimitSeconds = null): array
{
    $config = match ($gameKey) {
        'quiz' => [
            'question_ids' => party_quiz_question_order(),
            'question_limit_ms' => PARTY_QUIZ_LIMIT_MS,
        ],
        'higher_lower' => [
            'card_ids' => party_higher_lower_order(),
            'question_limit_ms' => PARTY_HIGHER_LOWER_LIMIT_MS,
        ],
        default => throw new InvalidArgumentException('Nieznana gra turniejowa.'),
    };
    if ($questionLimitSeconds !== null) {
        $config['question_limit_ms'] = $questionLimitSeconds * 1000;
    }
    return $config;
}

function party_game_step_count(string $gameKey, array $config): int
{
    return match ($gameKey) {
        'quiz' => count(is_array($config['question_ids'] ?? null) ? $config['question_ids'] : []),
        'higher_lower' => count(is_array($config['card_ids'] ?? null) ? $config['card_ids'] : []),
        default => 0,
    };
}

function party_game_limit_ms(array $config): int
{
    return max(1000, min(60000, (int)($config['question_limit_ms'] ?? 20000)));
}

function party_rank_leaderboard(array $players): array
{
    usort($players, static fn(array $left, array $right): int =>
        (int)$right['score_total'] <=> (int)$left['score_total']
        ?: (int)$left['seat'] <=> (int)$right['seat']
    );

    $previousScore = null;
    $previousRank = 0;
    foreach ($players as $index => &$player) {
        $score = (int)$player['score_total'];
        if ($previousScore === null || $score !== $previousScore) {
            $previousRank = $index + 1;
        }
        $player['rank'] = $previousRank;
        $previousScore = $score;
    }
    unset($player);

    return $players;
}

function party_validate_tournament_plan(array $input): ?array
{
    $requested = $input['round_order'] ?? null;
    if (!is_array($requested) || !array_is_list($requested)
        || count($requested) < 1 || count($requested) > count(party_game_catalog())) {
        return null;
    }
    $catalog = party_game_catalog();
    $order = [];
    foreach ($requested as $key) {
        if (!is_string($key) || !isset($catalog[$key]) || in_array($key, $order, true)) {
            return null;
        }
        $order[] = $key;
    }
    $seconds = $input['question_limit_seconds'] ?? null;
    if (!is_int($seconds) || !in_array($seconds, PARTY_QUESTION_LIMIT_OPTIONS, true)) {
        return null;
    }
    return ['round_order' => $order, 'question_limit_seconds' => $seconds];
}

function party_tournament_plan_from_room(array $room): array
{
    $settings = party_json_object((string)($room['settings_json'] ?? ''));
    $settings += ['round_order' => party_tournament_game_order(), 'question_limit_seconds' => 20];
    return party_validate_tournament_plan($settings)
        ?? ['round_order' => party_tournament_game_order(), 'question_limit_seconds' => 20];
}

function party_tournament_order_from_room(array $room): array
{
    return party_tournament_plan_from_room($room)['round_order'];
}

function party_create_round(PDO $pdo, int $roomId, int $roundNumber, string $gameKey, ?int $questionLimitSeconds = null): array
{
    $config = json_encode(
        party_game_config($gameKey, $questionLimitSeconds),
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR
    );
    $insert = $pdo->prepare(
        "INSERT INTO gk_party_rounds
            (room_id, round_number, game_key, status, current_step, config_json, state_json)
         VALUES (?, ?, ?, 'preparation', 0, ?, '{}')"
    );
    $insert->execute([$roomId, $roundNumber, $gameKey, $config]);
    return party_current_round($pdo, $roomId, true) ?? throw new RuntimeException('Nie udało się utworzyć rundy.');
}

function party_activate_round(PDO $pdo, array $round, int $roomId): void
{
    $config = party_json_object((string)$round['config_json']);
    $limitMicroseconds = party_game_limit_ms($config) * 1000;
    $update = $pdo->prepare(
        "UPDATE gk_party_rounds
         SET status = 'active', current_step = 0, started_at = NOW(3),
             ends_at = TIMESTAMPADD(MICROSECOND, ?, NOW(3)), finished_at = NULL
         WHERE id = ? AND status = 'preparation'"
    );
    $update->execute([$limitMicroseconds, (int)$round['id']]);
    if ($update->rowCount() !== 1) {
        party_fail('Ta runda nie czeka już na rozpoczęcie.', 409, 'round_not_preparing');
    }
    $pdo->prepare(
        "UPDATE gk_party_rooms SET status = 'active', state_version = state_version + 1 WHERE id = ?"
    )->execute([$roomId]);
}

function party_activate_next_step(PDO $pdo, array $round, int $nextStep, int $roomId): void
{
    $config = party_json_object((string)$round['config_json']);
    $limitMicroseconds = party_game_limit_ms($config) * 1000;
    $update = $pdo->prepare(
        "UPDATE gk_party_rounds
         SET status = 'active', current_step = ?, started_at = NOW(3),
             ends_at = TIMESTAMPADD(MICROSECOND, ?, NOW(3))
         WHERE id = ? AND status = 'result'"
    );
    $update->execute([$nextStep, $limitMicroseconds, (int)$round['id']]);
    if ($update->rowCount() !== 1) {
        party_fail('Nie udało się rozpocząć kolejnego etapu.', 409, 'round_step_conflict');
    }
    party_bump_room_version($pdo, $roomId);
}

function party_apply_round_scores(PDO $pdo, int $roundId, array $scores): void
{
    $playerScore = $pdo->prepare('UPDATE gk_party_players SET score_total = score_total + ? WHERE id = ?');
    $roundScore = $pdo->prepare(
        'INSERT INTO gk_party_round_scores (round_id, player_id, points) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE points = points + VALUES(points)'
    );

    foreach ($scores as $score) {
        $points = (int)($score['points'] ?? 0);
        $playerId = (int)($score['player_id'] ?? 0);
        if ($playerId < 1 || $points < 0) {
            throw new InvalidArgumentException('Nieprawidłowy wynik rundy.');
        }
        $playerScore->execute([$points, $playerId]);
        $roundScore->execute([$roundId, $playerId, $points]);
    }
}

function party_finish_round(PDO $pdo, array $round, int $roomId): void
{
    $finish = $pdo->prepare(
        "UPDATE gk_party_rounds
         SET status = 'finished', ends_at = NULL, finished_at = NOW(3)
         WHERE id = ? AND status = 'result'"
    );
    $finish->execute([(int)$round['id']]);
    if ($finish->rowCount() !== 1) {
        party_fail('Ta runda została już zakończona.', 409, 'round_already_finished');
    }
    $pdo->prepare(
        "UPDATE gk_party_rooms SET status = 'round_result', state_version = state_version + 1 WHERE id = ?"
    )->execute([$roomId]);
}

function party_round_scoreboard(PDO $pdo, int $roomId, int $roundId): array
{
    $query = $pdo->prepare(
        "SELECT p.id, p.nickname, p.color, p.seat, p.score_total,
                COALESCE(s.points, 0) AS round_score
         FROM gk_party_players p
         LEFT JOIN gk_party_round_scores s ON s.player_id = p.id AND s.round_id = ?
         WHERE p.room_id = ? AND p.status = 'connected'
         ORDER BY round_score DESC, p.seat ASC"
    );
    $query->execute([$roundId, $roomId]);
    $rows = $query->fetchAll();
    return array_map(static fn(array $row): array => [
        'id' => (int)$row['id'],
        'nickname' => $row['nickname'],
        'color' => $row['color'],
        'seat' => (int)$row['seat'],
        'score_total' => (int)$row['score_total'],
        'round_score' => (int)$row['round_score'],
    ], $rows);
}

function party_tournament_payload(PDO $pdo, array $room, array $leaderboard): array
{
    $plan = party_tournament_plan_from_room($room);
    $order = $plan['round_order'];
    $round = party_current_round($pdo, (int)$room['id']);
    $roundsQuery = $pdo->prepare(
        'SELECT round_number, game_key, status FROM gk_party_rounds WHERE room_id = ? ORDER BY round_number ASC'
    );
    $roundsQuery->execute([(int)$room['id']]);
    $rounds = array_map(static function (array $row): array {
        $definition = party_game_definition((string)$row['game_key']);
        return [
            'number' => (int)$row['round_number'],
            'key' => $row['game_key'],
            'label' => $definition['label'] ?? $row['game_key'],
            'status' => $row['status'],
        ];
    }, $roundsQuery->fetchAll());

    $currentDefinition = $round ? party_game_definition((string)$round['game_key']) : null;
    $roundLeaderboard = $round
        ? party_round_scoreboard($pdo, (int)$room['id'], (int)$round['id'])
        : [];
    $topScore = $leaderboard ? (int)$leaderboard[0]['score_total'] : 0;
    $winnerIds = array_values(array_map(
        static fn(array $player): int => (int)$player['id'],
        array_filter($leaderboard, static fn(array $player): bool => (int)$player['score_total'] === $topScore)
    ));

    return [
        'status' => $room['status'],
        'order' => array_values(array_map(
            static fn(string $key): array => party_game_definition($key) ?? ['key' => $key, 'label' => $key, 'description' => ''],
            $order
        )),
        'rounds' => $rounds,
        'current_index' => max(0, (int)$room['round_number'] - 1),
        'total_rounds' => count($order),
        'question_limit_seconds' => $plan['question_limit_seconds'],
        'has_next_round' => (int)$room['round_number'] < count($order),
        'current_round' => $round ? [
            'id' => (int)$round['id'],
            'number' => (int)$round['round_number'],
            'key' => $round['game_key'],
            'label' => $currentDefinition['label'] ?? $round['game_key'],
            'description' => $currentDefinition['description'] ?? '',
            'status' => $round['status'],
        ] : null,
        'round_leaderboard' => $roundLeaderboard,
        'winner_ids' => $winnerIds,
        'has_winner_tie' => count($winnerIds) > 1,
    ];
}
