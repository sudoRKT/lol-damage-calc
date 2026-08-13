# CLAUDE.md

## What this project is

A browser-based League of Legends damage simulator. The full specification lives in
`SPECIFICATION.md` in this folder — read it when you need detail on scope or behaviour.
It is the source of truth. This file only holds the rules that apply to every session.

Two champions are configured (level, ability ranks, items, runes, entry state), an
ordered combo is executed, and the engine returns an itemised damage breakdown and a
survival verdict. Calculation runs entirely in the browser. No accounts, no server-side
state, no authenticated Riot API access.

## Who you are working with

The project owner does not write code and cannot read it. This is a permanent
constraint on how you communicate, not a temporary gap to work around.

- Explain what you are about to do, and what you did, in plain English.
- Report results as behaviour and numbers. Never hand over a code diff as an
  explanation.
- When you need a decision, describe the options in terms of what a user of the site
  would see or experience — not in terms of implementation.
- Never say "this looks correct" or "this should work." Those are guesses stated as
  facts. Say what you actually ran and what it actually returned.
- If a request will cause a problem later, say so plainly before doing it.
- Define any technical term the first time you use it in a session.

## The rule that matters most

This product's only value is that its numbers are right. A plausible wrong number is
worse than no product at all, because nobody can tell it is wrong.

**Nothing is complete because you believe it is complete.** A component is complete
when a known-answer test passes against it. Report completion as pass and fail counts
against named test scenarios, never as a claim of doneness.

In-client verification is not available on this project. Correctness is therefore
established from three substitute sources, in descending order of authority:

1. **Formula tests.** Large parts of the engine are deterministic arithmetic that can
   be tested without the game: the armor and MR multipliers, the four-step
   resistance-modifier order, adaptive force resolution, crit, execute thresholds,
   and the rounding point. Write these as unit tests taken directly from the documented
   formulas, not from engine output. (A "minimum damage floor" was listed here until
   2026-08-12; it was investigated and no such game-wide rule exists — DATA-SOURCES §14.)
2. **Worked examples** published in the League wiki's damage and mechanics articles.
3. **Cross-checks against existing public damage calculators.** Where the engine and a
   third-party calculator disagree, that is a finding to surface, not something to
   silently reconcile.

Never edit a test to make the engine pass. If engine and test disagree, assume the
engine is wrong until shown otherwise. Any figure that cannot be established from the
three sources above is `derived` at best, never `verified`.

**Source authority is time-dependent, not just field-dependent.** Neither the wiki nor Data
Dragon is right in general, and which one is right about a given field can change in the days
after a patch. The wiki's champion data module is updated by hand and routinely sits a patch
behind; Data Dragon ships with the patch. So a field the wiki normally wins it can still lose
in that window — this is not hypothetical, it is how 28 champions ended up with wrong magic
resistance. The tie-break is the wiki's own patch-notes article, which is current even when
its data module is not. Where nothing resolves a disagreement, take neither silently: use the
value that ships with the patch, flag it `contested`, and surface it. The full rule, and the
two guards that stop stale overrides accumulating, are in DATA-SOURCES.md §15.

## Non-negotiables from the spec

- Resistance-modifier order is fixed: flat reduction, then percentage reduction, then
  percentage penetration, then flat penetration. Do not reorder it.
- Damage over time is never folded into the burst total. It is always a separate line,
  and the survival verdict is given twice — burst alone, and burst plus DoT.
- Every ability carries a verification status: verified, derived, or incomplete. It is
  shown to the user. Never present a derived figure as though it were verified.
- Damage type is never conveyed by colour alone. Every damage value carries a
  non-colour cue as well: a `P`/`M`/`T` tag (physical/magic/true) placed with the number
  and read out in full to assistive technology. This is not optional and not a
  colour-only "success/error" pattern — hue is reserved for damage data. See DESIGN.md.
- The engine models sequence, not elapsed time. No timestamps, no decay, no ticking,
  no attack-speed-derived attack counts.
- The curated override file is the only irreplaceable asset in this project. Every
  other input can be re-fetched from source. It lives in the top-level `/curated/`
  directory, which is guarded two ways: a Claude Code hook
  (`.claude/hooks/protect-curated.sh`) refuses tool writes/deletes to it, and its files are
  filesystem read-only. No script may write it. To author it deliberately, unlock as
  described in `curated/README.md`.
- Rounding behaviour is fixed and documented at a single point in the engine.

## How to work

- Use plan mode for anything touching the calculation engine or the curated data file.
  Present the plan and wait for approval before writing.
- Small, single-purpose commits with plain-English messages that say what changed in
  terms of behaviour.
- Do not add a dependency without saying what it is for and what removing it later
  would involve.
- When the spec is ambiguous or self-contradictory, raise it. Do not silently resolve
  it by picking a reading.
