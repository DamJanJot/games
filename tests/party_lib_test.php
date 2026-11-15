<?php
declare(strict_types=1);

require dirname(__DIR__) . '/gierkoteka/party/lib.php';

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

if ($failures) {
    fwrite(STDERR, "Niepowodzenia:\n- " . implode("\n- ", $failures) . "\n");
    exit(1);
}

echo "OK: testy funkcji Trybu Party\n";
