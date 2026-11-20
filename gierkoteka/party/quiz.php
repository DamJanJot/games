<?php
declare(strict_types=1);

const PARTY_QUIZ_LIMIT_MS = 20000;

function party_quiz_questions(): array
{
    return [
        1 => [
            'question' => 'Która planeta jest nazywana Czerwoną Planetą?',
            'answers' => ['Wenus', 'Mars', 'Jowisz', 'Merkury'],
            'correct' => 1,
            'explanation' => 'Mars zawdzięcza czerwony kolor tlenkom żelaza obecnym na jego powierzchni.',
        ],
        2 => [
            'question' => 'W ilu stopniach Celsjusza zamarza czysta woda przy normalnym ciśnieniu?',
            'answers' => ['0°C', '10°C', '-10°C', '100°C'],
            'correct' => 0,
            'explanation' => 'Przy normalnym ciśnieniu temperatura zamarzania czystej wody wynosi 0°C.',
        ],
        3 => [
            'question' => 'Jakie miasto jest stolicą Polski?',
            'answers' => ['Kraków', 'Gdańsk', 'Warszawa', 'Poznań'],
            'correct' => 2,
            'explanation' => 'Warszawa jest stolicą Polski od końca XVI wieku.',
        ],
        4 => [
            'question' => 'Ile wynosi 2 podniesione do potęgi piątej?',
            'answers' => ['10', '16', '25', '32'],
            'correct' => 3,
            'explanation' => '2 × 2 × 2 × 2 × 2 daje 32.',
        ],
        5 => [
            'question' => 'Które rozszerzenie najczęściej oznacza dokument HTML?',
            'answers' => ['.css', '.html', '.phpx', '.image'],
            'correct' => 1,
            'explanation' => 'Pliki dokumentów HTML najczęściej używają rozszerzenia .html lub .htm.',
        ],
    ];
}

function party_quiz_question(int $id): ?array
{
    return party_quiz_questions()[$id] ?? null;
}

function party_quiz_question_order(): array
{
    $ids = array_keys(party_quiz_questions());
    shuffle($ids);
    return $ids;
}

function party_quiz_score(bool $correct, int $elapsedMs, int $limitMs = PARTY_QUIZ_LIMIT_MS): int
{
    return party_timed_score($correct, $elapsedMs, $limitMs);
}
