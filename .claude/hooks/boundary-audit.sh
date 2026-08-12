#!/usr/bin/env bash
# boundary-audit.sh — enforces and records the one-writer-per-directory partition.
#
# CLAUDE.md ("Parallel execution") says concurrent agents never share write access to a
# file, and that work is partitioned by directory before any agent is deployed. This hook
# makes that a mechanical fact rather than an instruction an agent might drift away from.
#
# The PreToolUse payload carries `agent_type` (the subagent/teammate definition name) and is
# EMPTY for the lead session, so the partition can be enforced per agent:
#
#   agent_type = engine         -> may write src/engine/ only
#   agent_type = data-pipeline  -> may write scripts/fetch/ and public/data/ only
#   agent_type = (empty, lead)  -> unrestricted here (still bound by the deny rules in
#                                  settings.json and by protect-curated.sh)
#   any other agent             -> scratch space only
#
# Every decision, allowed or blocked, is appended to .claude/boundary-audit.log so a human
# can read back exactly which agent wrote which file, and whether any agent tried to reach
# across its boundary.
#
# LIMIT, stated honestly: this inspects tool calls. A write buried inside a node or python
# subprocess is invisible to it. /curated/ is defended against that case by read-only
# filesystem permissions (see curated/README.md); nothing else in the tree is.
set -euo pipefail

input="$(cat)"
proj="${CLAUDE_PROJECT_DIR:-$PWD}"
log="$proj/.claude/boundary-audit.log"

# Without jq this hook cannot read the payload. Fail open — protect-curated.sh and the
# settings.json deny rules are the guards that must never depend on jq.
command -v jq >/dev/null 2>&1 || exit 0

tool="$(jq -r '.tool_name // empty' <<<"$input")"
case "$tool" in
  Write | Edit | MultiEdit | NotebookEdit) ;;
  *) exit 0 ;;
esac

fp="$(jq -r '.tool_input.file_path // empty' <<<"$input")"
agent="$(jq -r '.agent_type // empty' <<<"$input")"
aid="$(jq -r '.agent_id // empty' <<<"$input")"
[ -n "$fp" ] || exit 0

rel="${fp#"$proj"/}"

allowed=0
case "$agent" in
  "")
    allowed=1
    ;;
  engine)
    case "$rel" in src/engine/*) allowed=1 ;; esac
    ;;
  data-pipeline)
    case "$rel" in scripts/fetch/* | public/data/*) allowed=1 ;; esac
    ;;
esac
# Any agent may use scratch space outside the repository.
case "$fp" in /tmp/*) allowed=1 ;; esac

ts="$(date -Is)"
if [ "$allowed" -eq 1 ]; then
  printf '%s\tALLOW\t%s\t%s\t%s\t%s\n' "$ts" "${agent:-LEAD}" "${aid:0:12}" "$tool" "$rel" >>"$log"
  exit 0
fi

printf '%s\tBLOCK\t%s\t%s\t%s\t%s\n' "$ts" "${agent:-LEAD}" "${aid:0:12}" "$tool" "$rel" >>"$log"
{
  echo "BLOCKED by boundary-audit hook: agent '${agent:-unknown}' may not write: $rel"
  echo
  echo "This project partitions write access by directory (CLAUDE.md, 'Parallel execution')."
  echo "  engine         -> src/engine/ only"
  echo "  data-pipeline  -> scripts/fetch/ and public/data/ only"
  echo
  echo "Do NOT work around this, and do NOT write the file by another route. 'Blocked' is a"
  echo "valid state. Stop, and report to the lead session what you need and why, so the lead"
  echo "can make the change. Shared types in src/types/ are frozen and lead-owned."
} >&2
exit 2
