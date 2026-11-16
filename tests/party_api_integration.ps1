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

$guestSessions = @(
    Invoke-PartyApi -Action 'join' -Body @{ room_code = $roomCode; nickname = 'Gosc 1' }
    Invoke-PartyApi -Action 'join' -Body @{ room_code = $roomCode; nickname = 'Gosc 2' }
    Invoke-PartyApi -Action 'join' -Body @{ room_code = $roomCode; nickname = 'Gosc 3' }
)
$guestTokens = @($guestSessions | ForEach-Object { $_.token })
$allTokens = @($hostToken) + $guestTokens
Assert-Party ($guestSessions[-1].state.players.Count -eq 4) 'w pokoju powinien byc gospodarz i trzech gosci'

$readyState = $null
foreach ($token in $allTokens) {
    $readyState = Invoke-PartyApi -Action 'ready' -Token $token -Body @{ room_code = $roomCode; ready = $true }
}
Assert-Party (@($readyState.state.players | Where-Object { -not $_.is_ready }).Count -eq 0) 'wszyscy gracze powinni byc gotowi'

Start-Sleep -Seconds 22
$staleProbe = Invoke-PartyApi -Action 'state' -Method 'GET' -Token $guestTokens[-1] -Query "&room=$roomCode"
Assert-Party (@($staleProbe.state.players | Where-Object { $_.is_online }).Count -eq 1) 'po przerwie tylko wracajacy gracz powinien byc online'

$offlineStartRejected = $false
try {
    Invoke-PartyApi -Action 'start_tournament' -Token $hostToken -Body @{ room_code = $roomCode } | Out-Null
} catch {
    $offlineStartRejected = [int]$_.Exception.Response.StatusCode -eq 409
}
Assert-Party $offlineStartRejected 'start powinien byc zablokowany, gdy czesc graczy jest offline'

$recoveredState = $null
foreach ($token in $allTokens) {
    $recoveredState = Invoke-PartyApi -Action 'state' -Method 'GET' -Token $token -Query "&room=$roomCode"
}
Assert-Party (@($recoveredState.state.players | Where-Object { -not $_.is_online }).Count -eq 0) 'kazda sesja powinna wrocic tym samym tokenem'
Assert-Party (@($recoveredState.state.players | Where-Object { -not $_.is_ready }).Count -eq 0) 'gotowosc powinna przetrwac chwilowy brak aktywnosci'

$preparedQuiz = Invoke-PartyApi -Action 'start_tournament' -Token $hostToken -Body @{ room_code = $roomCode }
Assert-Party ($preparedQuiz.state.room.status -eq 'preparation') 'turniej powinien zaczac sie od przygotowania rundy'
Assert-Party ($preparedQuiz.state.tournament.total_rounds -eq 2) 'turniej powinien miec dwie rundy'
Assert-Party ($preparedQuiz.state.tournament.order[0].key -eq 'quiz') 'Quiz powinien byc pierwsza runda'
Assert-Party ($preparedQuiz.state.tournament.order[1].key -eq 'higher_lower') 'Wiecej czy mniej powinno byc druga runda'

$startedQuiz = Invoke-PartyApi -Action 'advance_tournament' -Token $hostToken -Body @{ room_code = $roomCode }
Assert-Party ($startedQuiz.state.room.status -eq 'active') 'Quiz powinien zmienic pokoj na aktywny'
Assert-Party ($startedQuiz.state.game.question_count -eq 5) 'Quiz powinien zawierac piec pytan'

for ($question = 1; $question -le 5; $question++) {
    $hostAnswer = Invoke-PartyApi -Action 'submit_answer' -Token $hostToken -Body @{ room_code = $roomCode; answer = 0 }
    Assert-Party ($hostAnswer.state.game.your_answer_index -eq 0) "odpowiedz gospodarza powinna zostac zapisana dla pytania $question"
    if ($question -eq 1) {
        $duplicateRejected = $false
        try {
            Invoke-PartyApi -Action 'submit_answer' -Token $hostToken -Body @{ room_code = $roomCode; answer = 1 } | Out-Null
        } catch {
            $duplicateRejected = [int]$_.Exception.Response.StatusCode -eq 409
        }
        Assert-Party $duplicateRejected 'druga odpowiedz tego samego gracza powinna zostac odrzucona'
    }

    $lastGuestAnswer = $null
    for ($guestIndex = 0; $guestIndex -lt $guestTokens.Count; $guestIndex++) {
        $lastGuestAnswer = Invoke-PartyApi -Action 'submit_answer' -Token $guestTokens[$guestIndex] -Body @{
            room_code = $roomCode
            answer = $guestIndex + 1
        }
    }
    Assert-Party ($lastGuestAnswer.state.game.round_status -eq 'result') "czwarta odpowiedz powinna zamknac pytanie $question"
    Assert-Party ($lastGuestAnswer.state.game.answers_received -eq 4) "pytanie $question powinno zapisac cztery odpowiedzi"
    Assert-Party ($null -ne $lastGuestAnswer.state.game.correct_answer_index) "wynik pytania $question powinien ujawnic poprawna odpowiedz"

    $advanced = Invoke-PartyApi -Action 'advance_tournament' -Token $hostToken -Body @{ room_code = $roomCode }
    if ($question -lt 5) {
        Assert-Party ($advanced.state.game.round_status -eq 'active') "kolejne pytanie powinno wystartowac po wyniku $question"
        Assert-Party ($advanced.state.game.question_number -eq ($question + 1)) 'numer pytania powinien wzrosnac'
    } else {
        Assert-Party ($advanced.state.room.status -eq 'round_result') 'ostatnie pytanie powinno zakonczyc runde Quizu'
        Assert-Party ($advanced.state.tournament.round_leaderboard.Count -eq 4) 'wynik rundy powinien zawierac czterech graczy'
    }
}

