#!/usr/bin/env bash
# protect-curated.sh — PreToolUse guard for the irreplaceable /curated/ source tree.
#
# Blocks (exit 2) any attempt to write or delete the TOP-LEVEL curated/ directory:
#   - Write / Edit / MultiEdit whose file_path is under <project>/curated/   (reliable)
#   - Bash commands with an obvious destructive op naming top-level curated/ (best-effort)
#
# It deliberately does NOT match public/data/curated/ (the disposable served copy), and it
# excludes cp/mv (ambiguous source-vs-destination) — those, plus writes hidden inside a
# program's own filesystem calls, are caught by the read-only filesystem permissions instead.
# See curated/README.md.
set -euo pipefail

input="$(cat)"
have_jq() { command -v jq >/dev/null 2>&1; }
if have_jq; then
  tool="$(printf '%s' "$input" | jq -r '.tool_name // empty')"
  proj="$(printf '%s' "$input" | jq -r '.cwd // empty')"
else
  # Fail closed enough to be useful without jq: crude field extraction.
  tool="$(printf '%s' "$input" | grep -o '"tool_name"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')"
  proj=""
fi
[ -n "${CLAUDE_PROJECT_DIR:-}" ] && proj="$CLAUDE_PROJECT_DIR"

block() {
  {
    echo "BLOCKED by protect-curated hook: $1"
    echo "/curated/ is the project's irreplaceable, hand-authored asset (SPECIFICATION 7.3)."
    echo "No tool or script may write or delete it. To edit deliberately, a human unlocks it:"
    echo "  chmod -R u+w curated/   (see curated/README.md)"
  } >&2
  exit 2
}

# True if PATH refers to the top-level curated tree (not public/data/curated).
is_top_curated() {
  local p="$1"
  p="${p#./}"
  case "$p" in
    curated|curated/*) return 0 ;;
  esac
  if [ -n "$proj" ]; then
    case "$p" in
      "$proj"/curated|"$proj"/curated/*) return 0 ;;
    esac
  fi
  return 1
}

get() { # get <jq-path>
  if have_jq; then printf '%s' "$input" | jq -r "$1 // empty"; fi
}

case "$tool" in
  Write|Edit|MultiEdit)
    fp="$(get '.tool_input.file_path')"
    [ -n "$fp" ] && is_top_curated "$fp" && block "$tool -> $fp"
    ;;
  Bash)
    cmd="$(get '.tool_input.command')"
    if [ -n "$cmd" ]; then
      # Does the command name the TOP-LEVEL curated path? (relative token not preceded by '/',
      # or the absolute <proj>/curated which is not a substring of <proj>/public/data/curated)
      names_curated=0
      printf '%s' "$cmd" | grep -Eq '(^|[^[:alnum:]_./-])curated(/|[^[:alnum:]_.-]|$)' && names_curated=1
      if [ -n "$proj" ] && printf '%s' "$cmd" | grep -Fq "$proj/curated"; then names_curated=1; fi
      if [ "$names_curated" -eq 1 ]; then
        # Destructive/write op? redirections, or these verbs. cp/mv excluded on purpose.
        if printf '%s' "$cmd" | grep -Eq '>>?[[:space:]]*[^|;&]*curated' \
           || printf '%s' "$cmd" | grep -Eq '(^|[^[:alnum:]_])(rm|shred|unlink|truncate|tee|dd)([[:space:]]|$)' \
           || printf '%s' "$cmd" | grep -Eq 'sed[[:space:]]+-i'; then
          block "Bash command appears to write/delete top-level curated/: $cmd"
        fi
      fi
    fi
    ;;
esac
exit 0
