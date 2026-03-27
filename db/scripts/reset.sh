#!/usr/bin/env bash
# Reset the dev database: drop, recreate, migrate, seed
set -e

DB_URL="${DATABASE_URL:-postgresql+asyncpg://gator:gator@localhost:5432/gator_dev}"
DB_SYNC_URL="${DATABASE_URL_SYNC:-postgresql://gator:gator@localhost:5432/gator_dev}"

echo "→ Dropping and recreating gator_dev..."
psql "${DB_SYNC_URL%/*}/postgres" -c "DROP DATABASE IF EXISTS gator_dev;"
psql "${DB_SYNC_URL%/*}/postgres" -c "CREATE DATABASE gator_dev OWNER gator;"

echo "→ Running Alembic migrations..."
cd "$(dirname "$0")/../../api"
DATABASE_URL="$DB_URL" alembic upgrade head

echo "→ Running seeds..."
psql "$DB_SYNC_URL" -f "../db/seeds/kronos_paycodes.sql"

echo "→ Seeding super admin (via startup seed)..."
echo "  Start the API once to trigger core/seed.py, or run: python -c 'import asyncio; from app.core.seed import run_seed; ...'"

echo "✓ Reset complete."
