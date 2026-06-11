#!/usr/bin/env bash
# Verify prerequisites are installed before first build.
# Run from jarvisdesktop-poc/ directory.

set -e
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
RESET='\033[0m'

pass=0
fail=0
optional_pass=0
optional_skip=0

check() {
  local name=$1
  local cmd=$2
  local install_hint=$3
  if eval "$cmd" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${RESET} $name"
    pass=$((pass + 1))
  else
    echo -e "${RED}✗${RESET} $name"
    echo -e "  ${YELLOW}→${RESET} Install: $install_hint"
    fail=$((fail + 1))
  fi
}

check_optional() {
  local name=$1
  local cmd=$2
  local note=$3
  if eval "$cmd" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${RESET} $name"
    optional_pass=$((optional_pass + 1))
  else
    echo -e "${YELLOW}○${RESET} $name (optional, skipped — $note)"
    optional_skip=$((optional_skip + 1))
  fi
}

echo "── Required for JarvisDesktop POC ──"
check "Apple Command Line Tools (cc)" "xcode-select -p" "xcode-select --install"
check "Node 20+" "node --version | grep -E 'v(20|21|22|23|24)'" "brew install node"
check "pnpm 9+" "pnpm --version" "npm install -g pnpm"
check "Rust toolchain (rustc)" "rustc --version" "brew install rust  # or visit rustup.rs"
check "Cargo" "cargo --version" "(comes with Rust)"

echo ""
echo "── Optional but recommended ──"
check_optional "Tauri CLI globally" "tauri --version" "pnpm tauri works without it"

echo ""
echo "── Summary ──"
echo "Required: $pass pass / $fail fail"
echo "Optional: $optional_pass installed / $optional_skip skipped"
if [ "$fail" -gt 0 ]; then
  echo -e "${RED}Install the required tools above, then re-run this script.${RESET}"
  exit 1
fi
echo -e "${GREEN}You're ready.${RESET}"
echo ""
echo "Next:"
echo "  pnpm install            # one-time"
echo "  pnpm tauri dev          # launches JARVIS"
