# PLAN.md — the execution plan, rebuilt 2026-08-13

The plan this replaces was approved before the harvester existed in its current form. **Every
input it was sized against has moved.** This one is built on the measurements in DATA-SOURCES
§19–§32, and every figure below states what it counts.

---

## 1. What is actually true now

| | Entries | Definition |
|---|---:|---|
| **Total ability pages** | **937** | distinct wiki pages, after alias dedupe (§18) |
| — storable | **623** | ≥1 stored damage component |
| — worklist | **69** | stored nothing, and a source says it deals damage |
| — `no-damage` | **206** | stored nothing, and every source is silent about damage |
| — no component, incomplete for another reason | 39 | |
| **Of the 623 storable:** confirmed by gate 2 | **584** | gate 2 compared ≥1 row against the wiki's own rendering and found no disagreement |
| — **verified** | **10** | confirmed by a full 937-page run, 2026-08-13. Was 8 until the third round-trip was wired into the runner (§36.2); the two it restored are Aphelios Q Moonshot and Ambessa P |
| — gate 2 disagreed | 37 | forced `incomplete` |
| — no gate-2 evidence either way | 2 | was 35 before the third round-trip (§28) |
| **Permanently unreachable** | **23** | records an `unresolvable`: a fact no source states. Not work |

**Damage components stored: 917** — corrected 2026-08-13 from 921. **DEFINITION: components
surviving the summary, non-champion and unreadable-row filters, over 937 distinct pages.** The four
missing against 921 are the summary rows §34.1's widened filter now drops (Gangplank R's "Maximum
Mixed Total Damage with and", Gwen R's second and third cast totals, Xin Zhao W's "Slash Total
Physical Damage"). 921 was measured before that change landed.

**Gate 7 leaves 47 entries unreconciled, split 35 under / 12 over.** Measured on a full-roster run,
2026-08-13. The figure moved twice that day and both moves were the gate getting better, not worse:
51 (35/16) → **53** when it was made to honour component relations (§36.3), because it had been
summing alternatives it always claimed to exclude; then 53 → **47** when variable-hit abilities
began reconciling at the ceiling the source itself states (§38.4). **Compare it against those
definitions, never against a previous number.**

**The historic defect rate is 50%, not 10%.** Gate 5's first run disagreed with 14 of 28
abilities. After seven classes were fixed it disagreed with 5 of 28 — 18%. **Plan against 18%
for work already reviewed and 50% for work that has not been**, not against the 10% sampling rate
the old plan assumed.

---

## 2. The checks that now exist, and what each costs

The old plan had six gates, of which two were real. There are now seven, five of them mechanical
and roster-wide.

| Gate | What it checks | Cost to run on all 937 | Catches |
|---|---|---|---|
| 1 schema | structural validity | seconds, offline | malformed entries, duplicate ids, wrong rank counts |
| 2 round-trip ×3 | our expansion against the wiki's own rendering — the leveling box, the source block's full per-level expansion, and the rendered description | ~20 min, network | transcription errors |
| 3 sum guard | alternatives never summed | seconds, offline | double counts of variants |
| 4 non-champion | minion/monster rows never stored | seconds, offline | out-of-scope rows |
| 6 status honesty | nothing claims more than its evidence | seconds, offline | dishonest status |
| **7 total reconciliation** | our components sum to the total the source states | seconds, offline | **missing instances, missing multiplicities, double counts** |
| **game data** | every stored series against Riot's shipped arrays | ~2 min, offline after one fetch | **numeric disagreement, independent of the wiki** |
| 5 independent | a second party re-derives from scratch | ~25 agent-minutes per 28 abilities | **meaning** — and nothing else can |

**Gate 5 is a detector, not a certifier** (CLAUDE.md). Its output is a class and a mechanical check,
not a verdict on an entry.

---

## 3. What Areas B–E actually do now

The harvester does far more than the old plan assumed, so three of the areas shrank and one grew.

### Area B — data pipeline (`scripts/fetch/`, `public/data/`)
**Largely done.** Champions, items, runes and the override ledger are built and passing. What
remains is what was never started: **item and rune effect harvesting**. 85 owner-bearing effect
references are counted and unwritten (§16), and both `itemEffects` and `runes` are empty in every
batch produced so far. Stat shards are hand-entry and appear in no source (§7).
**Estimate: 10–14 agent-hours.** Most of it is the same shape as the ability harvester, against
prose that is worse — item text is written from the holder's point of view and rarely names anyone.

### Area C — the curated file (`scripts/extract/`, `build/proposed-curated/`)
**The harvester is built and is the largest single asset in the project.** The remaining work is
not "write the curated file"; it is **triage against the checks that now exist**:
- 69 worklist abilities — 47 reachable by code, 22 needing a person to read them once (§26.3)
- 51 gate-7 failures — 33 short, 18 over (§32.3)
- 37 gate-2 disagreements
- 236 entries `incomplete`, by reason
**Estimate: 25–35 agent-hours**, and it is the area where a defect costs the most.

