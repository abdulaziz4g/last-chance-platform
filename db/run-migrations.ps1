# ============================================================================
# Last Chance Platform — apply pending migrations, then run the SQL suites.
# Prereq: docker compose up -d   (from the project root)
#
#   .\db\run-migrations.ps1 [-Baseline] [-SkipTests]
#
# The Windows twin of db/run-migrations.sh. The two are kept deliberately
# small and identical in behaviour: the ledger DDL lives in one shared file
# (db/schema_migrations.sql) so the part that actually matters cannot drift.
#
# -Baseline records every migration as applied WITHOUT running it — the
# one-time adoption path for a database that predates this ledger. It is never
# implicit, because guessing wrong means silently skipping real migrations.
# ============================================================================
param(
    [string]$Container = "lastchance-postgres",
    [string]$Db = "lastchance",
    [string]$User = "lastchance",
    [switch]$Baseline,
    [switch]$SkipTests
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent

function Invoke-Psql {
    param([string[]]$PsqlArgs = @(), [string]$InputFile)

    $base = @("exec", "-i", $Container, "psql", "-U", $User, "-d", $Db, "-q", "-v", "ON_ERROR_STOP=1")
    if ($InputFile) {
        Get-Content -Raw -LiteralPath $InputFile | docker @base @PsqlArgs
    } else {
        docker @base @PsqlArgs
    }
    if ($LASTEXITCODE -ne 0) { throw "psql failed (exit $LASTEXITCODE)" }
}

function Get-NormalizedChecksum {
    param([string]$Path)
    # CR stripped before hashing: this repo checks out LF on Linux and CRLF on
    # Windows, so an unnormalised hash would differ per platform for the same
    # file and report tampering that never happened.
    $text = [System.IO.File]::ReadAllText($Path) -replace "`r", ""
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($text)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    ($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString("x2") }) -join ""
}

# ---- ledger ---------------------------------------------------------------
Invoke-Psql -InputFile (Join-Path $root "db\schema_migrations.sql")

$appliedCount = [int](Invoke-Psql -PsqlArgs @("-tA", "-c", "SELECT count(*) FROM schema_migrations")).Trim()

# Only tables this project created count as "pre-existing schema". Extension-
# owned objects must be excluded: the PostGIS image ships spatial_ref_sys plus
# the geometry_columns/geography_columns views in public, so a *virgin*
# database is never empty. Counting those told every new developer to
# -Baseline an empty schema, which records all migrations as applied without
# creating a single table. Hence relkind r/p (real tables, not views) and
# pg_depend deptype 'e' (owned by an extension) filtered out.
$otherTablesSql = @'
SELECT count(*) FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relkind IN ('r', 'p')
   AND c.relname <> 'schema_migrations'
   AND NOT EXISTS (SELECT 1 FROM pg_depend d
                    WHERE d.classid = 'pg_class'::regclass
                      AND d.objid = c.oid
                      AND d.deptype = 'e')
'@
$otherTables = [int](Invoke-Psql -PsqlArgs @("-tA", "-c", $otherTablesSql)).Trim()

if ($appliedCount -eq 0 -and $otherTables -gt 0 -and -not $Baseline) {
    throw @"
This database already has objects but no migration ledger, so it predates this
mechanism. Replaying the migrations would fail at 0002 (CREATE TYPE has no
IF NOT EXISTS).

If its schema is already up to date, adopt the ledger once:

    .\db\run-migrations.ps1 -Baseline

That records every migration as applied without executing any of them. Do NOT
baseline a partially-migrated database — the skipped files would never run.
"@
}

# ---- apply ----------------------------------------------------------------
$pending = 0
foreach ($f in Get-ChildItem (Join-Path $PSScriptRoot "migrations\*.sql") | Sort-Object Name) {
    $sum = Get-NormalizedChecksum -Path $f.FullName
    $recorded = (Invoke-Psql -PsqlArgs @("-tA", "-c",
        "SELECT checksum FROM schema_migrations WHERE filename = '$($f.Name)'")).Trim()

    if ($recorded) {
        if ($recorded -ne $sum) {
            throw @"
REFUSING: $($f.Name) was applied but its contents have changed.
  recorded $recorded
  on disk  $sum
Editing an applied migration makes every database diverge; add a new migration
instead.
"@
        }
        continue
    }

    $pending++
    if ($Baseline) {
        Write-Host "Baselining $($f.Name) (not executed)" -ForegroundColor DarkYellow
        Invoke-Psql -PsqlArgs @("-c",
            "INSERT INTO schema_migrations (filename, checksum, baselined) VALUES ('$($f.Name)', '$sum', true)")
        continue
    }

    Write-Host "Applying $($f.Name) ..." -ForegroundColor Cyan
    $started = Get-Date
    # Migration and ledger row reach psql as one ordered stream, so with
    # ON_ERROR_STOP a failed migration never records itself as applied.
    $sql = (Get-Content -Raw -LiteralPath $f.FullName) +
           "`nINSERT INTO schema_migrations (filename, checksum) VALUES ('$($f.Name)', '$sum');`n"
    $sql | docker exec -i $Container psql -U $User -d $Db -q -v ON_ERROR_STOP=1
    if ($LASTEXITCODE -ne 0) { throw "Migration failed: $($f.Name)" }
    $elapsed = [int]((Get-Date) - $started).TotalMilliseconds
    # Separate statement: the duration is only knowable once the migration has
    # finished. The row itself is written in-stream, so a failed migration can
    # never record itself as applied.
    Invoke-Psql -PsqlArgs @("-c", "UPDATE schema_migrations SET duration_ms = $elapsed WHERE filename = '$($f.Name)'")
    Write-Host ("  done in {0:N0} ms" -f $elapsed)
}

if ($pending -eq 0) {
    Write-Host "Schema is up to date; nothing to apply." -ForegroundColor Green
} elseif ($Baseline) {
    Write-Host "Baselined $pending migration(s)." -ForegroundColor Green
} else {
    Write-Host "Applied $pending migration(s)." -ForegroundColor Green
}

# ---- suites ---------------------------------------------------------------
if (-not $SkipTests -and -not $Baseline) {
    foreach ($t in Get-ChildItem (Join-Path $PSScriptRoot "tests\*.sql") | Sort-Object Name) {
        Write-Host "Running $($t.Name) ..." -ForegroundColor Cyan
        Invoke-Psql -InputFile $t.FullName
    }
    Write-Host "SQL suites passed." -ForegroundColor Green
}
