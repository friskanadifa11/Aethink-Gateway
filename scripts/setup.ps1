$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Install Docker Desktop first.' }
@('auths','logs','data','postgres-data','redis-data') | ForEach-Object {
  New-Item -ItemType Directory -Force -Path $_ | Out-Null
}
docker compose run --rm clirelay-init
if ($LASTEXITCODE -ne 0) { throw 'CliRelay setup failed.' }
if (-not (Test-Path config.yaml)) { throw 'config.yaml missing after init.' }
$text = Get-Content config.yaml -Raw
$text = [regex]::Replace($text, '(?ms)(^remote-management:\s*\r?\n)(.*?)(?=^\S|\z)', {
 param($m)
 return $m.Groups[1].Value + ($m.Groups[2].Value -replace '  allow-remote: false', '  allow-remote: true')
})
$text = [regex]::Replace($text, '(?ms)(^auto-update:\s*\r?\n)(.*?)(?=^\S|\z)', {
 param($m)
 return $m.Groups[1].Value + ($m.Groups[2].Value -replace '  enabled: true', '  enabled: false')
})
Set-Content -Encoding utf8 config.yaml $text
docker compose up -d
if ($LASTEXITCODE -ne 0) { throw 'Docker compose start failed.' }
Write-Host 'AethinkAI Gateway AI: http://localhost:8787/manage'
Write-Host 'User: admin. View generated CLIRELAY_ADMIN_PASSWORD in .env'