### Area D — the engine (`src/engine/`)
**Largely built as of 2026-08-13: 1,234 tests across 66 files pass, covering the sequential runner,
the four-step resistance order, shields, execute thresholds, amplification, multi-type instances and
per-instance resistance steps.** Three exclusions it had raised are gone (DATA-SOURCES §42): the
Result reports sustain, bonus-health ratios resolve, and mana ratios resolve as soon as a stat block
carries mana. ~~**Still outstanding:** `simulate(scenario) -> Result`.~~ **BUILT 2026-08-14 (DATA-SOURCES §47).**
All 173 champions run through it into every interface assertion with zero complaints. What it
cannot yet model is DATA, not engine: item passives and actives, every rune and stat shard,
critical-strike damage above the base multiplier, and all penetration — each named on every result
it produces.

*(The paragraph this replaces is kept below, because the sizing behind it is still the basis for
Areas B, C and F.)* **The formula layer exists and is tested; the component model does not.** The engine must now
consume what the harvester actually produces: `hits`, `relation` (adds vs alternativeTo),
`multipliers` (a ratio scaling another ratio), `owner` (whose stat), and four `Scaling` arms
including two level-scaled. The old plan assumed a flat base-plus-ratio model, which is 96% of
components and 0% of the hard ones.
**Estimate: 18–24 agent-hours.**

### Area E — the interface (`src/ui/`)
**Partly built. The design decision that gated it is DONE** — `DESIGN.md` §6 now carries glyphs for
all five states, and the searchable picker over all 173 champions, the combo shelf, the stat blocks,
the result table and the HP burndown are built and wired into the app.
**Three contract gaps this area raised are now closed** (DATA-SOURCES §42): `runningTotal` carries a
per-type split, so the running-total cell has the composition bar §8 requires; the stat block shows
mana and the bonus-health split; and the basic attack's art question is settled. **One gap it did
NOT close and which is now named work: the burndown does not draw a defender who HEALS** (§42.2) —
DESIGN.md §7 specifies a trace that only falls, and `DEFENDER_HEALS` in
`src/ui/burndown/mock-variants.ts` makes the gap reproducible.
The interface must also present `derived` as the normal well-evidenced state rather than a
warning, which is a copy and hierarchy problem as much as a component one.
**Estimate: 30–40 agent-hours**, plus the design decision.

### Area F — the scenario↔URL encoder (`src/url/`)
Untouched and unchanged by any of this. **Estimate: 5–7 agent-hours.**

---

## 4. Sequence, and why

1. ~~**Unblock Area E's design decision** (glyphs for `no-damage` and permanent/pending).~~
   **DONE** — DESIGN.md §6 carries all five. The six decisions of DATA-SOURCES §42 are also done,
   and each names the area task it released. The next contract-shaped item is the ONE fetched field
   Ryze Q waits on: `resource` on `Champion` (§42.3), which is Area B and needs a champion re-fetch
   plus a diff restricted to that field.
2. **Area C triage** — the 51 gate-7 failures first, because they are defects in numbers already
   being shown, then the 47 mechanically reachable worklist abilities.
3. **Area D** against the real component model, using the curated file as it now stands.
4. **Area B item/rune effects** — independent of C and D, can run concurrently.
5. **Area E** once the design decision lands.
6. **Area F** last; it depends only on the frozen types.

**Gate 5 runs once per phase as a sample, not as a queue.** Its job is to find the class the
mechanical gates do not yet cover.

---

## 5. Total, honestly

**88–120 agent-hours**, plus one design decision that is not an agent's to make.

The basis: this session took roughly 6 agent-hours of wall time and produced the prose path, three
round-trips, gate 7, the game-data referee, two gate-5 rounds and seven defect fixes. The figures
above assume the same rate and **do not** assume it improves. They exclude the recurring per-patch
cost, which is real: the gates re-run in about 25 minutes, and gate 5 needs a fresh sample every
patch because a pass is void once a value changes.

**What this plan does not promise.** It does not promise a verified roster; §32.4 explains why
that is not achievable at any budget. It promises that every number shown agrees with the source's
own rendering, reconciles with the source's own stated total, and matches Riot's shipped data
where that exists — and that everything which does not is absent rather than wrong.

---

## 6. The site around the calculator (2026-08-14)

The product became a **site of eight pages**, not one. Five were proposed — landing, calculator,
how the numbers are checked, about, report a wrong number. Three more are required by documents
already in this repository rather than by preference, and were added after that was pointed out:

| Page | Required by |
|---|---|
| Changelog | SPECIFICATION §8 — *"Every correction to a data value or engine behaviour is logged publicly with its patch number and what changed."* |
| Privacy policy | SPECIFICATION §15 |
| Cookie policy | SPECIFICATION §15 |

### ADVERTISING CANNOT BE SWITCHED ON BEFORE THE PRIVACY AND COOKIE POLICIES EXIST

