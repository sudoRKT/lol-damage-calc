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
components yet — `itemEffects` and `runes` are empty in every batch produced so far. They are what
will need an owner when those areas are built. Item prose is written from the holder's point of
view and rarely names anyone, and both readings genuinely occur, so this is not theoretical:
Sunfire Aegis and Heartsteel scale off the holder, Liandry's and Demonic Embrace off the target.

> **⚠ THE ITEM AND RUNE ROWS ABOVE ARE SUPERSEDED, AND THIS SECTION'S PROSE CONTRADICTED ITS OWN
> TABLE. Corrected 2026-08-13; the measurement that replaces them is §37.**
>
> Three defects, recorded rather than quietly overwritten, because each is a lesson:
>
> 1. **The prose said "48 of the 85 say nothing at all about whose stat they read." The table
>    directly above it gives 29 + 14 = 43.** Two numbers for one quantity, four lines apart, and
>    neither is now reproducible.
> 2. **THIS SECTION NEVER STATED ITS COUNTING RULE, AND NO CODE IN THE REPOSITORY IMPLEMENTED IT.**
>    That is the root defect and it is worse than either wrong number. A later measurement tried
>    several readings — bare "health", regeneration compounds, raw substring counts — and none
>    lands on 59 or 26. **A count nothing can re-derive cannot be checked, corrected, or trusted**;
>    it can only be quoted. That is exactly how it survived.
> 3. **The 85 is health-pools-only and was quoted downstream as though it covered all ten
>    owner-required stats.** CLAUDE.md and PLAN.md both carried "85 owner-bearing effect
>    references". Adding this section's own armor/MR/mana rows gives 111, not 85.
>
> **The rule this section should have carried, now stated and implemented in
> `scripts/fetch/effect-census.ts`: one reference is one mention of one of the ten owner-required
> stats within one effect's prose; the longest phrasing wins (so "bonus health" is one reference,
> not two); compound stats that merely contain a stat word — "health regeneration", "armor
> penetration" — are different stats and are NOT counted; bare "health"/"mana" with no qualifier
> counts as its own reference.** Measured under that rule: **120 references** across all ten stats,
> of which **72 are health pools** and **82 are not attributed to anyone**. See §37.

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

> **RE-MEASURED 2026-08-13, after the prose path (§25), the rank-count fix (§22), the gate-1 and
> gate-2 demotions (§23, §24), alias dedupe (§18) and `{{pplevel}}`.** The figures below are the
> current ones. Where a figure moved, the earlier value is shown beside it so the movement is
> visible rather than quietly replaced. The page set is unchanged: 937 distinct ability pages.
> The single honest-state table the execution plan is rebuilt against is at the end of §26.

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

| Figure | Count | Was | Definition |
|---|---:|---:|---|
| ability pages measured | **937** | 937 | distinct wiki pages, after alias dedupe |
| ability names on the roster | 1083 | 1083 | before dedupe; 123 aliases, 11 with no template |
| **damage components stored** | **930** | 893 | components surviving all filters, over 937 pages |
| of those, recovered from description prose | **30** | 0 | §25; on 29 abilities that stored nothing before |
| S2 base + one core ratio | 634 | 618 | a flat base and exactly one AD/AP ratio |
| S6 scales off a health pool | 106 | 106 | any ratio on maxHP/bonusHP/currentHP/missingHP |
| S3 base + two core ratios | 103 | 97 | two AD/AP ratios |
| S1 flat, no ratio | 46 | 39 | base only |
| S5 ratio-only | 15 | 14 | a ratio and no flat base |
| S8 resistances | 10 | 10 | any ratio on armor/MR |
| S7 mana | 8 | 8 | any ratio on mana |
| S9 stacks | 1 | 1 | a ratio on a stack counter |
| S4 three or more core ratios | 0 | 0 | measured, genuinely zero |
| **level-scaled damage sources** | **38** | 2 | stored component whose base is `byLevel`/`byLevelExplicit` |
| **prose-only worklist** | **80** | 108 | declares a damage type, stored no component |
| entries with no component and no declared damage | 239 | — | genuinely non-damaging; not a gap |
| entries `derived` | **771** | 788 | after both demotions |
| entries `incomplete` | **166** | 149 | after both demotions |
| entries `verified` | **0** | 0 | gate 5 has not been run by any session |

The prose-only figure was **108** when measured with today's code and the description path disabled,
not the 107 recorded earlier; the small drift is the rank-count fix of §22. 28 of those 108 moved.

Four shapes (S2, S6, S3, S1) cover **860 of 893 components, 96.3%** — the library's shape and
ordering are unchanged from the original measurement even though every absolute count moved.

### Why entries are incomplete — definitions

An entry can carry more than one reason, so the column sums past 166.

| Reason | Entries | Meaning |
|---|---:|---|
| prose-only | **80** | declares a damage type, stored no component at all |
| round-trip-disagreement | **24** | gate 2 found a stored value the wiki's own rendering contradicts (§24) |
| schema-invalid | 23 | fails gate 1, so it may not claim better than incomplete (§23) |
| unresolved-owner | 22 | a health/armor/MR/mana ratio the source does not attribute (§16) |
| unparsed-ratio | 13 | a ratio shorthand the parser cannot expand |
| unparsed-base | 9 | a base shorthand the parser cannot expand |
| no value | 3 | a damage row with no readable number |
| unknown stat | 3 | a ratio naming a stat this project does not model |
| split-payload | 2 | one expression split across several blocks (§23) |
| coefficient-shape | 2 | a `per 100` multiplier that could not be read (§17) |

### The level-scaling figure: 95, then 2, now 38

The originally recorded figure was **95**. It measured **2** once the definition was pinned to
what the harvester could actually reach, and it is now **38** — the two `{{pp}}` leveling rows of
§20, six rows that state a level term alongside a rank term (§25), and thirty recovered from
description prose. All 38 are checked against the wiki's own per-level expansion and all 38
agree; see §26.

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
the sizing.**

> **BUILT 2026-08-13 — the result is §25, and read it before trusting the sizing below.** Two
> figures here are wrong. The scan counted `{{pp}}` only, and `{{pplevel}}` is the same
> mechanism under a second name — 60 more abilities, 116 more blocks, Darius Hemorrhage among
> them. And of the two abilities this brief names as flagship cases, Caitlyn Headshot is
> deliberately refused (its value is a percentage of attack damage, not a flat base) and Darius
> Hemorrhage is deliberately refused (its value sits in a footnote variant). 29 abilities moved,
> not 107.

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

> **DONE 2026-08-13 (§25).** Gate 2 now compares at the wiki's own rendering precision. Measured
> by running the roster twice and changing nothing else, it clears **4 rows of the 56** — the 3
> above plus one ratio-count row. It clears **none of the wiki-series-short group**, and could
> not: a row in that group is one where the wiki printed no value at all at that rank, and a
> missing value does not agree at any precision. The counts in the table above are the 1e-6
> counts; §25 carries both columns.

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

---

## 25. The description-prose path — built (2026-08-13)

The brief in §20a is implemented. This section is its result. **Every count states what it
counts.** Measured over the same 937-page set as §19, after alias dedupe, on patch 16.16.1.

### The five components the brief asked for

1. **Prose scanner** — `scripts/extract/prose.ts` walks every `description*` field and finds
   every champion-level progression block with its position and surrounding text.
2. **The damage judgement** — same file. Structural, not proximity-based; see below.
3. **Damage type from `Module:DamageData/data`** — `scripts/extract/damage-data.ts` reads the
   module (1221 stated instances across 165 champions) and the prose path cross-checks against
   it rather than inferring a type.
4. **Piecewise progressions** — `; then` chains, in `progression.ts`.
5. **Per-level `x` formulas** — same file, evaluated over levels 1..18.

### A sixth shorthand the sizing did not count: `{{pplevel}}`

`{{pp}}` is not the only champion-level shorthand. `Template:Pplevel` redirects to
`Template:Passive progression level`, whose body is `{{#invoke:Ability progression|pplevel}}`,
and that function is three lines: `args["defaultDisplayMaxLevel"] = "true";
args["tooltipSize"] = 41; return p.pp(args)`. **It is `{{pp}}` with different tooltip
furniture, and it parses identically.**

**60 abilities use it in a description field, in 116 blocks.** §20a counted `{{pp}}` alone, so
none of them were in its sizing — including **Darius Hemorrhage**, which that brief names as an
ability contributing zero damage. Both names are now read (`findLevelBlocks`).

### What moved

| Figure | Count | Definition |
|---|---:|---|
| ability pages measured | 937 | distinct wiki pages, after alias dedupe |
| **abilities that gained ≥1 component from description prose** | **29** | stored a component the leveling rows did not produce |
| of those, ones that had **no** component at all before | 29 | every one was contributing zero damage |
| of those, ones that **leave the prose-only worklist** | 28 | `needsHandAuthoring` true before, false after |
| prose-derived components stored | 30 | one ability produced two |

The 29 are almost entirely the innate passives the brief named: Ziggs Short Fuse, Lux
Illumination, Braum Concussive Blows, Gwen A Thousand Cuts, Shaco Backstab, Sona Power Chord,
Leona Sunlight, Warwick Eternal Hunger, Zeri Living Battery, Nautilus Staggering Blow and
eleven more, plus all four of Aphelios's weapon Q's, his R, and Jayce's hammer form.

**This is 29 of the 107 prose-only entries, not 107.** The remaining 78 are not read, and the
reasons are counted below rather than described. Reporting the path as closing the gap would be
false.

### Gate 2 on everything that moved — 29 of 29 confirmed

**The ability-box round-trip cannot check these rows: it checked 0.** An ability whose damage is
in its description has no leveling row, so the rendered box prints nothing to compare against.
Reporting "0 disagreements" from that would have been a pass with no evidence behind it.

A round-trip that does work was built instead. Rendering the `{{pp}}`/`{{pplevel}}` block on its
own returns the wiki's **entire per-level expansion** in the `data-bot-values` attribute of the
rendered span — `20;24;28;32;36;40;48;56;64;72;80;88;100;112;124;136;148;160;172;184` for Ziggs
Short Fuse. That is the wiki's own Lua expanding the same block our parser read, so it is
independent evidence.

| Figure | Count | Definition |
|---|---:|---|
| level-scaled prose components checked | **29** | compared value-by-value against the wiki's expansion |
| **confirmed** | **29** | every value agrees at the wiki's display precision |
| disagreeing | 0 | |
| no comparable rendering | 0 | |

The visible text of that span reads `20 – 184 (based on level)`, and **184 is the level-20
value** — the §13 extrapolation trap. The attribute is read and the summary text is not.

### The damage judgement, and what it refuses

Nothing in the source marks a block as damage; the same shorthand carries cooldowns, life steal,
heals, energy and movement speed. The rule is **structural**: the wiki wraps a value in an
`{{as|…}}` block and names the thing there or in the `{{as}}` blocks immediately following, so
reading the wrapper is reading a statement rather than guessing from nearby words. A run of
adjacent `{{as}}` blocks is one damage instance — the wiki splits one figure across several,
value first, each ratio in its own, the noun last.

**435 description-field level blocks are not read.** A *block* is one `{{pp}}` or `{{pplevel}}`
occurrence in a `description*` field.

| Cause | Blocks | Abilities | Definition |
|---|---:|---:|---|
| **no-wrapper** | 244 | 163 | No `{{as|…}}` encloses the block, so nothing in the source says what the number is. Judging it would mean reading the surrounding sentence, which is the proximity heuristic §20a warns against. **The largest open group.** |
| not-damage | 96 | 80 | The wrapper names a cooldown, heal, shield, life steal, energy, movement or attack speed. |
| footnote-variant | 46 | 25 | The block sits inside a `{{ft|…}}` footnote, which states a conditional variant rather than a second instance. Summing it would double-count. Darius Hemorrhage is here. |
| unclear | 17 | 14 | The wrapper names neither damage nor a non-damage noun. |
| percent-payload | 12 | 10 | The value is a **percentage of a stat** (`key=%`) sitting where a flat base would go. Caitlyn Headshot's `{{pp|key=%|60 to 100 for 3|1 to 13}}` is 60–100% **of attack damage**; stored as a base it becomes 60–100 flat damage — wrong, and plausible. |
| has-leveling-rows | 11 | 10 | The ability already has damage from its leveling rows; the prose usually restates it and a second copy would double the ability's output. |
| duplicate-label | 9 | 4 | Two groups produced one label, so which is a variant of which is unstated. Both refused rather than one shadowing the other (§23). |

Two of these are worth naming as deliberate losses rather than gaps: **Caitlyn Headshot** and
**Darius Hemorrhage** are both refused, and both are abilities §20a named as flagship cases.
Reading either would need a shape the library does not have (a level-scaled percentage of a
stat) or a rule for conditional footnote variants. Neither is guessed at.

### The Malzahar W case: a row carrying both a rank term and a level term

`{{pp}}` was only read when a row had **no** `{{ap}}`, so a row with both dropped its level term
in silence (§24). Six rows do this, and all six now store both:

**Azir W · Kled W · Malzahar W · Mordekaiser Q · Tahm Kench Q · Zoe Q.**

`base` holds one `Scaling`, so the two additive terms are stored as two components with
`relation: 'adds'` — the level term as the primary (that is what the wiki renders as the row's
base) and the rank term as `<id>-rank-term`. **If either term is unreadable, neither is stored:**
half of a two-term row is not a partial answer, it is a wrong number that looks whole.

### Gate 2 at the wiki's display precision

§24 recorded three "value-differs" rows that were the wiki printing a rounded figure — Rumble Q
140.63 against a stored 140.625. The comparison now uses the wiki's own rendering rule, read from
`Module:Ability progression`: `round = args["round"] or 2`, applied by
`floor(val * 10^d + 0.5) / 10^d`.

**The rule, and why it is not a looser tolerance.** The stored value is put through that same
half-up rounding at `max(decimals the wiki printed, 2)` and must print what the wiki printed. The
`max` is load-bearing in both directions: using the printed decimals alone, a wiki `275` against a
stored `275.4` would round to `275` and be waved through; using a flat 2 alone, a block carrying
`round=3` would have a real third-decimal difference hidden. Only differences the wiki's renderer
physically cannot show are cleared.

**Measured by running the full roster twice, changing nothing but the comparison:**

| Cause | at 1e-6 | at display precision | cleared |
|---|---:|---:|---:|
| render-failed | 6 | 6 | 0 |
| **wiki-series-short** | 28 | 28 | **0** |
| **ratio-count** | 10 | 9 | **1** |
| value-differs | 18 | 15 | 3 |
| **total disagreeing rows** | **56** | **52** | **4** (14 individual values) |
| entries with ≥1 disagreement | 54 | 52 | 2 |
| entries gate 2 demotes | 25 | 24 | 1 |

**It clears none of the wiki-series-short group and one of the ratio-count group.** That is not a
disappointment, it is the definition: a wiki-series-short row is one where the wiki printed *no*
value at that rank, and a missing value cannot agree at any precision. The two groups have a
different cause and needed a different fix; §20a and §24 are amended accordingly.

### Gate 2 counts a row it never compared — found and stopped

A row whose base scales by champion level was added to `matched` and to `checkedRows`, on the
reasoning that the box prints one "(based on level)" figure with nothing to line up. That made an
uncompared row raise the pass count, and an entry whose every row is level-scaled could reach
gate 6 with a clean round-trip record behind which no comparison had happened.

Those rows are now counted separately and excluded from both. **9 rows across the roster are in
this state** — six of them the two-term rows above, which is why the wiki-series-short group fell
from §24's 34 to 28: those six left the comparison pool rather than being reconciled.

The fix for them exists and is not wired in: `renderLevelBlocks` checks exactly these values, and
it is what confirmed 29 of 29 prose components. It needs the network, and `roundTrip` is a pure
function. **Proposed, not implemented: move the level-scaled comparison into the batch runner
alongside the gate-2 demotion, where the network already is.**

### Full-roster gate 2 after this session

| Figure | §24 | now |
|---|---:|---:|
| entries gate 2 can run on (≥1 stored component) | 589 | **618** |
| entries with no components (skipped, not passed) | 348 | **319** |
| entries matching on every row | 530 | 566 |
| entries with ≥1 disagreement | 59 | 52 |
| entries demoted from `derived` to `incomplete` | 28 | 24 |
| rows checked / matched / disagreeing | 872 / 810 / 62 | 863 / 811 / 52 |
| rows this rendering cannot check | not counted | 9 |

### What is NOT claimed

- Nothing produced by this path is better than `derived`, and an entry gate 1 or gate 2
  disagrees with is `incomplete`.
- The prose-block round-trip confirms that our expansion of a block matches the wiki's. It says
  nothing about whether the block is damage — that is the judgement, and the judgement has no
  independent check beyond `Module:DamageData/data` listing the ability.
- 78 of the 107 prose-only entries are still prose-only.

---

## 26. The coverage ceiling, and the honest state (2026-08-13)

Three things were asked for and are answered here: the rows gate 2 was counting without
checking, how far automatic extraction can go, and the single table the execution plan is
rebuilt against.

### 26.1 Gate 2 no longer counts a row it did not check

A component whose base scales by champion level was added to gate 2's `matched` and `checked`
totals on the reasoning that the ability box prints one "(based on level)" figure with nothing to
line up rank by rank. That made an **uncompared row raise the pass count**, and an entry whose
every row is level-scaled could reach gate 6 with a clean round-trip record behind which no
comparison had happened.

Those rows are now excluded from both counts, and checked properly instead. The check lives in
the batch runner, where the network is, for the same reason the gate-2 demotion does
(`draftFromTemplate` is pure and cannot fetch). Rendering the source block returns the wiki's
entire per-level expansion in the `data-bot-values` attribute of the rendered span — the wiki's
own Lua, expanding the same block our parser read.

| Figure | Count | Definition |
|---|---:|---|
| rows the ability box cannot check | **9** | stored component with a level-scaled base whose label matched a rendered row |
| **level-scaled components checked against the wiki's own expansion** | **38** | the 9 above plus the 29 prose components, which the box never rendered at all |
| **matched** | **38** | every value agrees at the wiki's display precision |
| disagreeing | 0 | |
| no expansion to compare — recorded as no evidence, NOT as a pass | 0 | |

Two ways the wiki's series is legitimately longer than ours, neither a disagreement: a piecewise
progression generates values for levels 19 and 20 that the module itself does not display, and
`{{pplevel}}` sets `tooltipSize = 41` so its series runs on past level 18 at the same slope. Our
values are compared against the leading values of theirs.

### 26.2 A defect found while sizing: `heals?` matched "health"

`NOT_DAMAGE_NOUN` had no trailing word boundary, so **`heals?` matched the first four letters of
"HEALTH"**. Every prose run reading "X% of the target's maximum health" was disqualified as a
heal — Aatrox Deathbringer Stance, Jhin Whisper, Sejuani Icebreaker, Zed Contempt for the Weak
and twenty more. It failed in the safe direction, so no wrong number was ever stored, and it was
invisible for exactly that reason. `seconds?` inside "secondary", `range` inside "ranged" and
`gold` inside "Golden" were the same trap waiting to happen.

Fixed, with a regression test. It moved **no ability** — the affected sentences need the
connective rule below as well — but it moved 49 blocks out of `not-damage`, which is what made
the ceiling measurable at all.

### 26.3 The ceiling: 47 of the 80 are reachable, 33 are not

**DEFINITIONS.** The population is the **80 abilities on the prose-only worklist** — an entry
that stored no component and whose template declares a damage type. *Reachable* means **the
source states, structurally, both a damage value and what that value is**, so reading it needs
only code and no judgement about which of several meanings applies. *Hard* means it does not.

| | Abilities | Definition |
|---|---:|---|
| **R1** | **41** | A run of adjacent `{{as|…}}` blocks names a damage type and holds a value the existing classifier already reads. The shipped scanner misses them only because it triggers on a level progression, and these hold a flat ratio — `{{as|100% AD}} {{as|(+ 25% AP)}} {{as|'''bonus''' physical damage}}` (Blitzcrank E, Master Yi P, Sylas P, Corki P, Nocturne P). |
| **R2** | **6** | The same, once ONE bounded connective — the literal words `as`, `of`, `equal to` — is allowed between the value run and the block that names it: `{{as|'''bonus''' magic damage}} equal to {{as|{{pplevel\|key=%\|4 to 10}} of the target's '''maximum''' health}}` (Aatrox P, Jarvan IV P, Sejuani P). Still reading a structure, not scanning a sentence. |
| **H1** | **23** | A damage-named run exists but its value is not readable from it. |
| **H2** | **10** | No damage-named run at all: the source never labels the number. |

**Reachable: 47. Hard: 33.** Both counted over the same 80.

**The 23 in H1, by what actually blocks them:**

- **20** are the shape `{{as|'''bonus''' magic damage}}` standing alone — the naming block and
  the value block separated by something that is not a bounded connective, most often the closing
  brace of an enclosing `{{sti|…}}` wrapper or a clause. Some are reachable with more structural
  work and some are not, and **which is which cannot be decided without a human reading the
  sentence.** That is 20 sentences of hand inspection, not 20 permanent gaps.
- **1** Caitlyn Headshot — the value is readable but its ratio is a `{{critical damage|…}}`
  template this project does not read. Code.
- **1** Aphelios Crescendum — a piecewise `{{pp}}` the parser still cannot expand. Code.
- **1** Galio P — readable, and correctly refused: its ratio is `60% bonus magic resistance` and
  the source never says whose (§16). **This one stays incomplete even after a human reads it.**

### 26.4 What would actually resolve the hard 33 — the answer is not "a different source"

**There is no second source.** Data Dragon carries no ability damage at all (§4), and
`Module:DamageData/data` classifies instances without numbers (§11). The wiki's per-ability
template is the only place these figures exist. So the choice is code, a human, or nothing.

| Route | Abilities | What it means |
|---|---:|---|
| More structural code, no guessing | 2 | Caitlyn Headshot, Aphelios Crescendum — a template reader and a parser extension |
| A human reads the sentence, then possibly code | 20 | The H1 noun-alone shape. A person decides whether a rule can reach it |
| A human reads the rendered page and hand-authors it | 10 | H2 — the source never labels the number machine-readably |
| **Nothing resolves it** | **1** | Galio P, and only its owner field: no source states whose magic resistance the ratio reads |

**So the honest statement is: nothing here is beyond a human.** The wiki renders every one of
these abilities and a person can read the number off the page. What has a hard ceiling is
*automatic* extraction — 47 of 80 by code, 33 needing a person to look at least once.

**Permanent incompleteness is a different and much smaller category**, and it is not about
extraction at all. It is the case where **no source states the fact**, so a human reading the
page would be guessing too. Today that is the 22 entries carrying an `unresolved-owner` (§16) —
Malphite W's `(+ 15% armor)` with nobody named — of which Galio P is one. **Those must be
surfaced to the user as permanently incomplete, not as work pending.** Everything else on the
worklist is work.

### 26.5 The honest state

**DEFINITIONS.** *Entry* = one distinct wiki ability page, after alias dedupe. *Confirmed* = gate
2 compared at least one row or component of that entry against the wiki's own rendering and found
no disagreement; it is **not** `verified`, which additionally requires gate 5 (independent
re-derivation), and gate 5 has not been run by any session. *Storable* = at least one stored
component.

