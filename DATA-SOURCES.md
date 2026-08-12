# DATA-SOURCES.md

Permanent reference for where this project's data actually comes from, how to reach it,
and what each source does and does not contain. Written from a live fetch performed
against patch **16.16.1**. Every value below was observed directly, not taken from the
specification or from memory. If you are a future agent: read this before re-fetching
anything — it will save you from rediscovering the traps recorded here.

---

## 1. Wiki champion data — working access method

The champion base-stat data lives in the League of Legends Wiki module
`Module:ChampionData/data`. **Two different wikis host a module with this exact name.**
One is live, one is abandoned and stale. This project uses the **official Riot-run wiki
at `wiki.leagueoflegends.com`**. See the warning below — picking the wrong one silently
corrupts every champion stat in the product.

**Use this URL.** Note the mandatory `/en-us/` path segment — the bare `/api.php` issues a
302 redirect to it. It returns the whole roster as Lua source (~440,000 characters):

```
https://wiki.leagueoflegends.com/en-us/api.php?action=query&prop=revisions&titles=Module:ChampionData/data&rvslots=main&rvprop=content&format=json&formatversion=2
```

The Lua text is nested inside the JSON response at:

```
query.pages[0].revisions[0].slots.main.content
```

On this official host the `?action=raw` route also works (it returned HTTP 200 with the
raw Lua at `https://wiki.leagueoflegends.com/en-us/Module:ChampionData/data?action=raw`),
but `api.php` is the pinned method for consistency and because it returns a stable JSON
envelope.

### ⚠️ WARNING — do NOT use the Fandom wiki. It is stale and will silently corrupt stats.

There is a second, near-identical wiki at **`leagueoflegends.fandom.com`**. It looks the
same, hosts a module with the **same name** (`Module:ChampionData/data`, even the same
`pageid` 1401029), and returns data in the same format — so it is easy to pick by accident.
**It is abandoned.** Evidence gathered this session, both modules fetched the same day:

- **Highest `changes` patch recorded:** Fandom tops out at **V25.5**; the official wiki
  reaches **V26.15**. The Fandom copy has recorded no champion change in roughly the last
  eighteen months.
- **Champion count:** Fandom **171**, official **174**, Data Dragon referee **173**. The
  official count runs one ahead of Data Dragon (it lists a champion the CDN has not shipped
  yet); Fandom runs behind. Champions present only on the official wiki: **Locke, Yunara,
  Zaahen**. None are missing from the official side.
- **Actually-wrong base stats on Fandom**, cross-checked against Data Dragon 16.16.1 (whose
  *base* stats are reliable) as referee:
  - **Volibear** — base attack damage: Fandom **60**, official **65**, Data Dragon **65**.
    Base armor: Fandom **31**, official **35**, Data Dragon **35**. Fandom is wrong on both.
  - **Zac** — armor per level: Fandom **4.7**, official **5.2**, Data Dragon **5.2**.
    Fandom is wrong.
  - The stale `changes` markers that flag these: Volibear Fandom **V14.10** vs official
    **V26.15**; Zac Fandom **V14.13** vs official **V26.15**; Aatrox Fandom **V14.14** vs
    official **V26.12**.
- The Fandom `?action=raw` route additionally returns **HTTP 403** (Cloudflare challenge),
  which was mistaken in an earlier draft of this document for a general property of the raw
  route — it is specific to the Fandom host.

If a future fetch ever returns champion data whose highest `changes` patch is around V25 or
lower, you are on the Fandom wiki. Stop and switch to `wiki.leagueoflegends.com/en-us`.

### What the wiki module contains (this is the source of truth for champion stats)

Per champion it provides exactly the base and per-level values needed. Real example,
Aatrox (`["Aatrox"]`, id 266, apiname `"Aatrox"`):

- `hp_base` 650, `hp_lvl` 114
- `arm_base` 38, `arm_lvl` 4.8
- `mr_base` 32, `mr_lvl` 2.05
- `dam_base` 60, `dam_lvl` 5
- `as_base` 0.651, `as_lvl` 2.5, `as_ratio` 0.651
- `range` 175, `rangetype` "Melee", `adaptivetype` "Physical"

