#!/usr/bin/env bash
# ============================================================================
# Last Chance Platform — apply pending migrations, then run the SQL suites.
#
#   ./db/run-migrations.sh [--baseline] [--skip-tests]
#
# Talks to the database one of two ways, because CI and a laptop differ:
#   * LC_DB_DIRECT=1  -> psql straight at PGHOST/PGPORT (GitHub service
#                        containers, where psql is on the runner already)
#   * otherwise       -> docker exec into LC_CONTAINER (compose on a laptop)
#
# Files are piped on STDIN rather than passed with -f, so the same command
# works whether psql is inside the container (where the path is /migrations)
# or outside it (where the path is db/migrations).
#
# --baseline records every migration as applied WITHOUT running it. That is the
# one-time adoption path for a database that predates this ledger; it is never
# implicit, because guessing wrong means silently skipping real migrations.
# ============================================================================
set -euo pipefail

BASELINE=0
SKIP_TESTS=0
for arg in "$@"; do
  case "$arg" in
    --baseline)   BASELINE=1 ;;
    --skip-tests) SKIP_TESTS=1 ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER="${LC_CONTAINER:-lastchance-postgres}"
DB="${LC_DB:-lastchance}"
USER_NAME="${LC_USER:-lastchance}"

psql_run() {
  if [ "${LC_DB_DIRECT:-0}" = "1" ]; then
    PGPASSWORD="${PGPASSWORD:-lastchance_dev_only}" psql \
      -h "${PGHOST:-localhost}" -p "${PGPORT:-5432}" \
      -U "$USER_NAME" -d "$DB" -q -v ON_ERROR_STOP=1 "$@"
  else
    docker exec -i "$CONTAINER" psql \
      -U "$USER_NAME" -d "$DB" -q -v ON_ERROR_STOP=1 "$@"
  fi
}

# Strip CR before hashing: this repo checks out LF on Linux and CRLF on
# Windows, so an unnormalised hash would differ per platform for an identical
# file and report tampering that never happened.
checksum_of() { tr -d '\r' < "$1" | sha256sum | cut -d' ' -f1; }

# ---- ledger ---------------------------------------------------------------
psql_run < "$ROOT/db/schema_migrations.sql"

applied_count=$(psql_run -tA -c 'SELECT count(*) FROM schema_migrations')

# Only tables this project created count as "pre-existing schema". Extension-
# owned objects must be excluded: the PostGIS image ships spatial_ref_sys plus
# the geometry_columns/geography_columns views in public, so a *virgin*
# database is never empty. Counting those told every new developer to
# --baseline an empty schema, which records all migrations as applied without
# creating a single table. Hence relkind r/p (real tables, not views) and
# pg_depend deptype 'e' (owned by an extension) filtered out.
other_tables=$(psql_run -tA -c "
  SELECT count(*) FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind IN ('r', 'p')
     AND c.relname <> 'schema_migrations'
     AND NOT EXISTS (SELECT 1 FROM pg_depend d
                      WHERE d.classid = 'pg_class'::regclass
                        AND d.objid = c.oid
                        AND d.deptype = 'e')")

if [ "$applied_count" -eq 0 ] && [ "$other_tables" -gt 0 ] && [ "$BASELINE" -eq 0 ]; then
  cat >&2 <<'MSG'
This database already has objects but no migration ledger, so it predates
this mechanism. Replaying the migrations would fail at 0002 (CREATE TYPE has
no IF NOT EXISTS).

If its schema is already up to date, adopt the ledger once:

    ./db/run-migrations.sh --baseline

That records every migration as applied without executing any of them. Do NOT
baseline a partially-migrated database — the skipped files would never run.
MSG
  exit 1
fi

# ---- apply ----------------------------------------------------------------
pending=0
for f in "$ROOT"/db/migrations/*.sql; do
  name="$(basename "$f")"
  sum="$(checksum_of "$f")"

  recorded="$(psql_run -tA -c \
    "SELECT checksum FROM schema_migrations WHERE filename = '$name'")"

  if [ -n "$recorded" ]; then
    if [ "$recorded" != "$sum" ]; then
      echo "REFUSING: $name was applied but its contents have changed." >&2
      echo "  recorded $recorded" >&2
      echo "  on disk  $sum" >&2
      echo "Editing an applied migration makes every database diverge; add a" >&2
      echo "new migration instead." >&2
      exit 1
    fi
    continue
  fi

  pending=$((pending + 1))
  if [ "$BASELINE" -eq 1 ]; then
    echo "Baselining $name (not executed)"
    psql_run -c "INSERT INTO schema_migrations (filename, checksum, baselined)
                 VALUES ('$name', '$sum', true)"
    continue
  fi

  echo "Applying $name ..."
  started=$(date +%s%3N)
  # The migration and its ledger row go to psql as one ordered stream, so with
  # ON_ERROR_STOP a failed migration never records itself as applied.
  {
    cat "$f"
    printf "\nINSERT INTO schema_migrations (filename, checksum) VALUES ('%s', '%s');\n" \
      "$name" "$sum"
  } | psql_run
  elapsed=$(( $(date +%s%3N) - started ))
  # Timing is a separate statement because the duration is only knowable once
  # the migration has finished. The row itself is written in-stream, so a
  # failed migration can never record itself as applied.
  psql_run -c "UPDATE schema_migrations SET duration_ms = $elapsed
               WHERE filename = '$name'"
  echo "  done in ${elapsed} ms"
done

if [ "$pending" -eq 0 ]; then
  echo "Schema is up to date; nothing to apply."
elif [ "$BASELINE" -eq 1 ]; then
  echo "Baselined $pending migration(s)."
else
  echo "Applied $pending migration(s)."
fi

# ---- suites ---------------------------------------------------------------
if [ "$SKIP_TESTS" -eq 0 ] && [ "$BASELINE" -eq 0 ]; then
  for t in "$ROOT"/db/tests/*.sql; do
    echo "Running $(basename "$t") ..."
    psql_run < "$t"
  done
fi
