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
| — **verified** | **8** | ledger holds 10; the runner promotes 8. Two lack gate-2 evidence because the prose round-trip was never wired in (§36). Corrected 2026-08-13 |
| — gate 2 disagreed | 37 | forced `incomplete` |
| — no gate-2 evidence either way | 2 | was 35 before the third round-trip (§28) |
| **Permanently unreachable** | **23** | records an `unresolvable`: a fact no source states. Not work |

**Damage components stored: 917** — corrected 2026-08-13 from 921. **DEFINITION: components
surviving the summary, non-champion and unreadable-row filters, over 937 distinct pages.** The four
missing against 921 are the summary rows §34.1's widened filter now drops (Gangplank R's "Maximum
Mixed Total Damage with and", Gwen R's second and third cast totals, Xin Zhao W's "Slash Total
Physical Damage"). 921 was measured before that change landed. Gate 7 leaves **51** unreconciled,
split **35 under / 16 over** — not the 33/18 recorded here previously (§34.1 restated the over-sums
and never restated the under-sums; two entries changed direction rather than disappearing).

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
**The formula layer exists and is tested; the component model does not.** The engine must now
consume what the harvester actually produces: `hits`, `relation` (adds vs alternativeTo),
`multipliers` (a ratio scaling another ratio), `owner` (whose stat), and four `Scaling` arms
including two level-scaled. The old plan assumed a flat base-plus-ratio model, which is 96% of
components and 0% of the hard ones.
**Estimate: 18–24 agent-hours.**

### Area E — the interface (`src/ui/`)
**Unbuilt, and now blocked on a design decision.** SPECIFICATION §8 requires four statuses and a
permanent-versus-pending distinction; `DESIGN.md` carries glyphs for three statuses and none for
the rest, and it is write-denied to every session. **That decision gates the whole area.**
The interface must also present `derived` as the normal well-evidenced state rather than a
warning, which is a copy and hierarchy problem as much as a component one.
**Estimate: 30–40 agent-hours**, plus the design decision.

### Area F — the scenario↔URL encoder (`src/url/`)
Untouched and unchanged by any of this. **Estimate: 5–7 agent-hours.**

---

## 4. Sequence, and why

1. **Unblock Area E's design decision** (glyphs for `no-damage` and permanent/pending). Cheap,
   and everything visual waits on it.
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
