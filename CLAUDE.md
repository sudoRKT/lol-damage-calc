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

## The interface has been audited against its own design file

`DESIGN-AUDIT.md` at the project root records the state of the built interface against DESIGN.md,
section by section, measured on the live page rather than judged. **Start there rather than
re-deriving it.**

**THE HEADLINE HAS MOVED, AND THIS PARAGRAPH WAS STALE UNTIL 2026-08-15.** It said the
configuration row occupied the whole first screen and the burndown — the signature element —
began 309px below the fold, on a page 3.4 screens tall. That was true when audited and was fixed
on 2026-08-14 by commits `658d61c` and `a09cd0c`, re-measured in DESIGN-AUDIT §6.1: the
configuration row fell 921px → 413px, the page 3,793px → 3,286px, and **the burndown's top edge
moved from 309px BELOW the fold to 350px ABOVE it**, with the first 235px of the chart itself
above it too. The first screen now holds both champions, the combo, the running total, the
verdict and the top of the burndown.

**What has NOT changed is the judgement: the interface is correct and characterless.** Item 1 of
the audit's order of work is done; items 3–6 are not, and §4's caution stands — items 1 and 3 are
where "Bench Test" actually lives, and item 3 is the more tempting to defer because nothing is
broken.

It also carries the damage-type tag finding and its reframing, which is the part most easily lost:
**SPECIFICATION §10.1 requires only that damage type is never conveyed by colour alone. The letter,
and its placement on the ability chip, are DESIGN.md's additions** — so both can change without
touching the colour-alone rule. A player reads a chip marked `M` as an ability slot, not as magic
damage.

The three SPECIFICATION requirements the audit recorded as absent — the Riot disclaimer and the
scope disclaimer (§15), and the report-a-wrong-number control (§8) — **are all present and were
built in commit `1e3ba36`, about a minute after the audit was written.** Confirmed on the live page
2026-08-15. The audit's §2 table said "No" to all three until then; it now carries both the audited
and the current column.

**Item 1 of its order of work is DONE, item 2's decision is taken, and item 4's three requirements
are done** (ad slots remain, and PLAN.md §6 gates them behind the privacy and cookie policies).
Items 3 (the instrument details), 5 (the mobile horizontal overflow) and 6 (the portrait tint) are
outstanding.

**THREE STALE CLAIMS IN THIS PROJECT'S OWN DOCUMENTS WERE FOUND ON 2026-08-15 IN ONE SESSION** —
the fold headline above, the `KNOWN_DRIFT` paragraph below, and this requirements table. Each sent
an agent to do work that was already done. **Before acting on any sentence here that says something
is missing, absent, open or undecided, check the commit log.** These documents are briefings with
dates on them, not standing facts.

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
- **The partitioned areas are twelve, since 2026-08-14.** Four outside the interface —
  `src/engine/` · `scripts/fetch/` + `public/data/` · `scripts/extract/` +
  `build/proposed-curated/` · `src/url/` — and eight inside it: `ui-burndown`, `ui-breakdown`,
  `ui-combo`, `ui-config` (`config/` + `picker/` + `items/` + `inputs/`), `ui-stats`, `ui-site`
  (`shell/` + `pages/` + `landing/` + `coverage/`), `ui-curves`, `ui-compare`. Two directories
  share one area when one agent needs both to do one job: the fetcher writes the data it fetches,
  the harvester writes the drafts it harvests, and `config` travels with the three directories it
  imports.
- **`src/ui` was one area until 2026-08-14 and that was the throughput ceiling**, not tokens:
  almost every remaining task touches the interface, so agents queued for one directory. The
  split is cut along the IMPORT GRAPH, not the folder names.
- **LEAD-ONLY INSIDE `src/ui`, named here rather than discovered by being refused:** `app/`
  (composes 10 directories — **an agent never mounts its own component**, it exports one and the
  lead wires it), `primitives/` (imported by 7, and holds the tag and status rules and the token
  audit), `data/` (imported by 6, the catalogue contract), `art/` (imported by 6), `plot/` (the
  shared axis and scale both chart areas read), `preview/` and `slice/` (demo harnesses importing
  6 directories each), `tokens.css`, `fonts.css`, and the four cross-cutting sweep tests at the
  `src/ui` root, each of which renders 8 directories at once. A path in no area is refused to
  every agent and belongs to the lead — that also includes `src/types/`, `/curated/`, and the
  project's Markdown.
- **RELEASE AN AREA WHEN ITS AGENT REPORTS. This is a LEAD DISCIPLINE and it has already failed
  once.** The ledger (`.claude/boundary-owners.tsv`) locks an area to its claimant, and a claim
  expires only on a 12-hour timer — because the hook inspects tool calls and cannot ask whether a
  process is still alive. **The lead can.** A completion notification is proof the owner is done,
  and the claim must be dropped then. On 2026-08-15 eight claims from the previous evening's
  fan-out were all held by agents that had finished, reported, and had their work committed; two
  agents of the next fan-out were refused their own areas before anyone noticed, and three more
  would have been. The timer is the backstop, not the mechanism.
