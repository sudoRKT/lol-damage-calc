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
   minimum damage floors, and the rounding point. Write these as unit tests taken
   directly from the documented formulas, not from engine output.
2. **Worked examples** published in the League wiki's damage and mechanics articles.
3. **Cross-checks against existing public damage calculators.** Where the engine and a
   third-party calculator disagree, that is a finding to surface, not something to
   silently reconcile.

Never edit a test to make the engine pass. If engine and test disagree, assume the
engine is wrong until shown otherwise. Any figure that cannot be established from the
three sources above is `derived` at best, never `verified`.

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
