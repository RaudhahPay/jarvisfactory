#!/usr/bin/env bash
# Asserts the repo has no Next.js remnants after the migration.
set -euo pipefail

FAIL=0

if [ -d "app/" ]; then
  echo "✗ app/ directory still exists"
  FAIL=1
fi

if [ -f "next.config.js" ] || [ -f "next.config.mjs" ] || [ -f "next.config.ts" ]; then
  echo "✗ next.config.* still exists"
  FAIL=1
fi

if [ -f "middleware.ts" ]; then
  echo "✗ middleware.ts still exists"
  FAIL=1
fi

# Check for next imports in server/lib/web source (not node_modules, not .git)
NEXT_IMPORTS=$(grep -rn "from ['\"]next" --include='*.ts' --include='*.tsx' \
  server/ lib/ web/src/ 2>/dev/null | grep -v node_modules || true)
if [ -n "$NEXT_IMPORTS" ]; then
  echo "✗ Found 'next' imports in source:"
  echo "$NEXT_IMPORTS"
  FAIL=1
fi

if [ $FAIL -eq 0 ]; then
  echo "✓ No Next.js remnants found"
else
  exit 1
fi