$quizLeaderboard = Invoke-PartyApi -Action 'advance_tournament' -Token $hostToken -Body @{ room_code = $roomCode }
Assert-Party ($quizLeaderboard.state.room.status -eq 'leaderboard') 'po wyniku rundy powinna pojawic sie tabela turnieju'
$preparedHigherLower = Invoke-PartyApi -Action 'advance_tournament' -Token $hostToken -Body @{ room_code = $roomCode }
Assert-Party ($preparedHigherLower.state.room.status -eq 'preparation') 'druga runda powinna miec stan przygotowania'
Assert-Party ($preparedHigherLower.state.tournament.current_round.key -eq 'higher_lower') 'druga runda powinna uruchomic Wiecej czy mniej'

$startedHigherLower = Invoke-PartyApi -Action 'advance_tournament' -Token $hostToken -Body @{ room_code = $roomCode }
Assert-Party ($startedHigherLower.state.room.status -eq 'active') 'Wiecej czy mniej powinno przejsc do stanu gry'
Assert-Party ($startedHigherLower.state.game.card_count -eq 5) 'Wiecej czy mniej powinno zawierac piec porownan'

for ($card = 1; $card -le 5; $card++) {
    $hostAnswer = Invoke-PartyApi -Action 'submit_answer' -Token $hostToken -Body @{ room_code = $roomCode; choice = 'more' }
    Assert-Party ($hostAnswer.state.game.your_choice -eq 'more') "wybor gospodarza powinien zostac zapisany dla porownania $card"
    if ($card -eq 1) {
        $duplicateRejected = $false
        try {
            Invoke-PartyApi -Action 'submit_answer' -Token $hostToken -Body @{ room_code = $roomCode; choice = 'less' } | Out-Null
        } catch {
            $duplicateRejected = [int]$_.Exception.Response.StatusCode -eq 409
        }
        Assert-Party $duplicateRejected 'drugi wybor tego samego gracza powinien zostac odrzucony'
    }

    $lastGuestAnswer = $null
    for ($guestIndex = 0; $guestIndex -lt $guestTokens.Count; $guestIndex++) {
        $choice = if ($guestIndex % 2 -eq 0) { 'less' } else { 'more' }
        $lastGuestAnswer = Invoke-PartyApi -Action 'submit_answer' -Token $guestTokens[$guestIndex] -Body @{
            room_code = $roomCode
            choice = $choice
        }
    }
    Assert-Party ($lastGuestAnswer.state.game.round_status -eq 'result') "czwarta odpowiedz powinna zamknac porownanie $card"
    Assert-Party ($lastGuestAnswer.state.game.answers_received -eq 4) "porownanie $card powinno zapisac cztery odpowiedzi"
    Assert-Party (@('more', 'less') -contains $lastGuestAnswer.state.game.correct_choice) "porownanie $card powinno ujawnic wynik"

    $advanced = Invoke-PartyApi -Action 'advance_tournament' -Token $hostToken -Body @{ room_code = $roomCode }
    if ($card -lt 5) {
        Assert-Party ($advanced.state.game.round_status -eq 'active') "kolejne porownanie powinno wystartowac po wyniku $card"
        Assert-Party ($advanced.state.game.card_number -eq ($card + 1)) 'numer porownania powinien wzrosnac'
    } else {
        Assert-Party ($advanced.state.room.status -eq 'round_result') 'ostatnie porownanie powinno zakonczyc druga runde'
    }
}

$finalLeaderboard = Invoke-PartyApi -Action 'advance_tournament' -Token $hostToken -Body @{ room_code = $roomCode }
Assert-Party ($finalLeaderboard.state.room.status -eq 'leaderboard') 'po drugiej rundzie powinna pojawic sie tabela'
$finished = Invoke-PartyApi -Action 'advance_tournament' -Token $hostToken -Body @{ room_code = $roomCode }
Assert-Party ($finished.state.room.status -eq 'finished') 'ostatnia tabela powinna zakonczyc turniej'
Assert-Party ($finished.state.tournament.rounds.Count -eq 2) 'historia turnieju powinna zawierac dwie rundy'
Assert-Party ($finished.state.leaderboard.Count -eq 4) 'ranking powinien zawierac czterech graczy'
Assert-Party (($finished.state.leaderboard | Measure-Object -Property score_total -Sum).Sum -gt 0) 'obie gry powinny przyznac punkty do wspolnego wyniku'

$restoredFinished = Invoke-PartyApi -Action 'state' -Method 'GET' -Token $guestTokens[0] -Query "&room=$roomCode"
Assert-Party ($restoredFinished.state.room.status -eq 'finished') 'sesja powinna odtworzyc koncowy stan turnieju'

Invoke-PartyApi -Action 'leave' -Token $hostToken -Body @{ room_code = $roomCode } | Out-Null
$afterTransfer = Invoke-PartyApi -Action 'state' -Method 'GET' -Token $guestTokens[0] -Query "&room=$roomCode"
Assert-Party ($afterTransfer.state.you.is_host -eq $true) 'rola gospodarza powinna przejsc na pozostalego gracza'

[pscustomobject]@{
    result = 'PASS'
    room = $roomCode
    rounds = 2
    quiz_questions = 5
    higher_lower_cards = 5
    players = 4
    sessions_recovered = 4
    total_points = ($afterTransfer.state.leaderboard | Measure-Object -Property score_total -Sum).Sum
    host_transferred = $afterTransfer.state.you.is_host
} | ConvertTo-Json -Compress