**This is a gate, not a preference.** SPECIFICATION §16 makes advertising the product's sole
revenue mechanism. §15 requires *"a privacy policy, cookie policy, and consent management
interface … covering the personal data processing introduced by advertising"* — the processing
§16 introduces is the reason §15 asks for them.

**Shipping §16 without §15 puts the product out of compliance with its own specification**, and
it does so at the exact moment money starts moving, which is the worst time to discover it. The
two policy pages and the consent interface are therefore the LAST work before advertising and
the FIRST work if advertising is ever brought forward.

The pages exist as routes today and carry no prose yet. That is deliberate — the structure was
built first so every link, every page and the shared-link redirect could be tested against a real
site — and `tests/site-structure.test.ts` names exactly which pages are still waiting, so the
placeholder cannot quietly become permanent.

### What the structure decided, so it is not re-litigated

- **Eight real HTML files, no router dependency.** The landing page therefore ships none of the
  calculator's JavaScript, which is SPECIFICATION §13's low first-load time met by construction.
  Removing this later involves removing nothing: there is no router to take out.
- **A shared scenario link never lands on the landing page.** The scenario lives in the URL
  fragment, which carries no path, so a link can arrive at the root; `index.html` loads a tested
  redirect before its own module and moves it to the calculator with the fragment untouched.

---

## 7. The 183 tests that run on one machine (added 2026-08-16)

**This is plan-mode work and it is not scheduled. It is written down because it was found, and a
finding nobody records is a finding that gets found again.**

### What is true

CI runs **2,944** of the project's **3,127** tests. Seven test files read the harvester's output
from `build/proposed-curated/` — 4.3 MB across six files, the largest `ability-wikitext.json` at
3.1 MB — and that directory is `.gitignore`d on purpose as draft output. It is therefore absent
from every clone, and it cannot be rebuilt in CI: it is harvested from the wiki over the network,
which §2 measures at ~20 minutes.

| | |
|---|---:|
| Tests CI runs | 2,944 |
| Tests run on the owner's machine only | **183** |
| Test files involved | 7 |
| Areas they belong to | `scripts/extract/`, `scripts/fetch/`, and `tests/` |

The seven: `scripts/extract/rank-varying-count.test.ts`, `scripts/extract/rune-propose.test.ts`,
`scripts/fetch/ability-index.test.ts`, `scripts/fetch/defender-toggles.test.ts`,
`scripts/fetch/rank-shape.test.ts`, `tests/ability-files.test.ts`,
`tests/cross-area-seams.test.ts`.

**Why it matters more than the count suggests.** These are the tests over the harvester and the
fetch pipeline. §3 calls Area C "the area where a defect costs the most", and it is the area a
second party currently cannot check at all. `tests/cross-area-seams.test.ts` is on the list, which
means **the seam sweep §44 exists to run — the one check that catches two areas holding opposite
rules — is itself one of the checks CI does not run.**

**How it was found, because the shape recurs.** The first CI run ever, on 2026-08-16, failed on
all seven with file-not-found. The suite had been green since it was written, on one machine,
because the files were sitting on it. This is the same class as the stale-paragraph failures
CLAUDE.md records: a true statement about one context, read as a standing fact.

### What was done instead, and why it is not the answer

CI names the seven files and skips them, and a CI step compares that list against the files that
actually read the directory so it cannot quietly grow — proved by adding an eighth file and
watching it fail. `.github/workflows/ci.yml` and DEPLOY.md §0 both carry the count and the
definition.

**A list of exclusions is a worse instrument than a count of skips**, for the reason CLAUDE.md
already gives about published figures: the list says which files are excluded, not how many tests
are uncovered, and the two drift the moment a test is added to a file already on the list. Nothing
would fail.

### The fix, and what it would take

**Make each of the seven report a missing artifact as a NAMED SKIP rather than crash**, so what
is not covered is *counted* and printed by the runner, not inferred from a list in a YAML file.
Then delete the exclusions and let CI run everything, reporting `2,944 passed, 183 skipped
(artifact absent)`.

What it touches, and why it is not a quick change:

- **Three partitioned areas** — `scripts/extract/`, `scripts/fetch/` and `tests/`. Two are agent
  areas, one belongs to no area. That is a coordination problem before it is a code problem.
- **It changes test behaviour**, which CLAUDE.md's rule that matters most constrains: a test that
  can skip is a test that can pass by finding nothing. Each skip must state the artifact it wants
  and be impossible to satisfy accidentally.
- **The count becomes a published figure** and inherits the naming rule: *"183 skipped"* must mean
  183 tests skipped for the artifact reason and no other, or the name is a wrong number with no
  digits in it.

**Estimate: 4–6 agent-hours**, most of it in the third bullet rather than the first.

**The alternative that was considered and rejected on 2026-08-16** was committing the six files.
It was rejected by the project owner: 4.3 MB would enter git history and churn on every harvest
run, against a `.gitignore` comment that deliberately calls them proposals. Recorded so it is not
re-proposed as though it were new.
