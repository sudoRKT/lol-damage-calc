# DESIGN-AUDIT.md — the built interface against DESIGN.md

**Audited 2026-08-14.** Measured on the live page at a 1440×1100 viewport, default scenario
(Lux vs Garen, level 6, no items), served by `npm run dev` from commit `21c3b11`.

**Why this file exists.** The interface is a working prototype wearing the tokens; it is not yet
"Bench Test". Everything below was measured rather than judged, so a later session can act on it
without re-deriving it — and can tell what has moved by re-running the same measurements.

**STATUS, 2026-08-14: item 1 of the order of work at the end is DONE and item 2 is in progress.**
The original text of this file is preserved below exactly as it was measured, because a record that
is edited to match the present cannot show what moved. **Section 6 at the end is the re-measurement**
— every figure taken the same way, on the same viewport and scenario. Read this file top to bottom
for the diagnosis and section 6 for the current state.

Two things this file now also carries, and both are conclusions rather than observations:
**§3's type histogram is NOT a target and must not be optimised** (section 6.3), and a
**SPECIFICATION §10 violation on mobile that predates all of this work** (section 6.5).

> **Every count states what it counts.** Where a figure is a share, both the numerator and the
> denominator are named. Where a figure came from the DOM, the selector and the state of the page
> are named.

---

## 0. The headline: the whole first screen is a form, and the instrument is below it

**DEFINITION — region geometry:** `getBoundingClientRect()` plus `window.scrollY` for the top edge,
and the element's own rendered height, on the default scenario at a 1440×1100 viewport. Page height
is `document.documentElement.scrollHeight`. Share is the region's height over the page height.

| Region | Selector | Top edge | Height | Share of page |
|---|---|---:|---:|---:|
| Page title | `.app__title` | 49px | — | — |
| **Configuration row** | `.app__row` | 133px | **921px** | **24.3%** |
| **HP burndown** — the signature element | `.burn` | **1409px** | 633px | 16.7% |
| Per-instance breakdown | `.breakdown-panel` | 2066px | 960px | 25.3% |

- **Page height 3,793px against a 1,100px viewport — 3.4 screens.**
- **The fold is at 1,100px. The burndown begins at 1,409px — 309px below it.**
- The configuration row occupies 133–1054px, so **the entire first screen is inputs**.

DESIGN.md §0 asks for something "closer to a fighting-game frame-data table or an oscilloscope
than to the League client". §7 calls the burndown "the one place the animation budget is spent and
the product's remembered object". A reader currently scrolls past a full screen of form controls to
reach it. **This single fact is most of why the page reads as a form rather than an instrument.**

---

## 1. Section by section

### §0–§1 — direction and the reserved-hue law · **holding**

No hue outside the permitted set appears anywhere. Notices and refusals are neutral surfaces with a
border and a label — there is no red error panel and no green success panel. This is the section
that has held up best, and it held up under four concurrent agents.

### §2 — colour tokens · **holding**

Every rendered border colour is a palette value. **DEFINITION — rendered border treatments:**
distinct `borderTopWidth + borderTopStyle + borderTopColor` over every element on the page,
excluding zero-width borders. Four appear, and all four are from §5's vocabulary:

| Rendered | Token | §5 role |
|---|---|---|
| `1px solid rgb(46,55,66)` | `--line-subtle` via `--border-hair` | internal separators within a panel |
| `1px solid rgb(58,69,81)` | `--line-steel` via `--border-steel` | the default border |
| `1px solid rgb(85,98,111)` | `--line-strong` via `--border-strong` | emphasis, hovered controls |
| `2px solid rgb(237,233,222)` | `--text-primary` via `--border-active` | selected / active |

> **A CORRECTION TO AN EARLIER READING OF THIS, RECORDED SO IT IS NOT REPEATED.** A first pass
> counted only direct `var(--token)` occurrences in the component stylesheets, found zero for
> `--line-subtle` and `--line-strong`, and concluded the interface had *"one separator weight where
> the design specifies three"* — and that the resulting flatness was a cause of the form reading.
> **That was wrong.** Both are used indirectly, through `--border-hair` (7 references) and
> `--border-strong` (7 references), and the DOM confirms all four treatments render. The border
> vocabulary is complete. The flatness diagnosis rests on §4's spacing and §3's type distribution
> instead, both of which are measured below.

