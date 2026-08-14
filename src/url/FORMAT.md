# The shared-link format

*Area F — `src/url/`. Written before the encoder was built, so the format is a decision and
not a description of whatever the code happened to do.*

---

## 1. Why this exists at all

The product has no accounts, no database and no server-side storage of any kind
(SPECIFICATION §1, §14). **The link is the only place a scenario can live.** When a streamer
posts a link, that link *is* the scenario. There is no copy of it anywhere else to fall back
on.

That makes a wrong link exactly as dangerous as a wrong damage number, and dangerous in the
same way: it is plausible. If a link quietly decodes into *nearly* the scenario that was
shared — the same champions, the same combo, but Conqueror sitting at 0 stacks instead of 2 —
the damage total changes and **nobody watching can tell**. Every decision below follows from
that one sentence.

---

## 2. What a link looks like

```
https://example.com/#s=1~eyJ2IjoxLCJhIjpb...~k3f2p1
                     │ │ │                  │
                     │ │ │                  └─ checksum
                     │ │ └──────────────────── payload
                     │ └────────────────────── schema version
                     └──────────────────────── the fragment key
```

Three parts separated by `~`, and they are read strictly left to right.

**The scenario lives in the fragment (after the `#`), not in the query string.** Two reasons,
both about what a user experiences. First, a fragment is never transmitted to a web server —
so a scenario a coach builds is not written into the access log of the CDN, nor into any
referrer header when the user later clicks a link away from the page. Second, servers and
proxies commonly truncate long query strings; nothing truncates a fragment, because nothing
but the browser ever sees it.

**Length.** A full scenario — two champions with six items each, full rune pages, entry state
on both sides, and a five-step combo — comes out around 700–900 characters. This is well
inside the ~2,000-character limit that the most conservative browsers and chat clients honour,
but it is long enough that some chat clients will wrap or visually truncate it. Measured
figures for real scenarios are in §9.

**Version 2 cost nothing for a scenario that does not use its new field.** Measured 2026-08-14
over all 21 named scenarios: **not one link moved by a single character**, because none carries
hit counts and the version digit is one character in both formats. For a step that DOES carry
them the cost is about **12 characters per step**. **The new maximum for a realistic scenario is
1,852 characters** — the maximal build with a 13-step combo where every step carries both an
options bag and a hit count. The per-shape ceilings under the 2,000 budget, on the maximal build:
**72** plain steps, **35** with hit counts only, **16** with options only, **14** with both. So
version 2 costs two steps off the options-carrying ceiling. All six figures are pinned in
`length.test.ts`.

---

## 3. The version, and what an old client does with a new link

The version is a plain decimal integer, first, before anything else, and outside the encoded
payload. This is deliberate: **a decoder must be able to read the version without
understanding anything else in the link.** If the version were inside the payload, a decoder
would have to successfully parse a format it does not know in order to discover that it does
not know it.

The current version is **2**. Version 1 remains readable and always will (see below); the only
difference between them is that a version 2 combo step can carry `hitCounts` — the count a user
states for an ability whose hit count is a property of the situation rather than of the ability
(DATA-SOURCES §38, §46). Version 1's step-key list predates that field, so a scenario using one
of the 7 abilities that store `variableHits` could not be shared at all under version 1.

**The envelope is fixed across all versions; only the payload is versioned.** Three fields,
`~` between them, the same checksum function. This is what makes the promise above real: the
version is read, and judged, *before* the payload or the checksum is looked at. If a future
version 2 also changed how the payload is written, a version 1 build still says "this link is
newer" rather than "this link is damaged" — and that matters, because a user told their link
is damaged goes and asks for it to be sent again, which cannot possibly help.

A decoder that meets a version it does not recognise **stops and says so**. It does not
attempt a best-effort read, and it does not fall back to the newest format it does know.

> What the user sees: *"This link was made with a newer version of the site (link format 4,
> this site understands up to 1). Reload the page to get the latest version, then try again."*

That is the honest message, because that is the actual situation: the link is fine, the
reader is old. The opposite case — a version *older* than the current one — is a
compatibility promise this project makes and must keep: **every version ever published stays
readable forever.** A link shared in a YouTube video two years ago must still open. So
version 1's decoder is never deleted; a version 2 adds a second decoder beside it.

**What a version is for.** The version changes when the *shape of the encoding* changes, not
when game data changes. A new patch that renames an item does not bump the version — that is
a data question, handled in §6.

---