It also carries extras the engine can ignore (ARAM/URF damage multipliers, acquisition
radius, release date, and a `changes` field = last-changed patch, e.g. Aatrox `"V14.14"`).
For abilities it stores **names only** (`skill_q` = "The Darkin Blade") — no damage, no
ratios. Ability numbers are not here; they belong in the curated override file.

---

## 2. Riot Data Dragon — URLs

Data Dragon is a public, unauthenticated CDN. All paths carry the patch number, so the
pattern is reusable for any patch by swapping `16.16.1`.

- **Version list** (first array entry is the current patch):
  `https://ddragon.leagueoflegends.com/api/versions.json`
- **Realm / region file** (per-region live versions — see the trap in §8):
  `https://ddragon.leagueoflegends.com/realms/na.json`
- **All-champion summary:**
  `https://ddragon.leagueoflegends.com/cdn/16.16.1/data/en_US/champion.json`
- **Per-champion detail** (one file per champion, by apiname):
  `https://ddragon.leagueoflegends.com/cdn/16.16.1/data/en_US/champion/Aatrox.json`
- **Items:**
  `https://ddragon.leagueoflegends.com/cdn/16.16.1/data/en_US/item.json`
- **Runes (reforged):**
  `https://ddragon.leagueoflegends.com/cdn/16.16.1/data/en_US/runesReforged.json`

All six returned HTTP 200 this session.

---

## 3. The attack-damage-growth gap (why champion stats never come from Data Dragon)

In Data Dragon, `attackdamageperlevel` reads **0 for all 173 champions** — confirmed in
both the summary file and the per-champion detail file. Concrete case: Aatrox's Data
Dragon `attackdamageperlevel` = **0**, but the wiki's `dam_lvl` = **5** (the correct
value). Every *other* growth stat in Data Dragon is fine — Aatrox `hpperlevel` 114,
`armorperlevel` 4.8, `spellblockperlevel` 2.05, `attackspeedperlevel` 2.5 — it is
specifically AD-per-level that is blanked out, across the entire roster.

**Rule: champion base statistics and per-level growth come from the wiki module, never
from Data Dragon.** Data Dragon is used for champions only as an art/asset source.

---

## 4. What Data Dragon ability data does and does not contain

Data Dragon gives an ability's name, cooldown, cost, range, and icon — but **no usable
damage numbers and no ratios**. Real example, Aatrox Q ("The Darkin Blade"):

- `vars` = `[]` (empty)
- `datavalues` = `{}` (empty)
- `effect` per-rank arrays = `[0, 0, 0, 0, 0]`
- `tooltip` contains unresolved template placeholders: `{{ qdamage }}`, `{{ qedgedamage }}`
- What *is* populated: `cooldown` `[14, 12, 10, 8, 6]`, `cost` `[0, 0, 0, 0, 0]`, name

So there is no machine-readable path to ability base damage or scaling from Data Dragon.
All ability damage and ratios must come from the curated override file (see §9).

---

## 5. Item filtering

`item.json` contains **868 entries**. The rest — beyond the real Summoner's Rift pool — are
Arena variants, other-mode versions, trinkets, ornaments, and removed items.

Each real item is also **duplicated across game modes under different IDs**. Example — the
name "Infinity Edge" appears three times:

- `3031` — the real Summoner's Rift item (total gold 3500, `maps["11"]` = true)
- `223031` — Arena variant
- `773031` — another game-mode variant

**The old three-part filter is broken — do not reinstate it.** The filter that was
previously recorded here —

- `maps["11"] == true`  (intended to mean "Summoner's Rift")
- `gold.purchasable == true`
- `gold.total > 0`

— yields **248 entries, but only 222 of them are distinct items.** It admits **26 duplicate
mode-variants.** The reason is specific and easy to get wrong again: **Swiftplay also runs on
map 11**, so `maps["11"] == true` does **not** isolate classic Summoner's Rift — it lets
through the Swiftplay copies (and a few jungle-pet tier duplicates) as well. These copies are
not harmless aliases: they carry different gold and sometimes different stats.

Concrete example (verified 2026-08-12 against `item.json` 16.16.1): **Redemption appears as
`3107` at 2300g and as `323107` at 2800g. Only `3107` belongs in the pool.** The broken
filter keeps both, so a user would see two "Redemption" entries at different prices. Thornmail
(`3075` 2450g vs `323075` 2650g) and Hextech Gunblade (`3146` vs `663146`) duplicate the same
way, among 26 total.

