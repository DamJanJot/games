<?php
declare(strict_types=1);

const PARTY_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PARTY_PLAYER_COLORS = [
    '#ef476f',
    '#118ab2',
    '#25a18e',
    '#f28f3b',
    '#7c5cff',
    '#2d6cdf',
    '#d946ef',
    '#0f766e',
];

function party_normalize_room_code(string $value): string
{
    return strtoupper((string)preg_replace('/[^A-Z0-9]/i', '', trim($value)));
}

function party_normalize_nickname(string $value): string
{
    $value = (string)preg_replace('/\s+/u', ' ', trim($value));
    return function_exists('mb_substr') ? mb_substr($value, 0, 24) : substr($value, 0, 24);
}

function party_validate_nickname(string $value): ?string
{
    $length = function_exists('mb_strlen') ? mb_strlen($value) : strlen($value);
    if ($length < 1) {
        return 'Wpisz pseudonim.';
    }

    if ($length > 24) {
        return 'Pseudonim może mieć maksymalnie 24 znaki.';
    }

    return null;
}

function party_random_token(): string
{
    return bin2hex(random_bytes(32));
}

function party_hash_token(string $token): string
{
    return hash('sha256', $token);
}

function party_generate_room_code(callable $exists, int $length = 6): string
{
    $alphabetLength = strlen(PARTY_CODE_ALPHABET);

    for ($attempt = 0; $attempt < 20; $attempt++) {
        $code = '';
        for ($position = 0; $position < $length; $position++) {
            $code .= PARTY_CODE_ALPHABET[random_int(0, $alphabetLength - 1)];
        }

        if (!$exists($code)) {
            return $code;
        }
    }

    throw new RuntimeException('Nie udało się utworzyć unikalnego kodu pokoju.');
}

function party_player_color(int $seat): string
{
    return PARTY_PLAYER_COLORS[$seat % count(PARTY_PLAYER_COLORS)];
}

function party_read_json_body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function party_token_from_request(): string
{
    $token = trim((string)($_SERVER['HTTP_X_PARTY_TOKEN'] ?? ''));
    if ($token !== '') {
        return $token;
    }

    $authorization = trim((string)($_SERVER['HTTP_AUTHORIZATION'] ?? ''));
    if (preg_match('/^Bearer\s+(.+)$/i', $authorization, $matches)) {
        return trim($matches[1]);
    }

    return '';
}

function party_json(array $payload, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, max-age=0');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function party_fail(string $message, int $status = 400, string $code = 'request_error'): never
{
    party_json([
        'ok' => false,
        'error' => [
            'code' => $code,
            'message' => $message,
        ],
    ], $status);
}
