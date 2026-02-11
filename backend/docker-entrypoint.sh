#!/usr/bin/env sh
set -eu

echo "[backend] waiting for database..."
# simple wait loop
i=0
until nc -z postgres 5432 >/dev/null 2>&1; do
  i=$((i+1))
  if [ "$i" -gt 60 ]; then
    echo "[backend] database not reachable after 60s"
    exit 1
  fi
  sleep 1
done

echo "[backend] applying Prisma schema (db push)..."
npx prisma db push --accept-data-loss >/dev/null

echo "[backend] starting api..."
exec node dist/main
