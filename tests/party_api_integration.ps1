param(
    [string]$BaseUrl = 'http://127.0.0.1:8098/gierkoteka/party/api.php'
)

$ErrorActionPreference = 'Stop'

function Invoke-PartyApi {
    param(
        [Parameter(Mandatory = $true)][string]$Action,
        [ValidateSet('GET', 'POST')][string]$Method = 'POST',
        [string]$Token = '',
        [hashtable]$Body = @{},
        [string]$Query = ''
    )

    $headers = @{ Accept = 'application/json' }
    if ($Token) {
        $headers['X-Party-Token'] = $Token
    }

    $arguments = @{
        Uri = "${BaseUrl}?action=${Action}${Query}"
        Method = $Method
        Headers = $headers
    }
    if ($Method -eq 'POST') {
        $arguments.ContentType = 'application/json; charset=utf-8'
        $arguments.Body = $Body | ConvertTo-Json -Depth 8 -Compress
    }

    Invoke-RestMethod @arguments
}

function Assert-Party {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) {
        throw "FAIL: $Message"
    }
}

$hostSession = Invoke-PartyApi -Action 'create' -Body @{ nickname = 'Gospodarz'; mode = 'screen' }
$roomCode = $hostSession.state.room.code
$hostToken = $hostSession.token
Assert-Party ($roomCode.Length -eq 6) 'pokoj powinien otrzymac szesci znakowy kod'

$guest = Invoke-PartyApi -Action 'join' -Body @{ room_code = $roomCode; nickname = 'Gosc' }
$guestToken = $guest.token
Assert-Party ($guest.state.players.Count -eq 2) 'w pokoju powinno byc dwoch graczy'

$hostReady = Invoke-PartyApi -Action 'ready' -Token $hostToken -Body @{ room_code = $roomCode; ready = $true }
$guestReady = Invoke-PartyApi -Action 'ready' -Token $guestToken -Body @{ room_code = $roomCode; ready = $true }
Assert-Party (($guestReady.state.players | Where-Object { -not $_.is_ready }).Count -eq 0) 'wszyscy gracze powinni byc gotowi'

$started = Invoke-PartyApi -Action 'start_quiz' -Token $hostToken -Body @{ room_code = $roomCode }
Assert-Party ($started.state.room.status -eq 'active') 'Quiz powinien zmienic pokoj na aktywny'
Assert-Party ($started.state.game.question_count -eq 5) 'Quiz powinien zawierac piec pytan'

for ($question = 1; $question -le 5; $question++) {
    $hostAnswer = Invoke-PartyApi -Action 'answer_quiz' -Token $hostToken -Body @{ room_code = $roomCode; answer_index = 0 }
    Assert-Party ($hostAnswer.state.game.your_answer_index -eq 0) "odpowiedz gospodarza powinna zostac zapisana dla pytania $question"

    $guestAnswer = Invoke-PartyApi -Action 'answer_quiz' -Token $guestToken -Body @{ room_code = $roomCode; answer_index = 1 }
    Assert-Party ($guestAnswer.state.game.round_status -eq 'result') "drugie zgloszenie powinno zamknac pytanie $question"
    Assert-Party ($null -ne $guestAnswer.state.game.correct_answer_index) "wynik pytania $question powinien ujawnic poprawna odpowiedz"

    $advanced = Invoke-PartyApi -Action 'advance_quiz' -Token $hostToken -Body @{ room_code = $roomCode }
    if ($question -lt 5) {
        Assert-Party ($advanced.state.game.round_status -eq 'active') "kolejne pytanie powinno wystartowac po wyniku $question"
        Assert-Party ($advanced.state.game.question_number -eq ($question + 1)) 'numer pytania powinien wzrosnac'
    } else {
        Assert-Party ($advanced.state.room.status -eq 'results') 'ostatnie pytanie powinno zakonczyc Quiz'
    }
}

$final = Invoke-PartyApi -Action 'state' -Method 'GET' -Token $guestToken -Query "&room=$roomCode"
Assert-Party ($final.state.leaderboard.Count -eq 2) 'ranking powinien zawierac obu graczy'
Assert-Party (($final.state.leaderboard | Measure-Object -Property score_total -Sum).Sum -gt 0) 'co najmniej jedna poprawna odpowiedz powinna przyznac punkty'

Invoke-PartyApi -Action 'leave' -Token $hostToken -Body @{ room_code = $roomCode } | Out-Null
$afterTransfer = Invoke-PartyApi -Action 'state' -Method 'GET' -Token $guestToken -Query "&room=$roomCode"
Assert-Party ($afterTransfer.state.you.is_host -eq $true) 'rola gospodarza powinna przejsc na pozostalego gracza'

[pscustomobject]@{
    result = 'PASS'
    room = $roomCode
    questions = 5
    players = 2
    total_points = ($afterTransfer.state.leaderboard | Measure-Object -Property score_total -Sum).Sum
    host_transferred = $afterTransfer.state.you.is_host
} | ConvertTo-Json -Compress
