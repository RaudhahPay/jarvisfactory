#!/usr/bin/env bash
# Verify the template is internally consistent.
# Per SOP §2.2: "done means live and verified." This is the local verification.

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
RESET='\033[0m'

pass=0
fail=0

check() {
  local name=$1
  local cond=$2
  if eval "$cond" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${RESET} $name"
    pass=$((pass + 1))
  else
    echo -e "${RED}✗${RESET} $name"
    fail=$((fail + 1))
  fi
}

echo "── Required files ──"
check "package.json"           "test -f package.json"
check "tsconfig.json"          "test -f tsconfig.json"
check "next.config.js"         "test -f next.config.js"
check "tailwind.config.ts"     "test -f tailwind.config.ts"
check "wrangler.jsonc"         "test -f wrangler.jsonc"
check "middleware.ts"          "test -f middleware.ts"
check ".env.example"           "test -f .env.example"
check ".gitignore"             "test -f .gitignore"
check "components.json"        "test -f components.json"

echo ""
echo "── SOP-critical lib files ──"
check "lib/supabase/server.ts"        "test -f lib/supabase/server.ts"
check "lib/supabase/admin.ts"         "test -f lib/supabase/admin.ts"
check "lib/supabase/middleware.ts"    "test -f lib/supabase/middleware.ts"
check "lib/auth/require-user.ts"      "test -f lib/auth/require-user.ts"
check "lib/auth/require-staff.ts"     "test -f lib/auth/require-staff.ts"
check "lib/utils.ts"                  "test -f lib/utils.ts"
check "lib/types.ts"                  "test -f lib/types.ts"

echo ""
echo "── App shell ──"
check "app/layout.tsx"                            "test -f app/layout.tsx"
check "app/page.tsx"                              "test -f app/page.tsx"
check "app/globals.css"                           "test -f app/globals.css"
check "app/(auth)/login/page.tsx"                 "test -f 'app/(auth)/login/page.tsx'"
check "app/(auth)/login/login-form.tsx"           "test -f 'app/(auth)/login/login-form.tsx'"
check "app/(auth)/signup/page.tsx"                "test -f 'app/(auth)/signup/page.tsx'"
check "app/(auth)/signup/signup-form.tsx"         "test -f 'app/(auth)/signup/signup-form.tsx'"
check "app/(app)/layout.tsx"                      "test -f 'app/(app)/layout.tsx'"
check "app/(app)/app-shell.tsx"                   "test -f 'app/(app)/app-shell.tsx'"
check "app/(app)/dashboard/page.tsx"              "test -f 'app/(app)/dashboard/page.tsx'"

echo ""
echo "── Actions & migrations ──"
check "actions/auth.ts"                       "test -f actions/auth.ts"
check "supabase/migrations/01-profiles.sql"   "test -f supabase/migrations/01-profiles.sql"

echo ""
echo "── Docs ──"
check "README.md"  "test -f README.md"
check "CLAUDE.md"  "test -f CLAUDE.md"

echo ""
echo "── SOP §4.2 pattern enforcement ──"
check "admin.ts uses SERVICE_ROLE_KEY"        "grep -q 'SUPABASE_SERVICE_ROLE_KEY' lib/supabase/admin.ts"
check "requireUser imports server client"     "grep -q 'createSupabaseServerClient' lib/auth/require-user.ts"
check "auth.ts uses requireUser for mutation" "grep -q 'requireUser' actions/auth.ts"
check "auth.ts uses admin client"             "grep -q 'createSupabaseAdminClient' actions/auth.ts"
check "auth.ts validates input with zod"      "grep -q 'safeParse' actions/auth.ts"

echo ""
echo "── SOP §5 RLS pattern ──"
check "profiles migration enables RLS"        "grep -q 'enable row level security' supabase/migrations/01-profiles.sql"
check "profiles migration denies INSERT RLS"  "grep -q 'for insert with check (false)' supabase/migrations/01-profiles.sql"
check "profiles migration has owner SELECT"   "grep -q 'auth.uid()' supabase/migrations/01-profiles.sql"

echo ""
echo "── SOP §4.5 secret hygiene ──"
check "gitignore excludes .env.local"         "grep -q '.env.local' .gitignore"
check "wrangler.jsonc has no SERVICE_ROLE in vars" "! grep -E '^\s*\"SUPABASE_SERVICE_ROLE_KEY\"\s*:' wrangler.jsonc"
check "admin.ts file is the ONLY one referencing SERVICE_ROLE" "test \"\$(grep -rl 'SUPABASE_SERVICE_ROLE_KEY' --include='*.ts' --include='*.tsx' . | grep -v node_modules | wc -l | tr -d ' ')\" = '1'"

echo ""
echo "── Summary ──"
echo "$pass pass, $fail fail"
if [ "$fail" -gt 0 ]; then
  echo -e "${RED}TEMPLATE INCOMPLETE${RESET}"
  exit 1
fi
echo -e "${GREEN}TEMPLATE STRUCTURE VERIFIED${RESET}"
echo ""
echo "Next steps:"
echo "  1. cd $ROOT"
echo "  2. pnpm install"
echo "  3. bash scripts/install-shadcn.sh   # adds 44 shadcn/ui components"
echo "  4. cp .env.example .env.local       # then fill in Supabase keys"
echo "  5. Apply supabase/migrations/01-profiles.sql in your Supabase SQL editor"
echo "  6. pnpm dev   # → http://localhost:3100  (3000 reserved for JarvisFactory)"