### §3 — typography · **the scale exists; the hierarchy does not**

All three faces load. Every rendered weight is from the permitted set — no weight outside it.

**DEFINITION — leaf text nodes:** visible elements (`offsetParent !== null`) that contain text and
have no element children, on the default scenario. **366 in total.**

**By face:** IBM Plex Sans 197 · JetBrains Mono 133 · Saira 36.
**By weight:** 400 → 218 · 500 → 111 · 700 → 26 · 600 → 11.

**By rendered size:**

| Size | Nodes | Role in §3's scale |
|---:|---:|---|
| 11px | 141 | `--type-body-s` / `--type-num-s` / `--type-eyebrow` |
| 13px | 119 | `--type-body-m` / `--type-num-m` |
| 15px | 61 | `--type-body-l` |
| 16px | 12 | `--type-num-l` |
| 11.2px | 10 | the 0.7em damage tag at `--type-num-l` |
| 10px | 8 | the damage tag at its 10px floor (§8) |
| 24px | 7 | `--type-display-l` |
| 18px | 5 | `--type-display-m` |
| 28px | 2 | `--type-num-hero` |
| 32px | 1 | `--type-display-xl` |

**321 of 366 leaf nodes (88%) sit at 11px, 13px or 15px. Three sit at the two largest roles**
(one at 32px, two at 28px), and 15 sit at 18px or above.

The type scale has eleven roles and the page effectively uses three. **An instrument earns its
hierarchy from a few very large readouts anchoring a dense field of small ones.** This is a dense
field with almost nothing to anchor it.

### §4 — spacing · **uniform where §4 asks for it to be graded**

`.app` sets `padding: 24px` and `gap: 24px` — `--space-5` — between *every* major region:
configuration, burndown, breakdown and stat blocks are all separated identically.

§4 is explicit that this should not be uniform: *"prefer the smaller steps inside panels and
reserve the larger steps for separating major regions"*, with `--space-6` (32px) for "separation
between major sections" and `--space-7` (48px) for "top/bottom page regions". Those tokens exist
and are used elsewhere (`--space-6` ×3, `--space-7` ×2, `--space-8` ×4 references) but not on the
page's own rhythm.

**Everything is at one rhythm, so nothing groups.** This is the second major cause of the form
reading, after the fold.

**Table density — the sharpest instance.** **DEFINITION:** rendered height of the first `<tr>` in
`.breakdown tbody`, default scenario.

| | Measured | §4 specifies |
|---|---:|---|
| Breakdown row height | **63px** at 13px type | `--space-2` (8px) vertical cell padding |

A frame-data table at this type size lands around 28–32px per row. **The rows are roughly double
the specified density.**

### §5 — radius, borders, elevation · **one real absence**

Radii are correct: 4px on panels, 2px on controls, 0 on grid cells. Border weights match §5 (see
§2 above). **DEFINITION — rendered shadows:** distinct non-`none` `boxShadow` values over every
element. Exactly one appears: `rgba(0,0,0,0.5) 0 6px 20px` — `--elev-2`, on popovers, which is
what §5 permits ("if it is not a popover, it does not get `--elev-2`").

**DEFINITION — unused tokens:** of the 63 tokens defined in `src/ui/tokens.css`, those with zero
`var(--token)` references across the 14 component stylesheets **and** zero references from another
token's definition. **Two: `--elev-0` and `--elev-1`.**

- `--elev-0: none` being unused is harmless — it means "no shadow", which is already the default.
- **`--elev-1` is the one genuinely missing token.** §5 describes it as *"a barely-raised panel;
  the top inset highlight reads as a machined edge"*. That inset highlight is precisely the detail
  that makes a surface read as milled metal rather than as a card. It is defined and never used.

One oddity with no token behind it: a `0px 0px 0px 2px` asymmetric border-radius appears in the
rendered output.

### §6 — verification status and interaction states · **holding**

Glyph plus label, neutral throughout, no hue. `summaryNote` changes its sentence with the status so
*derived* never reads as a shortfall and *incomplete* never reads as ordinary. Implemented as
written.

### §7 — the HP burndown · **built faithfully, but demoted**

The chart itself matches the specification: grey treads, coloured risers by damage type, the
odometer at `--type-num-hero`, the composition bar, the LETHAL rule and its callout chip, the
hatched DoT tail, and the healing riser added 2026-08-14.

