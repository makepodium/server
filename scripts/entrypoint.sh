#!/bin/sh
set -e

# wait for postgres to accept connections before migrating
until pnpm drizzle-kit migrate; do
    echo "migration failed or db not ready, retrying in 2s..."
    sleep 2
done

exec node dist/index.js