## 4. What is encoded

Everything in the frozen `Scenario` type (`src/types/scenario.ts`), and nothing else. Written
out in full so there is no ambiguity about what "the whole scenario" means:

| Part of `Scenario` | What it holds |
|---|---|
| `version` | the schema version — carried in the link's first field, not duplicated inside |
| `attacker`, `defender` | one `ChampionConfig` each, both encoded identically and in full |
| `combo` | the ordered list of steps |

And within each `ChampionConfig`:

| Field | What it holds | How it is encoded |
|---|---|---|
| `apiname` | e.g. `Aatrox` | as text |
| `level` | 1–18 | as a number |
| `abilityRanks` | Q/W/E/R ranks | four numbers in the fixed order Q, W, E, R |
| `items` | item ids | list of numbers, **order preserved** |
| `runes.keystone` | a rune id, or none | a number, or `null` — and `null` is a real value, distinct from a keystone of id 0 |
| `runes.primary`, `runes.secondary` | minor rune ids | lists of numbers, order preserved |
| `runes.shards` | three stat-shard ids | list of text, order preserved |
| `persistent` | **persistent accumulations** (§3.3) — Veigar stacks, Nasus stacks. Fold into the stat block before the sequence and do not change during it | key→number pairs |
| `entryState` | **combat state** (§3.3) — Conqueror stacks, Bone Plating, Hemorrhage already on the target. Seeded at entry, then mutated by the sequence | key→number-or-boolean pairs |

`persistent` and `entryState` are encoded as two separate things because SPECIFICATION §3.3
treats them as two separate things, and the interface shows them in two different places —
persistent accumulations beside the build, combat state beside the combo. Merging them in the
link would be a silent claim that they are the same, and would make it impossible to put a
decoded scenario back into the right two boxes.

And within each `ComboStep`:

| Field | How it is encoded |
|---|---|
| `id` | as text |
| `kind` | one of the five step kinds, as text |
| `ref` | as text |
| `options` | an optional bag of step-specific settings (`{ sweetspot: true }`) |

**Order is the combo.** The engine models sequence, not time (SPECIFICATION §3.2), so the
order of `combo` *is* the scenario's meaning — Q-then-auto is a different scenario from
auto-then-Q, and they must produce different links. The combo is encoded as an ordered list
and is never sorted, deduplicated, or reordered on either side. The same applies to `items`,
`primary`, `secondary` and `shards`: these are stored as lists in the type, so they are
carried as lists.

**A step's `options` bag is optional, and "absent" is preserved as absent.** A step that
carried no options does not come back carrying an empty one.

---

## 5. What happens when a link is broken

The governing rule: **a scenario that cannot be reproduced exactly must fail visibly.** There
is no partial decode, no "best effort", no filling in of a field the link did not carry. A
decoder that helpfully supplies a missing value produces a scenario the sharer never built,
and produces it silently.

Four mechanisms enforce this, in the order they run.

**Structure.** A link that is not `version~payload~checksum` is rejected on sight.

**Checksum.** The third field is a short hash of the payload. It exists because the common
real-world damage to a link is *truncation* — a chat client cutting the last characters off,
or a user copying a partial selection — and truncation does not reliably produce an
unparseable payload. It can produce a shorter, still-valid one. The checksum turns "quietly
different scenario" into "refused link". It is a 32-bit FNV-1a hash written in base 36: about
six characters. It is an **integrity** check, not a security measure — it detects accidents,
and makes no attempt to resist someone deliberately forging a link. Nothing in this product
depends on a link being trustworthy, because a link only ever affects what the person opening
it sees.

**Shape.** After the payload parses, every field is checked against the `Scenario` type: right
fields present, right kinds of value, no extra fields. A missing field is an error, never a
default. The error names the field — `attacker.runes.shards[2]` — so the failure can be
reported precisely rather than as a shrug.

> What the user sees for all three: *"This link is damaged and can't be opened. It was
> probably cut short when it was copied or posted — ask for it again."* The page loads empty
> rather than loading something wrong.

**References that no longer exist.** This is the case the other three cannot catch, because
such a link is perfectly well-formed. It says `item 3078`, and item 3078 was removed two
patches ago. **Checking this is deliberately a separate step from decoding**, for a reason
worth stating: decoding depends only on the frozen types, while resolving depends on the
current patch's data. A decode is a fact about the link; a resolution is a fact about today.

