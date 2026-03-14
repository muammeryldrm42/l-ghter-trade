#!/bin/sh
set -e
echo "Running database migrations..."
node_modules/.bin/prisma migrate deploy --schema=apps/api/prisma/schema.prisma
echo "Migrations complete. Starting server..."
node apps/api/dist/server.js