What is wrong is its **standing**, not its construction. It sits third on the page, at 16.7% of
total height, entirely below the fold, framed identically to every other panel — same border, same
padding, same gap. §7 says the identity of the product is concentrated here. Nothing in the layout
says so.

### §7a — the locked layout · **half implemented**

The stacked arrangement is built: two configuration panels across the top, burndown full width
beneath, single column below 1280px ✓.

**The ad rails are not.** **DEFINITION:** elements matching `[class*="rail"], [class*="ad-slot"]` —
**zero**. §16 requires fixed-dimension reserved containers so that ad loading causes no layout
shift, and §7a's entire justification for the stacked arrangement is to let the rails appear at
roughly 1280px rather than 1440px. The layout exists; the constraint it was shaped around does not.

### §8 — the damage-type tag · **implemented, and the subject of Part 2 below**

Every damage figure carries its tag. The composition bar moves its labels rather than distorting
its proportions (resolved 2026-08-14). Working exactly as specified — and the specification is what
is wrong. See Part 2.

### §9 — official game art · **the best-implemented section**

**DEFINITION — measured element widths** via `getBoundingClientRect()`, and `filter` via
`getComputedStyle`, on the default scenario with the attacker picker open.

| §9 specifies | Measured |
|---|---|
| ability icons 32px in the combo builder | 32px ✓ |
| icons 24px in tables | 24px ✓ |
| combat chip: 2px damage-type underline **and** a corner tag | both present; underline renders `rgb(61,169,224)` = `--dmg-magic` ✓ |
| non-damaging chip: neutral underline, em-dash marker | `rgb(58,69,81)` = `--line-steel`, tag `—` ✓ |
| portraits 64px nameplate / 40px picker rows | 68px and 42px (each +4px, from a 2px border on each side) |
| portraits desaturated until active | picker rows `grayscale(1) brightness(0.7)`; combatants `none` ✓ |

**One drift:** §9 says portraits are *"desaturated and tinted toward `--bg-panel`"*. The
implementation is greyscale plus a brightness reduction — desaturation without the tint, so they
read as grey rather than as cooled toward panel steel.

### §10 — motion · **holding**

Durations match §10's table. Reduced motion is now enforced by a mechanical sweep over every
animated selector in every stylesheet (added 2026-08-14, after a real-browser defect where a
`backwards`-filled animation stuck at its first keyframe for exactly the users who asked for less
motion).

---

## 2. Three missing SPECIFICATION requirements, and they are layout-affecting

Not DESIGN.md gaps, but each occupies space and so belongs in any layout rework rather than being
bolted on afterwards. **DEFINITION:** text search over `document.body.innerText` on the default
scenario.

| Requirement | Source | Present |
|---|---|---|
| The Riot disclaimer — "not endorsed by Riot Games…" | SPECIFICATION §15, "readily visible" | **No** |
| The scope disclaimer — "does not account for crowd control…" | SPECIFICATION §15, "displayed alongside results" | **No** |
| Report-a-wrong-number control, pre-populated with the scenario | SPECIFICATION §8, "every result carries" | **No** |

The excluded-mechanics panel (§11) **is** present.

---

## 3. Part 2 — the damage-type tag reads as an ability slot

### The finding, and the reframing that matters

A League player looking at an ability chip marked **`M`** reads it as an ability *letter*, not as
magic damage. Measured: the chip renders `M` at 11px in its corner — exactly where a player expects
`Q` / `W` / `E` / `R`. **The cue is correct and unreadable, which makes it decoration rather than a
cue.**