So a decoded scenario is checked against the current champion, item and rune catalogue as a
second pass, which returns a **list of every reference it could not resolve** — not just the
first. The scenario is *not* repaired: the unknown item is not dropped and not substituted.

> What the user sees: *"This scenario was built on an earlier patch. It uses 1 item that no
> longer exists (id 3078). The scenario can't be calculated as shared."* Named, counted, and
> refused — rather than a damage total computed as though five items were six.

The alternative — dropping the missing item and calculating anyway — was rejected. It
produces a number that is wrong by roughly the value of an item, presented with exactly the
same confidence as a correct one.

---

## 6. What survives a patch, and what does not

SPECIFICATION §12 requires the schema to be versioned "so that shared links survive patch
changes and remain interpretable". Worth being precise about what that can and cannot mean.

**Interpretable** is achievable and is what the versioning delivers: a link from any past
version can always be *read* — we can always say what scenario it describes.

**Reproducible** is not something a link can promise on its own, because the numbers a
scenario resolves to depend on the patch, not the link. The same link calculated on patch
16.16 and on 16.20 will give different damage if the champion was changed in between, and
that is correct behaviour, not a bug. The `Result` type already records the `patch` it was
calculated on, which is how a reader can tell.

The failure this format prevents is the third case: a link that reads as a *different*
scenario than the one shared. That one is prevented absolutely.

---

## 7. What the payload actually is

The payload is the scenario written as JSON, laid out compactly, encoded as UTF-8, and then
written in base64url — the URL-safe alphabet, so nothing in it needs percent-escaping and
nothing gets mangled by a chat client that tries to be clever about link boundaries.

"Laid out compactly" means field *names* are not repeated in the link. A `ChampionConfig`
becomes a fixed-length list whose positions are fixed by this document, so `"level"` is not
spelled out in every link. This is a size decision, and it is the reason a full scenario fits
in ~800 characters rather than ~2,500.

The exact positional layout is recorded in the version-1 codec source
(`src/url/v1.ts`), which is the single point of truth for it. Two rules govern it:

- **A position is never reused or reordered within a published version.** Adding a field
  means a new version, not an extra slot in version 1.
- **The layout is exhaustive.** Every field of `Scenario` has a position. There is no
  "everything else" bucket, because a bucket is how a field ends up silently unencoded.

### Values the format refuses to carry

The link is JSON, so it can only carry what JSON can carry, and the encoder **refuses**
rather than silently mangling:

- a number that is `NaN` or infinite (JSON writes these as `null`, which would decode as a
  different value);
- **negative zero**, which JSON writes as `0`;
- a step-`options` value that JSON cannot represent — a function, a `Date`, `undefined`.

These are refusals at *encode* time, where they are a bug in the caller, and each names the
offending path. None of them can reach a shared link.

**Negative zero is raised, not settled.** It was not on this list when the list was written —
the generated-scenario test found it. `-0` and `0` are the same number to every calculation
the engine performs and display as the same thing, so refusing to share a scenario because a
stack count is `-0` is a blocking, baffling failure over a difference nobody can see. The
refusal was kept anyway, because normalising it would break this module's one guarantee: that
a link reproduces the scenario **exactly**, with no exceptions and no "except where it does
not matter". Someone must be able to state that sentence without a footnote. The alternative —
rejecting `-0` at the point the user types it, in the interface, where the message can be
useful — is the better fix and is not this module's to make. **Flagged for the lead.**

### Compression: deliberately not in version 1

The browser has a built-in compressor (`CompressionStream`) that would cut the payload by
roughly half, and there are npm packages that do it better. **Version 1 uses neither.**

Adding a dependency for it is a project-rule decision, not a technical one (CLAUDE.md: say
what a dependency is for and what removing it later would cost) — and here the cost of
removal is unusually high, because *every link ever shared would become unreadable without
it*. A compression library in the URL format is a permanent dependency, not a replaceable one.

`CompressionStream` needs no dependency, but it is asynchronous, which would make encoding
and decoding async everywhere they are used, and it is the kind of complexity that is much
easier to add in version 2 — where the versioning scheme means old links keep working
untouched — than to remove later. **This is raised, not decided.** The current length is
inside every practical limit; if a real one is hit, version 2 is the answer.

---

## 8. What the code exposes