**Corrected filter rule.** Keep an entry only when all of these hold:

- `maps["11"] == true`
- `gold.purchasable == true`
- `gold.total > 0`
- **`id < 200000`** — every mode-variant duplicate observed uses a six-digit id ≥ 200000
  (Swiftplay copies are `32xxxx`/`326xxx`/`663xxx`, Arena `22xxxx`, etc.); the real classic
  items keep their canonical 3–5 digit ids (`3107`, `3075`, `3146`, `3031`).

As a belt-and-braces check, **deduplicate by item name** afterward and, where a name still has
two survivors, keep the canonical low id. Cross-referencing the official wiki module's
classic-SR mode flag is an equivalent, more explicit alternative to the id cutoff. The
corrected pool is **222 distinct items**, not 248.

On the drop side the filter is safe for a damage tool: the only map-11 purchasable entries it
excludes are six zero-gold trinkets/quest items (Stealth Ward, Farsight Alteration, Oracle
Lens, Scarecrow Effigy, and Kalista's free Black Spear), none of which carry combat stats.
Boots and Doran's items have gold > 0 and are correctly kept.

**Item passive values are not in the structured data.** Infinity Edge's `stats` block
gives only `FlatPhysicalDamageMod` 75 and `FlatCritChanceMod` 0.25. Its signature passive
— 30% bonus critical strike damage — appears only inside the `description` HTML text
(`<attention>30%</attention> Critical Strike Damage`). Passive values must be curated.

---

## 6. Runes

`runesReforged.json` provides **5 trees** (Domination, Inspiration, Precision, Resolve,
Sorcery) and **62 runes** total. Each rune has only: `id`, `key`, `icon`, `name`,
`shortDesc`, `longDesc`.

**There are no structured numeric values — every number is embedded in prose.** Real
example, Press the Attack `longDesc`: "Hitting an enemy champion with 3 consecutive basic
attacks deals **40 - 160** … adaptive damage (based on level) and amplifies your damage
dealt by **8%** …". The `icon` fields are present and usable for the interface. Rune
numeric values must be curated.

---

## 7. Stat shards — present in no source

The rune stat shards (Adaptive Force +9, +9% attack speed, +6 armor, health-scaling-by-
level, and the rest) appear in **none** of the fetched files — not in `runesReforged.json`,
not anywhere in Data Dragon. They must be **hand-entered**. They are a small, stable,
well-documented set, so this is low-effort, but nothing will supply them automatically.

---

## 8. Patch version

- **Current patch = `16.16.1`** (first entry of `versions.json`; confirmed by the realm
  file's `dd`/`champion`/`item` fields).
- **Trap:** the realm file's `rune` field reads **`7.23.1`**. That is the version number of
  the **retired** (pre-Reforged) rune system, not the current runes. It must **never** be
  displayed to a user as the patch. The user-facing patch always comes from
  `versions.json`.
- The wiki module has **no single patch stamp** for the whole file. Each champion instead
  carries a `changes` field marking the patch it last changed in (Aatrox = `"V14.14"`).
  Treat wiki data as "current as of fetch date" and take the displayed patch number from
  Data Dragon.

---

## 9. The curated override file

Everything the two live sources cannot supply must live in the hand-curated override file.
Based on this fetch, that is **more than edge cases** — it is:

- all ability damage and ability ratios (Data Dragon supplies none — see §4)
- all item passive values (only flat stats are structured — see §5)
- all rune values (all numbers are prose — see §6)
- all stat shards (present in no source — see §7)
- all per-ability stack yields

This file is the project's only irreplaceable asset; every other input above can be
re-fetched from source.

---

## 10. Champion naming mismatch (wiki ↔ Data Dragon)

The wiki keys champions by human-readable name; Data Dragon keys its files and art assets
by an internal identifier. These differ for a number of champions, so a **mapping step is
required** to join wiki stats to Data Dragon art. Observed examples (wiki name → Data
Dragon identifier):

- **Wukong → `MonkeyKing`**
- **Nunu & Willump → `Nunu`**
- **Renata Glasc → `Renata`**
- (also Cho'Gath → `Chogath`, Kai'Sa → `Kaisa`, Bel'Veth → `Belveth`, Kha'Zix → `Khazix`,
  Vel'Koz → `Velkoz`, LeBlanc → `Leblanc`)

The wiki module conveniently carries an `apiname` field per champion that already holds the
Data Dragon identifier (Aatrox `apiname` = `"Aatrox"`), so the mapping can be built
directly from the wiki data rather than maintained by hand.

---

## 11. Where ability damage numbers actually live (project-sizing finding)

This section supersedes, at the project level, the earlier conclusion in §4 and §9 that
ability damage and ratios are unavailable and must all be hand-typed. That conclusion is
true **only of Data Dragon**. The wiki *does* hold every ability's base damage and ratios
in a machine-readable form. This changes the curated-file effort from "type ~850 abilities
by hand" (months) to "parse ~850 templates, then hand-verify and patch edge cases" (a
parsing job). **Nothing here is manual-from-scratch.**

### How a champion page is built

The champion article (e.g. `https://wiki.leagueoflegends.com/en-us/Aatrox`) is a thin
shell. Its entire Abilities section is five template transclusions:

```
== Abilities ==
{{Data Aatrox/I|Ability}}
{{Data Aatrox/Q|Ability}}
{{Data Aatrox/W|Ability}}
{{Data Aatrox/E|Ability}}
{{Data Aatrox/R|Ability}}
```

The numbers are **not** on the champion page. Each `{{Data <Champion>/<slot>}}` is a
template that redirects to a per-ability data page named by the ability's real name:
`Template:Data Aatrox/Q` → redirects to → `Template:Data Aatrox/The Darkin Blade`.

### Fetch a per-ability data template (this is the source of truth for ability numbers)

Use the same `api.php`, adding `redirects=1` so the slot alias resolves to the named page:

```
https://wiki.leagueoflegends.com/en-us/api.php?action=query&redirects=1&prop=revisions&titles=Template:Data_Aatrox/Q&rvslots=main&rvprop=content&format=json&formatversion=2
```

### The exact structure — two variants, both parseable

**Variant A — inline (the common case).** Base damage and ratios are written straight into
the `leveling` parameter using a fixed mini-syntax: `{{ap|X to Y}}` is the value at rank 1
through max rank, and `{{as|(+ Z% AD)}}` / `{{as|(+ Z% AP)}}` are the ratios. Real observed
values, fetched this session:

- **Lux Q (Light Binding):** `{{st|Magic Damage|{{ap|80 to 240}} {{as|(+ 75% AP)}}}}`
  → base **80 → 240** across ranks, **75% AP**, damage type Magic, cooldown 10.
- **Ezreal Q (Mystic Shot):** `{{ap|20 to 120}} {{as|(+ 130% AD)}} {{as|(+ 40% AP)}}`
  → base **20 → 120**, **130% AD + 40% AP** (dual ratio), Physical.
- **Darius Q (Decimate):** `{{ap|50 to 170}} {{as|(+ {{ap|100 to 140}}% AD)}}` for the
  blade, plus a handle component at `×0.35` → base **50 → 170**, ratio **100% → 140% AD**
  (the ratio itself scales per rank), Physical.

**Variant B — `#vardefine` header (used when the display math is complex).** Aatrox Q
declares its raw numbers as named variables at the very top of the template, each with a
human-readable comment, then the `leveling` lines compute displays from them:

```
{{#vardefine:b1|10}}   <!-- First Cast base damage Rank 1
{{#vardefine:b2|70}}   <!-- First Cast base damage Rank 5
{{#vardefine:r1|60}}   <!-- First Cast rank 1 AD ratio as a PERCENTAGE
{{#vardefine:r2|90}}   <!-- First Cast rank 5 AD ratio as a PERCENTAGE
{{#vardefine:cd|0.25}} <!-- Bonus Damage Modifier per Cast as a DECIMAL
{{#vardefine:sd|1.75}} <!-- Total Sweetspot Damage as a DECIMAL
```

So Aatrox Q real values: first-cast base **10 → 70** across ranks, **60% → 90% AD**, each
subsequent cast **+25%** damage, sweetspot **×1.75**.

### Answer to "which is true"

**It is (b): the numbers exist as per-page wikitext, one template per ability
(~850 templates total), in a recurring but not perfectly uniform format.** It is not (a) —
there is no single clean module that dumps all ability base numbers (the promising-sounding
central modules do not do this; see below). It is not (c) — the numbers are absolutely
present and machine-readable, not manual-from-scratch.

**Consistency across champions:** the `{{ap|X to Y}}` / `{{as|(+ Z% AD/AP)}}` convention
recurred on every champion checked (Aatrox, Lux, Ezreal, Darius). But the format has real
variation a parser must handle: inline values vs `#vardefine` headers; single vs dual
ratios (Ezreal); ratios that themselves scale per rank (Darius); and multi-component
abilities (Darius blade + handle, Aatrox three casts + sweetspot). A parser will extract
the great majority automatically and leave a minority of edge cases for human verification
— which matches the project's "verified / derived / incomplete" status model.

### Central modules checked and ruled out as the numbers source

- **`Module:Ability progression`** — Lua *rendering code*, not a source of base numbers. But
  rendering code is exactly where the **per-rank interpolation rule** lives, and it is
  authoritative for that rule — see "The `X to Y` interpolation rule" below.
- **`Module:DamageData/data`** (~293 KB Lua, URL:
  `https://wiki.leagueoflegends.com/en-us/api.php?action=query&prop=revisions&titles=Module:DamageData/data&rvslots=main&rvprop=content&format=json&formatversion=2`)
  — keyed champion → ability → damage-instance, but holds only **classification**:
  `damageType` (Physical/Magic/True), behaviour flags (applies lifesteal, triggers on-hit,
  is a proc), and notes. Example: Aatrox → "The Darkin Blade" carries a damage type and a
  property template, **no base number and no ratio**. This module is still valuable — it is
  a ready-made source for the engine's instance typing (§3.4) and for on-hit / lifesteal /
  proc flags — but it is **not** where the damage figures live.

### The `X to Y` interpolation rule (from Module:Ability progression)

The `{{ap|X to Y}}` shorthand is expanded by `Module:Ability progression` (function
`string_to_formula`) as **linear**:

```
value(rank) = X + (Y − X) / (ranks − 1) · (rank − 1)
```

where `ranks` is the ability's rank count (5 for a basic ability, 3 for an ultimate, and
occasionally other values). Variants the parser must handle: `X to Y by Z` (fixed step Z, rank
count derived from the span) and `X to Y for N` (interpolate across exactly N ranks).

**Abilities that do not scale evenly are stored as explicit pipe-separated per-rank lists**
`{{ap|v1|v2|…|vn}}`, and those literal values are used verbatim. Confirmed non-even examples,
found by scanning 180 ability templates on 2026-08-12:

- **Kayle R** (Divine Judgment): `{{ap|675|675|775}}` — steps 0, +100.
- **Anivia Crystallize**: `{{ap|133.33|125|120|116.67|114.29}}` — a decreasing curve.
- **Anivia Glacial Storm**: `{{ap|200|267|333}}`.
- **Caitlyn Yordle Snap Trap** and **Gangplank Powder Keg**: `{{ap|3|3|4|4|5}}`.

**Never interpolate a middle rank by assuming an even step.** Either the source gives `X to Y`
(then apply the linear rule above) or it gives an explicit list (then use it verbatim). The
curated schema carries both forms — a `linear` `{from, to}` and an `explicit` `perRank[]`
(see the plan's §2 F / §2 G). Verified against **Lux Q** (`{{ap|80 to 240}}` →
80/120/160/200/240) and **Darius Q** (`{{ap|50 to 170}}` → 50/80/110/140/170). Aatrox Q's
`{{ap|10 to 70}}` therefore expands to 10/25/40/55/70 by the rule — correct, but as a
consequence of the documented formula, not an assumption.

### Practical recipe for a future agent building the curated file

1. From `Module:ChampionData/data`, read each champion's `skill_i/q/w/e/r` names.
2. For each, fetch `Template:Data <Champion>/<slot>` with `redirects=1` to reach the named
   ability template.
3. Parse the `leveling` mini-syntax (`{{ap|X to Y}}`, `{{as|(+ Z% AD/AP)}}`) and any
   `#vardefine` header for base damage per rank and ratios. Apply the interpolation rule above:
   `X to Y` → linear, an explicit `{{ap|v1|v2|…}}` list → verbatim. Never guess a middle rank.
4. Cross-reference `Module:DamageData/data` for damage type and on-hit/lifesteal/proc flags.
5. Hand-verify the edge cases (multi-component abilities, per-rank-scaling ratios) and
   assign each a verification status.

---

## 12. Which source wins, per field

**The single most important lesson in this document: authority is per-field, not
per-source.** Neither the wiki nor Data Dragon is "the correct source" in general. Each has
fields it is right about and fields it is wrong about, and the two have been caught being
wrong in *opposite* directions. The table below records the winner for every field settled so
far, with the evidence. Every row was established by fetching both sources and comparing —
none is assumed.

| Field | Authoritative source | Evidence (why the other loses) |
|---|---|---|
| Champion base stats & per-level growth | **Official wiki** (`Module:ChampionData/data`) | Data Dragon reports `attackdamageperlevel` = **0 for all 173 champions** (e.g. Aatrox 0 vs wiki 5); other stale base stats too (Volibear base AD 60 vs correct 65). See §3. |
| Item gold cost | **Data Dragon** (`item.json`) | The wiki is stale here: **Redemption** wiki **2250g** vs Data Dragon **2300g**, and the recipe sums to exactly 2300 (850 + 850 + 600). See §5, Check 1. |
| Item stat values (AD/AP/HP/haste/etc.) | **Data Dragon** (`item.json`), confirmed current for 16.16.1 | Cross-checked recently-changed items (Essence Reaver, Statikk Shiv, Black Cleaver) against the wiki `Module:ItemData/data`; all stats matched. Wiki agrees but is redundant. |
| Rune stat values | **Data Dragon** (`runesReforged.json`), confirmed current for 16.16.1 | Recently-changed runes (Aftershock, Arcane Comet, Cash Back, Hail of Blades, Press the Attack) matched the wiki's live-rendered values. Numbers are in prose (see §6). |
| Ability base damage & ratios | **Per-ability wiki templates** (`Template:Data <Champion>/<Ability>`) | Data Dragon supplies none — empty `vars`/`datavalues`, unresolved tooltip placeholders (§4). The wiki templates hold the literal numbers (§11). |
| Ability damage type & on-hit/proc/lifesteal flags | **Official wiki** (`Module:DamageData/data`) | Data Dragon does not classify these; this module is keyed champion → ability → instance with `damageType` and behaviour flags (§11). |
| Rune stat shards (Adaptive Force, AS, armor, health-by-level) | **No source — hand-entered** | Absent from `runesReforged.json` and everywhere in Data Dragon (§7). |

**The rule that follows from this:** because neither source is authoritative in general, **the
winner for any *new* field must be established by evidence before that field is used — fetch
both sources, compare, and pick the winner from what you observe. Never inherit a field's
winner from a neighbouring field.** Item gold going to Data Dragon does not make Data Dragon
right about champion AD growth; the wiki winning champion stats does not make it right about
item gold. Both of those specific cross-assumptions would have been wrong.

---

## 13. Traps when reading wiki values

The wiki renders values through templates and patch-history boxes, and several of those
renderings state a number for a *different context* than the one you want. Each trap below has
produced, or would have produced, a confident wrong number. (The `7.23.1` rune-version trap is
recorded separately in §8 — it belongs to this same family: a value that looks current but
describes the retired rune system.)

- **Patch-history / changelog boxes show retired values.** A rune or item's patch-history
  section lists what the value *used to be*. Example caught this session: Hail of Blades'
  history scroll showed an intermediate **120%** attack speed, while the **live** data renders
  **90%** (matching Data Dragon). Reading the history box instead of the live value gives a
  number that was correct one or more patches ago and is wrong now.
- **Displayed values may be extrapolated to a level you did not ask for.** Example caught this
  session: the wiki displayed Press the Attack as **174.12**, which is the **level-20**
  extrapolation. The ability's own formula (`40 + (160-40)/17*(x-1)`) pins the **level-18**
  value to exactly **160**, matching Data Dragon. Champions cap at level 18 in normal play, so
  160 is the figure the engine needs; 174.12 would silently overstate it.

**General rule: when reading a value off a rendered wiki page, confirm which level and which
patch it is stated for before trusting it.** Prefer the underlying formula or the module's
literal number over a rendered figure; when only a rendered figure is available, verify it is
the live (current-patch) value and, for level-scaled numbers, the level-18 value — not a
patch-history entry and not a level-20 extrapolation. Where possible, settle the number
against an independent source (Data Dragon for item/rune stats) rather than a single rendered
page.
