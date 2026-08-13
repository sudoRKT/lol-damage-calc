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
value). This one is a *structural* fault: the field is blanked out across the entire
roster, in every patch, and it will not fix itself.

### ⚠️ CORRECTION (2026-08-12): "every other growth stat is fine" was FALSE

This section previously said every other growth stat in Data Dragon was fine. **It is not,
and the reason is the opposite of the AD case: the wiki module lags a patch behind.**

Patch 26.16 (Data Dragon `16.16.1`, released 2026-08-12) changed base magic resistance for
28 champions. Data Dragon carried the new values the same day. **The wiki module did not** —
its highest `changes` marker is still V26.15. So for one patch window, the wiki is wrong
about every stat that patch touched:

- **28 champions' magic resistance** — wiki `30 / 1.3`, Data Dragon `33 / 1.1` (Tristana
  `28 / 1.3` vs `33 / 1.1`). All 28 are marksmen. That is a 3-point magic-resist gap on
  every ranged target at level 1, and it moves damage numbers.
- **Bel'Veth health growth** — wiki `110`, Data Dragon `105`. The patch notes say "Health
  growth reduced to 105 from 110", so Data Dragon is right here too.

**The two faults point in opposite directions and must be handled separately:**

| Fault | Which source is wrong | Nature | Handling |
|---|---|---|---|
| `attackdamageperlevel` = 0 | Data Dragon | Structural, permanent | Always take AD growth from the wiki |
| Stats changed by the newest patch | Wiki module | Temporary, self-healing next edit | Take the changed stat from Data Dragon for that window |

**Revised rule: champion base statistics and per-level growth come from the wiki module by
default, because of the AD-growth fault — but the wiki is NOT authoritative for a stat the
current patch has just changed.** Before trusting a champion stat, check whether the current
patch touched it (the patch page `V<season>.<patch>` on the wiki lists this explicitly) and
whether the module's `changes` marker has caught up. See §12 and §13 for the full evidence.

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
classic-SR mode flag is an equivalent, more explicit alternative to the id cutoff.

### The corrected pool is 209 distinct items — NOT 222 (corrected 2026-08-12)

An earlier version of this document said the corrected pool was 222. **That was wrong, and the
error is worth understanding because the number 222 is real — it just measures the wrong thing.**
222 is the count of distinct *names* under the **broken** filter, before the id cutoff is applied.
It is not the size of the classic pool.

The full funnel, re-observed twice on 2026-08-12 (once by the pipeline, once independently):

| Stage | Entries | Distinct names |
|---|---|---|
| `item.json` total | 868 | — |
| `maps["11"] == true` | 316 | — |
| `+ gold.purchasable` | 254 | — |
| `+ gold.total > 0` | **248** | **222** ← the broken filter's numbers |
| `+ id < 200000` | 212 | **209** |
| `+ dedupe by name` | **209** | **209** ← the corrected pool |

The gap is 13, and it is not rounding error: **13 item names exist only above the id cutoff.**
They are Arena-exclusive gear with no classic Summoner's Rift counterpart, so dropping them is
correct — a damage tool for classic SR must not offer them:

Atma's Reckoning · Cloak of Starry Night · Crown of the Shattered Queen · Cruelty ·
Demon King's Crown · Flesheater · Gambler's Blade · Gargoyle Stoneplate ·
Shield of Molten Stone · Sword of Blossoming Dawn · Sword of the Divine ·
Veigar's Talisman of Ascension · Zephyr

The three names that the final dedupe step removes are jungle-pet tiers, not mode variants:
Scorchclaw Pup (kept 1101, dropped 1107), Gustwalker Hatchling (kept 1102, dropped 1106),
Mosstomper Seedling (kept 1103, dropped 1105).

**If a future fetch yields 222, the id cutoff is not being applied.** If it yields 248, neither
the cutoff nor the dedupe is.

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
wrong in *opposite* directions.

**Read this table as a record of what has been checked, not as a guarantee.** Every row below
was established by fetching both sources and comparing, on the date given. It says nothing
about a field nobody has examined, and — as the magic-resistance case in §3 proved — a row can
be too broad: "champion base stats and per-level growth" was recorded as a win for the wiki,
and that turned out to be true of *attack-damage growth* and false of *any stat the current
patch just changed*. A row is a finding about the fields actually compared. Widening it to
neighbouring fields is exactly the mistake this table exists to prevent.

**Authority is also time-dependent, not just field-dependent.** The wiki module updates by
hand and can sit a patch behind; Data Dragon ships with the patch. A field the wiki wins in
general it can still lose in the days after a patch that changed it.

| Field | Authoritative source | Evidence (why the other loses) |
|---|---|---|
| Champion **attack-damage** growth (`dam_lvl`) | **Official wiki** (`Module:ChampionData/data`) | Data Dragon reports `attackdamageperlevel` = **0 for all 173 champions** (e.g. Aatrox 0 vs wiki 5). Structural and permanent. See §3. |
| Champion base stats & growth **that the current patch just changed** | **Data Dragon** | The wiki module lags. Patch 26.16 moved 28 marksmen to `33 / 1.1` magic resistance and Bel'Veth health growth to 105; Data Dragon carried all of it the same day, the module still read the old values. Settled against the wiki's **own patch page** `V26.16`. See §3, §14. |
| Champion base stats & growth, otherwise | **Official wiki** (`Module:ChampionData/data`) | Checked for hp/armor/MR/AS base and growth outside the current patch window; wiki agreed with Data Dragon. Also catches stale Data Dragon base stats (Volibear base AD 60 vs correct 65). |
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

---

## 14. Investigations closed on 2026-08-12

Two questions were investigated to a conclusion on this date. Both are recorded here so nobody
repeats the work, and so the two loose ends are not mistaken for settled facts.

### 14.1 Marksman magic resistance — settled in Data Dragon's favour, with two exceptions

**Question.** The wiki module and Data Dragon disagreed about base magic resistance and its
growth for 28 champions. Which is right?

**Answer: Data Dragon, for 26 of the 28. Two cannot be settled from available sources.**

The decisive source turned out to be **the wiki's own patch page**, which contradicts the
wiki's own data module. Evidence, in the order it was gathered:

1. **Data Dragon changed the value in exactly this patch.** Ashe's `spellblock` /
   `spellblockperlevel` read `30 / 1.3` in every one of the 25 previous patches sampled
   (15.15.1 through 16.15.1) and `33 / 1.1` in 16.16.1. A melee control champion (Aatrox) was
   unchanged at `32 / 2.05` throughout, so this is not a wholesale reshuffle of the file.
2. **The wiki's patch page documents the change.** `V26.16` (released 2026-08-12) states, per
   champion: "Base magic resistance increased to 33 from 30. Magic resistance growth reduced to
   1.1 from 1.3." Fetched as raw wikitext via `api.php`, not as a rendered page.
   URL: `https://wiki.leagueoflegends.com/en-us/api.php?action=query&redirects=1&prop=revisions&titles=V26.16&rvslots=main&rvprop=content&format=json&formatversion=2`
3. **Data Dragon matches those notes for 26 of the 27 champions the notes name.**
4. **The wiki data module carries the pre-patch values**, consistent with its highest `changes`
   marker being V26.15 — one patch behind.
