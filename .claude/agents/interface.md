---
name: interface
description: RETIRED 2026-08-14. src/ui was split into seven areas; this role owns none of them and the boundary hook refuses it outright. Do not spawn it.
tools: Read, Grep, Glob
---

# RETIRED — do not spawn this role

This role owned `src/ui/` entirely. On 2026-08-14 `src/ui` was split into **seven areas**, cut
along the import graph, because almost every remaining task touches the interface and four agents
were queueing for one directory. That was the throughput ceiling — not tokens.

`.claude/hooks/boundary-audit.sh` **refuses this role by name.** It does not fall through to the
ledger rule, deliberately: a stale role that silently kept working would mean something different
from what its file says, and the whole point of enforcing by name is that a named role cannot
drift.

## What to use instead

Spawn an agent with **no role** and it claims one area from its first write, then is locked to it.
The areas inside `src/ui`, and what travels with what, are listed in `CLAUDE.md` and in the hook's
own refusal message.

The parts of `src/ui` that are shared — `app/`, `primitives/`, `data/`, `art/`, `plot/`,
`tokens.css`, and the four cross-cutting sweep tests at the root — belong to the lead and are
refused to every agent. **An agent never mounts its own component in `App.tsx`**; it exports the
component and the lead wires it.
