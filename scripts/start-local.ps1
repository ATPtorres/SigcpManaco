$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $projectRoot '.runtime'
$mysqlExe = Join-Path $runtimeDir 'mysql-8.4.13-winx64\bin\mysqld.exe'
$mysqlConfig = Join-Path $runtimeDir 'my.ini'
if (!(Test-Path -LiteralPath $mysqlExe) -or !(Test-Path -LiteralPath $mysqlConfig)) {
    throw 'La instancia MySQL local aún no está configurada. Consulta README-windows.md.'
}
function Test-LocalPort([int]$port) {
    $client = [System.Net.Sockets.TcpClient]::new()
    try { $client.Connect('127.0.0.1', $port); return $true } catch { return $false } finally { $client.Dispose() }
}
if (!(Test-LocalPort 3307)) {
    $mysqlProcess = Start-Process -FilePath $mysqlExe -ArgumentList ('--defaults-file="' + $mysqlConfig + '"') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru
    $mysqlProcess.Id | Set-Content (Join-Path $runtimeDir 'mysql-process.pid')
}
$mysqlReady = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    if (Test-LocalPort 3307) { $mysqlReady = $true; break }
    Start-Sleep -Milliseconds 500
}
if (!$mysqlReady) { throw 'MySQL no inició. Revisa .runtime\mysql-error.log.' }
if (!(Test-LocalPort 3000)) {
    $nodeExe = (Get-Command node.exe).Source
    $backendProcess = Start-Process -FilePath $nodeExe -ArgumentList 'server/index.cjs' -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDir 'backend.log') -RedirectStandardError (Join-Path $runtimeDir 'backend-error.log')
    $backendProcess.Id | Set-Content (Join-Path $runtimeDir 'backend-process.pid')
}
$backendReady = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try {
        $health = Invoke-RestMethod 'http://127.0.0.1:3000/api/health' -TimeoutSec 2
        if ($health.status -eq 'ok' -and $health.database -eq 'mysql') { $backendReady = $true; break }
    } catch { }
    Start-Sleep -Milliseconds 500
}
if (!$backendReady) { throw 'El backend no está listo. Revisa .runtime\backend-error.log.' }
Write-Host 'SIGCP MANACO iniciado: http://127.0.0.1:3000'
Write-Host 'Usuario: admin. La contraseña está en APP_PASSWORD dentro de .env.'