- Prefer boring, well-documented choices over clever ones. This codebase will be
  maintained by someone who is still learning.

## The machine this is built on

Development happens on CachyOS, an Arch-based Linux distribution, running KDE Plasma on
Wayland. Package management is `pacman` and the AUR, **not** `apt`. Never suggest
`apt`, `apt-get`, or `.deb` packages — they do not exist on this system. Prefer commands
that work regardless of distribution where possible, and say which package manager you
are using when you cannot.

Hardware is a Ryzen 5 3600, 32 GB RAM, NVIDIA RTX 4060. Ample for local web development.

## Design direction

The site's look is a defined deliverable, not something that emerges from the build. See
§10.1 of the specification.

- The design token file is `DESIGN.md` in the project root. Read it before writing any
  interface code. Every component derives its colours, type, and spacing from it. Never
  introduce a colour, font, or spacing value that is not in it. The chosen direction is
  "Bench Test": graphite and steel, with hue reserved for the three damage types.
- Use official game art rather than text labels. Champion portraits, ability icons, item
  icons, and rune icons come from Data Dragon. The combo builder shows ability icons, not
  lettered buttons.
- Three looks recur in machine-generated design and are banned here: cream background with
  serif display type and a terracotta accent; near-black background with one acid accent;
  broadsheet layout of hairline rules and zero border radius. If a proposal resembles one
  of these, say so and produce a different direction.
- Concentrate animation on the combo resolving against the target's health. Keep motion
  restrained everywhere else.

## The guards

Four mechanical guards run on this project. A safety system nobody has written down is one
nobody can audit, so this is the written record. **Only the lead session may change any of
them**, and changing one is a deliberate act to be stated plainly, never a side effect of
making a task easier. If a guard blocks legitimate work, say so and propose a fix — do not
route around it, and do not weaken it to get unblocked.

| Guard | What it blocks | Who it applies to |
|---|---|---|
| `.claude/hooks/protect-curated.sh` | Writes and deletes targeting the top-level `/curated/` tree, whether by file tool or by an obvious destructive shell command | Everyone, lead included |
| Read-only filesystem permissions on `/curated/` | Any write to that directory, including one buried inside a script that no hook can inspect | Every process on the machine |
| `.claude/hooks/boundary-audit.sh` | An agent writing outside its assigned directory, and any agent pushing to the remote | Agents only — the lead is unaffected |
| `permissions.deny` in `.claude/settings.json` | Editing `/curated/` or `DESIGN.md`; `git reset`/`checkout`/`clean`; installing or removing dependencies; `rm -rf`; `chmod` | Everyone, lead included |

Two things worth knowing about how these fit together:

- **The directory partition is enforced per agent, two ways.** An agent spawned from a named
  role (`.claude/agents/engine.md`, `.claude/agents/data-pipeline.md`) is held to that role's
  directory. An agent spawned without one claims an area on its first write and is then locked
  to it — so the partition holds even when the role definitions were not loaded. Every write,
  allowed or refused, is appended to `.claude/boundary-audit.log`, which is the audit trail:
  it records which agent wrote which file, and whether any agent tried to reach across.
- **The partitioned areas are:** `src/engine/` · `scripts/fetch/` + `public/data/` ·
  `scripts/extract/` + `build/proposed-curated/` · `src/ui/` · `src/url/`. A path in none of
  them is refused to every agent, and belongs to the lead — that includes `src/types/`,
  `/curated/`, and the project's Markdown. Two directories share one area when one agent
  needs both to do one job: the fetcher writes the data it fetches, the harvester writes the
  drafts it harvests. `src/url/` is the one name not fixed by prior work; rename it in the
  hook if the scenario↔URL encoder lands somewhere else.
- **Publishing is a lead action.** Agents are refused `git push` by the hook rather than by a
  blanket rule, so the lead can still do its job. Agents are also instructed not to commit.

**Known limit, stated rather than papered over:** the hooks inspect tool calls. A write buried
inside a Node or Python subprocess is invisible to them. `/curated/` is defended against that
case by the read-only filesystem permissions; nothing else in the tree is.

## Parallel execution

This project is built by running multiple agents concurrently. The following bind every
agent, lead or teammate:

- **One writer per file.** Work is partitioned by directory before any agent is
  deployed. If a task would make you write outside your assigned directory, stop and
  report it rather than reaching across the boundary.
- **The interface contract is frozen.** Shared type definitions and the engine's public
  interface are changed only by the lead session, never by a teammate mid-task. If a
  teammate needs a contract change, it is raised, not made.
- **Report in plain English with numbers.** Status is pass and fail counts against named
  tests plus a one-paragraph summary. Never a code dump.
- **Blocked is a valid state.** Say what you are waiting on. Do not invent a stub and
  proceed as though the dependency existed.

## Commands

