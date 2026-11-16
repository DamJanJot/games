<?php
declare(strict_types=1);

const PARTY_HIGHER_LOWER_LIMIT_MS = 20000;

function party_higher_lower_cards(): array
{
    return [
        1 => [
            'category' => 'Miasta',
            'reference_label' => 'Kraków',
            'reference_value' => 'około 804 tys. mieszkańców',
            'target_label' => 'Warszawa',
            'target_value' => 'około 1,86 mln mieszkańców',
            'question' => 'Czy Warszawa ma więcej czy mniej mieszkańców niż Kraków?',
            'correct' => 'more',
            'explanation' => 'Warszawa ma ponad dwa razy więcej mieszkańców niż Kraków.',
        ],
        2 => [
            'category' => 'Szczyty',
            'reference_label' => 'Kilimandżaro',
            'reference_value' => '5895 m n.p.m.',
            'target_label' => 'Mont Blanc',
            'target_value' => 'około 4808 m n.p.m.',
            'question' => 'Czy Mont Blanc jest wyższy czy niższy od Kilimandżaro?',
            'correct' => 'less',
            'explanation' => 'Mont Blanc jest niższy od Kilimandżaro o ponad kilometr.',
        ],
        3 => [
            'category' => 'Kosmos',
            'reference_label' => 'Rok na Merkurym',
            'reference_value' => 'około 88 dni ziemskich',
            'target_label' => 'Rok na Wenus',
            'target_value' => 'około 225 dni ziemskich',
            'question' => 'Czy rok na Wenus trwa dłużej czy krócej niż rok na Merkurym?',
            'correct' => 'more',
            'explanation' => 'Wenus potrzebuje około 225 dni na obieg Słońca, a Merkury około 88.',
        ],
        4 => [
            'category' => 'Morza',
            'reference_label' => 'Morze Czarne',
            'reference_value' => 'około 436 tys. km²',
            'target_label' => 'Morze Bałtyckie',
            'target_value' => 'około 377 tys. km²',
            'question' => 'Czy Bałtyk ma większą czy mniejszą powierzchnię niż Morze Czarne?',
            'correct' => 'less',
            'explanation' => 'Powierzchnia Morza Bałtyckiego jest mniejsza od powierzchni Morza Czarnego.',
        ],
        5 => [
            'category' => 'Rzeki',
            'reference_label' => 'Wisła',
            'reference_value' => '1047 km długości',
            'target_label' => 'Amazonka',
            'target_value' => 'około 6400 km długości',
            'question' => 'Czy Amazonka jest dłuższa czy krótsza od Wisły?',
            'correct' => 'more',
            'explanation' => 'Amazonka jest wielokrotnie dłuższa od Wisły.',
        ],
    ];
}

function party_higher_lower_card(int $id): ?array
{
    return party_higher_lower_cards()[$id] ?? null;
}

function party_higher_lower_order(): array
{
    $ids = array_keys(party_higher_lower_cards());
    shuffle($ids);
    return $ids;
}

function party_higher_lower_choice(string $value): ?string
{
    $choice = strtolower(trim($value));
    return in_array($choice, ['more', 'less'], true) ? $choice : null;
}

function party_higher_lower_score(bool $correct, int $elapsedMs, int $limitMs = PARTY_HIGHER_LOWER_LIMIT_MS): int
{
    return party_timed_score($correct, $elapsedMs, $limitMs);
}
