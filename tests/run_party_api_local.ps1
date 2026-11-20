param(
    [string]$MariaDbBin = 'C:\xampp\mysql\bin',
    [string]$PhpExe = 'php.exe',
    [switch]$BrowserTests
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
$dataDir = Join-Path $tempRoot ('gk-party-api-' + [guid]::NewGuid().ToString('N'))
$password = [guid]::NewGuid().ToString('N')
$database = 'gk_party_local_test'
$dbProcess = $null
$phpProcess = $null

function Get-FreePort {
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
    $listener.Start()
    try { return $listener.LocalEndpoint.Port }
    finally { $listener.Stop() }
}

try {
    $dbPort = Get-FreePort
    $httpPort = Get-FreePort
    New-Item -ItemType Directory -Path $dataDir -ErrorAction Stop | Out-Null
    $installer = Join-Path $MariaDbBin 'mysql_install_db.exe'
    $mysqld = Join-Path $MariaDbBin 'mysqld.exe'
    $mysql = Join-Path $MariaDbBin 'mysql.exe'
    $mysqladmin = Join-Path $MariaDbBin 'mysqladmin.exe'
    & $installer "--datadir=$dataDir" "--port=$dbPort" "--password=$password" --silent
    if ($LASTEXITCODE -ne 0) { throw 'Nie udało się utworzyć izolowanej bazy.' }

    $dbProcess = Start-Process -FilePath $mysqld -ArgumentList @(
        '--no-defaults', "--datadir=$dataDir", "--port=$dbPort", '--bind-address=127.0.0.1',
        '--skip-name-resolve', '--console'
    ) -WorkingDirectory $repoRoot -WindowStyle Hidden -PassThru `
      -RedirectStandardOutput (Join-Path $dataDir 'mysql.out') `
      -RedirectStandardError (Join-Path $dataDir 'mysql.err')

    $ready = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        & $mysqladmin --protocol=tcp -h 127.0.0.1 -P $dbPort -u root "-p$password" ping 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        Start-Sleep -Milliseconds 500
    }
    if (-not $ready) {
        $errorTail = Get-Content (Join-Path $dataDir 'mysql.err') -Tail 20 -ErrorAction SilentlyContinue
        throw "MariaDB nie uruchomiła się: $errorTail"
    }
    & $mysql --protocol=tcp -h 127.0.0.1 -P $dbPort -u root "-p$password" `
      -e "CREATE DATABASE $database CHARACTER SET utf8mb4 COLLATE utf8mb4_polish_ci"
    if ($LASTEXITCODE -ne 0) { throw 'Nie udało się utworzyć testowej bazy.' }

    # Apply the explicit schema before starting HTTP; API requests never execute DDL.
    $schema = Get-Content -LiteralPath (Join-Path $repoRoot 'gierkoteka/party/setup.sql') -Raw
    & $mysql --protocol=tcp -h 127.0.0.1 -P $dbPort -u root "-p$password" $database -e $schema
    if ($LASTEXITCODE -ne 0) { throw 'Nie udało się zastosować jawnego schematu Party.' }

    $env:PARTY_DB_HOST = '127.0.0.1'
    $env:PARTY_DB_PORT = [string]$dbPort
    $env:PARTY_DB_NAME = $database
    $env:PARTY_DB_USER = 'root'
    $env:PARTY_DB_PASS = $password
    $phpProcess = Start-Process -FilePath $PhpExe -ArgumentList @(
        '-S', "127.0.0.1:$httpPort", '-t', $repoRoot
    ) -WorkingDirectory $repoRoot -WindowStyle Hidden -PassThru `
      -RedirectStandardOutput (Join-Path $dataDir 'php.out') `
      -RedirectStandardError (Join-Path $dataDir 'php.err')

    $baseUrl = "http://127.0.0.1:$httpPort/gierkoteka/party/api.php"
    $httpReady = $false
    $lastHttpStatus = 0
    $lastHttpError = ''
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        try {
            Invoke-WebRequest -Uri "${baseUrl}?action=state" -UseBasicParsing -TimeoutSec 2 | Out-Null
            $httpReady = $true
            break
        } catch {
            $lastHttpError = $_.Exception.Message
            if ($_.Exception.Response) { $lastHttpStatus = [int]$_.Exception.Response.StatusCode }
            if ($lastHttpStatus -eq 401) {
                $httpReady = $true
                break
            }
            Start-Sleep -Milliseconds 250
        }
    }
    if (-not $httpReady) {
        $phpLog = Get-Content (Join-Path $dataDir 'php.err') -Tail 12 -ErrorAction SilentlyContinue
        throw "Lokalne API PHP nie uruchomiło się (HTTP $lastHttpStatus, $lastHttpError): $phpLog"
    }
    foreach ($mode in @('screen', 'phones')) {
        & (Join-Path $PSScriptRoot 'party_api_integration.ps1') -BaseUrl $baseUrl -Mode $mode
        if ($LASTEXITCODE -ne 0) { throw 'Test integracyjny API nie przeszedl.' }
    }
    if ($BrowserTests) {
        & node (Join-Path $PSScriptRoot 'party_phones_browser_test.cjs') ($baseUrl -replace 'api.php$', '')
        if ($LASTEXITCODE -ne 0) { throw 'Test przegladarek nie przeszedl.' }
    }
} finally {
    if ($phpProcess -and -not $phpProcess.HasExited) { Stop-Process -Id $phpProcess.Id -Force }
    if ($dbProcess -and -not $dbProcess.HasExited) {
        & $mysqladmin --protocol=tcp -h 127.0.0.1 -P $dbPort -u root "-p$password" shutdown 2>$null | Out-Null
        if (-not $dbProcess.WaitForExit(5000)) { Stop-Process -Id $dbProcess.Id -Force }
    }
    $resolved = [IO.Path]::GetFullPath($dataDir)
    if ($resolved.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -and
        [IO.Path]::GetFileName($resolved).StartsWith('gk-party-api-')) {
        Remove-Item -LiteralPath $resolved -Recurse -Force -ErrorAction SilentlyContinue
    }
}