Run `npm install` once after cloning. The stack is TypeScript + Vite + React + Vitest; the
app is a pure static site — none of these start a server or database (§1).

- Install: `npm install`
- Run locally: `npm run dev` — Vite dev server (defaults to http://localhost:5173)
- Typecheck: `npm run typecheck` — `tsc --noEmit`; no output on success
- Test: `npm test` — runs the known-answer suite once and prints pass/fail counts. With no
  tests present it passes (`--passWithNoTests`); a real failing test is what fails the run.
- Test (watch): `npm run test:watch`
- Build: `npm run build` — typechecks, then emits the static site to `dist/`
- Preview a build: `npm run preview`

## Current state

Area 0 (the lead foundation) is built and verified: repo + git, the TypeScript/Vite/React/
Vitest toolchain, the frozen type contract in `src/types/` (Scenario, Result, all data
shapes), the one canonical mock Result (`src/types/mock-result.ts`), and the design tokens
(`src/ui/tokens.css`) seeded from `DESIGN.md`. `npm run typecheck` passes, `npm test` is
green (no tests yet), and `npm run dev` serves the page. The `/curated/` write-guard is
active (hook + read-only filesystem).

Not yet built (each is its own partitioned area, per the technical-foundation plan): the
engine, the data pipeline, the curated override file, the scenario↔URL encoder, and the UI.
Nothing has been verified against the practice tool yet.

Ten stats now carry an owner (`caster` / `target` / `unresolved`) and are refused without
one: the four health pools, armor and bonus armor, magic resistance and bonus magic
resistance, maximum and current mana. The rule and the measurement behind it are in
DATA-SOURCES.md §16. Two things it records that are NOT fixed: 12 abilities are `incomplete`
because the source never says whose armor, magic resistance or mana they read (Malphite W
among them), and item and rune effects have not been harvested at all, so their 85 owner-
bearing references are counted but unwritten.

**Gate 5 ran at scale for the first time on 2026-08-13 and disagreed with half the sample — 14 of
28 abilities (DATA-SOURCES §29).** Seven defect classes came out of it, each measured across the
roster: a damage-over-time ability storing one tick as the whole ability (64 components at risk),
the coefficient shape stored inside out (12 ratios), second-form abilities on the wrong rank axis
(6), a blank damage type silently defaulted to magic (14 entries, 2 contradicted by the source),
percentage modifiers stored as flat damage (44 components), the prose path dropping a bare
literal (29 suspect), and "additional" damage stored as a replacement (1). **None of these is
visible to gate 2**, because every one of them round-trips correctly — they are errors of meaning,
not of transcription. Fix them before trusting any roster-wide figure.

**11 entries are `verified`**, the first in the project, recorded in `verification/gate5-passes.json`.
An entry reaches that status only when gate 5 passed it AND gate 2 agreed; the ledger is the only
route and the batch runner enforces both.

Abilities carry FOUR verification statuses, not three: `verified`, `derived`, `incomplete` and
`no-damage` (DATA-SOURCES §27). The fourth exists because 239 entries that deal no damage at all
were reading `derived` — "extracted from source, not independently confirmed" — which is a claim
about numbers none of them had. `no-damage` is only claimed when the ability's own template and
`Module:DamageData/data` are silent together; where they disagree the entry is `incomplete`.

Separately, an entry may carry `unresolvable` — facts **no source states**, so nobody can ever
supply them. 23 entries do, all ratio owners the source declines to attribute. These are NOT a
worklist: SPECIFICATION §8 records that the interface must present them as "cannot be completed"
rather than "not yet modelled". Do not put them on a plan as work.

The description-prose extraction path is built (DATA-SOURCES §25, extended in §27). Abilities that state their
damage in a sentence rather than a leveling row — almost all of them innate passives — used to
harvest to zero damage. **52 abilities now carry damage they did not have, 48 of them leaving the
worklist, and 26 are confirmed value-by-value against the wiki's own expansion.** The other 26
carry damage **nothing has checked** — they have no level progression to re-render and no
leveling row in the ability box, so neither half of gate 2 reaches them. That is the largest open
weakness in the gate. 69 abilities remain unread, grouped by cause in §27, and the largest group
is blocks the source does not label at all. Everything the path produces is
`derived` at most. Two rules it works by are worth carrying forward: a block whose meaning is not
stated in the source is left unread rather than judged from the surrounding sentence, and a row
that cannot be read in full is not stored in part.

The shape library has a real gap: 32 abilities deal a percentage of a health pool whose
percentage is itself scaled (`10–20% (+2.5% per 100 AP) of target's maximum health`). `Ratio`
cannot express it, so those abilities are currently stored wrong. They are detected and forced
to `incomplete`; the proposed contract change is written up in DATA-SOURCES.md §17 and is
waiting on a decision. Do not add the shape without one.