> ### THE REFRAMING — the constraint is narrower than the build assumes
>
> **SPECIFICATION §10.1 requires only that damage type is never conveyed by colour alone.** It does
> not require a letter, and it does not require the cue to sit on the icon.
>
> **The letter, and its placement on the chip, are DESIGN.md §8's and §9's additions — not the
> specification's.** Both are therefore available to change without touching, weakening or
> reinterpreting the colour-alone rule.
>
> This is the useful part of the finding. A future session should not start by assuming the letter
> is fixed.
>
> ---
>
> ### ⚠ CORRECTION, 2026-08-14 — THE REFRAMING ABOVE IS HALF WRONG, AND THE WRONG HALF MATTERS
>
> **SPECIFICATION §10.1 named the three letters literally**, in its own words: *"a damage-type tag
> — `P` for physical, `M` for magic, `T` for true — placed with the value"*. The paragraph above
> says the letter is DESIGN.md's addition. It is not, and the error was found only when the change
> was implemented and the specification was re-read line by line.
>
> **What the reframing was RIGHT about:** the letter's PLACEMENT on the icon-chip is DESIGN.md §9's
> addition, and the specification says nothing about it. That half stands.
>
> **What it was WRONG about:** adopting option A was a change to SPECIFICATION §10.1 as well as to
> DESIGN.md, and it was made and recorded as one. The specification now carries the word tag and a
> note explaining the change and this correction.
>
> **The lesson is not "read more carefully" — it is that an audit that reframes a constraint must
> quote the constraint.** This one paraphrased it. A quotation would have shown the letters.

### Option A — the slot goes on the chip; the type becomes a word on the figure · **recommended**

The chip carries `Q`, `W`, `E`, `R`, `P` — the notation a player already reads, on the object they
expect it on. Damage type leaves the chip entirely and appears only where a **number** appears, as a
word-fragment rather than a letter: `214 phys`, `180 mag`, `240 true`.

- **It removes the collision rather than softening it.** The ambiguous glyph is gone from the
  ambiguous place. A slot letter never appears beside a figure and a type word never appears on a
  chip, so position alone disambiguates them.
- **It strengthens the colour-alone rule rather than weakening it.** A word is a better non-colour
  channel than a single letter: no legend, no learning, and it survives greyscale, copy-paste and a
  screen reader identically.
- **Measured cost:** `phys` is roughly three times the width of `P` in JetBrains Mono. In the
  composition bar and the burndown riser labels that is real estate, and it would push labels below
  the bar more often. **That path already exists and is tested** (DESIGN.md §7, resolved
  2026-08-14), so the cost is absorbed rather than new.
- The chip's damage-type underline stays as the fast, redundant channel. It is already correct.

> **WHAT IMPLEMENTING IT ACTUALLY COST, measured 2026-08-14. Two of these are larger than the
> estimate above and one is a defect option A would have introduced.**
>
> 1. **"More often" turned out to be "always."** The longest inline composition-bar label measures
>    70px at `--type-num-s`, and the narrowest bar this product draws is the breakdown's
>    running-total column at **109px** — not the ~200px the threshold's original derivation
>    assumed. Two shares sum to 1, so they cannot both clear 70/109, and every split of two or more
>    damage types now puts its labels below the bar. The inline layout survives only for a
>    single-type bar.
> 2. **The same measurement showed the OLD threshold was already wrong.** At 0.25, a segment
>    holding 30% of a 109px bar had 33px of room for a 52px one-letter label. That was a latent
>    instance of the very defect the threshold exists to prevent, and it predates option A.
> 3. **Option A as written removes the chip's only visible non-colour cue, and that was not
>    adopted.** "Damage type leaves the chip entirely and appears only where a number appears"
>    leaves a combo-shelf chip with its underline hue alone — and on the shelf there is no result
>    yet, so there is no number anywhere to carry the type. The build keeps the type on the chip as
>    a **word beneath it**, which is the same vocabulary a figure uses.
> 4. **It made the mobile overflow worse, by a measured amount.** At a 375px viewport the plot area
>    is 187px, so four burndown columns are 47px each while a riser label is 49–59px — wider than
>    its own column. Two adjacent labels overlap, where the one-letter tag cleared by 6px. Page
>    scrollWidth went 609px → 648px. Narrowing the label's inset was tried and rejected: the inset
>    is what holds each label clear of the previous one, so shrinking it moves them together. This
>    is folded into §6.5's mobile item, which is where the honest fix lives.

### Option B — solve it only where it breaks

Chips carry the slot letter and lose the tag; every damage **value** keeps `P`/`M`/`T` exactly as
today, because a value never sits where a slot letter is expected. The chip's non-colour cue
becomes a **stroke pattern** on the existing underline — solid / dashed / dotted per type.

