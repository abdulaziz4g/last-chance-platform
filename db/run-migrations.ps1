# ============================================================================
# Last Chance Platform — apply all migrations in order, then run smoke tests.
# Prereq: docker compose up -d   (from the project root)
# Usage:  .\db\run-migrations.ps1 [-SkipTests]
# ============================================================================
param(
    [string]$Container = "lastchance-postgres",
    [string]$Db = "lastchance",
    [string]$User = "lastchance",
    [switch]$SkipTests
)

$ErrorActionPreference = "Stop"

$files = Get-ChildItem (Join-Path $PSScriptRoot "migrations\*.sql") | Sort-Object Name
foreach ($f in $files) {
    Write-Host "Applying $($f.Name) ..." -ForegroundColor Cyan
    docker exec -i $Container psql -q -v ON_ERROR_STOP=1 -U $User -d $Db -f "/migrations/$($f.Name)"
    if ($LASTEXITCODE -ne 0) { throw "Migration failed: $($f.Name)" }
}
Write-Host "All migrations applied." -ForegroundColor Green

if (-not $SkipTests) {
    Write-Host "Running smoke tests ..." -ForegroundColor Cyan
    docker exec -i $Container psql -q -v ON_ERROR_STOP=1 -U $User -d $Db -f "/db-tests/smoke_test.sql"
    if ($LASTEXITCODE -ne 0) { throw "Smoke tests FAILED" }
    Write-Host "Smoke tests passed." -ForegroundColor Green
}
