#!/usr/bin/env bash
# Writes .env.local pointing at the local Supabase stack (`npx supabase start`).
# The local stack's keys are fixed development keys, not secrets.
set -euo pipefail
cd "$(dirname "$0")/.."
eval "$(npx supabase status -o env 2>/dev/null | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
cat > .env.local <<ENV
NEXT_PUBLIC_SUPABASE_URL=$API_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
ENV
echo "Wrote .env.local for the local Supabase at $API_URL"