| Function | What it does |
|---|---|
| `encodeScenario(scenario)` | scenario → the `1~payload~checksum` string. Throws if the scenario contains something JSON cannot carry (§7) |
| `decodeScenario(text)` | the string → **either** `{ ok: true, scenario }` **or** `{ ok: false, error }`. Never throws, never guesses |
| `scenarioToUrl(baseUrl, scenario)` | builds the full shareable link, scenario in the fragment |
| `scenarioFromUrl(url)` | pulls the scenario out of a full link; same result shape as `decodeScenario` |
| `resolveScenarioReferences(scenario, catalogue)` | the §5 catalogue pass — lists every champion, item, rune and shard the current patch does not have |

Decoding returns a result rather than throwing because a bad link is an ordinary thing that
happens to users, not a programming error, and the interface has to be able to show a
sentence about it.

---

## 9. Measured link lengths

Measured on 2026-08-13 from the named test scenarios. Total URL length, base
`https://example.com/`. The budget held by `length.test.ts` is **2,000 characters**, the most
conservative limit in common use.

| Scenario | URL characters |
|---|---:|
| `max-level-max-ranks` — two champions, nothing else | 160 |
| `minimal` — the emptiest legal scenario | 163 |
| `keystone-null` | 180 |
| `duplicate-and-ordered-items` | 192 |
| `both-entry-state-kinds-both-champions` | 256 |
| `asymmetric-champions` | 295 |
| `unicode-and-awkward-keys` | 322 |
| `nested-options` | 347 |
| `all-five-step-kinds` | 373 |
| **`canonical-mock`** — the shared mock from `src/types/` | **575** |
| `long-combo-twenty-steps` | 768 |
| **`maximal`** — six items and a full rune page on both sides, both kinds of entry state, five-step combo | **870** |

So a realistic shared scenario is **roughly 600–900 characters**. That is longer than a
shortened link and shorter than anything that gets truncated. It is comfortably inside what
Discord, Twitch chat, YouTube descriptions and email clients carry intact.

**RE-MEASURED ON 2026-08-14, AFTER VERSION 2. Every figure in the table above is UNCHANGED — not
one link moved by a single character.** None of the named scenarios carries `hitCounts`, and the
version digit is one character in both formats, so the new slot costs a scenario that does not
use it precisely nothing. What it costs a scenario that DOES:

| Shape, on the maximal build | v1 | v2 |
|---|---:|---:|
| 5 steps, options only | 1,052 | 1,052 |
| 5 steps, options **and** hit counts | *unshareable* | **1,113** |
| 13 steps, options only | 1,692 | 1,692 |
| **13 steps, options and hit counts — the new maximum** | *unshareable* | **1,852** |

About **12 characters per step** that carries a one-key hit-count bag. Under the 2,000 budget the
per-shape ceilings are **72** plain steps, **35** with hit counts only, **16** with options only,
and **14** with both — so version 2 costs **two steps** off the options-carrying ceiling and
nothing off the others. "Unshareable" is literal: version 1 threw rather than dropping the field,
which is the right failure and still a failure (DATA-SOURCES §44.3).

### Where the budget actually runs out

An earlier draft of this document asserted that even a forty-step combo with options on every
step fits the budget. **It does not — measured, it is 4,457 characters.** The corrected
figures are below, and two costs dominate. Both are worth stating because both are avoidable
upstream.

**Option key names.** Version 1 spells out the key names of a step's options bag once per
step. A step carrying a three-key bag (`cast`, `forceCrit`, `sweetspot`) costs about **95
characters**; a step with no options costs about **19**. So a maximal build fits 60+ plain
steps, but only about **13 steps if every one of them carries options**. A realistic combo is
5–12 steps and few of them carry options, so this is a ceiling rather than a present problem —
but it is the first thing compression would fix, and it is why §7 raises compression rather
than dismissing it.

| Combo on a maximal build | URL characters |
|---|---:|
| 5 steps, all with options | 1,126 |
| 10 steps, all with options | 1,597 |
| 15 steps, all with options | 2,072 — **over budget** |
| 40 steps, all with options | 4,457 |
| 20 steps, no options | 1,017 |
| 60 steps, no options | 1,763 |

**Step ids.** Each step's `id` is carried verbatim. A two-character id (`s7`) costs ~19
characters per step; a fourteen-character one (`step-number-7`) costs ~33. That is the
difference between a 60-step combo fitting (1,763) and not (2,643). **A note for whoever
generates step ids in the interface: keep them short.** Nothing in this module forces that,
so it is recorded rather than enforced.

Both costs are pinned by tests in `length.test.ts`, so a future format change that inflates
them fails a run instead of shipping quietly.