- **The `interface` role is RETIRED and refused by name.** It owned `src/ui/` entirely and now
  owns none of the eight. Spawn an agent with no role and it claims one area from its first
  write.
- **Publishing is a lead action.** Agents are refused `git push` by the hook rather than by a
  blanket rule, so the lead can still do its job. Agents are also instructed not to commit.

- **The lead may edit `.claude/boundary-owners.tsv` and NOTHING ELSE in `.claude/`.** Granted
  2026-08-15. Releasing a dead claim is housekeeping, not a guard change: the ledger records who
  holds an area, the hooks and the deny rules are what enforce it, and waiting twelve hours for a
  timer because a classifier refused a one-line edit is friction with no safety in it. The rule is
  two lines in `permissions.allow` naming that one file. **It does not extend to
  `.claude/hooks/`, `.claude/settings.json`, or `.claude/boundary-audit.log`** — the first two are
  guards and the third is the audit trail, and an audit trail its subject can edit is not one.

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
- **Before merging anything into `/curated/`: `npm run premerge:check`** — see below. It is not
  optional and it is not slow; it is the difference between finding a moved figure before the
  merge and after it.

## Never hand over merge commands without running the pre-merge check

**`npm run premerge:check` runs the whole suite against the curated file you are ABOUT to merge,
and reports only what the merge would BREAK** — it measures a baseline first, in the same throwaway
copy, and differences the two failure sets, so a working tree that is already red does not drown
the answer.

It exists because of a specific failure on 2026-08-15, and the failure is worth keeping because it
was not carelessness. A merge was verified thoroughly: hash, entry count, component count, gate 8
over the file, and the four abilities it was meant to fix, all measured, all correct. The suite was
green — **against the old file.** Nothing ran it against the new one. **Fifteen tests failed the
moment it landed**, and the project owner found them rather than the session that handed over the
commands. Not one was a bad merge; every one was a check pinned to data the merge legitimately
moved. But the person running the commands cannot tell those apart from a broken build, and being
handed a red tree by someone who said it was green is the part that costs trust.

**A merge changes the data a dozen tests measure.** Verifying the FILE is not verifying the MERGE.

It was proved by replay rather than assumed to work: run against the pre-merge file as baseline and
the corrected file as the proposal, it reports exactly those 15, and separately names 2 that were
already failing and are not the merge's doing.

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

**Gate 5's output is a DETECTOR, never a per-entry verdict.** Decided 2026-08-13 and binding.
Verifying the roster by independent re-derivation is not 165 agent runs, it is 165 *per patch* —
a pass is evidence about one revision of one page and is void the moment a value changes. So gate
5 is sampled, and **a finding it makes becomes a mechanical check that runs on all 937 pages
offline**. Every one of the seven classes it found in its first run became exactly that, which is
why one 28-ability sample bought roster-wide coverage. When gate 5 finds something, the work is
not to fix that entry — it is to write the check that finds every other instance of it.
`derived` is the documented normal state (SPECIFICATION §8); `verified` is a small honest set and
is never a target to maximise.

**A DETECTOR PROPOSES, A PERSON CONFIRMS, AND STORAGE IS GATED ON THE CONFIRMED POPULATION.**
Decided 2026-08-13 and binding. **This is the default for anything that multiplies a damage
number.**

A pattern that finds candidates is not a pattern that can decide them. Two cases proved it and
both are now built this way:

- **Gate 5** finds defect classes; it never certifies an entry. Its output is a class and a
  mechanical check (DATA-SOURCES §32.4).
- **Variable hit counts** (§38). The prose test fires on **24** entries across the roster where a
  person reading the sentences found **17**, and it mis-shaped one of those. So the shape is
  STORED only on the population a person has read, recorded in `READ_POPULATION` in
  `scripts/extract/variable-hits.ts`. An entry outside it that trips the test is **reported for
  someone to read, never written**.

The failure it prevents is specific: two wordings that read almost identically mean opposite
things. *"reduced to 50% against those hit by subsequent WAVES"* is a later hit on the same
champion; *"reduced to 50% against TARGETS beyond the first"* is a different champion. A regular
expression cannot tell them apart reliably, and getting it wrong hands one champion damage that
belongs to another — a plausible wrong number, which is the failure this project exists to prevent.

**Adding a member means reading its sentence, not widening the pattern.** Widening a detector so it
stores more is the exact move this rule forbids.

