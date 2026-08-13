# League of Legends Damage & Stats Simulator
## Complete Product Specification

---

## 1. Overview

The product is a free, browser-based combat simulator for League of Legends theorycrafting.
Users configure an attacking champion and a defending champion — including level, items,
runes, and pre-existing combat state — then execute an ordered ability combo and receive an
exact, itemised damage result showing whether the defender survives.

The calculation runs entirely in the browser. There is no account system, no user database,
and no server-side session state. Every page load begins fresh. The only persistence
mechanism is the URL, which encodes a complete scenario for sharing.

The product covers every champion in the game, every item, and every rune.

Its intended users are streamers and content creators testing matchups without loading the
client, solo queue players verifying whether a build achieves a kill threshold, and coaches
demonstrating exact damage scenarios to students.

---

## 2. Core user flow

1. The user selects an attacking champion.
2. The user sets that champion's level (1–18) and individual ability ranks.
3. The user selects items from the full item pool.
4. The user selects a full rune page — keystone, minor runes, and stat shards.
5. The user configures the attacker's entry state: how many stacks of each relevant
   accumulating effect are already active when the combo begins.
6. The user repeats steps 1–5 for the defending champion.
7. The user configures the defender's entry state, including any debuffs already applied
   to them.
8. The user constructs an ordered combo sequence.
9. The simulator returns the full computed stat block for both champions, an itemised
   damage breakdown per instance, a running total, and a survival verdict.

---

## 3. Calculation engine

### 3.1 Sequential model

The engine is a sequential simulator, not a stat calculator. A combo is an ordered list of
discrete instances. Each instance resolves against the state produced by all preceding
instances, then mutates that state for those that follow.

Order is significant. `Q W E auto` and `auto E W Q` produce different results, because
armor shred, stack accumulation, and conditional damage reduction all depend on what has
already landed.

### 3.2 No time dimension

The engine models sequence, not elapsed time. Instances resolve in order but carry no
timestamps. Nothing decays between instances, nothing ticks, and attack speed does not
determine how many attacks fit into a window.

This is a deliberate architectural boundary. Its consequence is stated plainly in the
interface: stacking effects with real-world durations, such as Conqueror, do not expire
mid-combo, so a slow combo and a fast combo return identical figures. Results are labelled
as representing an uninterrupted sequence.

### 3.3 Entry state — "moments in time"

Every scenario begins from a user-defined moment. Rather than assuming a combat encounter
starts from zero, users specify the state that already exists when the first instance lands.

Two categories of state are modelled separately, because they behave differently.

**Persistent accumulations** do not change during a combo. They are game-long
accumulations that function identically to an item stat. Users enter a quantity and the
value folds into the champion's stat block before the sequence begins. This category
includes Veigar stacks, Nasus Q stacks, Dark Harvest stacks, Gathering Storm, Cho'Gath
Feast stacks, Senna souls, Kindred marks, and every comparable permanent accumulator in
the game.

**Combat state** is seeded at entry and then mutated by the sequence. Users specify a
starting quantity, and each instance in the combo adds to, consumes, or modifies it. This
category includes Conqueror stacks, Black Cleaver armor shred, Darius Hemorrhage stacks
on the target, Grasp of the Undying, Press the Attack, and all comparable in-combat
accumulators.

The distinction is visible to the user: persistent accumulations appear alongside the
champion's build, while combat state appears alongside the combo.

A representative scenario: a target already carrying two Hemorrhage stacks, against whom
the user executes a full Darius combo. The engine seeds two stacks, adds stacks as each
qualifying instance lands, and resolves the ultimate against the final stack count for
both its damage scaling and its execute threshold.

### 3.4 Instance types

The combo parser distinguishes seven instance types, because stack generation, on-hit
application, and damage reduction interactions differ between them:

