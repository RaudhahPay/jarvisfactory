#!/usr/bin/env bash
# Install the 40 canonical shadcn/ui components for the v12 template.
# Run once after `pnpm install`:
#   bash scripts/install-shadcn.sh
#
# Per Coach Fadzil's decision: "Full 40+ from day one" (Phase 7 RESET, ArchNote §9 decision log).

set -e

# Canonical 40 — covers 95% of CRUD + dashboard UI patterns.
COMPONENTS=(
  accordion
  alert
  alert-dialog
  avatar
  badge
  breadcrumb
  button
  calendar
  card
  carousel
  chart
  checkbox
  collapsible
  command
  context-menu
  dialog
  dropdown-menu
  form
  hover-card
  input
  input-otp
  label
  menubar
  navigation-menu
  pagination
  popover
  progress
  radio-group
  resizable
  scroll-area
  select
  separator
  sheet
  skeleton
  slider
  sonner
  switch
  table
  tabs
  textarea
  toast
  toggle
  toggle-group
  tooltip
)

echo "Installing ${#COMPONENTS[@]} shadcn/ui components..."
for c in "${COMPONENTS[@]}"; do
  echo "  + $c"
  npx shadcn@latest add "$c" --yes --overwrite > /dev/null 2>&1 || echo "    (skipped — already present or unavailable)"
done

echo ""
echo "Done. Run 'pnpm typecheck' to verify."
