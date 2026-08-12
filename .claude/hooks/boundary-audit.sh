#!/usr/bin/env bash
# boundary-audit.sh — enforces and records the one-writer-per-directory partition.
#
# CLAUDE.md ("Parallel execution") says concurrent agents never share write access to a
# file, and that work is partitioned by directory before any agent is deployed. This hook
# makes that a mechanical fact rather than an instruction an agent might drift away from.
#
# The PreToolUse payload carries `agent_id` (unique per running agent) and `agent_type`
# (the subagent/teammate definition name, when one was used). Both are EMPTY for the lead
# session. Enforcement runs two ways, deliberately, so it works whether or not the agent
# definitions in .claude/agents/ were loaded at session start:
#
#   1. BY NAME, when agent_type is a known role:
#        engine        -> may write src/engine/ only
#        data-pipeline -> may write scripts/fetch/ and public/data/ only
#
#   2. BY LEDGER, otherwise: each area is claimed by the first agent_id that writes into
#      it (recorded in .claude/boundary-owners.tsv). After that, no other agent may write
#      there, and the owning agent may not write into a different area. Two concurrent
#      agents therefore end up locked to one area each without the hook needing to know
#      their names in advance.
#
#   The lead session (empty agent_id) is unrestricted here. It is still bound by the deny
#   rules in settings.json and by protect-curated.sh.
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
ledger="$proj/.claude/boundary-owners.tsv"

# Without jq this hook cannot read the payload. Fail open — protect-curated.sh and the
# settings.json deny rules are the guards that must never depend on jq.
command -v jq >/dev/null 2>&1 || exit 0

tool="$(jq -r '.tool_name // empty' <<<"$input")"
case "$tool" in
  Write | Edit | MultiEdit | NotebookEdit) ;;
  Bash)
    # Publishing is a lead action. An agent has no business pushing to the remote, and
    # unlike a file write there is no undo. The lead (empty agent_id) is unaffected.
    bash_agent="$(jq -r '.agent_id // empty' <<<"$input")"
    if [ -n "$bash_agent" ]; then
      cmd="$(jq -r '.tool_input.command // empty' <<<"$input")"
      if printf '%s' "$cmd" | grep -Eq '(^|[^[:alnum:]_-])git[[:space:]]+([^|;&]*[[:space:]])?push([[:space:]]|$)'; then
        printf '%s\tBLOCK\t%s\t%s\tBash\tgit push\tagents may not push\n' \
          "$(date -Is)" "$(jq -r '.agent_type // empty' <<<"$input")" "${bash_agent:0:12}" >>"$log"
        {
          echo "BLOCKED by boundary-audit hook: an agent may not push to the remote."
          echo "Pushing is outward-facing and cannot be undone. The lead session publishes."
          echo "Report your work as pass and fail counts instead; the lead commits and pushes."
        } >&2
        exit 2
      fi
    fi
    exit 0
    ;;
  *) exit 0 ;;
esac

fp="$(jq -r '.tool_input.file_path // empty' <<<"$input")"
agent="$(jq -r '.agent_type // empty' <<<"$input")"
aid="$(jq -r '.agent_id // empty' <<<"$input")"
[ -n "$fp" ] || exit 0

rel="${fp#"$proj"/}"

record() { # record <ALLOW|BLOCK> <note>
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$(date -Is)" "$1" "${agent:-${aid:-LEAD}}" "${aid:0:12}" "$tool" "$rel" "$2" >>"$log"
}

refuse() { # refuse <reason>
  record BLOCK "$1"
  {
    echo "BLOCKED by boundary-audit hook: $1"
    echo "  agent: ${agent:-unnamed} (${aid:0:12})"
    echo "  path:  $rel"
    echo
    echo "This project partitions write access by directory (CLAUDE.md, 'Parallel execution')."
    echo "  the engine area        -> src/engine/"
    echo "  the data-pipeline area -> scripts/fetch/ and public/data/"
    echo "Everything else, including src/types/, is the lead session's to write."
    echo
    echo "Do NOT work around this, and do NOT write the file by another route. 'Blocked' is"
    echo "a valid state. Stop, and report to the lead what you need and why, so the lead can"
    echo "make the change."
  } >&2
  exit 2
}

# The lead session writes anywhere; log it and move on.
if [ -z "$aid" ] && [ -z "$agent" ]; then
  record ALLOW lead
  exit 0
fi

# Any agent may use scratch space outside the repository.
case "$fp" in
  /tmp/*)
    record ALLOW scratch
    exit 0
    ;;
esac

# Which partitioned area does this path belong to?
case "$rel" in
  src/engine/*) area=engine ;;
  scripts/fetch/* | public/data/*) area=data ;;
  *) refuse "an agent may only write inside a partitioned area; that path is in none" ;;
esac

# 1. Enforcement by name, when the agent was spawned from a known role definition.
case "$agent" in
  engine)
    [ "$area" = engine ] || refuse "role 'engine' owns src/engine/ only"
    record ALLOW "by-name:$area"
    exit 0
    ;;
  data-pipeline)
    [ "$area" = data ] || refuse "role 'data-pipeline' owns scripts/fetch/ and public/data/ only"
    record ALLOW "by-name:$area"
    exit 0
    ;;
esac

# 2. Enforcement by ledger: first agent to write an area owns it, exclusively and for good.
touch "$ledger"
exec 9>"$ledger.lock"
flock 9 2>/dev/null || true

owner="$(awk -F'\t' -v a="$area" '$1 == a { print $2 }' "$ledger" | head -1)"
mine="$(awk -F'\t' -v i="$aid" '$2 == i { print $1 }' "$ledger" | head -1)"

if [ -n "$owner" ] && [ "$owner" != "$aid" ]; then
  refuse "the '$area' area is already owned by another agent (${owner:0:12}); one writer per area"
fi
if [ -n "$mine" ] && [ "$mine" != "$area" ]; then
  refuse "this agent already owns the '$mine' area and may not also write '$area'"
fi
if [ -z "$owner" ]; then
  printf '%s\t%s\t%s\n' "$area" "$aid" "$(date -Is)" >>"$ledger"
  record ALLOW "claimed:$area"
  exit 0
fi

record ALLOW "by-ledger:$area"
exit 0