- **Smallest change.** The composition bar and the riser labels are untouched.
- **But it contradicts §8's own written reasoning**, which explicitly rejects border style as *"a
  second visual-only channel that also fails low-vision users"*. Adopting it means overturning that
  argument in writing rather than quietly. A 2px dashed rule 24px wide is a weak channel, and it
  needs a legend — which §8 chose letters specifically to avoid.

### Option C — type becomes structure, not an annotation

Damage type stops being a per-item cue. The breakdown table gains a **Type column** carrying the
full word; the composition bar and its legend carry it for the chart; chips carry only the slot.

- **Strongest readability** — full words, no abbreviation, no collision — and the cue becomes
  structural rather than ornamental, which is the most "instrument" of the three.
- **But it does not cover a floating figure**: a riser label, a tooltip, a curve point. Those still
  need a per-figure cue, so C in practice means C *plus* A's word suffix. That makes it the largest
  change and not a substitute for A.

**Recommendation: A**, with C as a later refinement of the table specifically. B is cheapest and
buys the least, and requires reversing a written argument to get it.

---

## 4. Proposed order of work

1. ~~**Layout and hierarchy.** The fold problem, the spacing grade (§4), table density.~~
   **DONE 2026-08-14** — commits `658d61c` and `a09cd0c`. Re-measured in section 6.
2. **The tag decision** (Part 2). It changes chips, values and the composition bar together, so it
   is better done once, after the layout settles. **Option A adopted 2026-08-14** by the project
   owner, on the comprehension finding rather than on the cue being wrong.
3. **The instrument details.** `--elev-1`'s machined edge; the stray asymmetric radius.
4. **Reserved containers and the missing requirements.** Ad slots, both disclaimers, the report
   control — all layout-affecting, so they should land before anything is called finished.
5. **The mobile horizontal overflow** (section 6.5). A SPECIFICATION §10 violation, pre-existing,
   and the only item on this list that is a spec breach rather than a design shortfall.
6. **§9's portrait tint** — cool toward `--bg-panel` rather than plain greyscale. Smallest item.

> **One caution worth carrying forward.** Items 1 and 3 are where "Bench Test" actually lives, and
> they are the two most tempting to defer, because nothing is *broken*. The interface is correct
> and characterless. Correctness is what we already have.

---

## 6. The re-measurement, 2026-08-14

Same viewport (1440×1100), same scenario (Lux vs Garen, level 6, no items), same method as
everything above. Commits `658d61c` (layout and hierarchy) and `a09cd0c` (the item pool and the
state column).

### 6.1 Region geometry — the headline figure moved

**DEFINITION unchanged from §0:** `getBoundingClientRect()` plus `window.scrollY` for the top
edge, the element's own rendered height, `document.documentElement.scrollHeight` for the page.

| | Audited | Now |
|---|---:|---:|
| Page height | 3,793px (**3.4 screens**) | 3,286px (**2.99 screens**) |
| Configuration row `.app__row` | 921px | **413px** |
| Combo builder `.combo` | 226px | **107px** |
| **HP burndown `.burn` — top edge** | **1,409px** (309px below the fold) | **750px (350px above it)** |
| The chart itself `.burn__plot` — top edge | 1,541px | **865px** (235px above the fold) |
| Per-instance breakdown `.breakdown-panel` | 2,066px | 1,414px |

**The fold is at 1,100px. The whole instrument header and the first 235px of the chart are now
above it.** §0's sentence — "the entire first screen is inputs" — no longer holds: the first screen
is both champions, the combo, the running total, the verdict and the top of the burndown.

### 6.2 The spacing grade (§4)

**DEFINITION:** rendered vertical distance between adjacent top-level children of `.app`, plus the
computed `gap` of each container, on the default scenario.

Before, one value: `--space-5` (24px) between every region, and 24px page padding on all sides.
Now: **32px** between the three regions (setup / result / detail), **16px** between panels inside a
region, **24px** as the side-by-side grid gutter, **48px** at the page foot, **8px** between the
burndown and its caption plate. Five steps where there was one. §4 was amended the same day to
record the page-top asymmetry rather than leave it as an undocumented deviation.

### 6.3 §3's TYPE HISTOGRAM IS NOT A TARGET — DECIDED 2026-08-14, DO NOT OPTIMISE IT

**DEFINITION unchanged from §3:** visible elements (`offsetParent !== null`) containing text with
no element children. **366 before, 366 after. Nodes at 18px or above: 15 before, 15 after.**

