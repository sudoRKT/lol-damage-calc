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