| Type | Behaviour |
|---|---|
| Basic attack | Applies on-hit effects; generates rune stacks at the basic-attack rate |
| Damaging ability | Generates rune stacks at the ability rate |
| Non-damaging ability | Occupies a position in the sequence, generates no damage stacks |
| Empowered basic attack | Resolves as both ability and basic attack; stack generation follows a per-ability rule rather than a general one |
| Item active | Generates stacks at the ability rate where applicable |
| On-hit effect | Attached to basic attacks and empowered attacks |
| Damage-over-time application | Registers a DoT source, reported separately from burst |

Empowered basic attacks — Darius W, Nasus Q, Garen Q and equivalents — are the ambiguous
category. Their stack behaviour is recorded per ability in the curated data layer rather
than derived from a general rule.

### 3.5 Stack generation rules

Conqueror generates two stacks from a melee basic attack, one from a ranged basic attack,
and two from abilities, spells, and item actives regardless of the champion's range type.
The melee/ranged split therefore applies to basic attacks alone.

Because certain ranged on-hit abilities generate two stacks while others generate one, with
no derivable rule distinguishing them, the stack yield of every individual ability is
recorded explicitly in the curated data layer.

Conqueror's per-stack value is snapshotted at the champion's level when the first stack is
generated, and the engine reflects this.

Black Cleaver's armor reduction accumulates on any instance dealing physical damage,
irrespective of source type.

### 3.6 Damage resolution order

Physical damage against positive armor resolves at a multiplier of `100 / (100 + armor)`.
Against negative armor it resolves at `2 − 100 / (100 − armor)`. Magic damage resolves
identically against magic resistance. True damage bypasses both.

Resistance-modifying effects apply in a fixed, documented order:

1. Flat armor or magic resistance reduction
2. Percentage armor or magic resistance reduction
3. Percentage penetration
4. Flat penetration (lethality)

This ordering is documented with cited sources in the project's reference material, and the
engine's implementation is verified against it.

### 3.7 Damage modifiers and special cases

The engine resolves the following:

- Critical strike chance and critical damage, including item-specific critical modifiers
- The distinction between on-hit and on-attack effects
- Adaptive force resolution, selecting between bonus attack damage and ability power
- Damage scaling on maximum health, current health, and missing health
- Execute thresholds
- Shields, separated into physical, magic, and general
- Flat and percentage damage reduction effects
- Damage amplification, with additive and multiplicative amplification handled distinctly
- Lifesteal, omnivamp, and spell vamp on the attacker
- Healing effects on the defender

Rounding behaviour is fixed and documented at a single point in the engine, so that
accumulated rounding across a multi-instance combo remains consistent with in-client values.

### 3.8 Damage over time

Damage-over-time effects are never folded into the burst total. Because the engine models
sequence rather than time, DoT contributions are reported as a separate line stating the
total damage delivered over the effect's full duration following the combo.

The survival verdict is presented twice: once against burst damage alone, and once
including full DoT resolution.

---

## 4. Attacker modelling

The attacker is fully configurable across champion, level 1–18, independent ability ranks,
the complete item pool, and a full rune page including stat shards.

Item stat bonuses are modelled in full. Item passives are modelled where their effect is a
stat modification or a damage instance. Item actives participate in the combo sequence as
instances.

Rune bonuses are modelled in full, including conditional keystones whose values depend on
accumulated state, which resolve through the entry-state and sequence systems rather than
through a blanket assumption.

---

## 5. Defender modelling

The defender does not act. They do not attack, reposition, or use abilities in response.
Results are labelled as damage dealt to a stationary target.

The defender is nonetheless modelled in full. Their stat block responds to champion
selection, level, complete item build, complete rune page, and their own kit. A defender is
never represented by generic or averaged values.

**Defensive kit effects** are modelled and divided by activation condition:

- *Always-active* effects are baked into the defender's resolved stat block. This includes
  innate damage-type reductions and passive resistances.
- *Conditional* effects are exposed as toggles, matching the attacker-side state pattern.
  This includes activated resistance abilities, shields, and spell shields.

**Defensive runes** are modelled, including those whose behaviour is sequential. Bone
Plating, which reduces damage from the first three instances an attacker delivers, resolves
against the instance counter directly and demonstrates the engine's instance-ordering
behaviour.