5. **A third dataset (Meraki Analytics) also reads `30 / 1.3`** — also stale, and therefore not
   an independent confirmation of the wiki, just the same lag.

**The two that are NOT settled. Do not treat either as verified:**

- **Tristana.** The patch notes say base magic resistance **31** (from 28). Data Dragon says
  **33**. Riot's prose and Riot's CDN disagree with each other, and the wiki module is stale on
  both. No source available here breaks the tie.
- **Twitch.** Data Dragon moved him `30 → 33`. **The patch notes never mention Twitch at all.**
  Either the notes omit him or the CDN value is wrong.

**What would settle them:** a reading of the live game client's own character records. The
obvious route — CommunityDragon's `game/data/characters/<name>/<name>.bin.json` — was tried and
does not work: the stat keys in that dump are hashed (`{b0ad034f}` and similar) and are not
readable without a hash table, and CommunityDragon's readable champion endpoint carries no
stats at all. The alternatives are the in-client practice tool (not available on this project)
or simply waiting for the wiki module to catch up next patch and re-comparing.

> **RESOLVED.** This finding is now applied by the pipeline. See §15 for the policy that
> implements it. As of the run on 2026-08-12, Ashe reads `33 / 1.1`, Bel'Veth's health growth
> reads 105, and Tristana and Twitch are flagged `contested` rather than silently resolved.

### 14.2 Minimum damage floor — investigated, and no such rule exists

**Question.** `SPECIFICATION.md` §3.7 required the engine to model "minimum damage floors".
Does League have a game-wide rule that a damage instance always deals at least some minimum?

**Answer: no. No such rule was found, and the specification requirement has been removed.**

Searched on 2026-08-12, all on `wiki.leagueoflegends.com`: the **Damage** article, the **Damage
modifier** article, the **Armor** article, the **Basic attack** article, plus a general web
search for a documented minimum. None states a floor, a clamp, or a lower bound on a damage
instance. The Armor article's own formulas make the point directly: the damage multiplier
approaches zero asymptotically as armor rises, with no stated minimum.

The only floors that *are* documented are on **resistances**, not on damage — flat reduction may
drive a resistance negative; both percentage steps are skipped once a resistance is at or below
zero; flat penetration stops at zero and cannot pull a negative value back up. Those are
implemented and tested in the engine.

**Consequence:** "minimum damage floors" was removed from `SPECIFICATION.md` §3.7 and from its
§8 test-suite list, and from the same list in `CLAUDE.md`. A specification requiring something
the game does not have is a defect, and it would have sent every future agent looking for a
rule that is not there. If a per-ability minimum ever turns up, it belongs in the curated
override file for that ability, not as an engine-wide rule.

---

## 15. The source policy (set 2026-08-12)

§12 established that authority is per-field. §3 and §14.1 established that it is also
**per-patch**: the wiki module is updated by hand and can sit a patch behind, while Data
Dragon ships with the patch. This section is the rule that follows, as the pipeline
implements it in `scripts/fetch/overrides.ts`.

### The rule

1. **The wiki module is the default** for champion base statistics and per-level growth.
2. **Where Data Dragon disagrees AND the current patch notes document a change whose new
   value matches Data Dragon, Data Dragon wins** that field for that champion. Status:
   `confirmed`.
3. **Where the two disagree and nothing resolves it, neither is taken silently.** Data
   Dragon's value is used — it ships with the patch — and the champion is flagged
   `contested`. Any result involving a contested champion must carry a visible note that
   one of its base statistics is disputed between Riot's own sources, and must never be
   presented as verified (SPECIFICATION §8).
4. **Attack-damage growth is never overridden.** Data Dragon reports 0 for every champion
   in every patch (§3). That is a structural fault, not a patch disagreement, and no patch
   note can make Data Dragon win it. `assertNoStructuralOverrides` enforces this.
5. **Every override records its own evidence** — both observed values, the status, the
   reason in plain English, the source URL, the literal patch-note line where one confirmed
   it, and the condition under which it should be retired.

### Why the patch notes are the tie-break

They are the one current, human-authored statement of what Riot changed, they live on the
same wiki whose data module is stale, and they are fetchable as raw wikitext. Patch 26.16 is
the worked example: the module read `30 / 1.3` for 28 marksmen while the notes and Data
Dragon both said `33 / 1.1`.

The article title is derived, not hard-coded: **minor number from Data Dragon** (`16.16.1` →
16), **major from the wiki's own newest `changes` marker** (`V26.15` → 26), giving `V26.16`.
The two number the same patch differently and the offset is not a constant worth trusting.

If the article does not exist yet — the wiki sometimes ships data before prose — the pipeline
does not fail. Nothing can be confirmed, so **every** disagreement becomes `contested` and is
surfaced. That degrades loudly, which is the correct direction.

### Overrides retire themselves

There is **no hand-maintained override list**, and there must never be one. Overrides are
derived from live evidence on every run: the moment the wiki module catches up, the two
sources agree, and no override is produced at all. Two guards make a violation of that loud
rather than silent, and both are also unit tests:

- `assertOverridesDocumented` — **override-has-recorded-reason.** Fails the run if any
  override lacks a reason, a source, or a retirement condition, or claims patch-note
  confirmation without quoting the note.
- `assertNoRedundantOverrides` — **override-not-redundant.** Fails the run if any override's
  two observed values are equal, which is the shape a stale override takes. Unreachable by
  construction, which is exactly why it is asserted: if it ever fires, something has started
  carrying overrides forward instead of re-deriving them.

### What this produced on 2026-08-12 (patch 16.16.1, notes V26.16)

**59 overrides across 30 champions: 54 confirmed, 5 contested.** Verified after the run:
Ashe `mr_base` 33 and `mr_lvl` 1.1; Bel'Veth `hp_lvl` 105; Ashe `ad_lvl` still 3.5 from the
wiki, not the 0 Data Dragon reports.

The five contested, none of which were resolved by picking the tidier number:

| Champion | Stat | Wiki | Data Dragon | Why it is contested |
|---|---|---|---|---|
| Tristana | `mr_base` | 28 | 33 | The patch note says **31**. Riot's prose and Riot's CDN disagree. |
| Twitch | `mr_base` | 30 | 33 | The notes never mention Twitch at all. |
| Twitch | `mr_lvl` | 1.3 | 1.1 | As above. |
| Jhin | `as_lvl` | 3 | 0 | Long-standing disagreement, unrelated to this patch, explained by no note. |
| Kled | `range` | 250 | 125 | Kled has two forms; which range belongs to the canonical row is unclear. |

Jhin and Kled were **not** part of the original finding — they surfaced only once every
comparable field was swept rather than just the ones already known. Neither has been resolved.

**Alternate forms are excluded from comparison entirely.** A form with a fractional wiki id
reuses the canonical champion's apiname ("Kled & Skaarl" is 240.1 reusing "Kled") and Data
Dragon has no separate record for it, so diffing its stats against the canonical champion's
compares two different things. Doing so manufactured two meaningless contested flags before
it was excluded.

### Where the flags live

