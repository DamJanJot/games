<?php
declare(strict_types=1);

require dirname(__DIR__) . '/gierkoteka/party/lib.php';
require dirname(__DIR__) . '/gierkoteka/party/bootstrap.php';
require dirname(__DIR__) . '/gierkoteka/party/quiz.php';
require dirname(__DIR__) . '/gierkoteka/party/higher-lower.php';
require dirname(__DIR__) . '/gierkoteka/party/tournament.php';

$failures = [];

function check(bool $condition, string $message): void
{
    global $failures;
    if (!$condition) {
        $failures[] = $message;
    }
}

check(party_normalize_room_code(' ab-c 23 ') === 'ABC23', 'normalizacja kodu pokoju');
check(party_normalize_nickname("  Ala   ma kota  ") === 'Ala ma kota', 'normalizacja pseudonimu');
check(party_validate_nickname('') !== null, 'odrzucenie pustego pseudonimu');
check(party_validate_nickname('Gracz 1') === null, 'poprawny pseudonim');

$token = party_random_token();
check(strlen($token) === 64, 'długość tokenu');
check(party_hash_token($token) === hash('sha256', $token), 'skrót tokenu');

$code = party_generate_room_code(static fn(string $candidate): bool => false);
check(strlen($code) === 6, 'długość kodu pokoju');
check((bool)preg_match('/^[A-HJ-NP-Z2-9]{6}$/', $code), 'alfabet kodu pokoju');
check(party_player_color(0) === party_player_color(count(PARTY_PLAYER_COLORS)), 'cykliczny wybór koloru');
check(count(party_quiz_questions()) === 5, 'liczba pytań przykładowego quizu');
check(party_quiz_question(1) !== null, 'pobranie pytania quizu');
check(party_quiz_question(999) === null, 'brak nieznanego pytania quizu');
check(party_quiz_score(false, 100) === 0, 'brak punktów za błędną odpowiedź');
check(party_quiz_score(true, 0) === 1500, 'maksymalny wynik za natychmiastową odpowiedź');
check(party_quiz_score(true, PARTY_QUIZ_LIMIT_MS) === 1000, 'minimalny wynik za poprawną odpowiedź');
check(party_tournament_game_order() === ['quiz', 'higher_lower'], 'kolejność gier w turnieju');
check(party_game_definition('higher_lower')['label'] === 'Więcej czy mniej', 'definicja drugiej gry');
check(count(party_higher_lower_cards()) === 5, 'liczba porównań Więcej czy mniej');
check(party_higher_lower_card(1) !== null, 'pobranie porównania Więcej czy mniej');
check(party_higher_lower_card(999) === null, 'brak nieznanego porównania');
check(party_higher_lower_choice(' MORE ') === 'more', 'normalizacja wyboru więcej');
check(party_higher_lower_choice('equal') === null, 'odrzucenie nieznanego wyboru');
check(party_higher_lower_score(true, 0) === party_quiz_score(true, 0), 'wspólna punktacja obu gier');
check(party_game_step_count('quiz', ['question_ids' => [1, 2]]) === 2, 'liczba etapów Quizu');
check(party_game_step_count('higher_lower', ['card_ids' => [1, 2, 3]]) === 3, 'liczba etapów porównań');

check(party_dedicated_db_config([
    'DB_HOST' => 'shared-host',
    'DB_NAME' => 'shared-database',
    'DB_USER' => 'shared-user',
]) === null, 'wspólne DB_* nie powinny uruchamiać Trybu Party');
check(party_uses_shared_db(['db_name' => 'shared-database'], ['DB_NAME' => 'shared-database']), 'ta sama baza powinna być zablokowana');
check(!party_uses_shared_db(['db_name' => 'party-staging'], ['DB_NAME' => 'shared-database']), 'inna baza może być użyta');

$ranked = party_rank_leaderboard([
    ['id' => 1, 'score_total' => 1200, 'seat' => 0],
    ['id' => 2, 'score_total' => 1200, 'seat' => 1],
    ['id' => 3, 'score_total' => 900, 'seat' => 2],
]);
check($ranked[0]['rank'] === 1 && $ranked[1]['rank'] === 1, 'wspólne miejsce przy remisie');
check($ranked[2]['rank'] === 3, 'miejsce po remisie');

if ($failures) {
    fwrite(STDERR, "Niepowodzenia:\n- " . implode("\n- ", $failures) . "\n");
    exit(1);
}

echo "OK: testy funkcji Trybu Party\n";