**That figure did not move, it was not supposed to, and a later session must not treat it as a
score to raise.** §3 above measured it as a *symptom* of the interface reading as a form. It was a
correct symptom and the wrong lever, for a reason that is only visible once you try to move it:

> **DESIGN.md §3 assigns its large roles to a short, fixed list of elements** — the page title and
> the matchup header (`--type-display-xl`), panel and section headers (`--type-display-l`),
> subsection labels (`--type-display-m`), the rolling combo total (`--type-num-hero`) — and assigns
> 11–13px *by name* to everything else: table number cells, chip labels, axis captions, footnotes.
> **On this page those assignments produce almost exactly 15 nodes.** Raising the count means
> granting a large role to an element §3 does not give it to, which is a change to DESIGN.md
> disguised as a polish pass.

**Hierarchy here comes from the anchors having POSITION and SEPARATION, not from there being more
of them.** What actually changed: the 32px matchup sits alone in a masthead band instead of over
two rows of grey text; the 28px rolling total and the verdict sit together inside a framed
instrument above the fold instead of below it; and the 24px section headers are separated by 32px
region gaps instead of being one of eight identically-spaced panels. None of that is visible in a
histogram, which is why the histogram stopped being the measure.

The one type change made was the verdict chip, `--type-display-m` → `--type-display-l`. It is the
answer to the user's question, and it also puts the LETHAL chip's magenta border unambiguously
inside §2's "large/bold only" contrast rule, which at 18px bold was marginal.

### 6.4 The breakdown table

**DEFINITION:** rendered height of each `<tr>` in `.breakdown tbody`, default scenario, with no row
expanded. **Before: 63 / 63 / 63 / 63. Now: 39 / 40 / 63 / 63.**

§4 above attributed this to padding and it is worth recording that **that was wrong**: the vertical
padding was already `--space-2`, and the state text was already `--type-body-s`, so both of the
obvious levers were spent before the pass began. The cause was that the cell printed the whole
state snapshot on every row — **12 phrases, 6 of which read zero on every row.** The column now
carries only what differs from the entry state, the entry state is printed once below the table,
and each row has an expand holding its full unfiltered snapshot.

**The two rows still at 63px are a different cause and are not waste.** From instance 3 the running
total spans two damage types, making it an untagged aggregate — which DESIGN.md §8 permits only
beside a tagged composition bar. 18px of figure plus 22px of bar and labels is 44px of construction
§8 requires. Reducing those rows means revisiting §8, not the layout.

### 6.5 TRACKED WORK — the page scrolls sideways on a phone, and that is a SPECIFICATION violation

**DEFINITION:** `document.documentElement.scrollWidth` against `clientWidth` at a 375×812 viewport,
default scenario. **scrollWidth 579px against a 375px viewport — 204px of horizontal overflow.**

**The cause is the `.breakdown` table**, whose six columns have a combined minimum width no phone
viewport can hold. Every other panel fits: the configuration and item panels each have a
minimum-content width of 282px, inside the 327px available.

**This PREDATES the layout work and was measured against the untouched code to be certain** — the
overflow is 579px both before and after commit `658d61c`. It is therefore out of scope for that
pass and is recorded here rather than being left to be rediscovered.

**It is nonetheless a spec violation, not a rough edge.** SPECIFICATION §10: *"The interface is
fully responsive. Layouts adapt for mobile, where a significant share of usage occurs."* A table
that forces the whole page to scroll horizontally is the single most common way a layout fails that
sentence, and it fails it on the product's primary output.

Not fixed here, and deliberately not fixed in passing: the honest options are a horizontally
scrolling container around the table alone (keeps every column, confines the scroll), or a stacked
card layout per instance below some width (loses column alignment, which is most of what makes a
frame-data readout readable). That is a design decision, and it is the fifth item in the order of
work below rather than something to bolt on.

---

## 5. How to re-measure this

Every figure above came from the live page. To reproduce: `npm run dev`, open the app root at a
1440×1100 viewport on the default scenario, and read back region geometry, leaf text nodes, rendered
borders, shadows and radii from the DOM. Token usage is a static count over
`src/ui/**/*.css` against the definitions in `src/ui/tokens.css`, and **must count a token
referenced by another token's definition as used** — the correction recorded in §2 above is exactly
the error that omission produces.