`public/data/overrides.json` is the full ledger, one entry per overridden field with its
evidence. `manifest.json` carries `contestedChampions` — the apinames the interface must warn
on — and the counts. The flag is a **sidecar rather than a field on `Champion`**, because the
type contract in `src/types/` is frozen and lead-owned; the interface joins by apiname. If the
UI work needs it inside the champion record, that is a contract change for the lead to make.

---

## 16. Health-pool ownership (contract change, 2026-08-13)

### The gap

`RatioStat` named four health pools — `maxHP`, `bonusHP`, `currentHP`, `missingHP` — and said
nothing about **whose** health. A pool without an owner is not a small omission. Bel'Veth R is
`20% of target's missing health`; the same coefficient read off the caster is a different
number, in a different direction, with an itemised breakdown that looks exactly as convincing.
Nothing downstream — no gate, no round-trip, no reader — could tell the two apart.

`Ratio` now carries `owner: 'caster' | 'target' | 'unresolved'`, **required on every health
pool** (gate 1) and rejected if absent. It is optional on other stats; see the open gap below.

### What the source actually says — measured, not assumed

All **865 ability templates** on the roster were fetched and their `{{as|(+ …)}}` ratio blocks
read on 2026-08-13. **176 blocks name a health pool, in 45 distinct phrasings:**

| The block says | Count | Examples |
|---|---:|---|
| the target, outright | 104 | `of target's maximum health`, `of the target's missing health`, `of primary target's bonus health` |
| the caster, outright | 24 | `of his bonus health`, `of her maximum health`, `of Zac's bonus health`, `per 100 Poppy's bonus health` |
| **neither** | 48 | `(+ 7% bonus health)`, `(+ 6% maximum health)` |

Of the 176, **96 sit on rows the harvester keeps as damage** (the other 80 are shields, heals,
non-champion rows and Total summary rows, all dropped before storage). Running the shipped
classifier over the full roster stores **74 target, 9 caster, 13 unresolved**, across 63
abilities.

### The 48 are NOT defaulted, and here is why not

There is a tempting argument that a bare `bonus health` must mean the caster, because the wiki
marks the target explicitly in **all 104** cases where it means the target. That is a
**convention, not a statement.** A convention holds until the one ability where it does not,
and that ability then ships a confident wrong number that nobody can see — the precise failure
this project exists to prevent. So the bare cases are recorded as `unresolved`, which:

- raises an `unresolved-owner` row issue, putting the ability on the hand-authoring worklist;
- forces the entry to `verification: 'incomplete'` — enforced by **gate 6**, which now refuses
  `derived` as well as `verified` for any ability carrying an unresolved owner.

### The 13 unresolved, and what the source does say about each

Each ability's own rendered prose was then read (`action=parse` of `{{Data X/Y|Ability}}`,
prose only — the patch-history and Arena-differences boxes are the §13 trap and were excluded).
That splits the 13 three ways:

**(a) Five that the ability's own prose DOES resolve, to the caster, naming the same pool.**
These are safe to hand-author into `/curated/` with the quoted sentence as evidence — that is a
source statement, not a guess:

| Entry | The sentence in the source |
|---|---|
| Cho'Gath R — Champion True Damage | "dealing true damage based on **Cho'Gath's bonus health**" |
| Shen E — Physical Damage | "dealing physical damage based on **his bonus health**" |
| Vladimir W — Magic Damage Per Tick | "dealt magic damage based on **his bonus health**" |
| Vladimir E — Minimum Magic Damage | "deal magic damage … based on **his maximum health**" |
| Vladimir E — Maximum Magic Damage | as above |

**(b) CORRECTION (2026-08-13).** An earlier version of this section listed Udyr Q and Maokai E
here as compound two-owner expressions. **That was wrong, and it was wrong in the direction
that matters — it named the defect on the wrong abilities.** Their actual rows are ordinary:

- Udyr Q's stored row is `Bonus Physical Damage On-Hit` = `{{ap|6 to 36 6}} {{as|(+ 20% bonus
  AD)}} {{as|(+ {{ap|1 to 2 6}}% bonus health)}}` — a plain base plus two ratios, with a bare
  "bonus health" whose owner is simply unstated. Udyr Q *does* have compound rows, but their
  coefficient is **bonus AD**, not health.
- Maokai E is `{{ap|50 to 150}} {{as|(+ 5% bonus health)}} {{as|(+ 25% AP)}}` — also plain. The
  "based on their maximum health" sentence read from the rendered page belongs to the sapling's
  expiry explosion, not to this row, and was mis-attached.

Both belong in group (c) below. The real compound cases, and the much larger shape problem
behind them, are in §17.

**(c) Seven the source genuinely does not say.** Nothing in the leveling row or the prose names
an owner for that pool. These stay `unresolved` and `incomplete`:

Dr. Mundo W (Heart Zapper) · Dr. Mundo E (Blunt Force Trauma, ×2) · Gnar E (Hop) ·
Nunu & Willump Q (Consume) · Udyr Q (Wilding Claw) · Maokai E (Sapling Toss, ×2)

Dr. Mundo E is the closest call: the prose attributes **his maximum health** and **his missing
health** to Mundo, but the damage rows scale off **bonus health**, which no sentence attributes.
Matching on the champion rather than on the pool would have resolved it — and would have been
the same class of reasoning as the convention argument rejected above.

### The widened scan (2026-08-13) — the first one was too narrow

The measurement above covered **865** ability templates: five slots per champion, one ability
name per slot. **That is not the roster.** A slot can carry more than one ability name, and the
wiki module stores them as a numbered list — which is where every second form lives: Jayce's
cannon (`skill_q` = "To the Skies!", "Shock Blast"), Elise's spider form, Gnar's mega form,
Hwei's twelve subjects, Aatrox's three Q casts. There are also two alternate-form champion rows
with fractional ids (Mega Gnar 150.2, Kled & Skaarl 240.1).

**1083 ability names exist; 208 of them are secondary names a one-per-slot scan never sees.**
They resolve to **937 distinct pages** (many names redirect to a shared page). This is a gap in
the whole curation pipeline, not only in the health question — anything measured "across the
roster" before this date was measured across 865 of 937 pages.

Re-measured across all 937, through the shipped harvester:

| Scope | Health ratios | caster | target | unresolved |
|---|---:|---:|---:|---:|
| **Abilities** (stored) | **106** | 11 | 82 | 13 |
| **Items** — classic SR, effect prose (source refs, not yet harvested) | **59** | 19 | 11 | 29 |
| **Runes** — `runesReforged.json` prose (source refs, not yet harvested) | **26** | 12 | 0 | 14 |
| **Total** | **191** | 42 | 93 | 56 |

Item and rune effects are counted as **source references**, because no code turns them into
components yet — `itemEffects` and `runes` are empty in every batch produced so far. They are
what will need an owner when those areas are built, and **48 of the 85 of them say nothing at
all about whose stat they read** — a worse ratio than abilities, because item prose is written
from the holder's point of view and rarely names anyone. Both readings genuinely occur in items,
so this is not theoretical: Sunfire Aegis and Heartsteel scale off the holder, Liandry's and
Demonic Embrace off the target.

### Armor, magic resistance and mana — gap closed 2026-08-13

The open gap recorded here has been closed. `owner` is now **required on ten stats**, not four:
the four health pools plus `armor`, `bonusArmor`, `magicResist`, `bonusMagicResist`, `maxMana`
and `currentMana`. Gate 1 refuses any of them without one; gate 6 forces `incomplete` on an
unresolved owner exactly as it does for health.

The result is stark and worth stating plainly:

| Scope | Armor / MR / mana ratios | caster | target | unresolved |
|---|---:|---:|---:|---:|
| **Abilities** (stored) | **23** | 0 | 0 | **23** |
| Items (source refs) | 22 | 3 | 0 | 19 |
| Runes (source refs) | 4 | 3 | 0 | 1 |

**Every single one of the 23 ability ratios is unresolved.** The source writes them as
`(+ 30% armor)`, `(+ 3% maximum mana)`, `(+ 30% bonus armor)` — a bare stat, never a possessive.
The 23 sit on 12 abilities, which are now all `incomplete`: Blitzcrank R · Galio R · K'Sante Q
and W · Kassadin R · **Malphite W and E** · Ornn E · Ryze Q, W and E · Taric E.

Malphite is the case that shows why this matters. `Thunderclap` reads `(+ 15% armor)` and the
source never says whose. Anyone who plays the champion knows it is Malphite's own armor — and
that is exactly the knowledge this project is not allowed to substitute for a source statement.

**And the convention it would tempt you into is demonstrably false.** Black Cleaver's effect
text reads "Each stack inflicts **6% armor reduction**" — bare, no possessive, exactly the same
shape as Malphite's `(+ 15% armor)`. But it is the **target's** armor, not the holder's. A rule
of "an unowned armor figure means the caster's own" would read Black Cleaver backwards. This is
not a hypothetical counterexample constructed to make the point; it is the second item in the
scan. Twelve abilities now carry an honest `incomplete` instead of a confident `derived` built
on an assumption that a real item already contradicts.

---

## 17. The coefficient shape — a real gap in the shape library (2026-08-13)

### What it is

Some abilities deal **a percentage of a health pool, where the percentage is itself scaled**:

```
Malzahar R:  {{ap|10 to 20}}% {{as|(+ 2.5% per 100 AP)}} of target's maximum health
```

That reads: deal 10–20% of the target's maximum health, **and add 2.5 percentage points to that
percentage for every 100 ability power.** The `2.5% per 100 AP` is not a 2.5% AP ratio. It
modifies the health percentage.

`Ratio` carries one stat and one magnitude. It cannot say this. So the harvester does one of
two wrong things, silently, and marks the result `derived`:

| Ability | Source | What was stored | What is wrong |
|---|---|---|---|
| Kled W | `4.5–6.5% (+0.4% per 100 bonus health) of target's **maximum** health` | `bonusHP`, owner `target`, 4.5→6.5 | wrong pool (**bonus**, not maximum), and the coefficient is gone |
| Pantheon W | `6–8% of target's maximum health (+1.5% per 100 AP) (+0.4% per 100 Pantheon's bonus health)` | `AP` 1.5 and `bonusHP` caster 0.4, **base 0** | the entire 6–8% payload is missing; the ability deals ~nothing |
| Malzahar R | `10–20% (+2.5% per 100 AP) of target's maximum health` | `maxHP` target 1→2 | the AP coefficient is gone |
| Zac W, Amumu W, Vi W, … | as above | payload kept, coefficient dropped | understates every build with AP or AD |