| | Entries | Definition |
|---|---:|---|
| **Total ability pages** | **937** | distinct pages, after alias dedupe (§18) |
| — storable | **618** | ≥1 stored damage component |
| — declares damage, stored nothing (prose-only worklist) | **80** | the coverage problem of §26.3 |
| — declares no damage, stored nothing | **239** | shields, heals, utility. Not a gap |
| **Of the 618 storable:** | | |
| — confirmed by gate 2, and `derived` | **528** | compared against the wiki, agreed, nothing else wrong |
| — confirmed by gate 2, but `incomplete` for another reason | **34** | agrees with the wiki and still carries an unresolved owner or a schema failure |
| — gate 2 disagreed | **46** | of which 24 were demoted from `derived` this run (§24) |
| — no gate-2 evidence either way | **10** | nothing the rendering could compare; not counted as a pass |
| **Verification, all 937** | | |
| — `verified` | **0** | gate 5 has never been run |
| — `derived` | **771** | includes the 239 non-damaging entries |
| — `incomplete` | **166** | reasons in §19 |
| **Permanently unreachable** | **22** | entries whose ratio owner no source states (§16). Not work; a property of the source |

**Damage components stored: 930**, of which 30 came from description prose and 38 are
level-scaled and independently confirmed.

**The one number to design the plan around:** of 937 ability pages, **618 carry damage today and
562 of those are confirmed against the wiki**. The gap is **80 abilities**, of which **47 are a
coding job and 33 need a person to read them at least once**, and **22 entries across the whole
roster can never be completed at all** because the source does not state whose stat a ratio
reads. The product must say so on those, rather than imply they are pending.

---

## 27. Four statuses, the flat-ratio path, and permanent versus pending (2026-08-13)

### 27.1 `no-damage` — a fourth status, and why the three did not suffice

`derived` means "extracted from source, not independently confirmed". That is a claim **about
numbers**, and 239 entries carried it while having none: shields, heals, dashes, utility. It
inflated the derived count by roughly a third and made the roster look better modelled than it
is. Silence about damage and unconfirmed damage are different facts and must not share a word.

`VerificationStatus` now has a fourth arm, `'no-damage'`, and it is a **claim**, so it is made
only when two independent sources are silent together:

- the ability's own template declares no `damagetype`, **and**
- `Module:DamageData/data` states no damage instance for it.

**Where the two disagree, the entry is `incomplete`, never `no-damage`.** That is not
hypothetical: **21 abilities declare no damage type while the module states one** — Jinx Q,
Kalista P, Zed W, Senna P, Viego P, Xayah W, Zac P and fourteen more. Calling those "no damage"
would assert an absence against a source that contradicts it. They are on the worklist instead,
which is where undetected damage belongs.

Two gates hold it: gate 1 refuses `no-damage` on an entry that carries components, and gate 6
refuses it on an entry whose `instanceType` is not `non-damaging-ability`.

**`instanceType` was fixed at the same time and for the same reason.** It was set from whether we
had *stored* a component, so every ability whose damage we could not extract was labelled
`non-damaging-ability` — a claim about the game made from a failure of ours. It is now set from
what the sources say.

| | Entries |
|---|---:|
| `no-damage` | **214** |
| entries with no component that ARE on the worklist | 69 |
| entries with no component that are `incomplete` for another reason | 13 |

### 27.2 The flat-ratio path (§26.3 R1) and one bounded connective (R2)

Both were built. The scanner no longer triggers only on a level progression; it triggers on any
run of `{{as|…}}` blocks that names a damage type and carries a readable value, and a run may now
span **exactly one** of the connective words `as`, `of`, `equal to`. Both halves are still wrapped
and named by the source, so this is reading a structure — anything else between two blocks ends
the run.

**DEFINITIONS.** *Worklist* = an entry that stored no component and that at least one source says
deals damage. Both columns below use that same definition, so the movement is like for like; the
left column is the current code with the description path unable to fire.

| Figure | Count |
|---|---:|
| worklist with the prose path disabled | **117** |
| worklist as it now runs | **69** |
| **abilities that moved off the worklist** | **48** |
| abilities carrying ≥1 prose component | **52** (29 before this work, 23 new) |
| prose components stored | **56** |

**Gate 2 on everything that moved:**

| Figure | Count | Definition |
|---|---:|---|
| abilities with prose components | 52 | |
| **confirmed** | **26** | gate 2 compared ≥1 component and found no disagreement |
| **disagreeing** | **0** | |
| no evidence either way | 26 | nothing gate 2 can compare — see below |

The 26 with no evidence are the newly reached flat-ratio abilities — Blitzcrank E, Master Yi P,
Zed P, Nocturne P, Jarvan IV P and the rest. Their components have **no level progression to
re-render and no leveling row in the ability box**, so neither half of gate 2 can reach them.
That is recorded as *no evidence*, not as a pass. It is the honest state and it is the largest
open weakness in the gate: 26 abilities carry damage nothing has checked.

### 27.3 Three guards that had to exist, found by building it

Widening the trigger exposed three ways to store a wrong number, each caught by measurement
rather than by reasoning:

- **`bonus-only-run`** — a run whose every block is a bare `(+ …)` addition. A bonus group is by
  construction an addition to a value stated elsewhere; storing the group alone gives the ability
  its ratios and no payload. Akali's mark is `{{as|(+ 60% '''bonus''' AD)}} {{as|(+ 55% AP)}}`
  with its base a bare progression outside the run. **29 worklist abilities are refused by this.**
  The first cut of the guard was too broad and refused Warwick, Katarina, Volibear and Gwen as
  well, whose entire passive is `{{as|(+ {{pplevel|10 to 50}}% '''bonus''' AD)}}` — a complete
  scaled ratio. A `(+ …)` group carrying a progression is now kept.
- **The unwrap rule.** A block whose argument holds a progression is the row's base and must be
  unwrapped for the classifier to read it — unless the rest of that block names a stat, in which
  case the progression is the *magnitude of a ratio*. `{{pplevel|4 to 10}} of the target's
  maximum health` unwrapped becomes "4 to 10 flat damage" instead of "4–10% of the target's
  health": a different number, and a plausible one. Both forms are now pinned by tests.
- **`NOT_A_DAMAGE_INSTANCE`** — with the scanner reading ordinary prose, "reduces magic damage
  taken" would otherwise read as a magic damage instance. The classifier's own exclusion list is
  applied to prose runs too.

**One ability moved backwards, correctly.** Zeri P produced a component before and does not now:
two runs on it claim the same label, and which is a variant of which is unstated, so
`duplicate-label` refuses both. Previously only one run was visible and it was stored without
question. The ambiguity was always there; it is now surfaced instead of resolved by accident.

### 27.4 Permanent is not pending, and it is now in the data

`CuratedAbility` gains `unresolvable?: Unresolvable[]` — a list of facts the entry needs that
**no source states**, each naming the missing field and why nothing settles it. It is not a
worklist item. It is a property of the source.

**23 entries carry one**, all of them ratio owners the source declines to attribute (§16):
Malphite W's `(+ 15% armor)` with nobody named, and its kin. Gate 6 enforces both directions — an
entry with an unresolved owner that records no `unresolvable` fails, and an `unresolvable` on
anything other than `incomplete` fails.

`SPECIFICATION.md` §8 now records how the interface presents the difference: **pending** reads
*"not yet modelled"* and will improve, **permanent** reads *"cannot be completed — the source does
not record this"* and names the missing fact. §8 also records that `DESIGN.md` carries no glyph
for `no-damage` or for the permanent/pending split, and that this is an open design decision
rather than something to invent here.

### 27.5 The state, re-measured

Supersedes §26.5. Same definitions.

| | Entries | Definition |
|---|---:|---|
| **Total ability pages** | **937** | distinct pages, after alias dedupe |
| — storable | **641** | ≥1 stored damage component |
| — worklist | **69** | stored nothing, a source says it damages |
| — `no-damage` | **214** | stored nothing, both sources silent |
| — no component, `incomplete` for another reason | 13 | |
| **Of the 641 storable:** | | |
| — confirmed by gate 2, and `derived` | **525** | |
| — confirmed by gate 2, `incomplete` for another reason | **35** | |
| — gate 2 disagreed | **46** | 24 demoted from `derived` this run |
| — **no gate-2 evidence either way** | **35** | of which 26 are the new flat-ratio prose components |
| **Verification, all 937** | | |
| — `verified` / `derived` / `incomplete` / `no-damage` | **0 / 566 / 157 / 214** | |
| **Permanently unreachable** | **23** | records an `unresolvable`; not work |

**Damage components stored: 956**, of which 56 came from description prose.

**The numbers to design the plan around.** 937 ability pages. **641 carry damage, 560 of those are
confirmed against the wiki, 35 carry damage nothing has checked.** The gap is **69 abilities**,
and after this session the cheap half of it is gone — what remains is dominated by 36 abilities
whose number the source never labels and 29 whose payload sits outside the run that names it.
**23 entries can never be completed by anyone.** No status above `derived` exists anywhere on the
roster, because gate 5 has never been run.

---

## 28. The values nothing had checked — a third round-trip (2026-08-13)

### The question

26 abilities carried damage that no gate could reach. A component recovered from prose whose
value is a **flat ratio** has no leveling row in the ability box and no progression block to
re-render, so both existing round-trips were blind to it. Asked plainly: is any round-trip
possible for them at all, or can they never be gate-2 confirmed?

### The answer: they are rendered, and not where anyone had looked

The same `action=parse` call that produces the leveling rows also renders the ability's
**description**, and the wiki's own Lua resolves every value into it:

```
Blitzcrank E   deal 100% AD (+ 25% AP) bonus physical damage
Zed P          deal 5% / 7.5% / 10% (based on level) of the target's maximum health
Nocturne P     dealing 120% AD physical damage to the target and nearby enemies
```

`parseRenderedProse` reads `div.ability-info-description` — and only that, since the patch-history
section elsewhere in the same document is the §13 trap. `roundTripProse` then requires every
figure a component asserts to appear in that text **in the order it asserts them**. Order is what
makes it meaningful: these sentences are full of cooldowns, durations and ranges, so a bare
"does this number appear" test would pass on a coincidence.

| Figure | Count | Definition |
|---|---:|---|
| prose components checked against the rendered description | **56** | every component the prose path produced |
| **matched** | **56** | every asserted figure printed, in order |
| disagreeing | **0** | |
| no figures to check | 0 | |
| abilities with prose components now carrying gate-2 evidence | **52 of 52** | was 26 of 52 |

**The 26 with no evidence is now 0.** Roster-wide, entries holding components that no round-trip
can compare fall from **35 to 9**.

### What this check is, and what it is not

It is deliberately the weakest of the three and must not be read as their equal. It confirms that
the figures we stored are the figures the wiki prints for that ability, in that order. It does
**not** confirm that we attached them to the right stat, nor that we did not miss a term the wiki
also printed. A pass here is evidence, not proof — which is exactly why gate 5 exists.

### Two corrections it forced, both found by running it

- **The description summarises rather than enumerates.** A varying value prints as a range —
  `26 – 196 (based on level)` — not as eighteen numbers. A first cut demanded every step and
  failed on **34 of 56** components. The expectation is now the ENDS of each series, and the
  middle steps are checked by `roundTripLevelScaled` against the wiki's full expansion wherever a
  progression block exists (27 of the 56).
- **The upper end of that range is the level-20 value.** Ziggs Short Fuse prints `20 – 184`; 184
  is level 20 and the correct level-18 figure is 160. This failed on a further 10 abilities. A
  level-scaled series therefore contributes only its FIRST value to this check. Storing 184 to
  make the check pass would have imported the extrapolation the project refuses (§13) — the check
  was changed, never the value.

### The 9 that remain, and what they mean

Nine entries still hold components no round-trip can compare — among them Aurelion Sol W,
Caitlyn W, and the Heimerdinger and Nidalee abilities whose rank counts the wiki will not render
(§22). For those, **gate 2 can never confirm them, and their only route to `verified` is gate 5**:
an independent re-derivation by an agent that does not share this pipeline's code. That is not a
gap to be closed by more parsing; it is the reason the project has a fifth gate.

---

## 29. Gate 5, run at scale for the first time (2026-08-13)

**Fourteen of twenty-eight abilities disagreed with what we stored. Half.**

That is the headline and it should not be softened. Five sceptic agents re-fetched the sources
and re-derived every value independently, without this pipeline's code. Several also refereed
against Riot's own shipped game data — `raw.communitydragon.org/latest/game/data/characters/…`,
which carries the live coefficient arrays — a second source this project had not previously used
and which settled several cases outright.

**DEFINITIONS.** *Sample* = 28 abilities drawn deliberately, not randomly, in four groups: 10 that
gate 2 confirmed on every row, 8 holding components gate 2 could not compare (that group had 8
members, not 10, after §28 moved 26 of the 35 out of it — it was not padded), 5 from the prose
path, 5 carrying the coefficient shape. *DISAGREE* = the sceptic derived a different value or a
different meaning from the source. *AGREE* = every stored figure reproduced.

| Group | Abilities | AGREE | DISAGREE |
|---|---:|---:|---:|
| A gate-2 confirmed | 10 | 8 | 2 |
| B no gate-2 evidence | 8 | 0 | 8 |
| C prose path | 5 | 3 | 2 |
| D coefficient shape | 5 | 3 | 2 |
| **Total** | **28** | **14** | **14** |

**Group B failed completely — 8 of 8.** The abilities gate 2 could not check are exactly the ones
that are wrong. That is the strongest possible evidence that "no gate-2 evidence" must never be
treated as neutral.

### Seven defect classes, each measured across the roster

| # | Defect | Found on | Roster population | Definition of the population |
|---|---|---|---:|---|
| 1 | **A damage-over-time ability stores one tick and calls it the ability.** The `Total` row is dropped as a summary and the per-tick row that remains keeps `hits: 1`, because nothing reads the real tick count. Cassiopeia Q stores 10.71 where the ability deals 75 — one seventh. | Cassiopeia Q | **64** | stored per-hit components on an ability that also had a `Total` row dropped |
| 2 | **The coefficient shape is stored inside out.** `isMultiplierGroup` matches any block containing "per 100", including a health payload that merely *contains* a nested multiplier — so the payload is lifted as a multiplier onto the wrong ratio, and the real scaling is lost. Ambessa Q rank 5 with 100 bonus AD into a 3000 HP target: real 225, stored 180 — and at other inputs it errs the other way, so a spot check can look right. | Ambessa Q ×2, Briar W | **12** | stored ratios on an AD/AP stat carrying a multiplier whose per-stat is a health pool — in the source that shape is always the reverse |
| 3 | **Second-form abilities are indexed by the wrong rank axis.** They scale with the ultimate's rank (4, or 3 for UPGRADE!!!), not the slot's 5. The source states it in plain text on the leveling line and Data Dragon's `maxrank` on the ultimate confirms it. Our values are correct and unreachable. | Heimerdinger W and E, Nidalee Q/W/E, Karma Q | **6** | the §22 render-failures, now diagnosed rather than open |
| 4 | **A blank `damagetype` is silently defaulted to magic.** Caitlyn W's Headshot bonus is *physical*; stored magic, so it resolves against the wrong resistance entirely. | Caitlyn W | **14**, of which **2** are contradicted by `Module:DamageData/data` (Caitlyn W, Illaoi E) | entries storing damage whose template states no usable damage type |
| 5 | **A percentage modifier is stored as flat damage that adds.** Aurelion Sol W is a 108–112% multiplier on *another ability's* damage; stored as 108–112 flat magic damage. Casting it injects ~108 phantom damage. | Aurelion Sol W, Nidalee Q ×2 | **44** | stored components whose label says modifier / effectiveness / increase / amplif |
| 6 | **The prose path drops a bare literal.** `{{as|15|physical damage}}` — the classifier returns nothing for a value block holding a plain number with no `%`, so Aphelios Calibrum kept its 15% bonus-AD ratio and lost the flat 15 beside it. | Aphelios P Calibrum | **29** suspect | prose components whose base is zero at every rank. Not all are wrong — many are genuinely ratio-only — but the reader provably cannot see a bare literal, so every one needs checking |
| 7 | **"Additional" damage stored as a replacement.** The variant-marker list matches on *outer* and never checks *additional*, which means the opposite. Camille W models the outer cone instead of the base hit rather than as well as it — 220 damage missing at rank 5. | Camille W | **1** | components labelled "additional" yet stored as `alternativeTo` |

Two further abilities agreed on every figure while being **materially incomplete**, which is its
own finding: **Ahri Q** stores the outbound magic pass and not the return pass, which deals the
same again as **true** damage — half the ability, and the half it keeps is mis-typed for a
combo. **Aphelios Infernum** stores the primary-target 110% AD and not the secondary-target
step function. Neither is eligible for `verified`.

### What this says about gate 2

**Gate 2 passed Cassiopeia Q and Camille W and was right to.** The numbers it compared are the
wiki's numbers. Both faults are in what the numbers *mean* — how many times a component lands,
and whether it adds or replaces — and no round-trip against the same source can see that. The
same is true of the silent magic default: the value round-trips perfectly under the wrong type.

Gate 2 is a check on transcription. Gate 5 is the only check on comprehension, and the first time
it ran at scale it found a defect in half the sample.

### What can legitimately be marked verified: 11

**DEFINITION.** An entry may be `verified` only when ALL of: gate 5 passed it with no material
gap; gate 2 compared at least one row and found no disagreement; the source states a damage type
rather than it being defaulted; the entry carries no per-hit component on an ability with a
dropped `Total` row; and a `sourceRevision` is recorded. Every criterion is checked mechanically.

12 abilities passed gate 5 cleanly; **11 are eligible**. Amumu W is blocked by a gate-2
disagreement of its own.

**Lux Q · Brand Q · Ezreal Q · Caitlyn Q · Darius Q · Annie Q · Ashe W · Amumu Q ·
Aphelios Q Moonshot · Akshan P · Ambessa P**

They are recorded in `verification/gate5-passes.json`, one entry each with the evidence in plain
English. The batch runner promotes an entry to `verified` only when the ledger has it **and**
gate 2 agreed — both required, neither sufficient. That mechanism did not exist before today,
which is a large part of why nothing had ever been verified.

**11 of 937 is 1.2% of the roster.** At the tiered sampling rate the plan assumed (10% for tier
1), gate 5 would have run on roughly 60 abilities and, at the rate observed here, left about 30
defects in place. The rate this run measured — 50% — is the number to plan against, and it argues
for gate 5 at a far higher rate than 10%, or for fixing the seven classes above first so that the
rate falls before sampling resumes.

### One more source, now proven useful

Riot's shipped game data at `raw.communitydragon.org/latest/game/data/characters/<champ>/<champ>.bin.json`
carries live per-rank coefficient arrays (`BaseDamage`, `ADRatio`, and calculation parts naming
the stat and whether it is bonus or total). Two traps recorded by the sceptics: **index 0 is the
unlearned rank**, so ranks 1..N are indices 1..N; and **Data Dragon's legacy `effectBurn` field
is vestigial and wrong** for at least Caitlyn Q and Ashe W, disagreeing with both the wiki and
Riot's own live data. This is a genuine third referee for ability damage — the first this project
has found — and §4's conclusion that Riot exposes no usable ability numbers is true of Data
Dragon only, not of the game data.

---

## 30. The seven defects fixed, and gate 5 re-run on the identical sample (2026-08-13)

**The disagreement rate fell from 14 of 28 to 5 of 28 — 50% to 18%.** Same 28 abilities, same four
groups, same five independent agents, the only change being the extractor. The sample was not
altered and no criterion was relaxed.

### What each fix does, what it touches, and what changed status

| # | Fix | Population it touches | Effect |
|---|---|---:|---|
| 1 | **Tick count derived, not guessed.** The `Total` row the wiki also prints is divided by the per-tick row; where that is the same whole number ≥2 at every rank (compared at the wiki's display precision, since a per-tick figure is rounded) it becomes `hits`. | 109 per-hit components | **42 now carry a real count** — Cassiopeia Q 7, Alistar E 10, Dr. Mundo W 16, Fiddlesticks R 20. **42 entries raise `unknown-hit-count` and are forced `incomplete`** rather than storing one tick as the ability. |
| 2 | **A bare percentage is a modifier, not damage.** Once the progression and ratio blocks are removed, a row leaving only a `%` is a multiplier on something else. Labels are deliberately not used: "Increased Physical Damage" is real damage and "Damage Increase" is not, and no wording rule separates them. | 44 components labelled modifier/increase/effectiveness | Aurelion Sol W now stores **nothing** instead of 108–112 phantom magic damage; 10 components dropped, the rest were genuine damage rows. |
| 3 | **A flat literal beside a ratio is a base.** `{{as|15|physical damage}}` names no stat, so the ratio reader returned nothing and the number vanished. | 29 suspect prose components | Aphelios Calibrum stores **15 (+15% bonus AD)** instead of the ratio alone. |
| 4 | **A damage type is never defaulted.** Template field, else `Module:DamageData/data`, else the row's own label — and where none of the three states one, **nothing is stored**. | 14 entries were storing damage under a silent magic default | Caitlyn W is **physical**, as the module states. 27 entries now raise `unknown-damage-type` and store nothing. |
| 5 | **The payload is no longer confused with its multiplier.** `isMultiplierGroup` was matching "per 100" inside a NESTED block, so a health payload containing a multiplier was itself lifted as one. | 12 ratios carrying the swap signature | **0 remain.** Ambessa Q and Briar W now read as the source writes them, with the scaling term present. |
| 6 | **A second-form ability takes the rank count its own row states**, where the template also carries a "scales with … rank" header — the source saying it twice. | 6 abilities | All six now store damage: Heimerdinger W and E at 3 ranks, Nidalee Q/W/E and Karma Q at 4. Previously correct-but-unreachable. |
| 7 | **"Additional" overrides a variant marker.** | 1 component | Camille W's outer cone now `adds`, as its own notes say ("an additional instance… it will trigger effects twice"). |

**Where a fix could not be made without guessing, it was not made.** The 42 abilities whose tick
count does not divide evenly keep `hits: 1` and are `incomplete`, not given a plausible count.
Ahri Q stores nothing rather than picking one of the two damage types its template states.

### Two more defects, found by the re-run itself

- **Refusing a two-token damage type dropped whole abilities, including a verified one.** Akshan P
  declares `Physical Magic`, which states two types rather than none, and gating the prose path on
  the ability-level field silenced both of its instances. A prose instance names its own type in
  the wrapper it sits in, so it never needed that field. **Akshan P was withdrawn from the gate-5
  ledger** rather than carried forward on trust: it must be re-confirmed, not assumed.
- **"Increased X" beside "X" is the doubled form of one hit, not a second hit.** Ambessa Q stored
  both as adding, overstating a single-target cast by 50%. Riot's own data settles it — the lesser
  row is the greater one times a `Min_Ratio` of 0.5. Paired structurally now, by label.

### The rate, stated honestly

| | Round 1 | Round 2 |
|---|---:|---:|
| Abilities | 28 | 28 |
| AGREE | 14 | **23** |
| DISAGREE | **14 (50%)** | **5 (18%)** |

Of the five that disagreed in round 2, **three were fixed after their reports landed** (Akshan P,
and both halves of Ambessa Q) and verified directly. **Two remain open**: Heimerdinger W, whose
rockets land 4 and 15 times and whose combined row states so — the same class as fix 1 but with
three components, which the derivation deliberately refuses; and Ahri Q, which needs its two
instances split by type before either can be stored. **18% is the measured rate. It is not 7%,
and the three post-hoc fixes must not be counted into it.**

### The absent-instance sweep

**DEF: gate 2 found no disagreement on every row it compared, AND the wiki rendered at least one
damage row we did not store.** That is the Ahri Q shape — every stored number right, a whole
instance missing.

**167 entries.** Most are rows deliberately dropped (Total summaries, minion and monster rows), so
the figure is an upper bound on the defect rather than a count of it. The sharper measure is the
second: **DEF: `Module:DamageData/data` states more damage types for the ability than we store —
21 entries**, including Akshan R, Camille Q, Draven R, Pantheon W and R, Samira P and E. Those are
abilities that deal two types where we hold one, and each is a candidate for the same split Ahri Q
needs. Neither figure is a defect count; both are worklists.

### CommunityDragon adopted as a third referee — after verifying it

`scripts/extract/game-data.ts`, with all three traps verified against known values and pinned by
tests before anything relied on it:

1. **Index 0 is the unlearned rank.** Lux Q ships `[40, 80, 120, 160, 200, 240, 280]` and deals 80
   at rank 1. Reading indices 0..4 shifts every rank by one.
2. **The array runs past the real maximum.** Seven entries for a five-rank ability; the tail is dead.
3. **A game-mode override sits beside the real values.** `DataValuesModeOverride.cherry` is Arena,
   where Lux Q reads 70..310 — a self-consistent set of numbers for a mode this product does not model.

This is a genuinely independent source: not derived from the wiki, and it settled several disputes
outright. §4's conclusion that Riot exposes no ability damage is true of **Data Dragon** only.

---

## 31. The residue, and Riot's own arrays run over everything (2026-08-13)

### 31.1 The five that still disagreed, diagnosed

Three of the five were fixed the same day and verified directly (§30). What matters is whether
each is a CLASS with a population behind it or a one-off.

| Ability | What is wrong | New class or survivor | Population | Definition of the population |
|---|---|---|---:|---|
| **Heimerdinger W** | Rockets land 1, **4** and **15** times; all three components store one hit. The wiki's combined row states the arithmetic literally (`initial + 4× + 15×`). | **Survivor of class 1.** The tick-count derivation deliberately refuses an ability with more than one repeating component, because a single total cannot be attributed among them. | **69** | **TOTAL-MISMATCH**: the ability has a dropped `Total` damage row that expands, and our additive components do not sum to it at rank 1. A missing instance, a missing multiplicity or a dropped term — the detector does not say which |
| **Ahri Q** | Deals magic outbound and true on the return; the rows do not say which is which, so nothing is stored. | **Survivor** of the damage-type work, in its second form: not an absent type but two. | **28** | **TYPE-SPLIT**: `Module:DamageData/data` states more damage types for the ability than we store |
| **Akshan P** | Regression I introduced: a two-token `Physical Magic` was read as "no type" and gated the prose path off. Fixed. | **New class**, created and closed the same day. | **24** | **TWO-TOKEN TYPE**: the ability's own template names more than one damage type |
| **Ambessa Q ×2** | "Increased X" stored as adding to "X" when it is the doubled form of the same hit. Fixed. | **New class.** | **19** | **EMPOWERED PAIR**: a stored "Increased/Enhanced/Empowered X" row now paired as `alternativeTo` its base row |

**None of the five is a one-off.** Every one has a population, and the largest — 69 entries whose
stored damage does not reconcile with the total the wiki prints — is a check that did not exist
before and that no one has to sample to run.

**Two cautions on the 69.** It catches over-counting as well as under (Evelynn Q sums 140 against
a stated total of 45; Dr. Mundo W 100 against 80), so it is a worklist, not a defect count. And
it has a known false positive: Cassiopeia Q reads 74.97 against 75, which is the wiki's own
two-decimal rounding of a per-tick figure multiplied back up, not an error.

### 31.2 Riot's shipped arrays, run across the whole roster

172 of 173 champion dumps retrieved. This is **not gate 5 and confers nothing**: it compares
numbers, not meaning, so it cannot see a missing instance, a wrong multiplicity or a wrong damage
type — the three things that did the most damage in §29. What it can do is run on everything at
once, and a disagreement it finds is a defect nobody had to sample to reach.

**Matching is by VALUE, not by name.** Riot names arrays freely and there is no mapping from our
row labels to theirs, so every array a champion ships is offset past the unlearned rank and
truncated at the ability's rank count, and we ask whether any of them reproduces our series.

| Figure | Count | Definition |
|---|---:|---|
| components checked | **810** | a stored component with a rank-scaled, non-zero base, on a champion whose dump was retrieved |
| **matched** | **606** | some shipped array, offset and truncated, reproduces our series at **every** rank |
| **near-miss — a disagreement** | **1** | some shipped array reproduces it on more than half its ranks but not all. That is the shape of a real defect |
| no counterpart | 203 | no shipped array comes close. **NOT a defect**: many stored rows are arithmetic on another row — a 35% handle, a 0.6 secondary — that Riot ships as a multiplier rather than as its own array |
| not checkable this way | 108 | a level-scaled base (Riot ships those as formulas, not arrays) or a payload row whose base is zero |
| dump unavailable | 3 | components on the one champion with no retrievable dump |

**606 independent confirmations in one pass**, against a source that is not the wiki and is not
derived from it. Set beside gate 5's 28 abilities in two rounds of five agents, that is the
argument for keeping this check in the pipeline.

### 31.3 The one disagreement, and it is real

**Nunu & Willump R (Absolute Zero), Maximum Magic Damage.**

- The wiki writes `{{ap|625 to 1275}}`, which its own documented linear rule expands to
  **625 / 950 / 1275**.
- Riot ships `BaseDamage = [625, 625, 925, 1275, 1275, 1275, 1275]`, which offset and truncated is
  **625 / 925 / 1275**.

**The two sources state different numbers at rank 2, by 25.** This is not a rounding artifact and
not a trap in the referee — the array is explicit and its first and last ranks agree with the
wiki. Either the wiki's shorthand is a lossy summary of a curve that is not linear, or the shipped
array is stale.

**It is recorded and not reconciled.** Nothing here silently adopts 925: the project's rule is that
a disagreement between sources is a finding to surface, and the tie-break used for champion base
statistics — the wiki's own patch notes — has not been consulted for ability values and may not
even cover this. **Nunu R must not sit at `derived` while two of Riot's own sources disagree about
it**, and resolving it is the first item of ability-level source policy the plan needs.

### 31.4 The state

**DEFINITIONS.** *Entry* = one distinct wiki ability page after alias dedupe. *Storable* = ≥1
stored component. *Confirmed* = gate 2 compared at least one row or component against the wiki's
own rendering and found no disagreement. *Verified* = confirmed **and** an independent gate-5
re-derivation is recorded in `verification/gate5-passes.json`; a CommunityDragon match confers
nothing. *Permanently unreachable* = the entry records an `unresolvable` — a fact no source states.

| | Entries | |
|---|---:|---|
| **Total ability pages** | **937** | |
| — storable | **623** | ≥1 stored damage component |
| — worklist | **69** | stored nothing, a source says it damages |
| — `no-damage` | **206** | stored nothing, every source silent about damage |
| — no component, incomplete for another reason | 39 | |
| **Of the 623 storable:** | | |
| — **confirmed by gate 2** | **584** | |
| — **verified** | **10** | confirmed AND independently re-derived |
| — gate 2 disagreed | **37** | forced to `incomplete` |
| — no gate-2 evidence either way | **2** | was 35 before §28's third round-trip |
| **Permanently unreachable** | **23** | records an `unresolvable`; not work |

**Damage components stored: 921** — **superseded 2026-08-13; the measured figure is 917** (§36).
The four are the summary rows §34.1's widened filter now drops. Incomplete by reason, an entry may
carry more than one:

| Reason | Entries |
|---|---:|
| prose-only | 69 |
| unknown-hit-count | 42 |
| round-trip-disagreement | 37 |
| unknown-damage-type | 27 |
| unresolvable-owner | 23 |
| unresolved-owner | 22 |
| schema-invalid | 18 |
| unparsed-ratio | 12 |
| unparsed-base | 7 |
| unknown stat | 3 |
| split-payload / coefficient-shape / no-value | 2 / 2 / 2 |

**Verified is 10 of 937 — 1.1%.** **SUPERSEDED 2026-08-13: the ledger holds 10, the runner promoted
8, and it is 10 again only after §36 wired the third round-trip in.** That is the number the plan has to move, and gate 5 is the only
thing that moves it.

---

## 32. Ability values: the tie-break policy, gate 7, and what gate 5 can be (2026-08-13)

### 32.1 Nunu R, investigated

| Source | Rank 1 | Rank 2 | Rank 3 |
|---|---:|---:|---:|
| Wiki template `{{ap|625 to 1275}}`, and **the wiki's own renderer** | 625 | **950** | 1275 |
| Riot's shipped `BaseDamage [625, 625, 925, 1275, …]`, offset and truncated | 625 | **925** | 1275 |

**Our parse reproduces the wiki exactly** — gate 2 passes this ability — so the disagreement is
between the two sources, not ours. The wiki's patch pages do not mention Absolute Zero at all
(`insource:"Absolute Zero" incategory:Patches`, 0 results), so the tie-break that settles champion
base statistics is unavailable here. Riot's dump is on the current patch
(`content-metadata` `16.16.8049184`), so it is not stale.

**One asymmetry is evidence, and it is worth stating precisely because it is tempting to
over-read.** The wiki's `X to Y` shorthand **cannot express a curve that is not linear**; if the
game's curve is 625/925/1275, any author writing it as `625 to 1275` flattens it. That is the
documented trap of §11 — *never interpolate a middle rank by assuming an even step* — appearing
from the other side. It is evidence that the wiki form is **lossy here**. It is **not** proof that
925 is the number, and 925 is not adopted.

### 32.2 The policy

§12 sets authority per field for champion statistics. Ability values had none. This is it.

1. **The wiki's per-ability template remains the default and only storage source.** It is the only
   source carrying base damage, ratios, owners and labels together. Riot's shipped arrays carry
   numbers without meaning.
2. **A CommunityDragon match confers nothing.** It is corroboration of a number, never of a
   reading, and never a route to `verified`.
3. **Where the two disagree, neither is adopted.** The entry is recorded in
   `verification/ability-conflicts.json` with both values and the evidence, and is forced to
   `incomplete` — it may never be `derived`, because "extracted from source, not independently
   confirmed" claims a settled reading of the source and there is not one.
4. **A conflict is only resolved by a source that states the value outright** — a patch note, or a
   future wiki edit replacing the shorthand with an explicit list. Not by preferring whichever
   source is tidier, and not by preferring the game data because it is closer to the engine.
5. **Endpoint agreement is recorded but does not decide.** Where only an interpolated middle rank
   differs, that is logged as evidence the wiki's shorthand is lossy, and the entry stays contested.

**Nunu R is `incomplete` as of this run**, enforced by the batch runner reading the conflict
ledger, not by hand.

### 32.3 Gate 7 — does what we store add up to what the source says the total is?

Self-consistency against a figure the wiki states outright. **Offline, no sampling, and it catches
over-counting as well as under** — which no other gate does. Gate 5 found Heimerdinger W storing a
third of its damage and Cassiopeia Q a seventh; this is the check that finds those without an agent.

Only `adds` components are summed, since an alternative replaces rather than joins. Totals naming
minions, monsters, epics or structures are ignored: those cover targets this product never models.
**The tolerance is the wiki's own display rounding** — each summed term is printed to two decimals,
so N terms carry up to N/2 of the last place. Without it, Cassiopeia Q reads 74.97 against 75 and
reports arithmetic as damage.

| Figure | Count | Definition |
|---|---:|---|
| entries gate 7 ran on | **623** | ≥1 stored component. An entry whose source has no total row passes trivially — nothing to reconcile |
| reconcile, or have no total row | 558 | |
| **do not reconcile** | **65** | |
| — **under-sum** | **39** | we sum to LESS than the stated total: a term or a multiplicity is missing. **10** carry a repeating component, so the likely cause is a hit count; **29** do not, so a whole term is absent |
| — **over-sum** | **26** | we sum to MORE: something is counted twice. Gangplank R sums 1560 against a stated 480; Hwei R 230 against 30 |

**The 65 are genuine defects, not deliberate drops.** Deliberate drops are excluded by construction
— alternatives are not summed, and non-champion totals are skipped — which is why the count fell
from the 69 the first rough sweep produced. **`incomplete` rises from 190 to 236** as a result: 46
entries that read `derived` while failing to reconcile now say so.

### 32.4 What gate 5 can be — recommendation

**Verifying the roster is not 165 runs. It is 165 runs per patch.** A gate-5 pass is evidence about
one revision of one page; the moment Riot changes a value it is void, and the wiki edits daily —
one of these sceptics found a Camille buff landed the day before. Certification that decays faster
than it can be produced is not a plan at any budget.

**Recommendation: repurpose gate 5 from certifying entries to discovering defect CLASSES, and
design the product around `derived` being the normal state.**

The evidence for it is this session's own record. Gate 5 found seven classes, and **every one became
a mechanical check that runs on all 937 pages offline** — the hit-count derivation, the modifier
detector, the type rules, the payload/multiplier fix, the rank axis, the additional-marker, and now
gate 7. A single 28-ability run bought roster-wide coverage of every defect it found. That is a
250-fold return, and it is the only form of comprehension checking that scales.

Concretely:

- **Gate 5 runs as a stratified sample per patch cycle**, sized to discover classes rather than to
  certify entries — weighted toward what changed and toward shapes no mechanical gate covers.
  Its output is a class and a detector, not a verdict.
- **`verified` stays a small, honest set** and keeps its current meaning: gate 2 agreement plus a
  recorded independent re-derivation. It will be tens of entries, not hundreds, and the interface
  must not imply otherwise.
- **`derived` is the normal state and the interface says what it means** — "read from the source,
  checked against the source's own rendering, not independently re-derived" — rather than treating
  it as a deficiency. With gate 7 and the game-data check, a `derived` entry now carries more
  evidence than `verified` did this morning.
- **The game-data check runs every patch on everything**, at no marginal cost, and any new
  disagreement is a defect surfaced without sampling.

**What this costs, stated plainly:** the product will never be able to say most of its numbers were
independently re-derived. It will be able to say every number agrees with the source's own
rendering, reconciles with the source's own stated total, and agrees with Riot's shipped data
wherever that exists — and to name the ones that do not. That is a weaker claim than "verified" and
a true one, which is the trade this project has made everywhere else.

---

## 33. Gate 7 worked, and what it found (2026-08-13)

### The gate was tightened, and the count fell — that is precision, not weakening

**A total must cover the WHOLE ability or the comparison is meaningless.** Fizz W prints "Total
**Passive** Magic Damage", which covers one of its three components; reconciling all three against
it reported a defect that was a scope mismatch. Gate 7 now takes a total only when its label
reduces to nothing once "Total", a Minimum/Maximum qualifier and the damage-type words are
removed — so "Total Magic Damage" qualifies and "Total Fissure Magic Damage", "Total Single-Target
Damage" and "Total Enhanced Damage" do not.

**65 → 51.** Fourteen were scope mismatches. The gate is stricter about what it will compare, not
more forgiving about what it finds.

| Figure | Count | Definition |
|---|---:|---|
| entries gate 7 ran on | **623** | ≥1 stored component; no whole-ability total means nothing to reconcile |
| reconcile, or have no whole-ability total | 572 | |
| **do not reconcile** | **51** | |
| — **under-sum** | **33** | we sum to less than the stated total: **8** carry a repeating component (likely a hit count), **25** do not (a whole term absent) |
| — **over-sum** | **18** | we sum to more: something is counted twice |

### The over-sums share a cause, and it is not the one it looks like

Gangplank R sums 1560 against 480; Hwei R 230 against 30. They look like runaway hit counts. They
are not. **The dominant cause is a summary row that does not begin with "Total" and is therefore
stored as a component**:

- Gangplank R stores `Magic Damage Per Wave ×12 + Magic Damage Per Cluster + True Damage with +
  **Maximum Mixed Total Damage with and**` — the last is a summary of the other three.
- Gwen R stores `… + **Second Cast Total Damage** + **Third Cast Total Damage**`.

`DERIVED_ROW` anchors on `^total`, so a summary with a qualifier in front of it is invisible to it.
A second cause is a max-variant whose min sibling is labelled without the word "Minimum", so the
pair is never matched — Evelynn Q stores `Magic Damage + Bonus Magic Damage + Magic Damage +
Maximum Magic Damage`, all four adding.

**Neither is fixed here, deliberately.** Widening the summary-row filter to match "Total" anywhere
in a label would drop rows across the whole roster, and the ability that ends up storing nothing
as a result is exactly the failure mode of DATA-SOURCES §23 — 32 abilities were once silently
zeroed by a mis-scoped summary filter. That change needs its own measurement before it ships. The
18 are recorded and their entries are `incomplete`.

### The under-sums carrying a repeating component are mostly NOT hit counts

Of the 8, the total-to-per-hit ratio is a whole number on only some: Miss Fortune R is exactly 14,
Malzahar R exactly 10. The rest are 1.8, 3.33, 2.97, 1.33, 1.6, 1.67 — and the reason is visible in
their component lists. **Kai'Sa Q, Xayah Q, Yuumi R and Zac R all store `X Per Hit [adds]` plus
`Reduced X Per Hit [alternativeTo]`**: the ability hits once at full damage and several times at a
reduced rate, and the total covers both. A model where an alternative simply replaces cannot say
"one of these and five of those", so no hit count exists that would reconcile them.

**That is a shape the library does not have, not a number that is missing**, and inventing a count
to make the sum come out is precisely the guess this project refuses. They stay `incomplete`.
Malzahar R additionally carries two components with the same label — the duplicate-id defect of
§23 — so its clean ratio of 10 cannot be attributed to either.

**Effect on the roster: `incomplete` 190 → 225, `derived` 541 → 506.** Thirty-five entries that
read `derived` while failing to reconcile with their own source now say so.

---

## 34. Two measurements before the fan-out (2026-08-13)

### 34.1 The summary filter, measured then widened

**DEF EXTRA ROWS:** damage rows kept under the old `^total` anchor that a match on `total`
ANYWHERE in the label would drop. **DEF SILENTLY ZEROED:** an ability keeping ≥1 damage row under
the narrow match and none under the wide one.

| Figure | Count |
|---|---:|
| extra rows dropped | **4** |
| abilities silently zeroed | **0** |

The four labels, all summaries by inspection: `Maximum Mixed Total Damage with and` (Gangplank R),
`Second Cast Total Damage` and `Third Cast Total Damage` (Gwen R), `Slash Total Physical Damage`.

**Widened**, and `droppedEveryDamageRow` remains the backstop for a future patch introducing a
label this reads wrongly. Gate 7's over-sums fell from 18 to 16.

**MY MEASUREMENT DEFINITION WAS TOO NARROW, AND I FOUND OUT AFTER APPLYING IT.** "Silently zeroed"
counts an ability losing *every* row. It does not count one losing *some*. **Gwen R lost its second
and third casts**, because those two summary rows were the only representation of them — the
ability went from over-summing (300 against 270) to under-summing (60 against 270). Nothing wrong
is now shown: gate 7 flags it either way and the entry is `incomplete` either way, and a double
count is the worse of the two failures. But the honest record is that the change was made on a
measurement that could not see this, and **the definition a future widening should use is "an
ability whose stored component count falls at all", not "falls to zero".**

### 34.2 The one-at-full-N-reduced shape: 5, below the threshold

**DEF:** an ability storing a per-hit component that ADDS alongside a per-hit component marked
`alternativeTo` whose label reads as its reduced form. The ability lands once at full damage and
repeatedly at a lesser rate; `alternativeTo` can only say "instead of", so no hit count reconciles it.

**5 abilities:** Kai'Sa Q · Xayah Q · Yuumi R · Zac R · Aurelion Sol Q.

And one of those five is not really this shape: **Aurelion Sol Q**'s reduced rows are *secondary
target* damage, a different target rather than a later hit on the same one. **So the true
population is 4.**

**Below the threshold of fifteen that governed the multiplier decision (§17), so no contract change
is proposed.** The four stay `incomplete`, flagged by gate 7, contributing no damage — which is the
promise working rather than failing. If a future patch pushes this shape past fifteen the proposal
is straightforward and is written down here so it need not be rediscovered: give `ComponentRelation`
an arm `{ kind: 'alternativeTo'; componentId: string; alsoLands?: number }`, meaning the component
replaces the named one on its first application and lands `alsoLands` further times at its own
value. That is additive to the contract and absent by default, exactly as `multipliers` was.

---

## 35. The npm audit findings, and why none of them ships (2026-08-13)

`npm audit` reports **5 vulnerabilities — 3 moderate, 1 high, 1 critical**. This section exists so
that result does not have to be re-derived every time someone runs the command. It records what
each one is, and the reasoning that separates *local development exposure* from *shipped
exposure*. That distinction is the whole answer here, so it is stated before the table.

### The reasoning: what actually reaches a visitor

This product is a **static site**. `npm run build` runs the bundler once on a developer's machine
and emits a fixed set of files; a visitor's browser downloads those files and nothing else. There
is no server-side execution, no API route, no runtime dependency resolution (SPECIFICATION §1,
§13, §14).

Three consequences follow, and they are what make the audit result benign:

1. **A build tool is not a shipped artefact.** Vite and esbuild *produce* `dist/`; they are not
   *in* it. A defect in the machine that prints a page is not a defect in the page.
2. **A test runner never touches the artefact at all.** Vitest, `vite-node` and `@vitest/mocker`
   run only when someone runs the suite.
3. **The claim was verified, not assumed.** Measured 2026-08-13: `npx vite build` emits
   `dist/index.html` (0.42 kB), one CSS file (1.53 kB) and one JS file (145.10 kB), plus the
   champion/item/rune JSON. Searching every file in `dist/` for `jsdom`, `testing-library`,
   `vitest` and `@vitest` returns **no matches**. **DEFINITION: "ships to a user" means the string
   appears in a file under `dist/` after a production build.** Anything else is developer tooling.

### The five, as reported

| Package | Version | Severity | What it is | Ships? |
|---|---|---|---|---|
| **vitest** | 2.1.9 (dev) | **critical** | Arbitrary file read and execution **when the Vitest UI server is listening** | No |
| **vite** | 5.4.21 (dev) | **high** | Path traversal in optimised-deps `.map` handling · `launch-editor` NTLMv2 hash disclosure via Windows UNC paths · `server.fs.deny` bypass via Windows alternate paths | No |
| **esbuild** | 0.21.5 (dev) | moderate | Any website can send requests to the **dev server** and read the response | No |
| **vite-node** | 2.1.9 (dev) | moderate | Inherited from vite | No |
| **@vitest/mocker** | 2.1.9 (dev) | moderate | Inherited from vite | No |

All five are `"dev": true` in `package-lock.json`, confirmed by reading the lockfile rather than
by inspecting `package.json` alone.

### Three specifics worth recording, because each narrows the exposure further

- **The critical one cannot currently trigger.** It requires the Vitest **UI** server to be
  listening. That UI is a separate package, `@vitest/ui`, and it is **not installed** — the
  contents of `node_modules/@vitest/` are `expect`, `mocker`, `pretty-format`, `runner`,
  `snapshot`, `spy`, `utils` and nothing else. The project's test scripts are `vitest run` and
  `vitest`, neither of which starts a server.
- **Two of the three vite advisories are Windows-only** (UNC paths, Windows alternate paths).
  Development is on Linux (CLAUDE.md, "The machine this is built on").
- **The remaining two concern `npm run dev`.** `vite.config.ts` sets no `server.host`, so the dev
  server binds to localhost. Exploiting either requires visiting a hostile website *while* the dev
  server is running on the same machine.

### None of this arrived with the test dependencies

`jsdom` 30.0.1, `@testing-library/react` 16.3.2 and `@testing-library/dom` 10.4.1 were added on
2026-08-13 to make it possible to test that a rendered damage value announces "214 physical
damage" to a screen reader (SPECIFICATION §10.1, DESIGN.md §8). **They carry none of the five.**
Every advisory sits in vite, vitest, or a package one of those two pulls in — all of which
predate that install.

### The decision taken, and why

**No action today.** Both fixes are **semver-major**: `vite` 5 → 8 and `vitest` 2 → 4. That is a
toolchain replacement, not a patch. Applying it during a five-way parallel fan-out would
invalidate work in flight and make every subsequent test failure ambiguous between "an agent
broke it" and "the upgrade broke it".

**Scheduled as its own piece of work once the fan-out has reported, with the full suite as the
acceptance criterion** — the suite stood at **471 passed, 1 failed, of 472 across 24 files** at the
time of this decision, so there is a real before-and-after to compare against rather than a guess.

`npm audit fix --force` was **not** run and must not be: `--force` is what performs the major
upgrade silently, which is precisely the change being deliberately deferred.

### What would change this assessment

Any one of these makes the finding above stale, and it should be re-derived rather than re-quoted:

- `@vitest/ui` is installed (re-opens the critical finding's precondition).
- `vite.config.ts` gains a `server.host` that binds beyond localhost.
- The product stops being a static site — any server-side rendering or runtime bundling moves a
  build tool into the shipped path.
- A future advisory lands in `react` or `react-dom`, which **are** runtime dependencies and would
  ship.

---

## 36. The parallel fan-out: what five concurrent areas measured (2026-08-13)

Five areas ran concurrently — data pipeline, harvest, engine, interface, URL encoder. Each carried
two standing instructions: **a defect becomes a mechanical check run over the whole population, not
a fix to the entry that surfaced it**, and **a count without a definition is not a count**. This
section records the harvest measurements. §37 records the effect census.

### 36.1 The state, re-measured from code run today

Method: all 1,071 ability-template names fetched once and cached, the harvester run over the cache
offline reproducing the batch runner's ordering and alias dedupe, then the network round-trips over
all 937 pages. Nothing below is quoted from a document.

| Figure | Count | Definition |
|---|---:|---|
| distinct ability pages | **937** | after alias dedupe — reproduces §19 exactly |
| storable | 623 | ≥1 stored damage component |
| worklist | 69 | stored nothing, a source says it damages |
| `no-damage` | 206 | stored nothing, every source silent |
| **damage components stored** | **917** | **not 921** — see below |
| verified / derived / incomplete / no-damage | **8 / 487 / 236 / 206** | before the repair in §36.2 |

Gate 2 ability box: **799 of 839 rows matched, 40 failed** across 37 entries, 0 render failures.
Gate 2 level series: **36 of 36 matched**. Gate 7 ran on 623 entries; **47 do not reconcile**, split
**35 under / 12 over**. That figure moved twice on 2026-08-13, both times because the gate got more
precise: 51 → 53 with the relation fix (§36.3), then 53 → 47 once variable-hit abilities reconciled
at the ceiling the source states (§38.4).

**917, not 921.** The four are the summary rows §34.1's widened filter drops: Gangplank R's
"Maximum Mixed Total Damage with and", Gwen R's second and third cast totals, Xin Zhao W's "Slash
Total Physical Damage". 921 was measured before that change landed.

**Gate 7's split is 35 under / 16 over, not 33 / 18.** §34.1 restated the over-sums and never
restated the under-sums. Two entries changed direction rather than disappearing; the total is 51
either way.

**Gate 7 compares only at rank 1**, and that was checked rather than assumed: re-run at every rank,
**0 entries** pass at rank 1 and disagree later. The shortcut costs nothing on today's data. It is
still a hole a future patch could fall through.

### 36.2 A check the documents credited that the pipeline never ran

**The batch runner imported `roundTrip` and `roundTripLevelScaled`. It did not import
`roundTripProse`** — the third round-trip of §28, which exists, is exported from `harvest.ts`, and
has passing tests. It had never been invoked.

The evidence §28 describes is real: run by hand over the 52 abilities carrying prose components,
**56 components checked, 56 matched, 0 disagreeing** — reproducing §28 exactly. **The documents
were right about the evidence and wrong about the pipeline.** 26 abilities were recorded as
confirmed on a check the shipped runner did not perform.

| Figure | As the runner ran | With the third round-trip wired in |
|---|---:|---:|
| confirmed by gate 2 | 558 | **584** |
| no gate-2 evidence either way | 28 | **2** |
| `verified` | 8 | **10** |

The two entries that could not reach `verified` were **Aphelios Q Moonshot** and **Ambessa P**: the
promotion rule requires gate-2 agreement, and their only evidence was the round-trip that never ran.

**WIRED IN AND CONFIRMED BY A FULL 937-PAGE RUN, 2026-08-13.** Measured, not predicted: 173
champions, 937 ability entries, 917 components. Of 623 storable entries, **584 confirmed by gate 2**
against 558 without the prose round-trip — **26 entries newly confirmed**, the prose round-trip
running on 52 abilities. **No gate-2 evidence either way: 2**, down from 28. **`verified`: 10**, the
runner reporting "10 promoted". Verification across all 937: **10 verified / 485 derived / 236
incomplete / 206 no-damage**. Gate 1: 919 pass, 18 fail. Gate 2 ability box: 839 rows checked, 799
matched, 40 failed. Gate 2 level series: 36 of 36. Gate 6 status-honesty: 937 of 937.

It costs no extra network traffic — `renderAbilityDetail` returns the leveling rows and the
rendered description from the same fetch gate 2 already made.

Why it was never wired in could not be established. The code and its tests are complete and
passing, so it reads as an omission rather than a decision, and no document says either way.

### 36.3 Gate 7's comment described behaviour gate 7 did not have

`harvest.ts` read: *"Only `adds` components are summed, since an alternative replaces rather than
joins."* **It did not.** Gate 7 ran before `proposeRelations`, the ability-wide pairing step. At the
moment gate 7 summed, a row the pairing step would later mark `alternativeTo` still had no relation
set, and the filter let it through.

**Population: 88 entries carry 112 `alternativeTo` components; 14 also have a whole-ability total;
12 of the 51 failures are affected, and 4 are reported in the WRONG DIRECTION** — Briar E,
Renekton E, Rumble E and Taliyah Q are labelled over-sums when they are under-sums.

**The fix was measured before it was proposed: 51 failures (35 under / 16 over) → 53 (41 under / 12
over).** It reconciles **zero** entries and surfaces two new ones (Lulu Q Glitterlance, Zaahen W
Dreaded Return).

> **THE COUNT RISING FROM 51 TO 53 IS THE SYSTEM WORKING, NOT A REGRESSION.** Read it against the
> definition, never against yesterday's number: gate 7 now compares what it always claimed to
> compare, and the four wrong direction labels are the reason to do it. A future session comparing
> 53 against 51 and concluding something broke would draw exactly the wrong lesson. This is
> CLAUDE.md's "a falling count is usually the system working", in the other direction.

### 36.4 The 51 gate-7 failures, classified

Each class has a definition, a detector that runs offline over all 937 pages, and a measured
population. The 51 partition cleanly. Detectors live in `scripts/extract/gate7-classes.ts`.

| Class | Entries | Definition |
|---|---:|---|
| **U-MULT1** | **26** | Under-sum. Exactly one additive component; the stated total is the same whole number ≥2 times it at **every** rank. A missing multiplicity |
| **RESIDUE** | **11** | No mechanical class fits. Needs a person |
| **MULTIPLE-TOTALS** | **9** | The source prints more than one qualifying whole-ability total and gate 7 compared against the first. Which is the whole ability is not decidable from the labels |
| **O-SCOPE** | **5** | Over-sum. The stated "Total" equals one repeating component × its hit count exactly at every rank — the total's scope is that component, and the label does not say so |
| **U-MULT2** | **2** | Under-sum. Several components; removing one and dividing the remainder yields a consistent whole number ≥2 |
| **O-PAIR** | **0** | Over-sum. A "Maximum X" whose sibling carries no "Minimum". Zero today; the detector stays because the shape recurs |

**11 of the 53 are AMBIGUOUS** — the arithmetic admits more than one reading, so no rule may settle
them and they stay `incomplete`.

> **THESE POPULATIONS ARE NOT THE ONES THE FIRST CLASSIFICATION PRODUCED, and the difference is
> instructive rather than a correction.** That pass, run in a scratchpad before the relation fix,
> gave U-MULT1 20, U-MULT2 11, O-SCOPE 8, O-PAIR 1 and residue 11 over 51 failures. Two things
> moved them, both deliberate:
>
> 1. **Gate 7 now honours relations (§36.3)**, so the failure set itself changed — 53 entries, not
>    the same 51.
> 2. **MULTIPLE-TOTALS is tested FIRST**, and it absorbs 9 entries the earlier pass distributed
>    among the other classes. That ordering is correct: when the source prints several qualifying
>    totals, gate 7 compared against an arbitrary one, and every other class would then be
>    reasoning about the wrong number. Nine entries that looked like under-sums or scope
>    mismatches were really "we compared the wrong total".
>
> U-MULT2 falling from 11 to 2 is the same effect: most of what it had claimed were entries whose
> total was the wrong total to begin with. **Compare each figure against its definition, never
> against the earlier pass's number for the same name.**

**U-MULT1's cause is precise:** the hit-count derivation of §30 only runs on a component whose
*label* marks it repeating ("per Tick", "per Wave"). An ability landing twice under a plain
"Physical Damage" label never reaches it. Four members were corroborated against the source's own
prose rather than trusting the arithmetic: Riven Q *"can activate Broken Wings three times"* (×3),
Aatrox W *"the target is dealt the same physical damage again"* (×2), Sett Q *"empowers his next
two basic attacks"* (×2), Ornn R *"deals the same damage"* (×2).

**U-MULT2 IS A DETECTOR, NOT A FIX.** It flags coincidences — Briar E "solves" at ×40 on a 2-damage
term. Worse, **4 entries admit two readings that both reconcile at every rank**: Ziggs E is either
one mine landing 5× at full damage, or one full mine plus 10 reduced ones. Also Nautilus E,
Xayah Q, Yuumi R. They sit on §34.2's one-at-full-N-reduced shape, which the contract cannot
express. **No mechanical rule can settle them. A person must read the ability.** Recorded as
unresolved; not to be guessed.

**A further roster-wide detector: 16 ability pages print more than one qualifying whole-ability
total, and gate 7 arbitrarily takes the first** — which on Hwei R, Nilah R and Nunu E is the narrow
damage-over-time total while the broader "Maximum Total …" row sits further down. **9 of the 16
currently fail gate 7.**

---

## 37. The item and rune effect census (2026-08-13)

The first measurement of the item and rune effect population. **A census, not a harvest** — no
effect value was written and nothing was marked `verified`. It supersedes §16's item and rune rows.

### 37.1 The population, and the per-field sourcing

**The two halves of an effect come from different sources**, established per-field rather than
inherited (§12's rule applied):

- **Which items exist** — Data Dragon `item.json`, the §5 filter. **209** distinct items, funnel
  reproduced exactly: 868 → 316 → 254 → 248 → 212 → 209.
- **Item effect prose** — the wiki's `Module:ItemData/data`, joined by numeric id. All 209 matched.
  **Data Dragon's own `description` is display HTML and its wording has already drifted**: Data
  Dragon says Black Cleaver reduces "the target's Armor by 6%", the wiki says "6% armor reduction"
  naming nobody. §16's ownership rule is built on the wiki's wording, so the wiki governs here.
- **Rune prose** — Data Dragon `runesReforged.json` `longDesc`, 62 runes. There is no wiki module.
- **Stat shards** — excluded. They appear in no source (§7) and are not to be invented.

**291 effect entries: 229 item + 62 rune.** 157 of 209 items carry an `effects` block; **52 are
pure-stat items with no passive at all**. **DEFINITION: one effect is one keyed entry**
(`pass`/`pass2`/`pass3`/`act`/`consume`), with `description2` folded in as a rider clause rather
than counted as a second effect.

### 37.2 How much this engine has to model

| | Count | Definition |
|---|---:|---|
| **In scope** | **168 of 291** | deals damage, or modifies a stat that can change a damage number or the survival verdict |
| — deal damage | **81** | 66 item, 15 rune |
| — modify a damage-relevant stat only | **87** | 60 conditional, 27 always-active |
| Out of scope | 123 | wards, gold, movement speed, haste, tenacity, vision, cosmetics |
| Conditional, whole population | 222 | **76 of the 81 damaging effects are conditional** |

Movement speed, attack speed, ability haste, cooldowns and tenacity are filtered out of
"damage-relevant" because **the engine models sequence, not elapsed time** (SPECIFICATION §3.2). A
broader "modifies any stat" count of **169** is reported alongside so that judgement stays visible
rather than baked in.

**Machine-readable versus needs-a-person**, using §26.3's split: of the 81 damaging effects, **63
state their value structurally and 18 need a person to read the sentence once** — 22%, against the
41% §26.3 measured for abilities. **Item prose is better than PLAN.md §3 assumed, not worse.**

All 40 sentences the classifier could not decide were hand-read. 18 deal damage; 22 do not, and
they fail one recognisable way: **the damage is the trigger, not the payload**. "Dealing physical
damage to enemy champions inflicts Grievous Wounds" is five items that deal nothing.

### 37.3 Whose stat — the measurement that replaces §16's 85

Counting rule stated in §16's correction box and implemented in `scripts/fetch/effect-census.ts`.

| | Refs | Holder | Other champion | **Not stated** |
|---|---:|---:|---:|---:|
| Items, health pools | 55 | 10 | 10 | **35** |
| Items, armor/MR/mana | 37 | 2 | 1 | **34** |
| Runes, health pools | 17 | 9 | 0 | **8** |
| Runes, armor/MR/mana | 11 | 6 | 0 | **5** |
| **Total** | **120** | 27 | 11 | **82** |

**56 distinct effects carry at least one stat the source never attributes** — 47 items, 9 runes.
**These are `unresolvable`, not a worklist** (SPECIFICATION §8). The clusters: the mana-stacking
family (Archangel's Staff, Manamune, Winter's Approach, Tear of the Goddess, Rod of Ages), the burn
family (Sunfire Aegis, Hollow Radiance, Heartsteel, Titanic Hydra, Warmog's, Hullbreaker), the
shred family (Black Cleaver `armor`, Bloodletter's Curse `magic resistance`), and four runes
(Conditioning, Unflinching, Overgrowth, Demolish).

**22 of the 82 unstated have a verb that implies the holder** ("gain +8 Armor"). **They were counted
and deliberately NOT resolved** — that is the same convention argument §16 rejected for abilities,
and Black Cleaver proves the convention can read backwards. **3** were resolved only by a possessive
governing a coordinated pair ("increase **your** Armor and Magic Resist"), which is grammar rather
than convention, and are flagged separately so the decision stays visible.

**The permanent-incompleteness share is far higher here than for abilities: 56 of 291 effects,
against 23 of 937 ability pages.**

### 37.4 Seven defects, each swept over all 291

Each was found by auditing the census's own output and became a rule over the whole population:

1. **A damage trigger read as a damage instance** — 20 of the first run's 85. A run naming a damage
   type with no value attached is never an instance.
2. **Shield and heal wording tested flatly over a sentence** — cost 4 real damage instances
   (Redemption, Eclipse, Malignance, Sundered Sky), because one sentence can heal an ally *and*
   damage an enemy. Now positional: whichever verb is nearer the number governs it.
3. **Excluding "critical strike" as non-damage** — deleted Essence Reaver, whose payload is physical
   damage and whose *ratio* merely mentions crit chance.
4. **Compound stat names counted as the ten stats** — "bonus health regeneration", "armor
   penetration": 6 references that are different stats entirely.
5. **A gerund read as a trigger wherever it appeared** — cost Scorch and Summon Aery, whose damage
   verb is mid-clause. Position, not the word.
6. **A rune label merely mentioning damage** — "Cooldown for damage restoration: 8s" handed
   Presence of Mind, a mana rune, an 8-point damage instance.
7. **The pronoun "its" treated as the holder** — World Atlas's "a minion below 30% of its maximum
   health" is neither champion.

### 37.5 Facts no source states, and two out of scope

- **Three runes state a value the source does not contain**: `@f3@` (Unsealed Spellbook),
  `@HealAmount@` (Absorb Life), `@BaseHeal@` (Font of Life) — unresolved Data Dragon placeholders.
  The source does not state it; that is a result, not a gap.
- **Two item effects are cross-reference stubs**: Armored Advance → Plated Steelcaps, Immortal Path
  → Gluttonous Greaves. The fact is stated, on another page.
- **Two damaging effects are out of champion-versus-champion scope**: Demolish (towers only) and
  Umbral Glaive `pass2` (wards only) — **corrected 2026-08-13: this said `pass3`, which is wrong.**
  In the live module `pass2` (Blackout) is the wards-only effect and `pass3` (Nightstalker) damages
  CHAMPIONS. Two independent sweeps over all 291 effects agree: `pass2` is the entry naming a
  non-champion target, `pass3` is the entry mentioning lethality. A wrong key here would have
  excluded a real champion-damaging effect and kept a wards-only one.

The census is `public/data/effect-census.json`, carrying its provenance, every definition in full,
per-effect rows, and the recorded hand audit.

---

## 38. Hit count is sometimes a property of the SITUATION, not the ability (2026-08-13)

### 38.1 Where this came from

Gate 7 could not reconcile four abilities because two readings both fitted the arithmetic (§36.4,
U-MULT2). The project owner, who plays the game, resolved them — recorded as testimony in
`verification/owner-testimony.json`, **not** as a source citation. Three of the four contradict the
wiki outright and are unresolved. But the fourth answer generalised into something larger than the
four: **for some abilities no fixed hit count exists to store, because the count depends on where
the target stands and whether they stay there.**

Yuumi R lands between one and five waves depending on whether the target remains in them. Ziggs E
depends on how many mines are contacted. Zac R depends on how many bounces catch the same champion.
**Storing any single number for these is a guess dressed as data**, which is the failure this
project exists to prevent.

### 38.2 The measurement — definitions first

Scanned: **937 of 937 ability pages, complete**, over the `description`/`blurb` prose fields, one
sentence at a time. An earlier run of the same scan reported over **759** pages because its fetch
errors were caught and skipped silently; it is recorded here because "silence is not success"
applies to measurement code as much as to the product.

| Class | Definition |
|---|---|
| **P1 SAME-TARGET REPEAT** | The source says ONE champion can be damaged more than once by a single cast, and states what the repeats deal ("subsequent waves against enemies hit", "against the same target", "from subsequent mines"). **The count is not fixed by the ability.** |
| **P2 SECONDARY TARGET** | The source says targets OTHER than the first take a different amount ("targets beyond the first"). A different champion, not a later hit. **NOT a variable hit count**, and reads almost identically in wikitext — conflating the two is what put Xayah Q in the wrong class. |
| **UNREAD** | Carries a `Reduced` leveling row whose prose this scan could not classify either way. Needs a person. |

| Figure | Count |
|---|---:|
| mechanical P1 candidates | **21** |
| — **confirmed same-target repeat, after reading all 21** | **12** |
| — actually P2, secondary target | 5 |
| — false positives | 4 |
| P2 by the scan | **18** |
| **UNREAD — a `Reduced` row the scan could not classify** | **27** |

> **THE 27 WERE READ ON 2026-08-13. THE POPULATION IS 17, NOT A RANGE.** Five of the 27 are
> genuine same-target repeats and join the 12: **Gnar Q** (the boomerang returns and can hit the
> same champion at reduced damage), **Jhin E** (a target struck by another Lotus Trap within one
> second), **Kai'Sa Q** ("Non-minions take X% damage from missiles beyond their first"), **Lulu Q**
> ("Enemies take reduced damage from a second bolt"), and **Master Yi Q** ("can mark the same
> enemies again").
>
> Of the other 22: **3 are secondary-target** (Caitlyn Q, Graves R, Qiyana Q Elemental Wrath),
> **18 are not repeats at all** (healing reductions, blade-versus-handle alternatives, positional
> alternatives like Ziggs R's epicentre, and rows about non-champion targets), and **1 is excluded
> by the engine's own boundary** — Garen E spins a number of times derived from attack speed, and
> SPECIFICATION §3.2 states there are no attack-speed-derived attack counts. That exclusion is a
> scope decision, not a gap.
>
> **Kai'Sa Q therefore joins the population**, which settles the last open member of §34.2's shape.

**The confirmed 12:** Aurora Q · Heimerdinger W (Micro-Rockets) · Heimerdinger W (Rocket Swarm) ·
Kled Q · Nautilus E · Shyvana E · Smolder W · Swain Q · Taliyah Q · Yuumi R · Zac R · Ziggs E.

**The 5 that are really secondary-target** — Orianna Q, Pantheon Q, Qiyana Q, Zed Q, Vladimir R —
all say "beyond the first" about *targets*, where the confirmed 12 say it about *waves, mines,
rockets, pellets, bounces or explosions*. That one-word difference is the whole distinction.

**The 4 false positives** were Aatrox Q (subsequent *casts* gaining damage — separate combo steps),
Senna P (mark consumption), Lillia P (a damage-over-time duration) and Nami W (bounces between
different units). The dominant false-positive source before refinement was **"refreshing on
subsequent hits"**, which is a stack timer, not a damage instance: it accounted for 42 of the 75
raw matches.

**Kai'Sa Q is in the UNREAD 27**, so §34.2's "one at full plus N reduced" population remains
unknown rather than 4 — see `verification/owner-testimony.json`.

### 38.3 A second shape exists, and it is not the same one

The confirmed 12 are all *first instance full, subsequent instances at a stated fraction*. **Xayah
Q is a different shape**: two feathers, each dealing FULL damage to a champion they hit, and the
count against one champion is 0, 1 or 2 depending on positioning — with no reduction at all. Its
"Reduced Damage per Hit" row is about other targets (P2). Any model has to carry both shapes, or it
will force one into the other.

**Shape B's population is NOT measured by this scan and is at least 1.** The scan keys on a
*reduction* being stated, and shape B states none — nothing in Xayah Q's prose distinguishes "two
feathers, each full" from "one instance" by the patterns used here. Xayah Q was found only because
it happens to carry a reduced row about *other* targets. **The method to measure it is written down
so it need not be rediscovered:** find abilities with a per-instance row and a whole-ability total
that is an exact integer multiple >1 of it, carrying NO reduced row, and read the prose of each.

### 38.4 Built 2026-08-13 — the shape, the default, and gate 7

**The contract.** `AbilityComponent.variableHits` carries `VariableHitCount`, in two arms:
`repeatsAtReducedRate` (rate + `maxAdditional`) and `repeatsAtFullRate` (`maxInstances`). Both
quote the sentence the ceiling rests on. `hits` and `variableHits` are **mutually exclusive** and
gate 1 refuses an entry setting both — a fixed count beside a variable one is two answers to one
question. The count itself arrives from `ComboStep.hitCounts`, keyed by component id, exactly as
entry state does.

**Neither the rate nor the ceiling is guessed.** Both are derived from three numbers the wiki
prints. Ziggs E: full 30, `Reduced Damage per Mine` 12, `Maximum Total Magic Damage` 150 →
rate = 12/30 = 0.4, and additional = (150/30 − 1) / 0.4 = **10**. If any of the three is missing,
or the division does not land on a whole number, **nothing is stored** and the entry raises
`variable-hit-count` saying why.

**THE DEFAULT IS THE MINIMUM AND MAY NOT BE RAISED: one full instance, zero repeats.** It is the
only count true whenever the ability connects at all. A default of "as many as possible" would
inflate a Ziggs E result fivefold and look exactly like a correct answer. The cost is named rather
than hidden: a minimum default understates "does my combo kill", which is why the interface makes
the control prominent and prints the ceiling beside it instead of quietly assuming a larger number.
A test asserts the default is below the maximum on every shape.

**Gate 7 reconciles a variable-hit component AT ITS CEILING**, because the source's whole-ability
total *is* its statement of the maximum. Comparing a per-instance value against a maximum total was
the gate and the source describing different situations.

### 38.5 Shape B measured, and the third shape sized (2026-08-13)

**SHAPE B — DEFINITION.** The source prints a per-instance damage row AND a whole-ability total
that is an exact integer multiple N ≥ 2 of it, AND its prose does not state that a repeat against
the same champion is reduced. Scanned over 937 of 937 pages, complete.

| Figure | Count | |
|---|---:|---|
| mechanical candidates | **71** | |
| — labelled "per tick" / "per second" | 21 | damage over time. A separate line by SPECIFICATION §3.8 and outside the engine's no-elapsed-time boundary (§3.2) — a different question, not this one |
| — remaining candidates | **50** | all 50 sentences read |
| — **confirmed shape B** | **13** | |
| — not shape B | 37 | |

**The confirmed 13:** Ahri Q · Akshan Q · Diana W · Draven R · Gangplank R · Kayn Q · Nunu &
Willump E · Poppy E · Samira W · Sejuani W · Talon R · Xayah Q · Zoe W.

They share one structure: **one cast produces several instances that travel or land separately**,
so whether a given champion takes one, some or all of them is a matter of where they stand. An orb
that goes out and comes back (Ahri Q, Akshan Q, Draven R, Talon R); several projectiles or orbiting
spheres (Xayah Q, Nunu E ×3, Zoe W ×3, Diana W ×3); a bombardment over an area (Gangplank R); a
second instance conditional on the world (Poppy E deals its damage again only if the target hits
terrain).

**The 37 that are not** fall into three groups, none of them a variable count: the N instances are
**separate combo steps** the builder already models (Cho'Gath E, Nami E, Riven Q, Xin Zhao Q,
Sett Q, Skarner Q, Gwen R's recasts); the N instances **always apply together** within one cast
(Renekton W striking twice, Karma W's tether, Morgana R); or N is **derived from elapsed time**
(Miss Fortune R's channel, Samira R, Smolder E), which §3.2 puts outside the engine entirely.

**NONE OF THE 13 IS STORED YET.** They were triaged from prose read in stripped form, and the
detect-then-read rule (CLAUDE.md) requires the full sentence before a shape may be written. Adding
them means reading each at full text and entering it in `READ_POPULATION` — not widening a pattern.

### 38.6 The third shape — repeats that deal MORE. Population 2, below the threshold

**DEFINITION.** The prose states a repeat against the same champion AND says the repeat deals
bonus, increased or amplified damage. Neither modelled shape can express it: shape A cannot hold a
rate above 1 by construction, and shape B would store the repeats as equal and understate them.

**7 mechanical candidates, all read. 2 confirmed:**

- **Swain Q** — *"Subsequent bolts against an enemy deal 25% bonus damage."*
- **Kennen R** — *"gains 10% additional damage for each subsequent strike a target has received."*

The other five are the opposite or unrelated: **Azir Q** (*"Enemies hit by subsequent soldiers take
no additional damage"*) and **Kha'Zix W** (*"Multiple explosions do not deal additional damage
against the same target"*) both state there is NO repeat at all, which is useful and is the reverse
of what the detector was looking for; **Aatrox Q** is about subsequent *casts*, which are separate
combo steps; **Bel'Veth R** and **Senna P** are unrelated wordings.

**2 is far below the threshold of fifteen that governed the multiplier decision (§17) and the
one-at-full-N-reduced decision (§34.2), so NO third shape is proposed.** Both entries stay flagged
by `variable-hit-count` and contribute no damage — the promise working rather than failing. If a
future patch pushes this past fifteen, the shape is written down here so it need not be
rediscovered: an arm `{ kind: 'repeatsAtAmplifiedRate'; rate: number; maxAdditional: number }` with
`rate > 1`, resolved identically to shape A.

---

## 39. Item and rune effect VALUES — the first extraction (2026-08-13)

§37 censused 291 effects and extracted none. This is the first extraction, over the **63 effects
that state their damage value structurally** (§37.2).

**DEFINITION OF "EXTRACTED", and it is stricter than "the parser read it".** The number was
produced **twice, independently** — once by a parser walking the wiki's wikitext, once by a person
reading the item's own displayed sentence and recording it in `scripts/fetch/effect-values-read.ts`
— and stored only where the two agreed on the damage type, the flat base, every ratio in order, and
every ratio's owner. Any other outcome is a refusal. This is the detect-then-read rule (CLAUDE.md)
applied at the level of the individual value rather than the population.

| Figure | Count |
|---|---:|
| effects in the population | 291 |
| stating their value structurally | 63 |
| **extracted** | **28** (all items) |
| — complete (`derived`) | 27 |
| — `incomplete`, unresolved owner | 1 (Heartsteel) |
| **refused** | **35** |
| parser fired outside the read population | **0** |

**THE REFUSALS ARE NOT READING FAILURES. In 33 of the 35 the number is plainly stated and the
CONTRACT cannot hold it.** Only two are the source being silent (two runes state a range whose axis
is never named). Grouped: melee/ranged split 12 · damage over time 7 · non-champion target only 6 ·
other enemies only 5 · lethality or crit-chance scaling 4 · adaptive damage type 3 · range with no
stated axis 3 · retaliation 2 · stack-scaled 2 · conditional extra damage 2 · ally only 1.

**All five damaging runes refused**, for exactly two reasons — three deal "adaptive" damage, which
`DamageType` has no arm for, and two state an unaxised range. That is what §6 and §9 already
predicted: rune values must be hand-curated.

**A refusal that is a finding, not a gap.** Luden's Echo states `75 (+5% AP)` per target over four
targets. Storing that looks like the safe floor — but in a two-champion scenario there is no second
target, the leftover stacks fall back onto the primary, and it deals `150 (+10% AP)`. **The
"minimum" reading would have understated the common case twofold.** A conservative default is not
automatically an honest one.

### 39.1 Data Dragon corroborates only 7 of the 28, and that is reported as absence

Data Dragon's item descriptions no longer carry passive numbers — Wit's End reads "Attacks deal
bonus magic damage" with no figure anywhere. **7 effects have every number independently restated;
21 have no second source at all.** That is recorded as absence, never as agreement. It also makes
§5's Infinity Edge example stale: its 30% critical damage is now a structured stat rather than
description text.

### 39.2 THE OTHER SOURCE DOES ATTRIBUTE 7 OWNERS THE WIKI LEAVES SILENT — a decision, not a fix

§37.3's "82 unattributed references" was measured **over the wiki module alone**. Data Dragon's own
prose attributes **7 of the 69 unstated item references, across 5 effects** — including two §37.3
calls permanently unresolvable: **Black Cleaver** ("the target's Armor") and **Bloodletter's
Curse** ("their Magic Resist"), plus Heartsteel ("your max Health"), Overlord's Bloodmail and
Riftmaker.

~~**Nothing was acted on.** Heartsteel still ships `owner: 'unresolved'`.~~ **ADOPTED in §41.1 and
APPLIED on 2026-08-13 — see §42.7.** Heartsteel's stored ratio now carries `owner: 'holder'` and the
entry reads `derived`. Whether a Data Dragon attribution outranks wiki silence was a SOURCE-POLICY
decision (§12, §15); it is measured and quoted in `public/data/effect-values.json`, and the rows
that reach a stored damage ratio are applied through a hand-read table rather than a rule.
~~**If it is adopted, the count of permanently unresolvable item effects falls and §37.3 must be
re-measured.**~~ **It did fall, and §41.1 re-measured it: 82 → 75 references, 56 → 52 effects.
Heartsteel is NOT among the four that left**, for the reason §42.7 sets out — a third reference in
its prose, the permanent bonus health it grants, is attributed by neither source.

---

## 40. The defensive kit census (2026-08-13)

The product models damage dealt and barely models damage received. SPECIFICATION §5 requires the
defender modelled in full and splits defensive effects by activation. This measures that population
over **all 937 ability pages**.

**SCAN COMPLETENESS, stated because a previous scan in this project silently covered 759 of 937:**
1,071 titles requested, 1,060 resolved, **0 fetch chunks failed**, 123 alias duplicates dropped,
**11 titles do not exist on the wiki and are listed by name rather than hidden**. Coverage: 937 of
937.

| Figure | Count | Definition |
|---|---:|---|
| candidate pages from the detector | **289** | prose matches a defensive pattern |
| **confirmed on reading** | **218** | a person read all 289 |
| rejected after reading | **71** | a **25% over-fire rate**, in line with the 24→17 precedent |
| including bonus-maximum-health grants | 226 | reported separately: they change the verdict rather than damage received |

**Candidate → confirmed by kind:** heals 142→121 · shields 84→67 · resistance grants 46→30 ·
immunity 54→**19** · damage reduction 63→**15** · execute thresholds 9→9 · type-specific reduction
2→**4** · spell shields 2→**3**. Two kinds GAINED on reading, because a person reclassified what the
pattern had mis-kinded — a confirmed count is not bounded by its candidate count.

### 40.1 The §5 split, and it needs a third bucket

**6 always-active · 210 conditional · 2 not-stated.**

Always-active means the source states no cast, no duration, no trigger, no stack count and no
precondition. The six that bake into the defender's resolved stat block: **Fizz P, Amumu E,
Aatrox E, Gwen P, Morgana P, Nasus P.** Everything else is a toggle.

~~**THE HEADLINE FOR THE INTERFACE: the defender panel needs on the order of 200 controls.**~~
**THAT CONCLUSION DOES NOT FOLLOW FROM THIS MEASUREMENT, and was corrected 2026-08-13 (§42).** The
210 is right and it is roster-wide. **A scenario has ONE defender.** DEFINITION: one toggle is one
conditional defensive ability of the chosen champion, measured over all 173 champions including
those with none. **Minimum 0 · median 1 · mean 1.23 · maximum 4** — 42 champions have none at all,
and the worst case is seven champions with four. The panel shows at most four rows. A roster-wide
total and a per-scenario count are different design problems, and only the second is real.

The two not-stated are not coin tosses. **Xin Zhao R** is invulnerable "against enemy champions far
away from him" — the source states the condition and it is a **distance**, which this engine models
nothing of. **Kayn P** is invulnerable only at his summoning platform, outside any combat sequence.

### 40.2 Value readability, and a third state §26.3 did not have

**103 reachable · 93 hard · 5 stated by reference · 17 with no value at all.** 53% reachable,
against the 41% §26.3 measured for ability damage.

"**Stated by reference**" is a state the ability-side split did not need: "heals for the same
amount", "equal to the health cost". The source states the value; it does not state a figure.
"**No value at all**" is a spell shield or an invulnerability — counting those as "hard" would have
overstated the reading burden.

**A rule corrected mid-measurement, with both readings reported:** a first rule stripped "for
&lt;number&gt;" as a duration and deleted "Heals Gwen for **67%**", reporting 23 effects as having
no value. Narrowed to strip only numbers carrying a time or distance unit, the figure is **17**.

### 40.3 Owners no source states

Two halves, never merged. **From leveling rows (exact): 10 references — 1 caster, 0 target, 9
UNRESOLVED.** From sentences (an upper bound, since a sentence can carry a stat from another
clause): 129 references — 64 caster, 17 target, 48 unresolved.

**24 confirmed defensive effects carry at least one stat the source attributes to nobody**, 4 of
them from a leveling row: Malphite W again, plus Rammus W, Braum W, Leona W, Sejuani P, Blitzcrank P
(`35% of maximum mana`) and eighteen others. `unresolvable`, not a worklist.

### 40.4 Five defects, each swept over all 937 pages

1. **`plainText` erases the evidence — 79 pages.** `wikitext.ts`'s `plainText()` deletes `{{…}}`
   blocks whole, and the wiki wraps almost every game term in `{{tip|…}}`. The first run found
   immunity on **1 page of 937** while `{{tip|untargetable}}` alone appears on 41. A flattener that
   unwraps rather than deletes took the candidate population from 162 to 289. **ANY FUTURE DETECTOR
   BUILT ON `plainText` IS BLIND TO THESE 79 PAGES.**
2. **"post-mitigation damage" read as a defensive effect — 15 pages.** The wiki's own tooltip for
   which damage figure a heal scales from. The largest single over-fire.
3. **"armor penetration" read as a resistance grant — 5 pages.** §37.4's item-side defect 4, in
   ability form.
4. **The dealt-side near-miss — 1 page.** Xayah Q's "Targets hit after the first take 50% reduced
   damage" is Xayah dealing less; Jax E's "take 25% reduced damage from all area of effect
   abilities" is Jax taking less. **The detector's dealt-side marker did not fire on Xayah** — the
   SUBJECT carries the meaning, not the verb phrase. A person caught it. Both are now tests.
5. **Untargetability read as damage immunity — 32 pages.** The source says untargetable and says
   **nothing about damage**. Not counted as immunity: inferring that it stops damage is inferring
   what the source declines to state. Counted and named in its own row instead.

### 40.5 Deliberately excluded, and counted so the exclusion is visible

Target resistance shred **10** (the engine's business — §3.6 fixes where reduction sits) · attacker
damage debuff **2** · target amplification **5** (attacker-side, engine-relevant) · shield
destruction **3** · untargetability-only **32** · health-pool properties **2** · "applies life
steal" **19**, distinct from the **4** that GRANT life steal or omnivamp.

The census is `build/proposed-curated/defensive-census.json`.

---

## 41. The contract pass — twelve gaps closed in one change (2026-08-13)

Four concurrent areas each hit the same wall: the work was no longer blocked on extracting values,
it was blocked on shapes the frozen contract could not express. Every one was RAISED rather than
worked around, which is the partition doing its job. This closed all twelve in a single pass with
no agents running.

| # | Gap | What it releases |
|---|---|---|
| 1 | `Scaling` gains a **`byRangeType`** arm — two values chosen by the holder's range type | **12 item effects** |
| 2 | `CuratedItemEffect.overTime` — an item effect whose damage recurs | **7 item effects** |
| 3 | `ReportedDamageType` gains **`'mixed'`**, and `InstanceResult.byType` carries the split | **13 abilities** |
| 4 | **`CuratedDefensiveEffect`** — kind, three activation buckets, an optional or by-reference value, an owner | the whole defender model, **218 effects** |
| 5 | `CuratedItemEffect.unresolvable` | the 52 permanent effects can say why |
| 6 | `CuratedItemEffect.appliesAs` — on-hit, Spellblade, active, … | **20 of the 28** extracted effects become sequenceable |
| 7 | `InstanceResult.afterPreMitigationReduction` | pre-mitigation flat reduction has an honest home |
| 8 | `StatBlock.penetration` | penetration stops being an argument beside the stat block |
| 9 | `StatBlock` base/bonus split on armor and magic resistance | percentage **bonus** armor penetration becomes modellable |
| 10 | `ReportedDamageType` gains **`'none'`** | a non-damaging instance stops being labelled `'true'` |
| 11 | **`ResistanceSteps`** — the four-step order, step by step | the burndown popover can show §3.6 instead of describing it |
| 12 | `CuratedFile.defensiveEffects` | the defender census has somewhere to land |

**Two design rules the additions carry, both learned from the measurements that motivated them:**

- **`byRangeType` is never defaulted.** `valueAt` throws when it meets one without a range type,
  because picking either arm understates half the roster. The range type is a fact the scenario
  knows and the data does not.
- **`'not-stated'` is a real activation, not a placeholder.** Two defensive effects state a
  condition this engine cannot represent — Xin Zhao R's is a DISTANCE, Kayn P's is a location
  outside combat. A two-way field would have forced them to be guessed.

### 41.1 The three decisions

**ROUNDING — the accurate total wins.** Rounded output is never fed back into arithmetic: the
burst total is rounded ONCE from the unrounded sum. Three instances of 150 / 166.67 / 187.5 display
as 150 / 167 / 188, whose column reads **505**, while the total is **504**. The alternative lets
rounding accumulate across a long combo and does not match the game, where damage applies unrounded
and only the display rounds. **CONSEQUENCE, BINDING ON THE INTERFACE: the per-instance column must
never be presented as something to add up. `runningTotal` is the authoritative figure and belongs
on every row.** Recorded on `InstanceResult.final`.

**REDUCTION ORDER — percentage before flat, and it is disclosed.** No source states the order. On
200 damage with a 25% and a 30-point reduction the two readings give **120** and **127.5** — 6%, not
a rounding artefact. The engine applies percentage first and **says so in `ENGINE_EXCLUSIONS`, which
is attached to every result**, so a user knows one ordering rests on a convention. To be settled by
cross-checking a public calculator (CLAUDE.md's third source), where a disagreement is a finding to
surface rather than reconcile.

**DATA DRAGON ATTRIBUTIONS — adopted.** Where Data Dragon's prose attributes a stat the wiki leaves
silent, that is a source STATING a fact, not an inference from convention. This does not weaken §16:
the rule remains that an owner is never inferred from a verb or a convention, and 22 references with
a holder-implying verb stay unresolved.

**§37.3 re-measured. DEFINITION: an effect is permanently unresolvable when at least one
owner-required stat reference in its prose is attributed by NEITHER source.**

| Figure | Before | After |
|---|---:|---:|
| unattributed owner references | 82 | **75** |
| effects carrying ≥1 | **56** | **52** |

**Four effects leave the permanently-unresolvable set** — Black Cleaver ("the target's Armor"),
Bloodletter's Curse ("their Magic Resist"), Overlord's Bloodmail and Riftmaker. **Heartsteel stays**
— but ~~Data Dragon attributes one of its stats and not the other, and an effect is permanently
incomplete if ANY of its owners is.~~ **the reason given here is wrong, corrected 2026-08-13 in
§42.7.** Data Dragon attributes BOTH of Heartsteel's `maxHP` references; the one it leaves silent is
a THIRD reference, `bonusHP`, in the clause granting permanent bonus health. So the conclusion holds
and the arithmetic behind it did not. **The consequence §41.1 missed: the effect-level question and
the entry-level question have different answers.** Heartsteel stays in the 52 by the definition
above, AND its stored damage entry is now `derived`, because the unattributed reference is in a
clause that entry does not model. The 75 / 52 figures are unchanged.

### 41.2 The composition bar was wrong for a reason worth recording

A 570/200/120 split rendered as three near-identical segments. **The grow factors were always
correct.** `flex-grow` distributes only FREE space, and with the default `flex-basis: auto` each
segment started at its own tag's width — which is about the same for P, M and T. Adding
`flex-basis: 0` makes the factors govern the whole width.

The values and the tags were right and the bar said something else, **which is worse than no bar**:
DESIGN.md §7 has the bar carry the split visually and the tags carry it definitively. Pinned by a
test that reads the declaration out of the stylesheet, because jsdom computes no layout and a width
assertion would have been theatre.

### 41.3 What now needs re-running

- **The full-roster batch**, to repopulate `verification/measurements.json` — no stored figure
  changed, but the harvester can now express shapes it previously refused, so the counts may move.
- **The item-value extraction.** ~~19 of the 35 refusals are releasable, taking the extracted set
  from 28 toward 47.~~ **THAT ESTIMATE WAS WRONG AND THE RUN DISPROVED IT. Only 10 were ever
  releasable, and 10 were released: 28 → 38, not 47.** Two things the estimate missed, both
  measured: the 12 range-split and 7 over-time refusals **overlap in one effect** (Bastionbreaker
  `pass2`), so they are 18 distinct effects rather than 19; and **8 of those 18 carry a second
  blocker the contract pass never touched** — five cleave items whose damage reaches only OTHER
  enemies and so can never touch the defender in a two-champion fight, two scaling on lethality,
  one wards-only. Adding a shape releases only the effects blocked by that shape ALONE, and
  counting refusal reasons without checking for overlap or a second blocker overstates it.
- **The defensive census**, which can now propose entries rather than only count them.
- **Nothing in the engine or the interface is invalidated.** 875 tests were green before this pass
  and are green after it; the additions are additive and every existing field kept its meaning.

---

## 42. Six outstanding decisions, taken (2026-08-13)

Each of these was raised by an area that hit it, deliberately NOT decided at the time, and left
for the lead. They are taken here in one pass, with no agent running — the interface contract is
changed only by the lead session (CLAUDE.md), and changing it while an area is live would move the
ground under that area mid-task.

Every decision below states what it RELEASES and what needs RE-RUNNING. Where a decision reverses
something this file already recorded, the old reading is kept and struck through rather than
deleted, because the reasoning that lost is the reason the decision is not relitigated.

**Measured after the pass: `npm run typecheck` clean; `npm test` 1,234 tests across 66 files, all
passing, against 1,204 across 66 before it.** The 30 new tests are named per decision below.

---

### 42.1 THE STACKS UNIT — percentage points, with no exception

**DECIDED: a `stacks` ratio's magnitude is PERCENTAGE POINTS OF THE STACK COUNT, exactly as every
other ratio. "+1 damage per stack" is stored as `100`, never as `1`.**

Taken now, before any data exists, which is the whole reason it was worth taking: nothing has been
harvested onto `stacks` yet, so there is no migration cost either way and the decision is purely
about which rule is easier to state, check and remember. Left undecided, the first harvester to
write one would have picked a unit by accident, and a hundredfold error on every stacking ability
is not a near miss — a 300-stack Nasus would contribute 3 damage instead of 300.

**Why the uniform rule won.** A stack counter is the one `RatioStat` whose stat has no unit of its
own — 200 ability power is a quantity of ability power, but 25 stacks is a count — so "75% of it"
is a strange sentence, and the alternative (a `stacks`-only unit of damage-per-stack) reads more
naturally at the call site. It lost on three grounds:

1. **One rule with no per-stat exception.** A `Ratio` on `stacks` looks exactly like a `Ratio` on
   `AP`; an exception invisible at the call site is one a reader must already know about.
2. **`RatioMultiplier.per100` would otherwise split.** A multiplier adds percentage points to its
   parent ratio. With a damage-per-stack parent, one field would carry two units depending on what
   it was attached to.
3. **The guard is cleaner in this direction.** Every legitimate percentage-points figure is well
   above 10 (half a point per stack is 50); a value below 10 cannot be legitimate and IS the
   signature of the other unit.

**THE COST IS NAMED RATHER THAN HIDDEN:** a curated entry reading `from: 100, to: 100` for "1 damage
per stack" is not self-evident to someone reading the file. That is why it is written on the
`Ratio` type, why the validator refuses the other unit, and why the refusal message names both
readings and prints the exact value to store instead.

**The guard.** `MIN_STACKS_RATIO_POINTS = 10` in `src/types/validate-curated.ts`. Gate 1 refuses a
`stacks` ratio whose magnitude is below it **at every rank or level** — "at every rank" and not "at
any rank", because a linear ratio may legitimately start small and grow, and refusing on the rank-1
value alone would reject real data.

**IT REFUSES; IT NEVER CONVERTS.** Multiplying by 100 would guess which unit the author meant, on a
number that reaches a user as damage. The entry fails gate 1, which forces it no better than
`incomplete` (§23) — a figure absent rather than wrong (SPECIFICATION §8).

- **Releases:** nothing today, and that is the point — it makes the first stacking ability
  harvested safe rather than a coin toss. `stacks` was measured at 1 row in the roster scan
  (`classify.ts`, shape S9).
- **Re-run:** nothing. No stored entry carries a `stacks` ratio.
- **Tests:** 7, in `validate-curated.test.ts` — the accepted 100, the refused 1, the Dark Harvest
  "5 per soul" shape, a legitimate 50, a rank-scaled ratio judged across every rank, a 1% AP ratio
  left alone, and one asserting the refused value is not silently converted in place.

---

### 42.2 A SUSTAIN FIELD ON RESULT

**DECIDED: `Result.sustain` carries all four §3.7 mechanics, split by which champion regains the
health; and `SurvivalVerdict.healingApplied` nets defender healing into BOTH verdicts.**

SPECIFICATION §3.7 requires lifesteal, omnivamp and spell vamp on the attacker and healing on the
defender. The engine modelled none of them and said so — *"a figure with nowhere to go is a figure
the user never sees"* — which was the right refusal and is now unnecessary.

**Two sides, never one number**, because they answer different questions. The attacker's sustain
changes whether the ATTACKER lives and can never change the survival verdict, which is about the
defender. The defender's healing changes the verdict directly.

**Healing is a TERM INSIDE both verdicts, not a third verdict.** §3.8 fixes the count at two —
burst alone, and burst plus DoT — so adding a third would contradict the spec. A defender who
healed 400 and whose verdict printed as though they had not is a **wrong** number, not an
incomplete one, so it is netted rather than dropped, and named on the verdict rather than folded
silently into a total. `remainingHp === max(0, defenderHp − damageApplied + healingApplied)` is a
test, and the burndown's `auditResult` checks it on every Result.

**A source is placed at the instance it arose from, and `fromInstance: null` is legitimate** — a
defensive heal is the defender's own kit rather than a response to a hit, and §3.2 gives the engine
no axis on which to place it between instances.

- **Releases:** the four mechanics stop being unmodellable. What is still absent is DATA: no
  curated item effect, rune or defensive entry states a sustain value, so the engine reports **zero
  from ZERO SOURCES** — an empty `sources` list is what distinguishes "nothing was computed" from
  "nothing was restored", and `ENGINE_EXCLUSIONS` says so in words on every result besides. §40.5
  counted **4 defensive effects that GRANT life steal or omnivamp**, distinct from the 19 that
  merely apply it, and §40 confirmed **121 heals**; those are the population that will fill it.
- **Re-run:** nothing yet. When sustain data lands, the engine's exclusion string for it must be
  removed in the same change, or the result will disclaim a mechanic it models.
- **Tests:** 2 in `combo.test.ts`, plus 2 new `auditResult` checks (`sustain-side-sum`,
  `verdict-healing`) that fire on any Result whose sustain totals disagree with the lines under
  them.

> **A GAP THIS DECISION EXPOSED, NAMED RATHER THAN PAPERED OVER. THE BURNDOWN DOES NOT DRAW
> HEALING.** DESIGN.md §7 specifies the trace as remaining HP *falling* — grey plateaus, coloured
> risers dropping — and says nothing about a plateau that RISES. So a defender healing 90 makes the
> chart's last tread end at 30 while the verdict printed beside it reads 120: the same quantity said
> two ways, which §41.2 records as worse than not drawing it at all.
>
> It is NOT fixed here, and the canonical mock therefore carries **attacker-side sustain only**.
> Where a heal sits between two instances is a design decision DESIGN.md has not taken, and
> inventing one in the geometry would be the interface area deciding it. `DEFENDER_HEALS` in
> `src/ui/burndown/mock-variants.ts` carries the state so the gap is reproducible rather than
> theoretical, and so it is covered rather than smuggled into every component's baseline.

---

### 42.3 MANA ON THE STAT BLOCK, AND A BONUS-HEALTH FIGURE

**DECIDED: `StatBlock` gains `maxHpBase` / `maxHpBonus` (required, summing to `maxHp`) and
`mana` / `maxMana` (OPTIONAL, absent where the champion's resource is not mana).**

`RatioStat` has carried `bonusHP`, `maxMana` and `currentMana` since the contract was frozen, while
`StatBlock` carried no mana at all and no bonus-health figure, so the component evaluator refused
every such ratio by name. The refusal was honest and it was also a hole: the ability was
unmodellable rather than unmodelled.

**Bonus health is not derivable from `maxHp`.** It is maximum health minus the champion's own base
at that level, and the base figure is a per-champion, per-level fact a total does not carry. So the
split is exactly the one `armorBase`/`armorBonus` and `magicResistBase`/`magicResistBonus` already
have, for exactly the same reason. **It is a split of MAXIMUM health only:** a champion at 800 of
1850 has lost health, and which pool it came from is not a fact the game states.

**MANA IS OPTIONAL, AND THIS IS THE MEASUREMENT THAT SETTLED IT.** Read from
`Module:ChampionData/data` on 2026-08-13, over **all 175 champion entries** (175, not 173 — the
module carries `GnarBig` and a second Kled form as their own entries):

| Figure | Count |
|---|---:|
| entries carrying a `resource` field | **175 of 175** — none absent |
| distinct resource values | **15** — Mana, Energy, None, Fury, Health, Rage, Courage, Flow, Blood Well, Frenzy, Shield, Ferocity, Heat, Grit, Crimson Rush |
| `resource: "Mana"` | **145** |
| **entries stating a NON-MANA resource with a NON-ZERO `mp_base`** | **19** |
| entries stating `resource: "Mana"` with `mp_base` 0 | **0** |

**`mp_base` holds whatever the champion's resource is, not mana.** Shen's 400 is energy, Yone's 500
is flow, Rengar's 4 is ferocity, Rumble's 150 is heat. Reading the pool as mana would label 19
champions' resources as something they are not — and, worse, would let a `maxMana` ratio resolve
against energy. In the fetched roster of 173, **11 champions state `mp_base: 0`** (Aatrox, Bel'Veth,
Briar, Dr. Mundo, Garen, Katarina, Mordekaiser, Riven, Sett, Viego, Zac); a 0 there means "no pool",
and writing 0 into a mana field would claim an empty mana pool, which is a different fact and one
that resolves a mana ratio to 0 damage instead of refusing it.

So absent is a real state, the engine's named refusal survives for it, and the stat block panel
omits the mana row entirely rather than printing "Mana 0".

- **Releases:** **bonus-health ratios resolve now, end to end** — tested through the whole runner,
  not just the component evaluator. **Mana ratios resolve the moment a stat block carries mana**,
  also tested end to end.
- **What Ryze Q still waits on, named precisely:** ONE fetched field. `Champion` does not carry
  `resource`, so nothing can currently tell a mana pool from an energy pool. That is a data-pipeline
  change (`scripts/fetch/champions.ts` + a re-fetch of `public/data/champions.json`), deliberately
  NOT run inside a contract commit — re-fetching 173 champions against the live wiki could move base
  statistics, and a silent stat movement buried in a decisions commit is exactly the kind of change
  nobody would find later. **Ryze's own row is already confirmed: `resource: "Mana"`,
  `mp_base: 300`, `mp_lvl: 70`.**
- **Re-run:** the champion fetch, once `resource` is added, followed by a diff of
  `public/data/champions.json` restricted to that field.
- **Tests:** 3 in `combo.test.ts` (bonus health resolves; mana still refused when absent; mana
  resolves when present — the last two paired, because without the third the second would pass for
  an engine that refused every mana ratio unconditionally) and 3 in `StatBlockPanel.test.tsx` (the
  health split reaches the screen; no mana row for a champion with no pool; the row appears for one
  with a pool).

---

### 42.4 RUNNINGTOTAL CARRIES A PER-TYPE SPLIT

**DECIDED: `Result.runningTotal` is `DamageTotals[]`, not `number[]`.**

§41.1 made `runningTotal` the authoritative figure and put it on **every row** of the per-instance
table, because the rounded per-instance column must never be presented as something to add up. But
it is a SUM ACROSS DAMAGE TYPES, and DESIGN.md §8 permits exactly one untagged damage figure: *"a
multi-type aggregate total, which is bone with no tag and is instead broken down by the tagged
composition bar."* A bare number on every row is an untagged damage figure with **no bar beside
it** — the one form the hard rule does not allow, on the very figure the rounding decision had just
made most prominent. The interface area raised this and refused to invent the split, correctly: it
cannot be reconstructed from the rounded column without contradicting the authoritative number.

`DamageTotals` is reused rather than a new pair invented — it already means "a total and the three
types it is made of", so there is one shape and one invariant to test.

- **Releases:** the running-total cell now renders `AggregateTotal`, which **refuses to draw the
  untagged figure without the tagged bar** and throws if the two disagree. A row whose combo has so
  far touched one type falls back to an ordinary tagged value, because §8's exception is for a total
  that SPANS types. The same change was applied to the vertical slice's own running total, which had
  the identical bare-number cell.
- **Re-run:** nothing data-side. The burndown's `buildBurndownModel` now **reads** the split instead
  of re-deriving it — it used to re-accumulate from each instance's rounded `final`, making the
  chart a second source of truth for a figure the engine states, and re-summing the rounded column
  is precisely what §41.1 forbids. `auditResult` still compares the two, so a disagreement is
  reported rather than reconciled by whichever code path ran last.
- **Tests:** 2 in `combo.test.ts` (the split per point; every point sums to its own total) and 1 new
  `auditResult` check (`running-total-split-sum`).

> #### 42.4a A SEVENTH DECISION THIS ONE FORCED: a split now always sums to its own total
>
> **THE ENGINE AND THE INTERFACE HAD ENCODED OPPOSITE RULES FOR ONE FIGURE, and neither check had
> ever run over the other's output, so both suites passed.**
>
> - `combo-mixed.test.ts` asserted, deliberately and with reasoning, that a mixed instance reports
>   **1 / 67 / 1 against a total of 68** — three displayed figures adding to 69 — on the reading
>   that §41.1's "rounded output is never fed back into arithmetic" makes a split behave like the
>   per-instance column.
> - `AggregateTotal` in `src/ui/primitives` **throws** when a split disagrees with its total, with
>   the comment *"Fix the caller — do not relax this check."*
>
> Decision 42.4 forced the collision: the moment `runningTotal` carries a split rendered by
> `AggregateTotal`, a non-summing split crashes the page.
>
> **THE DISTINCTION THAT SETTLES IT: is the discrepancy FORCED by the rounding rule, or merely
> PERMITTED by it?** For the per-instance column it is forced — those are N+1 independently
> meaningful figures, and reconciling them would mean feeding rounded values back, which is the
> thing the rule exists to prevent. For a split it is not forced: largest-remainder apportionment
> (`roundSplit` in `rounding.ts`, the single rounding point) keeps the total as `roundDamage` of the
> UNROUNDED sum, so rounding still cannot accumulate across a combo, and every type still lands
> within one point of what it actually dealt.
>
> **THE COST IS NAMED:** in the worked case the 0.5 true damage now displays as 0 rather than 1, so
> a reader sees no true segment. That is the same loss every figure in this product takes at whole
> points, and it is smaller than a bar whose segments contradict the number above them — which §41.2
> records as *worse than no bar*.
>
> ~~"BINDING ON THE INTERFACE, exactly as for the instance column: the composition bar's three
> figures must never be presented as something to add up."~~ **That was the previous reading, and it
> is withdrawn.** It is kept here because it is a good argument that lost to a better one, and a
> future session finding a split that sums should not conclude the rounding rule has been forgotten.
>
> Applied at all four sites that report a split: a mixed instance's `byType`, each `runningTotal`
> point, `burst`, and `dot`. **`burst` had the same latent inconsistency and nobody had noticed**,
> because `auditResult` lives in the interface and had only ever been run over the mock, whose
> figures are whole numbers.

---

### 42.5 THE SIX DEFENSIVE SHAPE FIELDS

**DECIDED: `CuratedDefensiveEffect` gains `label`, `id` + `relation`, `grantedStat`,
`appliesToDamageType`, `overTime` and `unit`.**

`defensive-propose.ts` reads the defender's kit off the wiki and REFUSES any row stating a fact the
entry could not carry, with a named class. Six of those classes are one missing field each, and the
proposer measured what they cost together rather than guessing:

> **44 pairs. DEFINITION: a refused (page, kind) pair is released by a set of classes when EVERY
> class blocking it is in that set** — measured over 226 confirmed pages / 282 (page, kind) pairs, of
> which 88 were proposed and 194 refused. A released pair still has to parse, still obeys the owner
> rule, and is `derived` at best. Counted this way and not by "how often did class X fire first",
> because that figure depends on the order the checks run in.

| Field | Refusal class it closes | Pairs blocked | What storing it wrong would have claimed |
|---|---|---:|---|
| `label` | `multiple-values-one-field` | 27 | **Leona W grants 20–50 armor AND 20–50 magic resistance** from two rows on one page. Picking one silently drops the other, and which one decides whether the defender mitigates physical or magic damage |
| `id` + `relation` | `needs-relation` | 14 | Minimum/Maximum and base/empowered pairs summed instead of alternated — the defender mitigating twice what they should |
| `grantedStat` | `needs-granted-stat` | 13 (**8 by this alone — the largest single release**) | 7 armor is not 7 magic resistance |
| `appliesToDamageType` | `needs-damage-type` | 3 | A magic-only shield absorbing physical damage too |
| `overTime` | `needs-over-time` | 14 | A channelled heal restoring its whole duration's health at one point in the sequence |
| `unit` | `unit-not-expressible` + `not-an-amount` | 7 by the second | 25 read as 25 points when the source meant 25%; life steal read as health restored |

Three design points, each learned from the class it closes:

- **`unit` is ONE field with four arms, not two fields that must agree.** `'flat'` and `'percent'`
  answer "a number, of what?"; `'percent-of-damage-dealt'` (life steal, omnivamp, the wiki's
  "healing percentage" rows) and `'healing-multiplier'` ("increased healing") answer the same
  question about a quantity that is a RATE or an AMPLIFIER rather than an amount. Gate 1 requires
  `unit` whenever `value` is present — a number with no unit is not a value — and refuses the last
  two arms on any kind but `heal`, because an engine reading either as shield health would invent
  health from nothing.
- **`grantedStat: 'both'` is a real answer, not a shorthand for "we did not look."** Some rows grant
  one figure to both resistances in one statement. It is NOT how Leona W is stored: hers is two
  separately-valued rows and belongs in two entries distinguished by `label`.
- **`appliesToDamageType` ABSENT means all types**, which is the ordinary case, and never "unknown"
  — a row whose type could not be read is refused, not stored blank.

- **Releases:** 44 refused pairs become writable. **They are not written here.** The proposals are
  drafts in `build/proposed-curated/` and the population that may be stored is
  `defensive-confirmed.ts` — the pages a person read (CLAUDE.md: a detector proposes, a person
  confirms, storage is gated on the confirmed population).
- **Re-run:** `defensive-propose.ts`, which must now populate the six fields; its refusal counts
  will fall and `whatOneFieldWouldRelease.shapeFieldsTogether.pairs` should approach 0. That is a
  harvest-area task and is deliberately not started in this commit.
- **Tests:** 12 in `validate-curated.test.ts`, including Leona W stored correctly as two labelled,
  related entries **and** the same pair refused when it is unlabelled and unrelated.

**One stale claim corrected in passing.** `CuratedDefensiveEffect`'s own doc comment read *"the
defender panel needs on the order of two hundred controls rather than a handful"* — the conclusion
§40.1 struck through on the same day. It now carries the corrected measurement: minimum 0, median 1,
mean 1.23, maximum 4, **at most four rows**. The contract file was the last place the withdrawn
figure still lived, and it is the place an agent would have read it.

---

### 42.6 THE BASIC ATTACK HAS NO ART

**DECIDED: the basic attack is named in words and marked `AA`. No Data Dragon art is borrowed for
it, and none is drawn for it.**

Data Dragon ships four asset categories — champion portraits, ability icons, item icons, rune icons
— and nothing for an auto-attack. SPECIFICATION §10.1 says *"the combo builder presents abilities as
their in-game icons rather than as lettered buttons"*, so the one control the builder cannot obey
the rule for is the one the rule does not cover.

**Why the ban does not reach it.** §10.1 forbids substituting a letter for art THAT EXISTS. Its
purpose is that a player recognises Q by its icon rather than by reading a letter, and that purpose
has no application where there is no icon to recognise. **A basic attack is not an ability** —
SPECIFICATION §3.4 lists it as its own instance type, distinct from "damaging ability" and from
"empowered basic attack" — so this is not the banned case narrowly construed, and it is not the
banned case on the argument behind the ban either.

**What was rejected, and why it is the worse option.** The alternative is to borrow an existing Data
Dragon asset — an item icon, a summoner-spell icon, the attack-move cursor — and let it stand for
"basic attack". That is presenting official art as denoting something it does not denote, in a
product whose §15 asset terms rest on using Riot's art as Riot ships it, and in an interface where
every other icon means exactly the thing it depicts. **A user who learns that one chip means
something other than what it shows can no longer trust that any of them does.** Drawing a bespoke
icon is the same objection plus a new asset class DESIGN.md does not define.

**What is drawn instead**, introducing no new design value: in the shelf, a plainly labelled control
reading "Basic attack", deliberately a different SHAPE from an icon-chip so the two never read as
the same class of thing; in the sequence, where every step must keep one rhythm, a chip-sized well
carrying the `AA` mark in the display face at the eyebrow size. Both use tokens DESIGN.md already
defines. It is the same construction §9 already specifies for a non-damaging chip — a visible marker
that says "no art here", never an omission.

- **Releases:** the combo builder's last provisional decision. The code already behaved this way;
  what it lacked was a decision, so it read "RAISED, not filled in here" and an agent could have
  changed it in either direction.
- **Re-run:** nothing.
- **BLOCKED, AND STATED RATHER THAN ROUTED AROUND:** DESIGN.md §9 still says nothing about a basic
  attack, and that file is write-denied to every session by `permissions.deny` (CLAUDE.md, the
  guards). The tidy end state is a one-row addition to §9 recording this decision; it needs the
  owner to unlock the file. The guard was not weakened to get it in — the reasoning lives on
  `BASIC_ATTACK_MARKER` in `src/ui/combo/sequence.ts` and here.

---

### 42.7 THE DATA DRAGON ATTRIBUTION, APPLIED TO HEARTSTEEL

§41.1 **ADOPTED** the rule — where Data Dragon's prose attributes a stat the wiki leaves silent,
that is a source STATING a fact, not an inference from convention — and then nothing acted on it.
Heartsteel kept shipping `owner: 'unresolved'` against a source that says **"your max Health"**.

**APPLIED. `public/data/effect-values.json` was regenerated and exactly ONE effect changed:**

| | Before | After |
|---|---|---|
| Heartsteel `pass` ratio owner | `unresolved` | **`holder`** |
| Heartsteel `pass` verification | `incomplete` | **`derived`** |
| Heartsteel `pass` `unresolvable` | one entry naming `maxHP` | **absent** |
| stored effects | 38 | 38 |
| — complete (`derived`) | 32 | **33** |
| — carrying an unattributed owner | 6 | **5** |

`holder` and **not** `caster`: the same item on the defender reads off the defender (`RatioOwner` in
`data.ts`). Every other figure in the file is byte-identical, so nothing else moved with it.

**IT IS A HAND-READ TABLE, NOT A RULE.** `DATA_DRAGON_ATTRIBUTIONS` in `effect-values-gate.ts`
carries one row, quoting the words it rests on. A regex over Data Dragon's prose would decide
references nobody has read — the exact move CLAUDE.md forbids ("a detector proposes, a person
confirms, and storage is gated on the confirmed population"). A paired test uses **identical
wikitext under a key the table does not name** and asserts the owner stays `unresolved`; without it
the change would pass for an implementation that resolved every unattributed `maxHP` reference to
the holder, which is precisely the convention argument §16 rejects.

**WHY ONLY ONE ROW IS APPLIED WHEN 7 REFERENCES ACROSS 5 EFFECTS ARE ELIGIBLE.** The other four —
Black Cleaver and Bloodletter's Curse shred, Overlord's Bloodmail and Riftmaker's stat grants —
attribute stats this extraction does not store as damage ratios, so adopting them changes no stored
number. They are recorded, not applied. Measured: of the 6 stored ratios carrying an unattributed
owner (Heartsteel, Hollow Radiance, Hullbreaker, Sunfire Aegis, Titanic Hydra ×2), **Data Dragon
attributes only Heartsteel's**.

> **§41.1 IS IMPRECISE ABOUT HEARTSTEEL AND THE CORRECTION IS WORTH KEEPING.** It reads:
> ~~"**Heartsteel stays:** Data Dragon attributes one of its stats and not the other, and an effect
> is permanently incomplete if ANY of its owners is."~~
>
> The conclusion is right and the reason given is wrong. Heartsteel `pass` carries **three**
> owner-bearing references, not two, and Data Dragon attributes **both** `maxHP` references —
> the damage ratio and the `10% of that amount` clause. The one it leaves silent is a **`bonusHP`**
> reference in a different clause: *"grant you permanent bonus health"*. That clause has a
> holder-implying verb and §37.3 deliberately declines to resolve those, so it stays unattributed.
>
> **The consequence matters, because §41.1 ran two questions together.** Heartsteel remains in
> §37.3's permanently-unresolvable population under that section's own effect-level definition (at
> least one owner-required reference attributed by neither source), so **the 75 / 52 figures do NOT
> move**. But the STORED entry is a damage component, and every fact IT needs is now attributed —
> the unmodelled bonus-health clause is not one of them. Marking the damage `incomplete` because an
> unmodelled sibling clause has an unattributed owner would refuse a number we can stand behind,
> which is the mirror of the defect §27 fixed when 239 no-damage entries were reading `derived`.
>
> **The effect-level question and the entry-level question have different answers, and both are
> correct.**

- **Releases:** one item effect's damage, from `incomplete` (contributing nothing) to `derived`.
- **Re-run:** `node scripts/fetch/values.ts` — done, diffed against the previous file, one effect
  changed. §39's table (28 extracted / 1 incomplete) is superseded twice over: by §41.3's 38, and
  now by 33 complete / 5 unattributed.
- **Tests:** 3 in `effect-values.test.ts`. The rule "an unresolved owner forces incomplete" is
  unchanged and still tested — **its exemplar moved from Heartsteel to Titanic Hydra**, because
  Heartsteel stopped being an example of it. Moving an exemplar is not weakening a test; the
  assertion is identical.

---

### 42.8 What this pass did NOT do

Stated so the next session does not have to infer it:

- **No area was launched.** Every change here is the lead's, in lead-owned files plus the direct
  consequences in `src/engine/`, `src/ui/` and `scripts/fetch/` that a contract change forces. The
  work each decision RELEASES is an area task and is listed under it.
- **No owner was inferred from convention.** The one owner that changed did so because a source
  states it in its own words, quoted.
- **`/curated/` was not touched.** Nothing in this pass writes it, and the write-guard was not
  altered.
- **DESIGN.md was not edited**, because the guard denies it. The one row it needs is named in §42.6.
- **The full-roster batch was not re-run.** No stored ability figure changed, so
  `verification/measurements.json` is unaffected; the §41.3 note that it should be re-run to pick up
  shapes the harvester can now express still stands, and now includes the six defensive fields.

---

## 43. The resource field — what Ryze Q was waiting on (2026-08-14)

§42.3 added optional mana to `StatBlock` and named the one thing still missing: **nothing could
tell a mana pool from an energy pool.** This adds it.

### 43.1 The field, and why `mp_base` is not enough

`Module:ChampionData/data` carries a champion-level `resource` string beside `stats`.
**`stats.mp_base` is the resource POOL and says nothing about which resource it is.**

| Figure | Count | Definition |
|---|---:|---|
| module entries | **175** | top-level entries carrying an `apiname`. NOT 173 — the module also holds Mega Gnar and a second Kled form, which Data Dragon has no assets for |
| — carrying a `resource` field | **175** | none absent |
| — distinct `resource` values | **15** | Mana, Energy, None, Fury, Health, Rage, Courage, Flow, Blood Well, Frenzy, Shield, Ferocity, Heat, Grit, Crimson Rush |
| — `resource: "Mana"` | **145** | |
| — **non-mana resource with a NON-ZERO `mp_base`** | **19** | the measurement that makes the field necessary |
| — `resource: "Mana"` with `mp_base` 0 | **0** | so a mana champion always has a pool to report |

**Over the SHIPPED ROSTER of 173 champions the last two figures are 17 and 0**, not 19 and 0 —
the two entries the module has and the roster does not (Mega Gnar `Rage 100`, Kled & Skaarl
`Courage 100`) both fall in that class. **Both figures are real and they count different
populations; quoting one for the other is how a count stops meaning anything.** The 17:
Akali 200 energy · Ambessa 200 energy · Gnar 100 rage · Kennen 200 energy · Kled 100 courage ·
Lee Sin 200 energy · Rek'Sai 100 fury · Renekton 100 fury · Rengar 4 ferocity · Rumble 150 heat ·
**Shen 400 energy** · Shyvana 100 fury · Tryndamere 100 fury · Vladimir 2 crimson rush ·
Yasuo 100 flow · **Yone 500 flow** · Zed 200 energy.

Reading the pool as mana would have labelled every one of those as a mana champion, and — the part
that reaches a damage number — would have let a `maxMana` ratio resolve against energy.

**`ChampionResource` is a free string, deliberately.** 15 values observed, and Riot adds more with
new champions; a closed union would make the fetch throw on the next release. Only the exact value
`'Mana'` licenses populating a mana figure, so an unseen value correctly produces no mana.

### 43.2 The requirement is at the ROSTER level, not in the parser, and that placement is
### load-bearing

Requiring `resource` during parsing was tried first and **it broke the wrong-wiki guard**. The
abandoned Fandom copy does not carry the field, so parsing threw before `assertOfficialWiki` could
run, and an operator served the stale copy would have seen *"resource is not a string"* instead of
*"this is the wrong wiki"*. **A guard that cannot report is not a guard.**

So the parser reads it where present, and `assertEveryChampionStatesAResource` runs on the JOINED
roster and throws naming every champion that lacks one. The failure it prevents is silent: a
champion with no resource gets no mana figure, so every mana-scaling ability they have reports as
unmodellable rather than wrong — correct, and quiet enough that nobody would notice.

`Champion.resource` is OPTIONAL in the contract only so a `champions.json` written before
2026-08-14 stays valid. The source states it for all 175 entries, so an absent value means the file
predates the field, never that the source was silent.

### 43.3 THE RE-FETCH, DIFFED — NO BASE STATISTIC MOVED

The whole pipeline was re-run against the live sources and the output diffed against the previous
files, field by field, twice (once before the parser change and once after).

| | Result |
|---|---|
| patch | **16.16.1 both times — unchanged** |
| champions in the roster | **173 before, 173 after; none added, none removed** |
| **base statistics that moved** | **0.** DEFINITION: any differing value under `stats` on any champion — all 16 fields, compared per champion across all 173 |
| item values that moved | **0** |
| rune values that moved | **0** |
| withheld champions | 2 both times, the same two (Kled & Skaarl, Mega Gnar) |
| contested source overrides | 5 both times, the same five (Jhin `as_lvl`, Kled `range`, Tristana `mr_base`, Twitch `mr_base`, Twitch `mr_lvl`) |
| files changed under `public/data/` | 176 |
| **fields that actually differ, across every changed file** | **exactly two** |

The two: `provenance.fetched`, a timestamp, on 173 champions + 209 items + the manifest; and
`resource`, added on 173 champions. A grep over the whole `public/data/` diff for any changed line
naming neither field returns nothing. `defender-toggles.json`, `effect-census.json`,
`effect-values.json`, `overrides.json` and `runes.json` are byte-identical.

### 43.4 What this releases, and the one step still open

- **Releases:** the product can now tell mana from every other resource, for all 173 champions.
- **STILL OPEN, and it is not a data gap:** nothing yet BUILDS a `StatBlock` from a `Champion`.
  That is `simulate(scenario) -> Result`, the public entry point which is unwritten (`src/engine/
  index.ts` says so). When it is written, the rule it must follow is one line — populate `mana` and
  `maxMana` only when `champion.resource === 'Mana'` — and the engine already resolves the ratio
  correctly once they are present, which §42.3 tested end to end.
- **Re-run:** none outstanding. The fetch has been run and diffed.
- **Tests:** 7 in `champions.test.ts`, including the roster-wide 145 / 17 / 0 measurement, the
  named-failure assertion, and the one that keeps the wrong-wiki guard able to speak.

---

## 44. The cross-area seam, swept (2026-08-14)

§42.4a found the engine and the interface holding **opposite rules about one figure**, with both
suites green. This applies CLAUDE.md's standing instruction to it: the defect becomes a mechanical
check run over the whole population, and the population is measured.

### 44.1 The defect class, stated so it is recognisable next time

**DEFINITION — A SEAM: a (shape, producer area, consumer area) triple where one area writes a
value of a shape declared in `src/types/` and a DIFFERENT area reads it and asserts something
about it.**

A seam defect is not a bug in either area. Each is internally consistent, each has its reasoning
written down, and each has a passing suite — because **an area's tests run over its own output,
and the partition means no one person reviews both sides**. The engine tested Results against
hand-authored expectations; the interface tested its assertions against `MOCK_RESULT`; nothing ran
`auditResult` over `runCombo`, so the two rules never met.

**This is a cost of the partition, not an accident, and it will recur every time an area is added
or a shape gains a field.** The check lives in `tests/cross-area-seams.test.ts` — `tests/` belongs
to no area, which is the only place a file may import from `src/engine/`, `src/ui/`, `src/url/`,
`scripts/extract/` and `scripts/fetch/` at once.

### 44.2 The population: five seams, checked; one defect found

| # | Shape | Producer | Consumer's assertions run over it | Coverage | Result |
|---|---|---|---|---|---|
| 1 | `Result` | engine `runCombo` | `auditResult`, `buildBurndownModel`, `AggregateTotal`'s invariant, the `StatBlock` invariants | **9 hand-authored plans** + the 3 interface fixtures | **clean** |
| 2 | `CuratedFile` | harvester | gate 1, gate 3, and the engine's component evaluator | **937 entries, 946 components** | **clean**; 18 gate-1 failures pinned |
| 3 | `Champion` | data pipeline | `resolveBaseStats`, and the resource rule any stat-block builder must follow | **173 champions × 3 levels** | **clean** |
| 4 | `Scenario` | url encoder | the engine runs a decoded scenario | **10 scenarios** | **clean** |
| 5 | runtime mirrors of contract types | every area | the contract's own member list | **26 mirrors** | **1 DRIFT** |

**DEFINITION of the 9 plans:** hand-authored `ComboPlan`s, each chosen because it produces a shape
some consumer treats specially — a multi-type aggregate, a fractional split, a zero, an empty
list, a lethal crossing, an incomplete instance, a DoT tail. No data file is read to build them,
so a failure is two areas disagreeing rather than the data moving. A coverage test asserts the
battery really reaches each shape, so it cannot pass by running nothing.

**THE CHECK WAS PROVED TO FAIL, TWICE, RATHER THAN ASSUMED TO WORK.** Reintroducing the original
defect — `roundSplit` rounding each type independently of its total — turns seam 1 red and names
all three places it surfaces (`burst`, `runningTotal[0]`, `instance 1 byType`). Dropping `holder`
from `RATIO_OWNERS` turns seam 5 red. Both were run and both were reverted.

### 44.3 The one defect: a contract field the URL encoder was never told about

**`ComboStep.hitCounts` is missing from `STEP_ALL_KEYS` in `src/url/v1.ts`.**

It was added to the contract on 2026-08-13 for variable hit counts (§38). The encoder was not, and
its own suite passes because it tests the fields it knows about.

**The failure is LOUD, which is the good direction:** `encodeScenario` throws *"combo[0].hitCounts
is not part of the scenario contract"* — a message that is itself untrue, since it is part of the
contract. Nothing is shared wrongly. But SPECIFICATION §12 says any scenario is shareable as a link
that reproduces it exactly, and **a scenario using any ability that carries `variableHits` cannot
be shared at all.**

> **DEFINITION of the affected population: ability entries with at least one component carrying
> `variableHits`, over the 937 in `build/proposed-curated/abilities/batch-01.json`. The count is
> 7:** Kai'Sa Q · Lulu Q · Nautilus E · Taliyah Q · Yuumi R · Zac R · Ziggs E. It is 7 and not the
> 17 or 13 of §38 because those count abilities a person READ, and storage is gated on a narrower
> set than reading (CLAUDE.md).

**NOT FIXED HERE, and the reason is that it is a decision rather than a repair.** The step is
encoded positionally — `[id, kindIndex, ref]` or `[id, kindIndex, ref, options]` — so carrying
`hitCounts` needs a fifth slot and a `FORMAT.md` change. Raised, not made.

It is recorded in `KNOWN_DRIFT` in the seam test, asserted EXACTLY: a second drift fails the check,
and so does fixing this one without striking its entry. A red suite blocks every merge (§14), so a
found-but-unfixed seam is pinned rather than left failing — the same device gate 1's `failed === 18`
uses.

### 44.4 Four more classes, searched by hand and found clean

The automated check covers what a machine can compare. These were read:

- **`ReportedDamageType` has five arms and `DamageByType` has three keys.** A consumer indexing the
  split by the reported type would land on `physical` for `'none'` and for `'mixed'`. Every site
  that does so guards first — `geometry.ts` narrows the union rather than casting, which its own
  comment says is deliberate so a new arm fails the typecheck instead of landing silently.
- **The absent-reason fallback.** SPECIFICATION §8: an incomplete entry with no reason falls back
  to PENDING, never permanent. The engine defaults it when planning; the interface's
  `VerificationStatusMark` reads `reason?.kind === 'permanent' ? … : pending`. **The two agree, and
  they agree in the safe direction** — neither can promote an unexplained gap to "cannot be
  completed".
- **`RatioOwner: 'holder'`** is resolved by the engine at evaluation time from `holderIs`, and
  refused by name when the caller does not supply it. It is not silently mapped to `caster`, which
  would invert every defender-side item.
- **`AbilityComponent.variableHits`** is consumed by the runner, and gate 1's refusal of `hits`
  beside `variableHits` matches the runner's own guard on the same pair.

### 44.5 A watched item, not a defect: there are two damage pipelines

`src/ui/slice/compute.ts` computes damage itself — base, ratios, `applyResistance`, `roundDamage` —
rather than calling `runCombo`. It reuses the engine's PRIMITIVES, so it cannot disagree about a
formula, but it does not run the engine's PIPELINE: no four-step resistance order, no shields, no
crit, no reductions, no sequence state. **For a scenario involving any of those it would show a
different number than the engine, for the same inputs.**

It is not a defect today for one measured reason: **it does not ship.** `src/main.tsx` renders the
burndown alone, and the slice exists only on the dev-only preview page. It is recorded here so
that wiring it to a real route without deleting it would be a deliberate act rather than an
oversight. The right end state is that it goes when `simulate(scenario) -> Result` lands (§43.4).

### 44.6 What would extend this check

Named rather than implied, so the next session does not have to rediscover them:

- **The defensive proposals** (`build/proposed-curated/defensive-proposals.json`) are not yet run
  through gate 1 by the seam check, because the six shape fields landed after they were generated
  (§42.5). Re-running the proposer is what unblocks it.
- **`CuratedItemEffect` and `CuratedRune`** reach the engine through a layer that does not exist
  yet, so there is no consumer to run over the producer.
- **The item and rune effect values** are checked by their own gate, not against the engine's
  component evaluator, because nothing assembles them into a plan yet.

---

## 45. The healing trace, built (2026-08-14)

Approved as proposed in §42.2's raised gap. Two halves — the engine's arithmetic and the chart —
and they are built so that neither derives from the other and `auditResult` compares them.

### 45.1 The engine: a walk, not a lump

Healing used to be added to the defender's health **in one lump before the first instance**. That
is wrong in one direction that matters: **a heal placed after the kill brought the defender back.**

The verdict is now a walk. For each instance: apply its damage; if health has reached zero, STOP —
`lethalAtInstance` is set and every later heal is simply not counted; otherwise apply the healing
that instance owns, capped at maximum health.

| Rule | Behaviour |
|---|---|
| A heal a source attributes to instance *n* | resolves after instance *n*'s damage |
| A heal **no instance owns** | available from the START of the walk |
| A heal that would land after the kill | **not counted, and not drawn** |
| Healing past maximum health | capped; the excess is reported as waste, never silently dropped |
| Health reaching exactly zero | lethal — the same rule the unhealed walk always used |

**The unplaced case is the one assumption, and it is disclosed rather than assumed.** No instance
owns it, so there is nowhere honest to put it; available-from-the-start is the reading most
generous to the defender and therefore the one that says *"this kills"* **less** often. That is the
same safe direction §38.4 chose for variable hit counts. `ENGINE_EXCLUSIONS` states it on every
result, and the exclusion NARROWED rather than disappeared: what is disclosed now is the single
assumption inside a model, not the absence of one.

**`healingApplied` is what actually entered a verdict's arithmetic**, which is not always what the
sources offered — healing beyond the kill and healing past maximum did not happen. The audit
therefore checks it is never MORE than the sources offered, rather than equal to it, and separately
that **no verdict leaves more health than the champion can hold** (the engine had no upper clamp).

### 45.2 The chart: a trace that can also go up

`buildBurndownModel` walked `startHp − cumulativeDamage`, which can only fall. It now walks health:
damage, then healing, in the instance's own position, capped and stopping at death — **the same
rules as the verdict, computed independently, and compared.**

- **Healing riser:** 3px, rising, in `--hp-trace` — the neutral cool grey already used for the HP
  line, because a change in health is exactly what it is. **The non-colour cue is a DOTTED
  stroke.** No new hue, and none is permitted: §1's reserved-hue law admits no exception, and a
  green "restored" colour is the success-colour that rule exists to forbid.
- **Label:** `+90`, carrying **no `P`/`M`/`T` tag** — a heal is not damage, and tagging it would
  make it read as one. Overhealing reads `+240 (120 wasted)`.
- **The recent-damage ghost never fires on a heal**, and now fires only where health was actually
  removed. It is "the chunk that was just taken".

**ONE DEVIATION FROM THE APPROVED PROPOSAL, stated rather than slipped in.** The proposal put the
unplaced-healing column after the last burst column, beside `+DoT`. It is drawn **before instance
1** instead, because that is where the engine counts it. Drawing it last would have put the chart
and the verdict back into disagreement — the defect this work exists to close.

`auditResult` gained `trace-disagrees-with-verdict`: the chart's own walk must land on the number
the verdict states. Before this change they differed by 90 on the healing fixture.

### 45.3 Two defects a real browser caught and no test could have

Both found by loading the preview page, not by the suite.

1. **The riser rendered at zero height.** Two causes, and the second is the general one:
   `inline-size: 0` left it with no content box, and — the real cause — **`.burn__heal` was
   missing from the reduced-motion block.** `burn-draw-riser` starts at `scaleY(0)` with a
   `backwards` fill, so a selector that animates and is not switched off does not merely skip its
   animation, it **sticks at the first keyframe permanently** — for exactly the users who asked
   for less motion. DESIGN.md §10 requires the chart fully readable with motion disabled.
2. **The sweep that now covers the class.** `token-audit.test.ts` asserts that **every animated
   selector in every stylesheet appears in that stylesheet's reduced-motion block.** Proved by
   removing one and watching it fail. jsdom computes no layout and runs no animations, so neither
   defect was reachable by any existing test.

---

## 46. Version 2 of the link format (2026-08-14)

Closes the one drift §44.3 found. `ComboStep.hitCounts` reached the contract on 2026-08-13 and the
encoder was never told, so **7 abilities could not be shared at all** — Kai'Sa Q, Lulu Q,
Nautilus E, Taliyah Q, Yuumi R, Zac R, Ziggs E.

**A new version, not an extended version 1.** The step is positional — `[id, kindIndex, ref]` or
`[…, options]` — so adding a fifth slot in place would make any page a user already has open
either misread slot 4 or reject the link as damaged. FORMAT.md §3 fixes the rule: **every version
ever published stays readable forever, and a new version adds a second decoder beside the old one.**
So `v1.ts` is untouched, `v2.ts` is new, and decoding dispatches on the version the link states.

**A version 1 link reports `version: 1`**, because that is what it is; re-sharing it upgrades the
format and loses nothing. A step with hit counts and no options writes `null` in slot 4 so slot 5
keeps its place, and `null` reads back as ABSENT rather than as an empty options bag — different
things this suite pins separately. **A count that is not a whole number of hits is refused rather
than rounded**, and 0 is carried, because 0 means the ability missed entirely.

**Version 2 shares version 1's champion encoding rather than copying it, and that is safe only
because the promise is now mechanical:** three version 1 links are frozen as constants in
`round-trip.test.ts`, never regenerated, each asserted to decode to the scenario it was made from.
Any edit to shared code that changed version 1's behaviour fails there.

### 46.1 Length, measured before and after

| Figure | Before | After |
|---|---:|---:|
| every one of the 21 named scenarios | 163–870 | **163–870, unchanged to the character** |
| `canonical-mock` | 575 | 575 |
| `maximal` | 870 | 870 |
| 5 steps, options only | 1,052 | 1,052 |
| 5 steps, options **and** hit counts | *unshareable* | **1,113** |
| **13 steps, options and hit counts — THE NEW MAXIMUM** | *unshareable* | **1,852** |

**Not one existing link moved by a single character**, because no named scenario carries hit counts
and the version digit is one character in both formats. A step that DOES carry them costs about
**12 characters**.

**Per-shape ceilings under the 2,000-character budget**, on the maximal build. DEFINITION: the
largest combo length whose full URL stays at or under 2,000.

| Shape | Steps that fit |
|---|---:|
| plain steps | **72** |
| hit counts only | **35** |
| options only | **16** |
| options and hit counts | **14** |

So version 2 costs **two steps** off the options-carrying ceiling and nothing off the others. All
six figures are pinned in `length.test.ts`.

---

## 47. `simulate(scenario) -> Result` — the spine closed (2026-08-14)

The last unwritten piece. Until now `runCombo` took a fully resolved `ComboPlan`, so everything ran
on hand-authored plans and **nothing turned a user's configuration into a Result.**

**It still reads no data file.** The engine's rule is that champion, item and rune values arrive as
arguments; they now arrive as a `Catalogue` the caller builds from `public/data/`. This file opens
nothing.

**It refuses by NAME rather than returning a smaller number.** A champion not in the catalogue or
an item id that does not exist refuses the whole scenario and says which. A single unmodellable
STEP does not: it becomes an `incomplete` instance contributing no damage and naming its reason,
which is SPECIFICATION §8 applied where a scenario is assembled.

**Mana is populated only when `resource === 'Mana'`** (§43), so Shen's 400 energy and Yone's 500
flow correctly produce no mana figure at all.

**Item statistics: eight of twelve keys applied.** DEFINITION: the distinct `stats` keys present
across the shipped 209-item pool. The four unapplied are named, not forgotten — two movement-speed
keys and health regeneration change no damage figure because the engine models sequence rather than
time; `PercentLifeStealMod` is real sustain and needs the per-instance damage figure it applies to,
which this function does not have. **A key this map does not know is reported on the result**, so a
patch adding one cannot drop a stat silently.

`SIMULATION_EXCLUSIONS` states what is absent because the DATA is, not because the engine cannot:
item passives and actives, every rune and stat shard, critical-strike damage above the base
multiplier, and all penetration.

### 47.1 What the end-to-end seam found on its first run

**A check that had contradicted the project's own rounding rule for as long as it existed.**

`auditResult` demanded that a running-total delta equal the instance's `final` exactly. Three of
Lux's four instances failed: *"runningTotal delta 86 but final 87"*. **Neither figure is wrong.**
§41.1 rounds every figure ONCE from an unrounded quantity, so the difference between two rounded
cumulative totals need not equal a separately rounded instance — which is the rule the interface
itself prints under the table. **It passed until now only because every fixture used whole numbers.
Real champion data does not.**

The tolerance is exactly what rounding can produce and not a point more: 1 for a delta, half a
point per instance for a per-type sum. Proved still to catch a real disagreement by overstating
every instance by 5 and watching it fail.

### 47.2 RYZE Q IS STILL BLOCKED, AND NOT BY MANA

Recorded because the expectation was reasonable and wrong. §43 said the mana field was "the whole
of what Ryze Q was waiting on". **It was a blocker, and it was not the last one.**

The stat block now carries mana and the engine resolves a mana ratio end to end. Ryze Q still
contributes nothing, because the wiki states *"2% of maximum mana"* and **never says whose**, so
the harvested ratio carries `owner: 'unresolved'` and the entry is PERMANENTLY incomplete (§16).
Data Dragon cannot settle it either — it exposes no ability ratios at all (SPECIFICATION §7.3), so
§42.7's attribution rule has nothing to work with.

> **DEFINITION: mana ratios stored across the 937-entry batch: 8. Of those, with a stated owner:
> 0.** No harvested ability exercises the mana path today.

### 47.3 The sweep

**All 173 champions**, each attacking Garen with a Q-W-E-R-plus-basic-attack combo — 173 scenarios,
865 planned instances, every one through `simulate` and then through every assertion the interface
makes about a Result. **Zero complaints, zero refusals.** One passing matchup would prove almost
nothing; a champion whose kit produces an awkward shape is what a seam check is for.

---

## 48. The defensive entries, written (2026-08-14)

The six shape fields landed in the contract on 2026-08-14 (§42.5) and nothing had used them.
`defensive-propose.ts` now populates all six.

| Figure | Before | After |
|---|---:|---:|
| confirmed pages / (page, kind) pairs | 226 / 282 | unchanged |
| **pairs proposed** | 88 | **132** |
| **pairs refused** | 194 | **150** |
| **entries written** | 88 | **161** |
| `shapeFieldsTogether.pairs` | 44 | **0** |

**DEFINITIONS.** A *pair* is one (page, kind) — a page carrying a shield and a heal is one
confirmed effect and two pairs. An *entry* is one `CuratedDefensiveEffect`. **Before, one pair
could only ever be one entry, which is exactly why 27 pairs were refused; now one pair is one
entry PER LEVELING ROW, so 132 pairs produce 161 entries.** The "before" column was not quoted
from this document — the previous code was re-run over the same page cache and reproduced
88 / 194 / 44 exactly.

Coverage: 937 pages in the cache, 0 fetch chunks failed.

### 48.1 Released is not written

**42 of the 44 measured pairs were written, as 70 entries — 56 `derived`, 14 `incomplete`.** The
other two were read and refused, and neither is a parsing failure:

- **Graves E** grants 7–19 armour **per stack** of True Grit, stacking to eight. The entry has no
  counter for a flat value, so the row is between one and one-eighth of the real grant.
- **Briar W** heals "5% of her maximum health **plus** a percentage of the damage dealt", and only
  the percentage has a row. One entry holds one unit.

Both were inside the earlier "released by the six fields" measurement. **A pair a field releases
still has to parse and still obeys every other rule** — the §42.5 figure sized the FIELD's reach,
not the number of entries that would result, and the difference is 2.

### 48.2 Gate 1, run by the lead

**161 checked, 161 passed, 0 failed** — run independently over the proposals rather than accepted
from the area's own report. No entry claims `verified`; no entry carries a `value` without a
`unit`; no entry records an `unresolvable` fact while claiming better than `incomplete`. Statuses:
**133 `derived`, 28 `incomplete`, 0 `verified`.**

**Leona W is stored the way §42.5 requires** and this was checked directly: two entries, labels
"Bonus Armor" and "Bonus Magic Resistance", `grantedStat` `armor` and `magicResist`, both `adds`,
**neither `both`**.

**8 negative controls** take entries the file really produces, break exactly one field, and require
gate 1 to catch it — a gate that always passed would print the same line as a gate that works.

**Gate D2** (round trip against the wiki's own rendering, over all 161): **138 matched, 1
mismatched, 22 nothing-to-compare** — the 22 being immunities and spell shields, which have no row
and are never counted as passes. The one mismatch is **Trundle R**, where the wiki prints
`20–30% (+2% per 100 AP)` as two groups and the entry correctly stores one ratio carrying a
multiplier. **That is a limit of gate D2's group counting, not a data defect**, and it will fire on
any entry using the multiplier shape. The entry stays `incomplete`, because the rule is that an
entry gate 2 disagrees with is `incomplete` — the rule was not bent to accommodate a known-good
value.

### 48.3 Three rows a label rule would have decided wrongly

Storage is gated on a read population (`defensive-shapes.ts`), not on a regular expression. These
are why:

1. **Vladimir R "Maximum Total Heal"** — "total" fires every over-time rule in this project, and
   here it means **across every target hit**, delivered at one moment. Stored as `overTime`, a heal
   that lands inside the burst would sit outside the burst verdict.
2. **Graves E** and **Briar W**, above.

### 48.4 Two real defects, each swept over the whole confirmed population

- **`kindMismatch` — 14, of which 2 were real.** **Amumu E** and **Galio W** reported "no leveling
  row of this kind on the page" while their "Physical Damage Reduction" rows sat in plain sight,
  because the label map filed a typed reduction under plain `damage-reduction`. Both are now routed
  correctly, and 3 of the new `type-specific-reduction` entries come from it. The other 12 are
  effects whose value genuinely lives in a sentence.
- **`labelFactsCarried` — 0 defects, and it caught a bug in the detector itself.** It reported four
  entries "stating a damage type they do not carry"; the entries were right and the pattern was
  wrong — it fired on "Bonus **Magic** Resistance", where the word names a resistance. **Measured
  before the change:** the wide pattern matches 12 rows across the 226 confirmed pages, the
  narrowed one 6, and all 6 dropped are "… Magic Resistance". No stored value moved and the
  before/after entry sets are byte-identical.

### 48.5 What still refuses — 150 pairs, by class

**140 are `no-leveling-row`** — the effect's value lives in a sentence rather than a row. That is
**93% of all remaining refusals and the whole remaining reading burden.** 2 are
`not-a-defensive-kind` (attacker debuffs, excluded by §40.5). The other 8 are parse failures:
Kled R and Senna R (an unreadable ratio), Thresh W ("+2 per Soul collected" outside every readable
block), Udyr W twice (a 6-rank axis against a 5-rank slot, and two additive terms), Ambessa R (an
unknown stat), plus the two read-and-refused above.

**`needs-granted-stat`, `needs-damage-type` and `unit-not-expressible` now block ZERO pairs.** Four
pairs carry `shape-not-read`, and **not one is blocked by that alone** — every one also has a parse
blocker, so reading them today would release nothing.

### 48.6 A MODELLING QUESTION RAISED AND NOT DECIDED: whose defensive effect is it?

**Shen R shields only an ALLY and never Shen, yet it is stored as Shen's defensive entry.** So did
the previous 88. Braum W is the same shape and was handled locally — its "Ally Bonus Armor" rows
are dropped and reported, exactly as non-champion rows are, because a 1v1 has one defender and
storing both would grant Braum the 12% ally value on top of his own 36%.

**The general question is unresolved and is the lead's:** many confirmed effects target "the target
allied champion". If the defender model is strictly one champion, some of these are not defensive
entries at all and should not be in the population. It is recorded here rather than decided,
because deciding it silently would either grant a defender protection they never receive or drop
one they do.

### 48.7 Three further contract limits, reported rather than worked around

1. **No field for a conditional multiplier.** Malphite W's armour grant is "tripled while Granite
   Shield is active". The untripled row is stored; the entry is already `incomplete` for a separate
   reason — the source never says whose armour the percentage reads. Population: 1.
2. **No field for a cap.** Amumu E reduces each physical instance by a flat 5–13 "capped at 50% of
   the damage instance". **It was stored rather than refused**, because the cap binds only on
   instances below about 26 damage and the error is one-directional. That judgement is recorded
   here rather than buried in the data. Leona W and Fizz P are the same family with no row at all.
3. **`value` cannot carry a `RatioMultiplier`.** Galio W states "(+4% per 100 AP)" beside a flat
   percentage, so those terms land on `ratios` instead — which is what puts Trundle R's mismatch on
   gate D2.

---

## 49. Three decisions after the fan-out (2026-08-14)

### 49.1 THE HONESTY SHORTFALL — every incomplete entry now names what is missing

SPECIFICATION §8 requires a PENDING entry to say what is missing, not merely that something is.
On screen, most of the roster said only *"this ability is recorded as incomplete"* — a sentence
that restates the status as though it were the cause.

**It was a data gap with a visible symptom, and the harvester already knew the answer in every
case.** `issues` — a per-entry list of reason classes — drove the verdict and then stayed in the
batch report. The entry never carried it, so the interface had nothing to print.

Two causes were not even recorded. `needsHandAuthoring` set an entry to `incomplete` and pushed
NO issue, though its own condition distinguishes two situations the reader would want told apart:
every damage row dropped, versus the source stating damage while the page carries no leveling row
at all. Both were computed and thrown away.

| Incomplete entries, over the 937-page batch | Before | After |
|---|---:|---:|
| carrying a specific reason (`notes`) | **0** | **224** |
| carrying named missing facts (`unresolvable`, permanent) | 23 | 23 |
| **carrying NEITHER — the shortfall** | **224** | **0** |

**DEFINITION: entries whose `verification` is `incomplete`, over the 937 distinct ability pages.**
213 gained a reason from the harvester itself; the remaining 11 were the LATE demotions — gate 2's
round-trip disagreements and one recorded source conflict — which are applied after the harvester
has finished, so the note is now written again once every status change is final.

**A PERMANENT entry is deliberately given no note.** It carries `unresolvable`, which names the
missing FIELD and why no source settles it — a fuller answer than any sentence the describer could
write. **And where the harvester recorded nothing, `simulate` says exactly that** rather than a
sentence that merely sounds like an explanation: *"the data records no reason for this … which is
itself a gap in the harvested data rather than a fact about the ability."*

> **THE FIX OPENED A NEW CHANNEL FOR AN OLD DEFECT, AND THE INTERFACE'S OWN SWEEP CAUGHT IT ON THE
> FIRST RUN.** The details were written for a report, so they carried raw arithmetic — *"a total of
> 195.60000000000002"*, *"0.800x the per-instance value"*. The moment `notes` reached the screen
> that was floating-point noise printed at the user, which is the exact defect the interface had
> just swept out of its own figures. **A check written in one area caught a defect introduced in
> another**, which is what §44's seam work exists for. Reasons are now held to the same two-decimal
> precision as any figure.

### 49.2 DESIGN.md §7 vs §8 — the bar keeps its proportions, the labels move

§7 sizes composition-bar segments in proportion; §8 makes the `P`/`M`/`T` tag mandatory and never
suppressed. On a short bar with a lopsided split both cannot hold, and a build had resolved it by
**widening the narrow segment** — keeping every tag and making the bar overstate the smallest
damage type, the number a reader is least able to check.

**RESOLVED: a segment is never widened. When any segment is too narrow for its own tagged value,
every label leaves the bar and sits in a row beneath it**, in the bar's order, each keeping its tag
and its hue. Recorded in both sections, which now cross-reference each other. The general form is
worth carrying: **when a mandatory cue will not fit, move the cue — never resize the data to
accommodate it.**

"Too narrow" is decided from the DATA, not from measured layout, because layout exists only in a
real browser and a rule nothing can evaluate is a rule nothing checks. `MIN_SHARE_FOR_INLINE_LABEL`
is 0.25, and it was derived rather than picked: the longest realistic label is seven characters,
about 46px at `--type-num-s` in JetBrains Mono, against a narrowest-case bar of roughly 200px.

**VERIFIED IN A REAL BROWSER on the exact split that failed.** Ahri with Rabadon's Deathcap
produces 42 physical / 225 magic — the split that had rendered as the single illegible string
`4222 5 M` with the `P` lost. The segments now measure **12px and 65px**, a ratio of 0.156 against
the true 0.157; both labels sit below, both carry their tag, and they do not overlap. Under the
withdrawn rule that 12px segment would have been stretched to about 35px, showing a 16% share as
though it were 35%.

### 49.3 Ally-only defensive effects are not the defender's

The defender model is ONE champion. An effect that only ever protects an ALLY is not a defensive
entry for its owner: storing it grants a defender protection they never receive — a plausible wrong
number in the worst direction, because it makes a combo look survivable when it is not.

> **A WORD SEARCH DOES NOT FIND THESE, AND THE PROOF IS THE CASE THAT PROMPTED THE RULE.** Sweeping
> all 161 proposed entries for "ally" or "allied" found 12 — and **missed Shen R**, whose stored
> condition reads only *"Active channel; scales with target's missing health"*. The word that
> decides it is in the source's own sentence — *"granting the target allied champion a shield"* —
> not in anything the entry carries. So the population is a READ LIST, each member quoting the
> sentence it rests on, and adding one means reading its sentence rather than widening a pattern.

**6 entries removed, from 161 to 155.** DEFINITION: proposed `CuratedDefensiveEffect` entries whose
recipient is not the defender, over the 155 that remain plus the 6 dropped.

| Removed | Kind | Why |
|---|---|---|
| **Shen R** ×2 (Minimum, Maximum) | shield | the shield is placed on the ally Shen channels toward; he only travels there afterwards |
| **Kalista R** | immunity | Fate's Call makes the OATHSWORN untargetable; Kalista gains nothing |
| **Tahm Kench R** | shield | *"If the target is an ally, they are granted a shield"* — granted to them |
| **Taric W** | shield | the source splits the recipients in one sentence: the armor is Taric's and STAYS, the shield is the ally's and goes |
| **Yuumi R** | heal | **not ally-only — NOT READ.** Kept in its own list, see below |

**Where an effect protects both, only the self portion goes.** Taric W is the clearest: its
`resistance-grant` remains and its `shield` does not, from one sentence. Kayle R (*"herself or a
target allied champion"*), Milio E, Senna Q, K'Sante E and Braum W all protect the owner too and
are untouched.

**Milio W is the near miss worth recording.** Its heal reads *"Allied champions near the fuemigo"*,
which looks ally-only until the page's own footnote settles it: ***"Milio counts as an allied
champion."*** It is kept because a source says so, not because it looked likely.

**Yuumi R is refused for a DIFFERENT reason and kept in a separate list.** Yuumi channels at the
origin and launches the waves outward, and the source never says whether she is among the "allied
champions hit". Milio's page answers the identical question explicitly and Yuumi's does not. **Not
guessed in either direction**: storing it would grant protection that may never arrive, dropping it
silently would remove protection that may be real. It is dropped WITH that reason, and it is
revisitable — SPECIFICATION §8's PENDING, where ally-only is a decided fact.

**One entry was missed by the first filter and the miss is instructive.** Kalista R is an
immunity, which carries no value and is pushed from a different branch than the row loop the filter
sat in. It surfaced because the removal is measured by **the entries that actually left**, not by
the length of the read list — 4 read members produced 5 removals, and the discrepancy is what
exposed the second code path.

Gate 1 over the reduced set: **155 checked, 155 passed, 0 failed.**

**A test's exemplar moved, and the rule did not.** `defensive-propose.test.ts` used Shen R as its
example of alternating a Minimum/Maximum pair rather than summing it. Shen R is no longer in the
population, so the example is now Ekko R, whose heal really does carry such a pair. The assertion
is unchanged; moving an exemplar is not weakening a test.

---

## 50. A check that claims more than it measures (2026-08-14)

### 50.1 The defect, and why it is the smaller half

The burndown's resistance-math popover printed **`57.91960035475755 magic damage after resistances`**
at a reader — visibly and to a screen reader — on the default scenario. Two of the four mitigation
checkpoints the contract carries (`afterResistances`, `afterReductions`) are the engine's unrounded
WORKING values; only `final` arrives rounded. It is the identical defect `src/ui/primitives/readout.ts`
was written for on the same day, in a surface that file's sweep had never opened.

**HOW MANY FIGURES THE FIX CORRECTS. DEFINITION: occurrences of the pattern `\d+\.\d{3,}` in text
nodes and `aria-label`s inside `.burn__pop`, over every riser popover of every champion — 173
champions as attacker at level 11 with rank-3 abilities, combo Q → W → E → R → basic attack against
Garen at level 11, one popover opened at a time. Measured by reverting the fix and counting.**

| | |
|---|---:|
| Noisy figure occurrences | **2,450** |
| Distinct noisy values | **437** |
| Champions affected | **173 of 173** |

The rounding is applied at the popover's call site, never inside `DamageValue`, so the structural
guarantee holds: no component can round a damage figure a second time, and the engine's single
rounding point is untouched. `readout.ts`'s header said *"IT NEVER TOUCHES A DAMAGE FIGURE"*; that
sentence is deleted rather than reworded, because it would now be false.

### 50.2 The real problem: the claim was wider than the measurement

`rendered-figures.test.tsx` said it renders **"the WHOLE result surface"**. It rendered
`<HpBurndown>` and never opened a riser, so the popover was never in the tree it walks. **A check
that renders a component is not a check that has seen the component's states.**

**A wide claim is worse than a narrow one, because nobody goes looking behind it.** The sweep was
the obvious place to ask "is any figure noisy?", it answered yes-everything-is-clean, and it was
answering about a smaller surface than it named.

**Proved to fail rather than assumed to work.** With the popover fix reverted, the widened sweep
fails and names the champions. With it restored, it passes.

### 50.3 THE CENSUS — every surface that exists only on interaction

**DEFINITION: an element, or the text of a live region, that is absent from the rendered DOM (or
`display: none`) until a user focuses, hovers, clicks or types. Population read from every shipped
component under `src/ui/` — every `.tsx` reachable from `src/main.tsx`, which excludes `*.test.tsx`,
`preview.tsx`, and `slice/VerticalSlice.tsx` (a dev scaffold `main.tsx` does not mount).**

**"Reached by a sweep" means a check whose stated population is a whole surface or roster** —
`rendered-figures`, `interactive-names`, `roster-sweep`, `accessible-names`, `negative-zero-sweep`,
`rounding-presentation`, `token-audit` — as opposed to a targeted per-component test.

| # | Surface | Revealed by | Reached by a sweep? | Reached by any test? |
|---|---|---|---|---|
| 1 | Burndown resistance popover | riser focus / hover | **now yes** (was NO) | yes — but on a whole-number fixture |
| 2 | Champion picker option rows | field focus | yes | yes |
| 3 | Picker "no champion matches" row | focus + non-matching query | **NO** | yes |
| 4 | Picker match-count live text | field focus | **NO** | yes |
| 5 | Item pool result rows | field focus / typing | **now yes** | yes |
| 6 | Item status "N of M items match…" | field focus / typing | **NO** | yes |
| 7 | Item add/remove announcement | after an add or remove | **NO** | **NO — nothing anywhere** |
| 8 | Combo edit announcement | after add / move / remove | **NO** | yes |
| 9 | Breakdown full-state row | click the row's toggle | **NO** | yes |
| 10 | Odometer intermediate roll values | during the 300ms roll | **NO** | **NO — nothing anywhere** |

**Counts, against the definition above.** Surfaces 5, 6 and 9 did not exist at the start of the
session; they were created by the item-pool collapse and the state-column change, so the honest
comparison is stated twice:

- **At session start (commit `e6f8800`): 7 interaction-only surfaces, of which 1 was reached by a
  sweep and 6 were not.** Two of those six — the item announcement and the odometer roll — were
  reached by no test at all.
- **Now: 10 interaction-only surfaces, of which 3 are reached by a sweep and 7 are not.** The same
  two are still reached by no test at all.

**The two with no coverage anywhere are named rather than quietly left.** The item picker's
add/remove announcement is a live region whose text a screen reader user is the only person who
ever receives — exactly the class §41.1's spoken-string defects came from. The odometer's
intermediate values exist only mid-animation, which jsdom does not run; that one may be
untestable without a real browser, and saying so is better than implying it is covered.

### 50.4 The rule this leaves behind

**A check states what it OPENS, not only what it renders.** Three headers were corrected on
2026-08-14, and none of them by widening a claim without widening the measurement:

- `rendered-figures.test.tsx` — the word "WHOLE" is gone; it now lists what it opens (every riser
  popover) and what it does not render at all, and it asserts the number of popovers it opened so
  a refactor that stops mounting them fails instead of silently shrinking the population.
- `interactive-names.test.tsx` — its coverage claim now states the condition that keeps it true:
  each fixture is measured in its default state plus exactly the surfaces its `after` hook opens,
  and a control revealed by any other interaction is outside it and would not be noticed.
- `src/ui/burndown/HpBurndown.test.tsx` — its popover tests are annotated with what they cannot
  see: a fixture of whole numbers has no fractional tail to mangle, so they prove the popover
  opens and is correct in structure while being blind to how a figure is formatted.

**And `readout.ts` had its scope sentence deleted rather than softened**, because the fix made it
false. A header that is merely *narrowed* after the fact still misleads anyone who read it before.

### 50.5 The same defect a second time, in a different area (2026-08-14)

**A check passed because it was run from the wrong starting point.** This is §50.2's failure
exactly — a check whose population did not include the failing case — and it happened again
within hours, in an unrelated area, which is why it is recorded beside it rather than on its own.

**The case.** `/index.html` loads a redirect so that a URL carrying a shared scenario lands on the
calculator rather than the landing page (SPECIFICATION §12). It was verified in a real browser
and it passed: navigate to `/#s=…`, arrive at `/calculator/` with the right matchup. Committed,
pushed.

**It only ever worked on a cold load.** A module runs once per DOCUMENT load. Changing only the
fragment of the current URL is a SAME-DOCUMENT navigation — the browser fires `hashchange` and
loads nothing. So a reader already sitting on the landing page who pasted a shared link into the
address bar changed the fragment and stayed exactly where they were: on the front page, holding a
scenario, with the redirect module long since finished.

**Why the verification missed it.** It navigated from `/calculator/` to `/#s=…` — a DIFFERENT
document, so a full load, so the module ran. The one starting point that reproduces the defect is
the landing page itself, and that is the one the check did not start from.

| | §50.2, the popover | §50.5, the redirect |
|---|---|---|
| The check | renders the result surface | navigates to a shared link |
| What it never did | open a riser | start from the landing page |
| Why it looked complete | the component WAS rendered | the navigation DID happen |
| What was actually untested | every state behind an interaction | the only path that does not reload |

**THE COMMON SHAPE, STATED ONCE FOR BOTH.** A check exercises a *starting state* as much as an
action, and the starting state is the half nobody writes down. "Render the component" is not
"see the component's states"; "navigate to the URL" is not "arrive at the URL from everywhere a
reader can". **When a check has a starting point, the starting point is part of its population and
belongs in its stated definition.**

**The fix, and what made it testable.** `installScenarioRedirect` moved out of the entry module
into `src/url/entry.ts` and now takes the narrow slice of `window` it needs. That was not
tidying: the entry module had a top-level side effect, so importing it in a test threw `window is
not defined` and the behaviour **could not be tested at all**. Three tests now hand it a fake and
watch — including that the `hashchange` listener is registered before the first check and
unconditionally, because a reader who arrived with one scenario and pasted another would
otherwise be stranded on the second.

Verified on the path that failed: load the landing page, then change only the fragment. Lands on
`/calculator/` with the shared matchup, and the landing page never renders.
