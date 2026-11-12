#!/usr/bin/env bash
# Runs the migration/RLS tests against a throwaway local Postgres (no Docker needed).
# Usage: npm run db:test            (uses TEST_DATABASE_URL if set, else starts one in /tmp)
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -n "${TEST_DATABASE_URL:-}" ]; then
  exec npx vitest run tests/db
fi

PG_BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
if [ -z "$PG_BIN" ] && command -v pg_ctl >/dev/null; then PG_BIN="$(dirname "$(command -v pg_ctl)")"; fi
if [ -z "$PG_BIN" ]; then
  echo "Postgres not found. Install it, or set TEST_DATABASE_URL to any Postgres you can drop databases on." >&2
  exit 1
fi

DIR="$(mktemp -d /tmp/sahra-pg-XXXX)"
RUN=()
if [ "$(id -u)" = 0 ]; then chown postgres "$DIR"; RUN=(su postgres -c); fi
run() { if [ ${#RUN[@]} -gt 0 ]; then "${RUN[@]}" "$*"; else bash -c "$*"; fi; }

run "$PG_BIN/initdb -D $DIR/data -A trust -U postgres >/dev/null"
run "$PG_BIN/pg_ctl -D $DIR/data -o '-p 54330 -k $DIR -c listen_addresses=' -l $DIR/log -w start >/dev/null"
trap 'run "$PG_BIN/pg_ctl -D $DIR/data -m immediate stop >/dev/null"; rm -rf "$DIR"' EXIT

TEST_DATABASE_URL="postgresql://postgres@localhost:54330/postgres?host=$DIR" npx vitest run tests/db