This is the failure mode the project exists to prevent: a plausible number, itemised, with a
verification status that says it was read from source.

### How many

Measured over all 937 distinct ability pages, damage rows only (summary, minion and monster
rows excluded), 2026-08-13:

| Family | Coefficient is | Abilities | Rows |
|---|---|---:|---:|
| **A** | a **health pool** — two champions' health in one expression | **2** | 2 |
| **B** | **AP or AD** scaling a health payload | **32** | 51 |
| | **union** | **32** | 53 |

Family A is only **Kled W** (`+0.4% per 100 bonus health`) and **Pantheon W** (`+0.4% per 100
Pantheon's bonus health`). The two-owner problem by itself is a handful and does not justify a
new shape.

**Family B is 32 abilities and does.** Ambessa Q ×2 · Amumu W · Briar W · Camille W · Elise Q ×2
· Evelynn E ×2 · Fiddlesticks Q · Gwen Q and R · Illaoi W · K'Sante W · Kayle E · Kled W and R ·
Kog'Maw W · Malzahar R · Nasus R · Pantheon W · Rell E · Sett Q · Shen Q · Tahm Kench R ·
Trundle R · Udyr Q · Varus W · Vi W · Viego R · Yorick E · Zac W.

### What was done now, and what was not

**Done:** a detector, `hasCoefficientShape`, raises a `coefficient-shape` issue on any such row.
The row is still stored, but the ability drops to `incomplete`, so nothing downstream can
present it as settled. The defect is now loud instead of silent. **No shape was added** — that
is a contract change and a lead decision, not something to slip in behind a regular expression.

**Proposed, pending a decision.** Give a ratio an optional coefficient list:

- `Ratio` gains `coefficients?: Array<{ per: RatioStat; owner?: RatioOwner; per100: Scaling }>`,
  meaning "add `per100` percentage points to this ratio's magnitude for every 100 of `per`".
- The magnitude of the ratio stays what it is today, so all 106 existing health ratios and all
  23 resistance/mana ratios are unaffected — the field is additive and absent by default.
- Gate 1 requires an `owner` on a coefficient whose `per` is an owner-required stat, by the same
  rule as the ratio itself. Family A then expresses cleanly: payload `maxHP` owner `target`,
  coefficient `per: bonusHP, owner: caster`.
- The engine resolves `magnitude + Σ(per100 × stat/100)` before applying the ratio. One
  multiplication, at one place.
- Gate 2 (round-trip) already renders the wiki's own expansion, so it verifies the change for
  free: today those 53 rows either mismatch or are not compared at all.

Cost if it is declined: 32 abilities stay `incomplete` indefinitely and are excluded from any
result that claims to be complete, which for champions like Malzahar, Zac and Vi means their
primary damage source is unusable.

---

## 18. The roster is 937 ability pages, not 865 (2026-08-13)

### The bug

`Module:ChampionData/data` stores each slot as a numbered **list** of ability names. The
pipeline read `[1]` only, on the recorded reasoning that the rest were "alternate cast names".

That is true of most of them and false of enough to matter. Across the roster there are
**1083 ability names in 875 slots**. Of the 208 names beyond the first:

| | Count | What they are |
|---|---:|---|
| **Aliases** | **128** | `Template:Data Aatrox/The Darkin Blade 2` resolves to the *same page* as `.../The Darkin Blade`. They name extra cast rows inside one template. |
| **No template** | **11** | Listed in the module, no page exists (Viktor's evolutions, Samira's splash coin, Milio, Yuumi). |
| **Real abilities** | **69** | Their own page, their own numbers, previously invisible. |

**69 abilities were missing entirely**, and they are not obscure: every Aphelios weapon, all
ten Hwei subjects, the whole of Jayce's second form, Elise's spider form, Nidalee's cougar
form, Kha'Zix's four evolutions, Lee Sin's second casts, Rek'Sai's burrowed kit, Kled
dismounted, Karma's mantra forms, **Riven's Wind Slash — which is her ultimate's damage** —
Swain's Demonflare, Quinn's Skystrike, Sion's Death Surge, Tahm Kench's Regurgitate.

