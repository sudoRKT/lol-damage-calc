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
#        interface     -> may write src/ui/ only
#        harvest       -> may write scripts/extract/ and build/proposed-curated/ only
#      A role with no case below is not refused for lacking one; it falls through to the
#      ledger rule, which is what holds the partition for the areas that have no role file
#      yet (extract, ui, url).
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
    echo "  engine        -> src/engine/"
    echo "  data-pipeline -> scripts/fetch/ and public/data/"
    echo "  extract       -> scripts/extract/ and build/proposed-curated/"
    echo "  url           -> src/url/"
    echo "  ui-burndown   -> src/ui/burndown/"
    echo "  ui-breakdown  -> src/ui/breakdown/"
    echo "  ui-combo      -> src/ui/combo/"
    echo "  ui-config     -> src/ui/config/, picker/, items/, inputs/"
    echo "  ui-stats      -> src/ui/stats/"
    echo "  ui-site       -> src/ui/shell/, pages/, landing/, coverage/"
    echo "  ui-curves     -> src/ui/curves/"
    echo "  ui-compare    -> src/ui/compare/"
    echo
    echo "LEAD-ONLY, and named here so it is not discovered by being refused:"
    echo "  src/ui/app/ (composes everything — an agent NEVER mounts its own component),"
    echo "  src/ui/primitives/, src/ui/data/, src/ui/art/, src/ui/plot/,"
    echo "  src/ui/preview/, src/ui/slice/, src/ui/tokens.css, src/ui/fonts.css,"
    echo "  the four sweep tests at the src/ui root, src/types/, /curated/, and the Markdown."
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
#
# An area is a SET of directories one agent needs together. scripts/fetch/ and public/data/
# are one area because the fetcher writes the data it fetches; scripts/extract/ and
# build/proposed-curated/ are one area for the same reason -- the harvester writes the drafts
# it harvests. Splitting either pair would refuse an agent doing one coherent job.
#
# src/ui WAS ONE AREA UNTIL 2026-08-14, and that was the throughput ceiling rather than tokens:
# almost every remaining task touches the interface, so four agents queued for one directory.
# It is now SEVEN areas, cut along the import graph rather than along the folder names.
#
# WIDENED, NOT WEAKENED. Every path that was writable by an agent before is still governed, and
# the shared parts of src/ui are now refused to EVERY agent rather than being writable by the one
# that claimed `ui` first. The list below is exhaustive; a src/ui path matching none of these
# falls through to the refusal at the bottom, which is the intent.
#
# LEAD-ONLY INSIDE src/ui, AND WHY EACH — measured over every non-test import in the tree:
#   src/ui/app/          composes 10 directories. Mounting is a lead action; an agent exports a
#                        component and never wires it.
#   src/ui/primitives/   imported by 7. Holds the P/M/T tag rule, the status mark, the table
#                        scroller and token-audit.test.ts, which is itself a guard.
#   src/ui/data/         imported by 6. The catalogue contract; changing it changes App.tsx too.
#   src/ui/art/          imported by 6. Shared infrastructure — a changed export ripples into six
#                        areas at once.
#   src/ui/plot/         imported by the two chart areas. Shared axis and scale, same standing.
#   src/ui/preview/      demo harnesses importing 6 directories each.
#   src/ui/slice/
#   src/ui/*.css         tokens.css and fonts.css: every component derives from them.
#   src/ui/*.test.tsx    the four cross-cutting sweeps, each rendering 8 directories. They belong
#                        to no area, exactly as tests/ does.
case "$rel" in
  src/engine/*) area=engine ;;
  scripts/fetch/* | public/data/*) area=data ;;
  scripts/extract/* | build/proposed-curated/*) area=extract ;;
  src/url/*) area=url ;;

  # The seven interface areas. `config` travels with the three directories it imports, and
  # `site` with the two that import it — splitting either would refuse an agent doing one job.
  src/ui/burndown/*) area=ui-burndown ;;
  src/ui/breakdown/*) area=ui-breakdown ;;
  src/ui/combo/*) area=ui-combo ;;
  src/ui/config/* | src/ui/picker/* | src/ui/items/* | src/ui/inputs/*) area=ui-config ;;
  src/ui/stats/*) area=ui-stats ;;
  src/ui/shell/* | src/ui/pages/* | src/ui/landing/* | src/ui/coverage/*) area=ui-site ;;
  src/ui/curves/*) area=ui-curves ;;
  src/ui/compare/*) area=ui-compare ;;

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
  # Added 2026-08-13. Enforcement BY NAME is tighter than the ledger rule below, not looser: a
  # named role is pinned to its area from its first write and can never claim a different one,
  # whereas the ledger only locks an area once someone has written to it. Named roles are also
  # what lets an area be re-deployed in a later fan-out — the ledger locks an area to its first
  # claimant for good, which is correct for concurrency and wrong across sessions.
  #
  # THE 'interface' ROLE WAS RETIRED ON 2026-08-14 and is refused outright. It owned src/ui/
  # entirely, and after the split there is no single area for it to own — an agent spawned from
  # it would claim whichever of the seven it wrote to first, which is the ledger's job and not a
  # role's. Refusing is deliberate: silently falling through to the ledger would let a stale role
  # keep working while meaning something different from what its file says.
  interface)
    refuse "the 'interface' role was retired when src/ui was split into seven areas (2026-08-14). Spawn an agent without a role and it will claim one area from its first write, or use a role that names the area you mean."
    ;;
  harvest)
    [ "$area" = extract ] || refuse "role 'harvest' owns scripts/extract/ and build/proposed-curated/ only"
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