**A PUBLISHED FIGURE'S NAME IS A CLAIM, AND A NAME THAT DOES NOT MATCH ITS DEFINITION IS A WRONG
NUMBER WITH NO DIGITS IN IT.** Written 2026-08-15 after the third one in a week. This project's whole
premise is that a plausible wrong number is worse than no product, because nobody can tell it is
wrong — and a figure whose digits are correct and whose NAME is false is exactly that, with the
added problem that no test can fail on it. All three below were arithmetically perfect and all three
sent someone to do the wrong work:

| Figure | What the name claimed | What it counted |
|---|---|---|
| `runesModelled` | runes the engine applies | runes with a **curated entry**, applied or not |
| `defensiveReadyToApply` | defences ready to apply | defences of **three** kinds, where the engine has five |
| `perTickAbilitiesHeldBack` | held back **by the tick count** | per-tick entries that are `incomplete` **for any reason** — 8 of 17 for something else |

The rule, in the order the checks are cheap: **a name states the definition, or the definition is
stated beside it.** Where the two can drift, the definition wins and the name changes. When you
publish a count, read its name back as a sentence and ask whether that sentence is true of every
member — `perTickAbilitiesHeldBack` fails that test out loud, and it survived for weeks because
nobody said it aloud. **Never report a count without its definition** is already the standing rule
for talking about figures; this is the same rule applied to storing them.

**A falling count is usually the system working.** Making a gate more precise, or adding one,
moves entries from `derived` to `incomplete` — that is evidence arriving, not regression. Compare
counts only against a stated definition, never against yesterday's number alone.

**Gate 5 ran at scale for the first time on 2026-08-13 and disagreed with half the sample — 14 of
28 abilities (DATA-SOURCES §29).** Seven defect classes came out of it, each measured across the
roster: a damage-over-time ability storing one tick as the whole ability (64 components at risk),
the coefficient shape stored inside out (12 ratios), second-form abilities on the wrong rank axis
(6), a blank damage type silently defaulted to magic (14 entries, 2 contradicted by the source),
percentage modifiers stored as flat damage (44 components), the prose path dropping a bare
literal (29 suspect), and "additional" damage stored as a replacement (1). **None of these is
visible to gate 2**, because every one of them round-trips correctly — they are errors of meaning,
not of transcription. Fix them before trusting any roster-wide figure.

**10 entries are `verified`, measured over a full 937-page run on 2026-08-13.** **DEFINITION: an
entry is `verified` when the gate-5 ledger records an independent re-derivation AND the batch
runner's promotion rule fires, which requires agreement from at least one of the three gate-2
round-trips.** `verification/gate5-passes.json` is the only route in.

This figure moved twice in one day and the path is worth keeping. CLAUDE.md said 11 and PLAN.md
said 10, while the pipeline actually produced **8** — Aphelios Q Moonshot and Ambessa P were
refused promotion because their only evidence came from the prose round-trip the runner never
invoked. Wiring that round-trip in (§36.2) restored them, and the full run confirms **10**. So the
documents were right about the number and wrong about how it was reached, which is the harder kind
of wrong to notice.

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

**Six outstanding decisions were taken on 2026-08-13, in one lead-only pass with no agent running
(DATA-SOURCES §42).** Each had been raised by an area and deliberately left. In one line each:

1. **The stacks unit is PERCENTAGE POINTS, with no exception** — "+1 damage per stack" is `100`,
   never `1`, and gate 1 REFUSES the other unit rather than converting it. Taken before any data
   exists, which is why it was cheap.
2. **`Result.sustain`** carries lifesteal, omnivamp, spell vamp and healing, split by which champion
   regains the health; defender healing is a term inside BOTH verdicts (§3.8 fixes the count at two),
   never a third. Zero from ZERO sources until data lands.
3. **`StatBlock` gains `maxHpBase`/`maxHpBonus` and OPTIONAL `mana`/`maxMana`.** Bonus-health ratios
   resolve now. Mana resolves the moment a stat block carries mana — the last step is one fetched
   field, because `mp_base` holds whatever the resource is and **19 of the module's 175 entries state
   a non-mana resource with a non-zero `mp_base`**.
4. **`runningTotal` is `DamageTotals[]`**, so the figure §41.1 put on every row can carry the
   composition bar DESIGN.md §8 requires beside an untagged aggregate.
5. **Six defensive shape fields** — label, id + relation, grantedStat, appliesToDamageType, overTime,
   unit. **44 refused pairs become writable**, chiefly Leona W, which grants both resistances.
6. **The basic attack is named in words and marked `AA`.** No Data Dragon art is borrowed for it;
   borrowing would make one chip mean something other than what it depicts.