Total distinct pages: 868 (reachable by first names) + 69 = **937**.

### The trap in fixing it

Carrying every name through naively is worse than the bug. Harvesting `The Darkin Blade`,
`The Darkin Blade 2` and `The Darkin Blade 3` stores Aatrox Q **three times** and triples its
damage. The alias and the real ability are indistinguishable by name — `Shock Blast` and
`The Darkin Blade 2` look equally like second entries.

**The fix is to deduplicate by the wiki page's revision id**, which the harvester already
records as `sourceRevision`. `readAbilityNames` returns every name; `run-batch` fetches them
all and stores one entry per distinct page, logging each alias it skips.

### Re-measuring what the plan was built on

Every roster-wide figure recorded in this codebase was re-measured over the corrected 937
pages. **Almost none of them reproduce**, and the differences do not all point the same way,
so they cannot be explained by the 69 missing abilities alone — the original counts must also
have used different definitions (rows before filtering, or the 1085-name set including
aliases). They are recorded here as *not reproducible*, which is the honest state:

| Figure | Recorded | Re-measured |
|---|---:|---:|
| damage components | 999 | **893** |
| S2 base + one ratio | 666 | 618 |
| S6 health pool | 123 | 106 |
| S3 base + two ratios | 111 | 97 |
| S1 flat | 43 | 39 |
| S5 ratio-only | 19 | 14 |
| S8 resistances | 7 | **10** |
| S7 mana | 9 | 8 |
| S9 stacks | 1 | 1 |
| alternative-marked components | 94 | 71 |
| non-champion rows dropped | 81 | **97** |
| Total/summary rows dropped | 388 | 168 |
| per-hit components | 131 | 110 |
| ratios that scale per rank | 244 | 183 |
| prose-only worklist | 136 | 108 |
| **level-scaled damage sources** | **95** | **0** |

The shape *library* survives — the ordering is unchanged, S2/S6/S3/S1 still cover 96% of
components, and no new shape appeared. What does not survive is any figure quoted as an
absolute count.

### The zero is a real defect, not a measurement artifact

**`byLevel` and `byLevelExplicit` are in the contract and nothing produces them.** The 95
level-scaled damage sources — Caitlyn Headshot, Darius Hemorrhage, Ziggs Short Fuse and the
other innate passives — are stored with **zero components**. Verified directly: all three
templates harvest to 0 components and land in the prose-only worklist, and Ziggs Short Fuse
carries three `{{pp|…}}` blocks the classifier never looks at (it reads `{{ap}}` only).

This predates today's work. It means 107 of the 149 `incomplete` entries are prose-only, and a
large share of those are level-scaled passives that *are* machine-readable — the parser simply
does not read that shorthand yet. This is the single largest remaining source of missing
damage in the curated file.

---

## 19. The authoritative roster measurement (2026-08-13) — every figure defined

**This section supersedes every roster-wide count recorded anywhere else in this project,
including the technical-foundation plan and the header comments in `scripts/extract/classify.ts`
and `src/types/validate-curated.ts`. Those figures are SUPERSEDED — do not cite them.**

A number without a definition is what caused the confusion this section exists to end. Every
figure below states what is counted and what is filtered.

### The page set every figure is measured over

- **Source:** `Module:ChampionData/data`, every champion row with an integer or fractional id.
- **Names:** every ability name in every slot list, in module order — **1083 names**.
- **Fetched:** `Template:Data <Champion>/<Name>`; **11 names have no template** and are dropped.
- **Alias dedupe:** entries are deduplicated by the wiki **revision id**, so a name that
  redirects to a page another name already reached is counted once. **123 names are aliases.**
- **The measured set is therefore 937 distinct ability pages.** Every figure below is
  *after* alias dedupe and *after* the level-scaling fix of 2026-08-13.
- Champions withheld from the product roster (Mega Gnar, Kled & Skaarl — §15) are excluded,
  which is why 1083 names yield 1071 through `champions.json`.

### Row-level definitions

A **damage row** is a `{{st|…}}` leveling row whose label matches `/damage/i` and does not
match `/damage reduction|damage amp|damage taken|damage cap/i`, judged after stripping a
leading `Minimum`/`Maximum`. Three classes of damage row are counted and then **dropped**:

- **summary rows** — label begins `Total`. Arithmetic on other rows; storing them double-counts.
- **non-champion rows** — label names minion/monster/turret/ward/epic. This is a
  champion-versus-champion tool.
- a row the classifier cannot read at all, which becomes an **issue**, not a component.

A **component** is a damage row that survived all three filters and produced a stored
`AbilityComponent`. Components are counted **after** dropping, so the component count is
strictly smaller than the damage-row count.

### The figures

| Figure | Count | Definition |
|---|---:|---|
| ability pages measured | **937** | distinct wiki pages, after alias dedupe |
| ability names on the roster | 1083 | before dedupe; 123 aliases, 11 with no template |
| **damage components stored** | **893** | rows surviving all filters, summed over 937 pages |
| S2 base + one core ratio | 618 | component with a flat base and exactly one AD/AP ratio |
| S6 scales off a health pool | 106 | any ratio on maxHP/bonusHP/currentHP/missingHP |
| S3 base + two core ratios | 97 | two AD/AP ratios |
| S1 flat, no ratio | 39 | base only |
| S5 ratio-only | 14 | a ratio and no flat base |
| S8 resistances | 10 | any ratio on armor/MR |
| S7 mana | 8 | any ratio on mana |
| S9 stacks | 1 | a ratio on a stack counter |
| S4 three or more core ratios | 0 | measured, genuinely zero |
| alternative-marked components | 71 | stored component whose label matches the variant list |
| non-champion rows dropped | 97 | damage rows dropped for naming a non-champion target |
| summary rows dropped | 168 | damage rows dropped for beginning `Total` |
| per-hit components | 110 | stored component whose label matches the per-tick/per-hit list |
| ratios that scale per rank | 183 | stored ratio whose scaling is not `linear` flat |
| ratios carrying a multiplier | 45 | stored ratio with a `per 100 X` multiplier (§17) |
| level-scaled damage sources | **2** | stored component whose base is `byLevel`/`byLevelExplicit` |
| prose-only worklist | 108 | ability with a declared damage type and no readable row |
| abilities that dropped every damage row | 3 | had damage rows in source, stored none |
| entries `derived` | 788 | |
| entries `incomplete` | 149 | |

Four shapes (S2, S6, S3, S1) cover **860 of 893 components, 96.3%** — the library's shape and
ordering are unchanged from the original measurement even though every absolute count moved.

### Why entries are incomplete — definitions

| Reason | Entries | Meaning |
|---|---:|---|
| prose-only | 107 | declares a damage type, no machine-readable leveling row |
| unresolved-owner | 21 | a health/armor/MR/mana ratio the source does not attribute (§16) |
| unparsed base and/or ratio | 14 | a progression shorthand the parser cannot expand |
| unknown stat | 2 | a ratio naming a stat this project does not model |
| no value | 3 | a damage row with no readable number |
| coefficient-shape | 2 | a `per 100` multiplier that could not be read (§17) |

### The level-scaling figure, and why it is 2 and not 95