Champions whose maximum health or resistances scale through their own kit — through
accumulating stacks or ability-granted stats — are handled through the persistent
accumulation system.

---

## 6. Coverage

The simulator covers the complete champion roster, the complete item pool, and the complete
rune set. Coverage is not staged or partial by champion.

Because certain ability properties cannot be derived programmatically and must be recorded
by hand, individual abilities carry a verification status that is surfaced to the user
(see §8).

---

## 7. Data architecture

### 7.1 Sources

Champion base statistics and per-level growth are sourced from the official League of
Legends Wiki at `wiki.leagueoflegends.com` (the `/en-us/` locale path), specifically its
structured champion data module, which provides machine-readable values for base health and
growth, base and per-level armor and magic resistance, base and per-level attack damage,
base attack speed, attack speed ratio and growth, range type, and adaptive type. This is
retrieved through the wiki's MediaWiki `api.php` query endpoint — requesting the module
page's latest revision content (`action=query&prop=revisions`, reading the main slot) —
rather than by parsing rendered HTML.

The source wiki must be the official `wiki.leagueoflegends.com`. A near-identical lookalike
exists at `leagueoflegends.fandom.com`: it hosts a module of the same name and format but is
abandoned and stale, and it produces wrong base statistics (for example, it reports an
attacker's base attack damage and base armor at long-outdated values). It must never be used
as a source. The staleness is detectable — its recorded change markers top out at a patch
roughly eighteen months old, while the official wiki tracks the current patch. Note that the
Cloudflare block on the raw-content route is a property of the Fandom host only; on the
official wiki both `api.php` and the raw route respond, and `api.php` is the pinned method.

Item statistics, item metadata, and visual assets are sourced from Riot's Data Dragon,
a public content delivery network requiring no API key. The Data Dragon item file is not
a clean Summoner's Rift catalogue: it mixes in game-mode variants and duplicates each item
under several identifiers, one per mode. Filtering to entries available on map 11, flagged
purchasable, and carrying a non-zero total cost is necessary but **not sufficient**: that
filter yields 248 entries but only 222 distinct items, because Swiftplay also runs on map 11,
so map-11 availability does not by itself isolate classic Summoner's Rift. The filter must
additionally exclude the mode-variant duplicate identifiers (every observed duplicate uses a
six-digit id at or above 200000, while the real classic items keep their canonical 3–5 digit
ids) and deduplicate by item name, keeping the canonical low id. For example, Redemption
appears as id 3107 at 2300 gold and as id 323107 at 2800 gold, and only 3107 belongs in the
pool. **Only the corrected pool of 209 distinct items is presented to the user.** (This read 222
until 2026-08-13. 222 is real but measures the wrong thing — it is the count of distinct *names*
under the broken filter, before the id cutoff. The full funnel and the rule that a fetch yielding
222 means the id cutoff is not being applied are in DATA-SOURCES §5, which corrected this on
2026-08-12; this file was not updated with it, and the stale figure was propagated into an agent
brief before it was caught.)

Ability ratios, item passive values, rune values, and per-ability stack yields are held in
a hand-curated override file maintained within the project repository. This layer exists
because these values are not reliably machine-extractable from any single source.

Rune stat shards — the small selectable bonuses such as Adaptive Force, attack speed,
armor, and health-by-level — are a further explicitly hand-entered category. They appear
in no fetched source: neither Data Dragon's rune file nor any other endpoint provides them,
so they are maintained by hand alongside the curated override file.

The champion roster count differs between the two sources: the wiki lists more champions
than Data Dragon (for example 174 on the wiki against 173 in Data Dragon), because the wiki
adds a champion's stats page as soon as it is announced, before Riot ships that champion's
assets to Data Dragon. The product therefore gates roster membership on Data Dragon asset
availability, not on the wiki: a champion is offered to the user only once its portrait and
ability icons exist in Data Dragon. A champion that has wiki stats but no Data Dragon art is
treated as forthcoming and withheld, not shown. This is the recommended handling because the
interface uses official art in place of text labels throughout, so a champion with no
portrait or ability icons cannot be rendered as specified; showing a placeholder instead
would violate that design rule and present a half-built champion. The withheld entries are
not lost — they surface automatically on the next patch fetch once their assets ship.

Every data type has a single pinned source of truth, recorded with its URL and the patch
version from which it was drawn.

### 7.2 API access

The product uses no authenticated Riot API endpoints. It performs no summoner lookups, no
match history retrieval, and no player identification. Data Dragon and the wiki are both
public and unauthenticated.

### 7.3 The curated override file

This file is the project's only irreplaceable asset — every other input can be re-fetched
from source. It is version controlled and backed up independently.

Its scope is not a thin layer of edge cases. It holds all ability damage and ability
ratios, all item passive values, all rune values, all stat shards, and all per-ability
stack yields. The live sources supply none of these: Data Dragon exposes no ability damage
or ratios (the relevant fields are empty and its tooltips carry unresolved placeholders),
item passive values live only in description text, rune values are embedded in prose, and
stat shards are absent everywhere. Without this file the engine has no ability damage at
all, which is why it is treated as the irreplaceable asset.

---

## 8. Accuracy and trust systems

Numerical trustworthiness is the product's entire value proposition, and the following
systems exist to protect it.

**Patch version display.** The patch version the calculation was performed against is
displayed adjacent to every result, not relegated to a footer.

**Per-ability verification status.** Every ability carries one of four statuses, surfaced in the
interface alongside any result it contributes to. Each is a claim about *evidence*, and the
evidence behind each is stated here so the interface can describe it honestly rather than
gesturing at it.

- ***Derived* — the normal state, and a well-evidenced one.** The product claims three things
  about a derived number, all of them checked mechanically on every entry, every run:
  1. it agrees with the **source's own rendering** of the same ability — the wiki's software
     expanding the same template our parser read, compared value by value at the precision the
     wiki itself prints;
  2. it **reconciles with the total the source states** — where the source publishes a total for
     the ability, our components sum to it, which catches damage counted twice as well as damage
     missing;
  3. where **Riot's shipped game data** carries a counterpart array, it agrees with that too — a
     source that is not the wiki and is not derived from it.

  What *derived* does **not** claim: that a second party re-derived it from scratch. Agreement
  with a source cannot detect a source read wrongly in a consistent way — a value can be
  transcribed perfectly and still be attached to the wrong stat, land the wrong number of times,
  or be missing an instance the ability also has.

- ***Verified* — a rarer and stronger claim.** Everything *derived* claims, **plus** an
  independent re-derivation by a party that did not use this product's code or share its
  assumptions, recorded with its evidence. This is deliberately a small set. It is not a target to
  be maximised, and the interface never implies that a number lacking it is doubtful.

- ***Incomplete* — we will not show a number we cannot stand behind.** Something about the ability
  is unmodelled, unreconciled, or disputed between sources. **An incomplete ability contributes no
  damage to a result** and says why. This is the status that carries the product's promise: a
  figure is absent rather than wrong.

- ***No damage*** — the ability deals none. Not a statement about trustworthiness; a statement
  that there is nothing to make one about. Claimed only when the ability's own data template and
  the wiki's damage-classification module are silent together; where they disagree the ability is
  *incomplete*, never *no damage*.

**How this reads to a user.** *Derived* is presented as the ordinary, expected state — checked
against the source three ways — and never as a warning, a caution, or a lesser grade. *Verified*
is presented as an additional assurance where it exists, not as the bar everything else fell short
of. *Incomplete* is presented as a deliberate refusal, naming what is missing: "this ability's
damage is not shown because …". A result containing an incomplete ability states plainly which
ability and why, and the total it shows excludes it.

**Permanently incomplete is shown differently from not-yet-complete.** Two abilities can both be
*incomplete* for entirely different reasons, and a user deserves to know which they are looking at:

- **Pending** — the value exists in a source and this product has not extracted it yet. It will
  improve with work. The interface says so: *"not yet modelled."*
- **Permanent** — a fact the ability needs is stated by **no source at all**, so no amount of work
  will supply it. The clearest case is a damage ratio whose owner is unstated: the source says an
  ability scales with *armor* and never says whose, so a person reading the page is guessing
  exactly as a parser would. The interface must not imply that someone will get to it. It says:
  *"cannot be completed — the source does not record this,"* and names the missing fact.

An entry that is permanently incomplete records **which** fact is missing and **why no source
settles it**, so the note is specific rather than generic. A permanently incomplete ability is
never silently dropped from a result.

Both distinctions are shown the way every other status is (§10.1) — by a glyph and a label, never
by hue, since colour is reserved for damage type. The design token file records glyphs for
*verified*, *derived* and *incomplete*. **It carries none for *no damage*, and none for the
permanent-versus-pending distinction. That is an open design decision**, deliberately left open
here rather than invented: tokens are the design file's to define.

**Contested base statistics.** The same principle extends to a champion's base statistics,
which come from two sources that can disagree. Where a disagreement is settled by evidence,
the settled value is used silently. Where nothing settles it — the sources conflict and no
patch note explains the difference — the champion is marked *contested*: the value that
ships with the patch is used, and **any result involving that champion carries a visible
note that one of its base statistics is disputed between Riot's own sources, and is never
presented as verified.** The disputed field, both observed values, and the evidence for each
are recorded in the generated data so the note can name what is in doubt rather than warn
vaguely. The rule that produces these flags is DATA-SOURCES.md §15.

**Known-answer test suite.** A hand-authored set of scenarios whose expected values are
established without access to the game client, from three sources in descending order of
authority: unit tests written directly from documented formulas — the resistance
multipliers, the four-step modifier order, adaptive force resolution, critical strike,
execute thresholds, and the rounding point; worked examples
published in the wiki's damage and mechanics articles; and cross-checks against existing
public damage calculators. These define correctness. They are never modified to
accommodate the engine. They run automatically against every change, and a failure blocks
the change from shipping. Where the engine and a third-party calculator disagree, the
disagreement is surfaced as a finding rather than silently reconciled.

**Report-a-wrong-number.** Every result carries a reporting control, pre-populated with the
complete scenario that produced it, so a discrepancy can be submitted in one action.

**Public changelog.** Every correction to a data value or engine behaviour is logged
publicly with its patch number and what changed.

---

## 9. Patch pipeline

Patch updates are handled by a scheduled process running on a self-hosted server,
independent of the public site.

The process retrieves current wiki data modules and Data Dragon files, then performs a
**deterministic diff** against the previously stored version. This step uses no language
model — structured data comparison is exact and requires none.

Diffed changes pass through **validation bounds** before proceeding. Implausible movements,
such as a base statistic shifting by an order of magnitude, halt the update rather than
propagate it. The wiki is community-editable, and this check exists to absorb both error
and vandalism.

A **language model reads the human-readable patch notes** and cross-references them against
the curated override file, producing a list of entries that may require human attention.
It never writes values into any data file. Its output is a review queue.

**Rework detection** identifies cases where ability identifiers in the curated file no
longer match the source data, which occurs when a champion's kit is replaced, and surfaces
these for manual reconciliation.

The pipeline's output is a **pull request**. Nothing publishes automatically. A human
reviews and merges, at which point deployment proceeds. Every data state is recoverable
through version history.

---

## 10. Interface

Champion, item, and rune selection use searchable, keyboard-navigable pickers with
autocomplete and filtering, since users perform these selections dozens of times per
session across large lists.

The interface is fully responsive. Layouts adapt for mobile, where a significant share of
usage occurs.

The interface meets accessibility requirements for colour contrast, complete keyboard
navigation, and screen reader compatibility.

### 10.1 Visual identity

The visual direction is a defined deliverable agreed before any interface code is written,
not a property that emerges from the build. It is recorded as a design token file: four to
six named colour values, a display typeface, a body typeface, a utility typeface for
numeric and tabular data, a spacing scale, a motion rule, and one named signature element
the product is remembered by. Every agent producing interface work reads that file, so
that concurrently built components share one palette, one type scale, and one spacing
system.

Official game art is used throughout in place of text labels. Champion portraits, ability
icons, item icons, and rune icons are drawn from Data Dragon, within the asset usage
permitted in §15. The combo builder presents abilities as their in-game icons rather than
as lettered buttons.

The signature element is the combo resolving against the defender: instances landing in
sequence against the target's health. The animation budget is concentrated there and kept
restrained everywhere else.

Damage type is never conveyed by colour alone. Every rendered damage value carries a
non-colour cue in addition to any colour: a damage-type tag — `P` for physical, `M` for
magic, `T` for true — placed with the value and exposed to assistive technology as the
full word. Colour is a fast, redundant channel; the tag is the definitive one. This holds
everywhere a damage figure appears, and the same principle governs any other colour-coded
distinction in the interface (for example damage-over-time is additionally marked by a
hatch pattern, and verification status by a glyph and label, not by hue). The agreed
design token file for this product is `DESIGN.md` in the project root; it records the
palette, type, spacing, motion, signature element, and this cue in buildable detail.

Three visual defaults recur in machine-generated design and are out of scope for this
product: a cream background with high-contrast serif display type and a terracotta accent;
a near-black background with a single acid-green or vermilion accent; and a broadsheet
layout of hairline rules and zero border radius. Work matching these is rejected and
redone.

The advertising slots defined in §16 constrain the available content width. The layout is
designed around them from the outset rather than adapted to them afterwards.

---

## 11. Output

Results are presented as more than a single figure:

- **Per-instance breakdown** — the damage contributed by each instance in the combo, in
  order, showing the state that applied at that point in the sequence
- **Running total** — cumulative damage as the combo progresses
- **Survival verdict** — whether the defender's health is exceeded, shown for burst alone
  and for burst plus damage over time
- **Damage-versus-armor curve** — how the combo's output changes across a range of target
  resistances
- **Damage-versus-level curve** — how the combo's output changes across levels
- **Build comparison** — two attacker configurations evaluated against the same defender
  side by side
- **Separated damage-over-time line** — never merged into the burst figure

Every excluded mechanic is stated visibly in the result rather than silently omitted.

---

## 12. Sharing

A complete scenario — both champions, levels, ability ranks, items, runes, entry state, and
combo sequence — is encoded in the URL. Any scenario is shareable as a link that reproduces
it exactly. This requires no database and no account, and is the primary mechanism by which
streamers and coaches distribute scenarios to their audiences.

The URL schema is versioned so that shared links survive patch changes and remain
interpretable.

---

## 13. Performance

Champion, item, and rune data is lazy-loaded rather than shipped as a single bundle, keeping
first-load time low despite the full-roster dataset. Calculation is instantaneous because it
executes locally with no network round trip.

Advertising slots are fixed-dimension reserved containers, so ad loading produces no
cumulative layout shift.

---

## 14. Hosting and infrastructure

The site is a static application served from a global content delivery network with
integrated denial-of-service protection. Source is version controlled in a remote
repository, and merges to the main branch deploy automatically.

Continuous integration runs the known-answer test suite on every change, blocking merges
that fail.

Error monitoring reports client-side failures.

The self-hosted server runs the patch pipeline only. It does not serve public traffic. Where
a service running on it needs external reachability, it is exposed through an outbound
tunnel rather than by opening inbound ports.

Domain registration and DNS are managed through the same provider as the CDN.

---

## 15. Legal and compliance

The following notice is displayed in a location readily visible to users:

> [Product Name] is not endorsed by Riot Games and does not reflect the views or opinions of
> Riot Games or anyone officially involved in producing or managing Riot Games properties.
> Riot Games and all associated properties are trademarks or registered trademarks of Riot
> Games, Inc.

The following scope disclaimer is displayed alongside results:

> This calculator computes champion ability damage, item stats, and rune bonuses only. It
> does not account for crowd control, map-based damage, seasonal changes, or passive effects
> requiring specific gameplay conditions.

Wiki-derived content is attributed under its CC BY-SA licence with a link to the licence
terms.

Visual assets are limited to Data Dragon game-specific static data and official press kit
material, in line with Riot's permitted asset usage.

The product is registered with Riot Games' developer programme, as required for products
serving players regardless of whether they consume official APIs.

A privacy policy, cookie policy, and consent management interface are present, covering the
personal data processing introduced by advertising.

---

## 16. Monetisation

The product is free to use in full. Advertising is the sole revenue mechanism.

Advertising is delivered through fixed-dimension slots: two vertical rails flanking the main
content area, and one horizontal unit each at the top and bottom of the page. Slot dimensions
are reserved in the layout so that ad rendering never displaces interface elements, and the
vertical rails render only at viewport widths where they do not compress the calculator.

The product carries no subscription tier, no paywall, and no gated functionality. It contains
no betting or gambling mechanics, and no cryptocurrency or blockchain component.

---

## 17. Explicit exclusions

The following are outside the product's scope by design, and are stated in the interface
rather than silently omitted:

- Tower, dragon, and neutral objective damage
- Crowd control durations and mechanics
- Map-based and season-specific environmental effects
- Elapsed time, ability cast times, and animation windows
- Defender counterplay — the target does not act
- Player statistics, match history, win rates, or build recommendations
- Any data requiring authenticated access to player accounts

---

## 18. Method of construction

This project is built by deploying multiple AI agents working concurrently, rather than by
a single continuous assistant session.

**Parallel execution with isolated context.** Multiple agents run at once, each holding its
own separate working context. An agent's exploration, file reads, and intermediate reasoning
remain contained within it, so the volume of one agent's work never degrades another's.
Each returns only its conclusions.

**Written artefacts as project memory.** Conversation is not the record. Every decision,
finding, and specification lives in version-controlled files that all agents read
automatically at start-up. Agents are stateless between sessions; the repository is not.
This is what allows work to be halted, resumed, and handed between sessions without loss.

**Shared task coordination.** Concurrent agents draw from a common task list, claim items,
and track dependencies. Work that depends on unfinished work is blocked until its
prerequisite completes, and unblocks automatically.

**Strict file ownership.** Concurrent agents never share write access to the same file.
Work is partitioned by directory before agents are deployed. This is the primary constraint
that determines how a phase is divided.

**Parallelism matched to work shape.** Work is deployed concurrently only where it is
genuinely independent — separable subject areas, or a single subject examined through
several unrelated lenses. Work that is sequential, interdependent, or converges on a single
file is executed in one continuous session instead. Concurrency applied to dependent work
produces conflicts, not speed.

**Review gates before execution.** Agents operating on critical components produce a plan
and hold in a read-only state until that plan is approved. Approval criteria are set in
advance rather than judged case by case.

**Verification as the completion condition.** No component is complete because an agent
reports it complete. Completion is defined by the known-answer test suite passing, and
results are reported as pass and fail counts against named scenarios.

**Plain-language reporting.** All agent output intended for human review — plans, findings,
status, obstacles — is written in plain English rather than code. Decisions are surfaced in
terms of behaviour and numbers.

**Resource tiering.** Agent capability is matched to task difficulty rather than uniformly
maximised, with demanding reasoning work and routine mechanical work assigned different
resources.

**Active supervision.** Agent progress is observed while running rather than reviewed only
on completion. Individual agents are inspected, redirected, or replaced mid-execution.
Concurrent deployment increases throughput; it does not remove the need for direction.

**Phase separation.** Each phase of work is a discrete deployment that ends when its output
is reviewed and accepted. The next phase begins fresh, reading the artefacts the previous
phase produced.
