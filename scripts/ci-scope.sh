#!/usr/bin/env bash
# CI scope (D-077): "light" when every changed file is Markdown, under docs/ or under mockups/; else "full".
# Light runs only the drift check; full runs `npm run check`. Writes light=true|false to $GITHUB_OUTPUT (or stdout).
# Inputs (env): CI_EVENT (pull_request | push | workflow_dispatch), CI_BEFORE (push: the previous main commit).
# pull_request checks out GitHub's merge commit, so HEAD^1..HEAD is exactly the PR's change (fetch-depth: 2).
set -eo pipefail

out="${GITHUB_OUTPUT:-/dev/stdout}"
light=false
range=""
case "${CI_EVENT:-}" in
  pull_request) range="HEAD^1 HEAD" ;;
  push)
    if [[ -n "${CI_BEFORE:-}" && ! "$CI_BEFORE" =~ ^0+$ ]]; then
      git cat-file -e "$CI_BEFORE^{commit}" 2>/dev/null || git fetch --quiet --depth=1 origin "$CI_BEFORE" || true
      git cat-file -e "$CI_BEFORE^{commit}" 2>/dev/null && range="$CI_BEFORE HEAD"
    fi ;;
esac

if [[ -n "$range" ]]; then
  # Captured first: a pipe into grep -q can SIGPIPE git under pipefail on a big diff.
  # shellcheck disable=SC2086
  files="$(git diff --name-only $range)"
  if [[ -n "$files" ]]; then
    heavy="$(printf '%s\n' "$files" | grep -Ev '(\.md$|^docs/|^mockups/)' || true)"
    [[ -z "$heavy" ]] && light=true
  fi
fi
# No range (manual run, first push, unknown base) or an empty diff: full.
echo "light=$light" >> "$out"
echo "ci-scope: event=${CI_EVENT:-none} range=${range:-none} light=$light" >&2