The recorded figure was **95 level-scaled damage sources**. It now measures **2**, and that is
not a regression — it is the true count *of what the harvester can currently reach*, which is
the point. See §20.

---

## 20. Level-scaled damage — the gap is real, and mostly still open (2026-08-13)

### What was fixed

`{{pp|…}}` is the wiki's champion-level progression shorthand. `parseLevelProgression` has
existed since the parser was written and **was never called from the classifier**, which looked
for `{{ap}}` only. A leveling row expressed on the level axis therefore stored no base at all.

Three changes:

1. The classifier now reads a `{{pp}}` base when a leveling row has one.
2. `{{pp}}` named arguments may carry a digit (`key1=`, `label1=`). The parser matched
   letters-only names and treated those as positional values, breaking 22 blocks.
3. When the value side has no explicit step count and the level side is an explicit list, the
   level list now states the count: `40 to 70` against levels `1;7;13` is three values, not
   eighteen.

Parse coverage over the game's damage-context `{{pp}}` blocks went from **74 to 81 of 224**.

### What that actually moved: 2 components on 1 ability

**Only 8 abilities in the game put `{{pp}}` in a leveling row**, and 7 of them already had a
readable `{{ap}}` base. The fix produces level-scaled components for exactly one — **Shen Q
(Twilight Assault)**, two components, `byLevel 10→40 across levels 1–16 in 6 steps` — and gate 2
matches both rows, 2 of 2.

So the honest figure is **2**, not 95. Reporting the level-scaling gap as closed would be false.

### Why it is still open: the numbers are in the prose, not the rows

**215 abilities carry `{{pp}}` in a `description` field rather than a leveling row.** Across
937 pages there are **224 damage-context `{{pp}}` blocks on 155 abilities** — Caitlyn Headshot,
Ziggs Short Fuse, Nasus Soul Eater and the rest of the innate passives. `statRows` reads
leveling fields only, so none of them are seen.

Reaching them needs a **new extraction path**, not a parser tweak: description prose must be
scanned, each `{{pp}}` judged for whether it is damage at all (many are cooldowns, life steal or
durations), and its damage type recovered from the surrounding `{{as|…|ad}}` wrapper. That is a
piece of work in its own right and has not been started.

Of the 143 blocks the parser still cannot expand, three groups are distinct and only the first
is a defect:

- **piecewise progressions** — `16+4*x for 6; then +8*x for 6; then +12*x for 8` (Ziggs).
  Real, unhandled, and common enough to matter.
- **per-level formulas in `x`** — `35 + (180-35)/17*(x-1)`. Needs an evaluator over levels 1–18.
- **non-level axes, correctly refused** — a `{{pp}}` indexed by ability power or a percentage.
  `parseLevelProgression` already rejects these by design (§11); they are not level scaling and
  must never be stored as such.

**This is the largest remaining source of missing damage in the curated file**: 107 of the 149
`incomplete` entries are prose-only, and a large share of those are level-scaled passives whose
numbers are machine-readable and simply unread.

---

## 21. Gate 2 defects confirmed on 2026-08-13

Teaching gate 2's rendered-row reader to recognise a payload row (§17) cut its disagreements on
the coefficient-shape abilities from **20 entries to 5**, and rows from 31 to 6 — 26 of 31
entries now match on every row. The 20 were mostly the reader comparing our base against the
wiki's payload. Of the 5 that survived, **two are genuine defects**, both confirmed against the
source:

### K'Sante W (Path Maker) — CONFIRMED WRONG

The source splits one expression across four `{{as}}` blocks:

```
{{ap|45 to 165}} {{as|(+ 8%|hp}} {{as|(+ 2% per 100 bonus armor)}}
                 {{as|(+ 2% per 100 bonus magic resistance)}} {{as|of target's maximum health)}}
```

It reads: **8% (+2% per 100 bonus armor) (+2% per 100 bonus MR) of the target's maximum health.**
We store a `bonusArmor` ratio of **2** — the multiplier mistaken for the payload — and lose the
8% entirely. The wiki renders 8; we store 2. The same error repeats on all three of its damage
rows. **Not fixed:** the multiplier-lifting added in §17 handles a payload and its multipliers as
sibling blocks, but not a payload split *across* blocks with the stat name in a fourth.

### Udyr Q (Wilding Claw) — CONFIRMED WRONG, and the cause is not this ability

`{{ap|3 to 8 6}}` expands to **six** values, and the harvester rejects it because
`maxRankFor('Q')` returns 5. The source is right and we are wrong: **Udyr has no ultimate, and
all four of his stances rank up to 6.** `maxRankFor` assumes 5 for Q/W/E and 3 for R for every
champion in the game. It is wrong for all four Udyr abilities, and the rank count is exactly the
thing DATA-SOURCES §11 warns must never be inferred, because the same shorthand over 5 and over
6 ranks produces different middle values. **Not fixed:** it needs a per-champion rank count.

### The other three are comparison artifacts, not storage errors

- **Amumu W** — the wiki prints a non-rank-scaling base as one number; we expand to five. Same
  class as the flat-ratio case already handled for ratios, not yet for bases.
- **Malzahar R** — two stored components share the label "Magic Damage Per Tick", so both map to
  one rendered row and the wrong one is compared. A duplicate-label defect, not a value defect.
- **Yorick E** — our ratio order and the wiki's differ, so a positional comparison misaligns.

---

## 22. Ability rank counts — the wiki does not state them (2026-08-13)

### Where the wiki states it: nowhere

§11 says a rank count must never be inferred. It was being inferred anyway — `maxRankFor`
returned 5 for Q/W/E and 3 for R for every champion in the game.

Looking for the wiki's own statement: **there is none.** `Module:Ability progression` derives
the fill count from the parent template's `skill` field — `fill = (skill ~= "R" and 5) or 3` —
which is the same assumption. The ability data templates carry `skill = Q`, `champion`, icons,
cooldowns and costs, and **no rank-count field**. Where an ability differs, the difference shows
up only inside the value shorthand itself (`{{ap|3 to 8 6}}`), as the author working around the
module's default.

### Where it IS stated: Data Dragon's per-champion `maxrank`

`.../data/en_US/champion/<apiname>.json` lists four spells, each with `maxrank`. This is a
**structural** field, not one of the zero-filled damage fields (§4), so using it does not
arbitrate an ability number through Data Dragon (§12). `Champion.abilityMaxRanks` now carries
it and the harvester takes the rank count from there, never from the slot letter.

### How wrong the assumption was

**DEFINITION: a slot has a wrong rank count when Data Dragon's `maxrank` for it differs from
the old 5/5/5/3 rule.** Measured over all 173 roster champions:

**7 champions, 15 ability slots.**

| Champion | Q | W | E | R | Why |
|---|---|---|---|---|---|
| **Udyr** | **6** | **6** | **6** | **6** | no ultimate; four stances each rank to 6 |
| **Jayce** | **6** | **6** | **6** | **1** | two weapon forms; R is the transform |
| **Aphelios** | **6** | **6** | **6** | 3 | five weapons |
| **Yuumi** | **6** | 5 | 5 | 3 | |
| Elise | 5 | 5 | 5 | **4** | transforming ultimate |
| Karma | 5 | 5 | 5 | **4** | Mantra |
| Nidalee | 5 | 5 | 5 | **4** | transforming ultimate |