**THE SPINE IS CLOSED (DATA-SOURCES §47).** `simulate(scenario, catalogue) -> Result` exists, so a
user's configuration becomes a Result for the first time — everything used to run on hand-authored
plans. It still reads no data file: the data arrives as a catalogue the caller builds. **All 173
champions were run through it into every interface assertion, with zero complaints.** Its first run
found a check that had contradicted this project's own rounding rule since it was written, passing
only because every fixture used whole numbers. **Ryze Q is still blocked, and NOT by mana** (§47.2):
the wiki never says whose maximum mana, so it is permanently incomplete. 8 mana ratios are stored
across the roster and 0 state an owner.

**Healing is modelled, and a heal cannot resurrect (§45).** Placed healing resolves at its own
instance; the walk stops at the crossing. Unplaced healing keeps the generous reading and is
disclosed. The burndown's trace now goes up as well as down, in neutral grey with a dotted stroke —
no new hue. Two defects there were caught by a real browser and not by any test, and the second is
now a sweep: every animated selector must appear in its reduced-motion block, or it sticks at its
first keyframe forever for users who asked for less motion.

**The link format is at version 2 (§46).** Seven abilities could not be shared at all. Version 1 is
untouched and still decodes, pinned by frozen link constants. No existing link moved by a single
character; the new maximum for a realistic scenario is 1,852 against a 2,000 budget.

**THE CROSS-AREA SEAM IS NOW SWEPT AND WATCHED (DATA-SOURCES §44).** The seventh decision below
exposed a defect class the PARTITION creates rather than one either area caused: an area's tests
run over its own output, so two areas can hold opposite rules about one shape with both suites
green. `tests/cross-area-seams.test.ts` runs each consumer's own assertions over each producer's
real output — `tests/` belongs to no area, which is the only place a file may import from five
areas at once. **Five seams checked, one defect found:** `ComboStep.hitCounts` was added to the
contract and the URL encoder was never told, so a scenario using any of the 7 abilities that store
`variableHits` could not be shared at all (SPECIFICATION §12). **The check was proved to fail
rather than assumed to work** — reintroducing the original defect turns it red and names all three
places the figure appears.

**THAT DRIFT IS CLOSED, AND THIS PARAGRAPH SAID OTHERWISE UNTIL 2026-08-15.** It read *"is pinned
in `KNOWN_DRIFT`; closing it is a wire-format decision, raised not made"*, which stopped being true
on 2026-08-14 in commit `c6a6754` — version 2 of the link format carries hit counts additively in a
fifth positional slot, no version 3 was needed, and `KNOWN_DRIFT` has been EMPTY since. The stale
sentence cost real work: it was copied verbatim into a `src/url/` brief on 2026-08-15, sending an
agent to make a decision that had already been made. **This is the second time a stale paragraph in
this file has done that** — the first was the coefficient-shape text that made an engine session
refuse 53 damage rows. When a paragraph here describes something as open, check the commit log
before acting on it.

The list itself is deliberately kept rather than deleted with its entry: a red suite blocks every
merge, so a found-but-unfixed seam needs somewhere honest to sit, and a test asserts every entry
still in it is still real.

**A SEVENTH, forced by the fourth and worth knowing about: a per-type split now ALWAYS sums to its
own total.** The engine and the interface had encoded opposite rules for one figure and both suites
passed, because neither check had run over the other's output. §42.4a records which argument lost
and why. `burst` carried the same latent inconsistency and nobody had noticed.

**The Data Dragon attribution decision was applied to Heartsteel** (§42.7): one stored ratio moved
from `unresolved` to `holder`, one entry from `incomplete` to `derived`, and nothing else in
`effect-values.json` changed. §41.1's stated reason for keeping Heartsteel permanently unresolvable
was wrong in its arithmetic while right in its conclusion; the correction is in place.

**The coefficient shape is IN the contract and live — corrected 2026-08-13.** This paragraph used
to say `Ratio` "cannot express it" and that the change was "waiting on a decision. Do not add the
shape without one." That was true when written and stopped being true two commits later, in
`202708d` ("give ratios a multiplier"), and nobody updated it. The stale text cost real work: an
engine session refused 53 damage rows on the strength of it, and the lead repeated it in a brief.

What is actually true: 32 abilities deal a percentage of a health pool whose percentage is itself
scaled (`10–20% (+2.5% per 100 AP) of target's maximum health`), and `src/types/data.ts` expresses
it with `RatioMultiplier` (`per`, optional `owner`, `per100`) on `Ratio.multipliers`. It is live in
three places: the harvester captures multipliers including the split-across-blocks case, gate 1
validates them and requires an owner where the stat needs one, and the `coefficient-shape` detector
was narrowed to fire only when the multipliers were NOT captured (`classify.ts:602`).

**What is still open is a measurement, not a decision:** how many of the 32 the live shape actually
resolves, and how many still fail. Nobody has run that.