Every damage value on those 15 slots was wrong at every rank except the first and last, because
`X to Y` interpolates across the count: Udyr Q read as 5 ranks gives 3/4.25/5.5/6.75/8, and the
source says 3/4/5/6/7/8.

### The residual, now loud instead of silent

A **slot's** rank count is not uniform across the ability names in it. Karma's Soulflare and
Nidalee's Takedown are second-form abilities sitting in slot Q, and their own shorthand gives
**four** values — they follow the transforming ultimate, not the Q slot. Data Dragon has no
separate spell for them, so it cannot state their count.

Gate 1 now **fails** these rather than storing wrong middle values: "explicit scaling has 4
values but the ability has 5 ranks", on Karma Q Soulflare and Nidalee Q Takedown. That is the
correct outcome for now — the error moved from silent to loud.

**Proposed, not implemented:** where an ability's own shorthand gives an explicit list, that
list's length is itself a statement of its rank count, and should win over the slot's `maxrank`.
That is reading the source, not inferring — but it changes how every explicit list in the game is
validated, so it is a decision, not a tidy-up.

---

## 23. Nothing that fails gate 1 may claim better than `incomplete` (2026-08-13)

### K'Sante W, and the general rule behind it

§21 recorded K'Sante W as storing a bonus-armor ratio of **2** in place of its real **8% of the
target's maximum health** payload, on all three of its damage rows — while the entry claimed
`derived`. A known-wrong number inside a `derived` entry is the failure this project exists to
prevent, so it is stopped mechanically rather than by hand.

**The detector: unbalanced parentheses inside an `{{as|…}}` body.** That is the signature of one
expression split across several blocks:

```
{{ap|45 to 165}} {{as|(+ 8%|hp}} {{as|(+ 2% per 100 bonus armor)}}
                 {{as|(+ 2% per 100 bonus magic resistance)}} {{as|of target's maximum health)}}
```

The first block opens a group it never closes; the stat name arrives alone in the fourth. The
row now raises `split-payload` and the ability drops to `incomplete`. **This does not repair the
row** — reading it correctly needs the multiplier lifting to span blocks, which is still open.

### The sweep, and what it found

**DEFINITION: an entry is wrongly-confident when it comes out `derived` or `verified` while
carrying the signature of a defect recorded in this document.** Swept over the same 937-page set
as §19, after alias dedupe:

| Check | Before | After |
|---|---:|---:|
| split-payload (§21, K'Sante W) | 3 rows on 1 ability | **0** |
| coefficient-shape unread (§17) | 0 | **0** |
| **fails gate 1 yet claims `derived`** | **21** | **0** |
| two components sharing a label (§21) | 14 | **0** |

The 21 were the real find, and they were not all K'Sante-shaped:

- **14 with two components sharing an id** — Akali E, Anivia Q, Evelynn Q, Graves Q, Malzahar R,
  Mel E, Sejuani W, Smolder Q, Sylas Q, Talon W, Twisted Fate W, Vel'Koz W, Vex R, Viktor E. One
  component silently shadows the other, and gate 2 then compares the wrong one — which is
  exactly the Malzahar R misalignment recorded in §21, now explained.
- **6 rank-count failures** — Heimerdinger W and E, Karma Q Soulflare, Nidalee Q/W/E (§22).
- **1 missing stack counter** — Nasus Q Siphoning Strike.

**The rule now enforced in the harvester:** an entry that fails gate 1 is forced to `incomplete`
and each schema finding is recorded as an issue on it. A structurally invalid entry is not
"extracted from source, not independently confirmed" — it is broken, and may not describe itself
as anything better.

**Effect on the roster: `derived` 788 → 767, `incomplete` 149 → 170.** Twenty-one entries traded
a confident wrong number for an honest admission.

### The same hole remains one gate along: gate 2 does not demote

Gate 1 now demotes. **Gate 2 does not.** An entry whose stored values *disagree with the wiki's
own rendering* still comes out `derived`, because gate 6 only requires round-trip evidence for
`verified`. That was survivable while gate 2 compared base values only; now that it compares
ratios (§21) it finds disagreements it previously could not, and each one is a known-wrong
number sitting in a `derived` entry — the same failure §23 just closed on the gate-1 side.

Live examples from a three-champion run on 2026-08-13, all currently `derived` except where the
gate-1 rule caught them for another reason:

- **Malzahar W (Void Swarm)** — bonus-AD ratio: wiki 12/14/16/18, stored 40. AP ratio: wiki 40,
  stored 20. Newly visible, not yet diagnosed.
- **K'Sante W** — the three rows in §23 (already `incomplete` via the split-payload guard).

**Proposed, not implemented:** an entry with a recorded gate-2 disagreement is forced to
`incomplete`, on the same reasoning as §23. It is not implemented because gate 2 runs in the
batch runner rather than in `draftFromTemplate` — it needs the network — so the demotion has to
happen where the round-trip result is known, and that is a change to how the batch assembles
its file rather than a one-line rule.

---

## 20a. BRIEF — the description-prose extraction path (written 2026-08-13, unstarted)

**This is a brief for a dedicated session. Everything needed to start is here; do not re-derive
the sizing.** Nothing in it has been built.

### Why it exists

`statRows` reads `leveling` fields only. **215 abilities state their damage in `description`
prose instead**, via `{{pp|…}}`. That is **107 of the 170 `incomplete` entries** and the largest
remaining source of missing damage in the curated file — Caitlyn Headshot, Darius Hemorrhage,
Ziggs Short Fuse, Nasus Soul Eater and most other innate passives contribute **zero damage**
today.

### The sizing, already measured (2026-08-13, over the 937-page set of §19)

| Figure | Count | Definition |
|---|---:|---|
| abilities with `{{pp}}` in a description field | 215 | any `{{pp}}` in any `description*` field |
| abilities with `{{pp}}` in a leveling field | 8 | already handled (§20); 7 had an `{{ap}}` base anyway |
| damage-context `{{pp}}` blocks | 224 | across 155 abilities; "damage-context" = the 120 chars before or 60 after contain damage/dealing/deals |
| blocks the current parser expands | 81 | `parseLevelProgression` succeeds |
| blocks it cannot | 143 | grouped below |

### The five components to build

1. **Prose scanner.** Walk `description*` fields, find `{{pp}}` blocks with positions, and keep
   the surrounding text — the judgement and the damage type both depend on context, so a bare
   list of blocks is not enough.
2. **The damage judgement.** Decide per block whether it is damage at all. Many `{{pp}}` blocks
   are cooldowns (Ziggs `description2` reduces a cooldown), durations, life steal (Nasus Soul
   Eater), heals or shields. **See the failure mode below — this is the risky component.**
3. **Damage type from `Module:DamageData/data`.** That module is keyed champion → ability →
   instance and **states** `damageType` per instance (§11). Read it; do not infer a type it
   states. Infer only where it is silent, and mark such entries accordingly.
4. **Piecewise progressions.** `16+4*x for 6; then +8*x for 6; then +12*x for 8` (Ziggs Short
   Fuse). Segments joined by `; then`, each with its own slope and span.
5. **Per-level `x` formulas.** `35 + (180-35)/17*(x-1)`, `5+3.5*(x-1)*(0.7025+0.0175*(x-1))`
   (Malzahar W). Needs an evaluator over levels 1–18 producing `byLevelExplicit`.

**Keep refusing non-level axes.** `parseLevelProgression` already rejects a `{{pp}}` whose second
axis leaves 1..18 — Hwei's Grim Visage indexes ability power, Kai'Sa's Supercharge a percentage.
That refusal is correct and must survive.

### The failure mode of the damage judgement, stated plainly

The judgement is **contextual, not declared**: nothing in the source marks a `{{pp}}` block as
damage. Any rule will be a keyword-proximity heuristic over surrounding prose, and it fails two
ways, asymmetrically:

- **False positive** — a cooldown or heal read as damage. This invents damage that does not
  exist. **This is the dangerous direction** and the reason nothing here may be stored above
  `derived`.
- **False negative** — real damage skipped. This leaves the ability where it already is, on the
  prose-only worklist. Recoverable and visible.

**Bias the rule toward false negatives.** A block whose classification is not clear from the
surrounding sentence must be left unread and reported, not guessed. `Module:DamageData/data` is
the partial cross-check: an instance it lists is damage, and a block on an ability it does not
list at all deserves more suspicion.

### What "done" looks like

- Every ability that moves off the prose-only worklist has **gate 2 run on it**, with pass and
  fail counts reported per entry.
- Everything produced is `derived` at most — **never `verified`**, and never `derived` if gate 1
  or gate 2 disagrees (§23, §24).
- The remaining unreadable blocks are reported **grouped by cause**, with a definition for each
  group, in the style of §19.
- The three counts to report: how many abilities move, how many gate 2 confirms, how many remain
  unreadable and why.
- No count without its definition.

---

## 24. Gate 2 demotes (2026-08-13)

§23 closed the hole on the gate-1 side and named the one still open: **an entry whose stored
values disagree with the wiki's own rendering still came out `derived`.** Gate 6 only ever
required round-trip evidence for `verified`, so a disagreeing entry sat at `derived`
indefinitely. That was survivable while gate 2 compared base values only. It stopped being
survivable when gate 2 started comparing ratios (§21) and began finding disagreements it
previously could not see.

**The rule, now enforced:** an entry with a recorded gate-2 disagreement is forced to
`incomplete`, and the disagreement is recorded on it as a `round-trip-disagreement` issue. A
value the source contradicts is wrong, not "extracted but unconfirmed".

It lives in the batch runner rather than in `draftFromTemplate` because the round-trip needs the
network: the harvester cannot know the result, and the batch runner can.

### Malzahar W (Void Swarm) — diagnosed

The source row:

```
{{pp|5+3.5*(x-1)*(0.7025+0.0175*(x-1))|formula=5 + 10.5 growth}} (+ {{ap|12 to 20}})
{{as|(+ 40% '''bonus''' AD)}} {{as|(+ 20% AP)}}
```

The ability's damage is **a level-scaled base** (the `{{pp}}` formula, "5 + 10.5 growth")
**plus** a per-rank `12 to 20` **plus** 40% bonus AD **plus** 20% AP.

What was stored: base `12 to 20`, ratios bonus-AD 40 and AP 20. **The level-scaled term is
dropped entirely** — the `{{pp}}` path added in §20 only fires when a row has no `{{ap}}` block,
and this row has one, so the rank term won and the level term vanished. Malzahar W therefore
under-reports its damage by its whole level-scaled component at every champion level.

That is a **storage defect**, and it is the same root cause as the prose path (§20a): a `{{pp}}`
the extractor does not read. It is also why the row's ratios appear misaligned — the wiki treats
the parenthesised `(+ 12 to 20)` as a ratio group while we call it the base, so a positional
comparison comes out shifted. Two separate faults in one row, and only the first is a wrong
number.

### Full-roster result

**DEFINITIONS.** *Entries gate 2 can run on* = entries with at least one stored component;
an entry with none has nothing to compare and is skipped, not passed. *Demoted* = was `derived`
before the round-trip and is `incomplete` after. Disagreeing **rows** are grouped by cause:

- **render-failed** — the wiki would not render the ability at all.
- **wiki-series-short** — the wiki's own rendered series carries fewer values than the ability
  has ranks, its renderer having absorbed one into a trailing fragment. A **comparison
  artifact**: our value is not shown to be wrong.
- **ratio-count** — we and the wiki disagree on how many ratio groups the row has, so the
  positional comparison comes out shifted. **Artifact, but it can hide a real error underneath**,
  so it is counted separately rather than cleared.
- **value-differs** — same shape on both sides, different numbers. A **storage defect**.

Measured over the 937-page set of §19, after alias dedupe. Results below.

| Figure | Count |
|---|---:|
| ability pages measured | 937 |
| entries gate 2 can run on (≥1 stored component) | **589** |
| entries with no components (nothing to compare; skipped, not passed) | 348 |
| of the 589: `derived` beforehand | 527 |
| of the 589: already `incomplete` | 62 |
| entries matching on every row | **530** |
| entries with ≥1 disagreement | **59** |
| **entries gate 2 demotes from `derived` to `incomplete`** | **28** |
| rows checked / matched / disagreeing | 872 / 810 / **62** |

Disagreeing **rows** by cause:

| Cause | Rows | Storage defect? |
|---|---:|---|
| wiki-series-short | 34 | no — comparison artifact |
| **value-differs** | **18** | **yes, on 17 abilities** |
| ratio-count | 10 | artifact, but may hide a real error |
| render-failed | 6 | no — all six are the §22 rank-count failures |

**The 6 render-failures are not the wiki's fault:** Heimerdinger W and E, Karma Q Soulflare and
Nidalee Q/W/E — the same second-form rank counts §22 left open. They fail before rendering.

**Of the 18 value-differing rows, 3 are display rounding, not defects.** The wiki prints a
rounded figure where we store the exact one: Rumble Q (wiki 140.63, stored 140.625), Varus Q
(wiki 100, stored 99.9975), Zeri Q (wiki 3.71, stored 3.7125). A fourth cause worth naming, and
an argument for comparing at display precision rather than 1e-6.

**The remaining 15 are real, and most share one root cause.** Twelve sit on abilities that also
carry two components with the same id (§23) — Akali E, Anivia Q, Graves Q, Mel E, Sejuani W,
Smolder Q, Sylas Q, Talon W, Twisted Fate W, Vel'Koz W, Vex R, Viktor E. One component shadows
the other and the comparison lands on the wrong one. They were already `incomplete` via gate 1,
so gate 2 confirms the diagnosis rather than finding them anew.

**Three were newly caught by gate 2 alone**, and the gaps are large:

| Ability | Wiki renders | We stored |
|---|---|---|
| **Blitzcrank R** (Static Field) | 275 / 400 / 525 | 50 / 100 / 150 |
| **Vex R** (Shadow Surge) | 150 / 250 / 350 | 75 / 125 / 175 |
| **Kled Q** (Bear Trap on a Rope) | 60 / 110 / 160 / … | 30 / 55 / 80 / … |

None is diagnosed yet. All three are now `incomplete` rather than `derived`, which is the point:
the numbers are no longer presented as understood.
