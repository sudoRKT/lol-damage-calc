# DESIGN.md — "Bench Test"

The design token file required by SPECIFICATION.md §10.1. This is the single source of
truth for colour, type, spacing, radius, borders, elevation, motion, the signature
element, and how official game art is used.

**Every agent building interface work reads this file first and derives every colour,
type size, and spacing value from it. Do not introduce a colour, typeface, size, radius,
or spacing value that is not defined here.** If you need something this file does not
provide, raise it with the lead session — do not invent it locally. That is what keeps
two agents building two different components from producing two different-looking
products.

Token names below are the names to use in code (CSS custom properties / a shared token
module). Two components referring to `--dmg-magic` will always be the same blue.

---

## 0. The direction in one paragraph

The product is a cold, precise measuring instrument — closer to a fighting-game
frame-data table or an oscilloscope than to the League client. It is dense on purpose:
tables, a step chart, resistance math shown in full. Its one source of warmth is
**meaningful colour** — every damage figure is coloured by its damage type, which is
League's own convention made structural, not decoration. The look is graphite and steel
with three semantic damage hues, read at a glance by an analyst on a second monitor.

---

## 1. The reserved-hue law (read this before the palette)

**The only hues in this product are: the three damage types (physical / magic / true),
lethal-magenta, and the transient recent-damage gold. Nothing else is coloured.**

Every other surface — backgrounds, panels, text, borders, interaction states (hover /
selected / focus / disabled), and verification status (verified / derived / incomplete)
— is neutral: graphite, steel, and bone. Interaction and status are shown with
**brightness, weight, border, glyph, and label — never with a new hue.**

If you find yourself wanting a green "success" or a red "error" or a blue "link" colour:
stop. Use a neutral surface plus a glyph and a label. Hue is reserved for data meaning
only. This one rule, followed literally, is what makes concurrently built components look
like one instrument.

---

## 2. Colour tokens

Hex values are exact. "Used for" and "Never used for" are binding.

### Surfaces and structure (neutral)

| Token | Hex | Name | Used for | Never used for |
|---|---|---|---|---|
| `--bg-base` | `#1E242C` | Graphite | The page canvas behind everything | Not pure black — never use `#000` as a background |
| `--bg-well` | `#171C22` | Well | Inset areas: input fields, the plot background, table wells | Raised surfaces |
| `--bg-panel` | `#262E38` | Panel steel | The default raised instrument surface: cards, config panels, table headers | The page canvas |
| `--bg-panel-raised` | `#2E3742` | Raised steel | Hover state of a panel, selected rows, the surface of popovers/menus | Large static fills (too light to read text against comfortably at length) |
| `--line-subtle` | `#2E3742` | Hair line | Internal grid lines, faint separators inside a panel | Primary component borders |
| `--line-steel` | `#3A4551` | Steel line | The default 1px border on panels, inputs, chips, table cells | — |
| `--line-strong` | `#55626F` | Strong line | Emphasis borders, the plot's zero axis, hovered control borders | Decoration |

### Text (neutral)

| Token | Hex | Name | Used for | Contrast on `--bg-base` |
|---|---|---|---|---|
| `--text-primary` | `#EDE9DE` | Bone | All primary text, headings, body | 12.9 : 1 (AAA) |
| `--text-secondary` | `#9AA4AF` | Steel text | Secondary labels, captions, axis numbers, units | 6.2 : 1 (AA) |
| `--text-muted` | `#6B7580` | Muted | Disabled controls, placeholder text, hints **only** | 3.3 : 1 — below AA body; permitted only for disabled/placeholder, which WCAG exempts |

### Damage-type hues (semantic — this is the data)

| Token | Hex | Name | Used for | Contrast on `--bg-base` |
|---|---|---|---|---|
| `--dmg-physical` | `#E8833A` | Physical orange | Physical damage values, their burndown risers, their icon-chip underlines | 5.8 : 1 (AA) |
| `--dmg-magic` | `#3DA9E0` | Magic cyan | Magic damage values, risers, chip underlines | 5.9 : 1 (AA) |
| `--dmg-true` | `#F0ECE0` | True bone-white | True damage values, risers, chip underlines | ~13 : 1 (AAA) |

Note on true damage: it is a **warm** near-white. The HP trace (below) is a **cool**
grey. That warm/cool split keeps true-damage marks distinct from the neutral HP line
even for red-green colourblind viewers (the difference is on the blue-yellow axis, which
red-green deficiency preserves). The mandatory `true` tag (§8) is the definitive cue.

### Special markers

| Token | Hex | Name | Used for | Rule |
|---|---|---|---|---|
| `--lethal` | `#E0457B` | Lethal magenta | The LETHAL vertical rule, kill callouts, a defeated total | Contrast on base is 3.9 : 1 — **large/bold only** (≥ 24px, or ≥ 18.66px bold). Never magenta small body text. Never any damage type. |
| `--flash-recent` | `#F4D06F` | Recent gold | The transient "just-lost HP" ghost on the burndown only | Transient and motion-carried; never a static fill, never a value colour. Tuned yellower/brighter than physical orange so the two never read as the same thing. |
| `--hp-trace` | `#C3CCD6` | HP grey | The remaining-HP line and its plateaus in the burndown | Neutral cool grey; never a damage value |

### Contrast — how these were checked

The ratios above are WCAG 2.1 relative-luminance ratios I computed by hand from the hex
values against `--bg-base`, not estimates. Binding consequences: **body text uses only
bone or steel-text**; **damage hues clear AA (≥ 4.5) for normal text**; **magenta is
large/bold only**; **muted grey is disabled/placeholder only**. Any new pairing an agent
introduces must be checked the same way before use.

---

## 3. Typography

Three typefaces. All three are licensed under the **SIL Open Font License 1.1**, which
permits commercial use, embedding, and self-hosting at no cost.

**Recommended loading: self-host** (do not hot-link Google Fonts). A self-hosted static
app makes no third-party font request, which keeps first paint under local control (§13)
and avoids a third-party data flow that the cookie/consent surface (§15) would otherwise
have to cover. Install via the Fontsource packages and import the specific weights, or
download the families from Google Fonts / the source repos and serve the `woff2` files
yourself.

| Face | Role | Licence | Fontsource package | Source repo | Google Fonts |
|---|---|---|---|---|---|
| **Saira** | Display / headers | OFL 1.1 (Omnibus-Type) | `@fontsource/saira` | github.com/Omnibus-Type/Saira | fonts.google.com/specimen/Saira |
| **IBM Plex Sans** | Body / labels | OFL 1.1 (IBM) | `@fontsource/ibm-plex-sans` | github.com/IBM/plex | fonts.google.com/specimen/IBM+Plex+Sans |
| **JetBrains Mono** | Numbers / tables | OFL 1.1 (JetBrains) | `@fontsource/jetbrains-mono` | github.com/JetBrains/JetBrainsMono | fonts.google.com/specimen/JetBrains+Mono |

**Why each was chosen for this product**

- **Saira (display)** — a technical, slightly condensed grotesque. It packs into narrow
  headers and rail labels without shouting, and it reads as engineered instrumentation
  rather than editorial or decorative. It is the instrument's nameplate voice.
- **IBM Plex Sans (body)** — drawn for IBM's engineering documentation: literate but
  machined. Chosen specifically instead of Inter so the interface does not carry the
  generic-SaaS fingerprint Inter now signals.
- **JetBrains Mono (numbers)** — built for dense readouts, with unambiguous `0 O 1 l`
  (its zero is dotted by default) and monospaced-so-inherently-tabular figures. In a tool
  whose entire worth is a column of numbers being right and aligned, the numeric face is
  the most important type decision, and this one is engineered for exactly this job.

### Weights to load (keep to these — do not add weights)

- Saira: **500** (Medium), **600** (SemiBold)
- IBM Plex Sans: **400** (Regular), **500** (Medium), **600** (SemiBold)
- JetBrains Mono: **400** (Regular), **500** (Medium), **700** (Bold)

### Weight tokens (added 2026-08-13)

The table below stated a weight per type role in prose while the token file exposed none, so
every component carried a numeric literal and the token audit could only compare those literals
against a table — the one part of this file that agents had to retype by hand. These are the
same seven weights already listed above, named. **Use the token, never the number.**

| Token | Value | Face | Used by |
|---|---:|---|---|
| `--weight-display` | 600 | Saira SemiBold | `--type-display-xl`, `--type-display-l` |
| `--weight-display-medium` | 500 | Saira Medium | `--type-display-m`, `--type-eyebrow` |
| `--weight-body` | 400 | IBM Plex Sans Regular | `--type-body-l`, `--type-body-m` |
| `--weight-body-medium` | 500 | IBM Plex Sans Medium | `--type-body-s` |
| `--weight-body-strong` | 600 | IBM Plex Sans SemiBold | Emphasis inside body copy |
| `--weight-num` | 400 | JetBrains Mono Regular | `--type-num-m`, `--type-num-s` |
| `--weight-num-medium` | 500 | JetBrains Mono Medium | `--type-num-l` |
| `--weight-num-bold` | 700 | JetBrains Mono Bold | `--type-num-hero` |

No weight outside this set exists in the product. Adding one means loading another font file,
so it is a change to the section above and not a local decision.

### Type scale (rem with px at a 16px root; line-heights are unitless)

| Token | Face / weight | Size | Line-height | Use |
|---|---|---|---|---|
| `--type-display-xl` | Saira 600 | 2rem / 32px | 1.15 | Page title; the attacker-vs-defender matchup header |
| `--type-display-l` | Saira 600 | 1.5rem / 24px | 1.2 | Panel and section headers |
| `--type-display-m` | Saira 500 | 1.125rem / 18px | 1.25 | Subsection labels, tab labels |
| `--type-eyebrow` | Saira 500 | 0.6875rem / 11px | 1.2 | Uppercase micro-labels; letter-spacing **+0.06em**; `--text-secondary` |
| `--type-body-l` | IBM Plex Sans 400 | 0.9375rem / 15px | 1.5 | Primary body, form field labels |
| `--type-body-m` | IBM Plex Sans 400 | 0.8125rem / 13px | 1.45 | Dense table body text, secondary copy |
| `--type-body-s` | IBM Plex Sans 500 | 0.6875rem / 11px | 1.4 | Chip labels, axis captions, footnotes |
| `--type-num-hero` | JetBrains Mono 700 | 1.75rem / 28px | 1.1 | The rolling combo total |
| `--type-num-l` | JetBrains Mono 500 | 1rem / 16px | 1.15 | Per-instance damage values in the breakdown |
| `--type-num-m` | JetBrains Mono 400 | 0.8125rem / 13px | 1.2 | Running totals, secondary figures, table number cells |
| `--type-num-s` | JetBrains Mono 400 | 0.6875rem / 11px | 1.2 | Axis ticks, small stat readouts |

### Type feature rules

- Anywhere IBM Plex Sans or Saira renders numbers, enable tabular, lining figures:
  `font-variant-numeric: tabular-nums lining-nums;`. JetBrains Mono is monospaced, so its
  figures are already tabular — leave it alone.
- Damage-type tags (§8) render in JetBrains Mono regardless of the surrounding face.
- Display text is never letter-spaced except the `--type-eyebrow` role.

---

## 4. Spacing scale

A 4px base unit. Use only these steps. Layout is dense: prefer the smaller steps inside
panels and reserve the larger steps for separating major regions.

| Token | Value | Typical use |
|---|---|---|
| `--space-0` | 2px | Hairline insets. **NOT the damage-type tag** — see the note below |
| `--space-1` | 4px | Tightest gap; icon-to-label inside a chip |
| `--space-2` | 8px | Table cell vertical padding; gaps between related controls |
| `--space-3` | 12px | Control inner padding; row rhythm |
| `--space-4` | 16px | Panel inner padding; default gap between fields |
| `--space-5` | 24px | Gap between panels; grid gutter; rail gutter |
| `--space-6` | 32px | Separation between major sections |
| `--space-7` | 48px | Top/bottom page regions |
| `--space-8` | 64px | Rare; large vertical breaks on wide layouts |

Defaults an agent can rely on: panel padding `--space-4`; table cell padding
`--space-2` vertical / `--space-3` horizontal; grid and rail gutters `--space-5`.

### The page's own rhythm, and the one place it is not symmetrical (added 2026-08-14)

The table above says what each step is *for*. It did not say how the page as a whole is
divided, and the result was that every gap on the built page was `--space-5` — configuration,
combo, burndown, breakdown and stat blocks all separated identically, so **nothing grouped**.
DESIGN-AUDIT.md measured it as the second largest cause of the interface reading as a form.

The page is divided into three **regions** and the rhythm is graded across them:

| Where | Step | Value |
|---|---|---|
| Between regions — setup / result / detail | `--space-6` | 32px |
| Between panels **inside** one region | `--space-4` | 16px |
| Side-by-side gutter between two panels in a row | `--space-5` | 24px |
| Page **bottom** | `--space-7` | 48px |
| Page **top** | `--space-5` | **24px — see below** |

**THE PAGE TOP IS 24px, NOT 48px, AND THAT IS A DECISION RATHER THAN A DRIFT.** The row above
this paragraph reads "Top/bottom page regions — `--space-7`", and a literal reading puts 48px
at the top of the page. It is 24px, for a stated reason:

> §7 makes the HP burndown the product's remembered object, and the built page put it 309px
> **below** the fold at a 1440×1100 viewport. Every pixel above it is spent on getting there.
> 48px of empty canvas above the page title buys nothing a reader can use and costs a further
> 24px of the one element the whole design is organised around. The bottom of the page keeps
> the literal 48px, because nothing competes with it there.

This is recorded here rather than as a comment in a stylesheet **because an implementation that
differs from this document is exactly the drift the token audit exists to catch.** If the fold
problem is ever solved another way, this asymmetry should be revisited and this paragraph
deleted — it is a trade, not a principle.

---

## 4a. Layout measures — lengths that are not spacing (added 2026-08-14)

Some lengths in this product are neither a spacing step nor a type size: how tall the burndown's
plot area is, how tall an open picker list may grow before it scrolls, how wide a popover may grow
before its text wraps, and how narrow a column in a responsive list grid may become before the grid
drops a column. This file defined none of them, so each was **composed inline from the spacing
scale** — `calc(var(--space-8) * 5)` and the like — by whichever component needed it, each with a
comment saying it was raised rather than settled.

**Three occurrences of the same construction is a token.** They are named here.

| Token | Value | Derivation | Used for |
|---|---:|---|---|
| `--measure-plot-block` | 320px | `--space-8` × 5 | The height of the burndown's plot area (§7) |
| `--measure-popover-max-block` | 320px | `--space-8` × 5 | The height at which an open picker list starts to scroll (§5) |
| `--measure-popover-max-inline` | 256px | `--space-8` × 4 | The width at which a popover stops growing and its text wraps — the burndown's resistance-math popover (§7) |
| `--measure-list-column-min` | 256px | `--space-8` × 4 | The narrowest a column may be in a responsive list grid before the grid drops to fewer columns |
| `--measure-reading-max` | 960px | `--space-8` × 15 | The widest a page of prose grows before it is centred — every page except the calculator, which wants the whole screen |
| `--measure-prose-max` | 640px | `--space-8` × 10 | The widest a single PARAGRAPH grows: about 85 characters at `--type-body-l`, past which the eye loses the start of the next line |

## 4b. THE ONE BREAKPOINT (added 2026-08-14)

`--break-phone: 30rem` (480px). **`@media (max-width: 30rem)` is the only width query this
product may write, and this is the whole list of what it governs.**

### Why there is one at all, when §4a's whole argument is that there should be none

`--measure-list-column-min` makes a grid responsive *without* a breakpoint, and that is the right
tool whenever the thing reflowing is a REPEAT of one shape. A breakpoint is for the case that
cannot reflow: **a label that must move somewhere else entirely, because there is no width at
which it fits where it is.**

That case was measured on 2026-08-14 and is the reason this section exists.

**THE MEASUREMENT.** The burndown draws one riser label per damage instance, inside the plot, at
its own riser's foot. DEFINITION: pairs of labels whose boxes overlap on BOTH axes, counted over
three populations at patch 16.16.1 — the scenario the page opens on; all 173 champions at level 18
with maximum ranks running P→Q→W→E→R→basic attack; and the same roster holding the five items
whose effects ride on a basic attack, running Q→W→E→R→AA→AA, which is the worst case a reader can
build.

| at 375px | scenarios with a collision | colliding pairs | worst overlap |
|---|---:|---:|---:|
| the default scenario | 0 of 1 | 0 | — |
| the roster, full kit | 98 of 173 | 153 | 15.45px |
| the roster, rider build | 173 of 173 | **4,296** | **22.09px** |

**22.09px is a full line box: one damage figure printed directly on another.** A label needs
76.96px of column and the worst case leaves 12.69px. There is no type size, inset or column rule
that closes a gap of that size — and shrinking type below §3's scale to make text fit is
forbidden here for the same reason it is everywhere else.

### What the breakpoint does, and the two things it must not do

**Below 30rem the riser labels leave the plot and stack in a row beneath it**, in instance order,
each naming its instance. The risers, the treads and the trace are untouched: at 12.69px a column
the chart itself is still legible, and it was only ever the labels that ran out of room.

- **It must not shorten what a screen reader hears.** The riser's accessible name is unchanged at
  every width. Moving a label is a visual answer to a visual problem.
- **It must not become a general phone stylesheet.** One query, one job. A second use of this
  token needs its own entry in the list below and its own measurement — otherwise it becomes the
  breakpoint everything hides behind, and §4a's argument is lost by a thousand cuts.

**What it governs, exhaustively:** the burndown's riser labels (§7). Nothing else.

### Why 30rem and not 24rem or 48rem

30rem sits between the two measured facts. The default scenario is clean at 375px (23.4rem) and
collides at 320px (20rem) — so a threshold at 24rem would leave the default scenario broken on
the narrowest phones this product supports. The roster cases collide at every width tested, so no
threshold rescues them in place; the labels have to move. 48rem would move labels out of the plot
on a tablet that has room for them.

It is expressed in `rem` rather than `px` so a reader who has raised their browser's text size
crosses it sooner, which is when they need it.

---

**The last two were added on 2026-08-14 with the site's static pages** — a landing page, an
About page and a changelog are prose, and this file had never had to describe prose before. They
are two measures rather than one on purpose: the COLUMN holds panels, tables and figures and can
be wide; a PARAGRAPH inside it must be narrower or the reader loses their place between lines.
Using one value for both is the most common way a text-heavy page ends up unreadable at desktop
width.

**A FOURTH WAS FOUND AFTER THE FIRST THREE WERE NAMED, and it is the reason the rule is worth
stating rather than just applying.** `--measure-popover-max-inline` was still composed inline in
`burndown.css` when this section was first written; a search for the construction turned it up
immediately afterwards. Two of these measures share a value with another (320px twice, 256px
twice) and **that is not a reason to merge them**: a popover's maximum width and a grid column's
minimum width are different facts that happen to agree today, and collapsing them would mean one
could never move without the other.

Three rules about them, all binding:

- **They are derived from the spacing scale and stay on it.** A new layout measure is
  `--space-8 × n`, never an arbitrary number. That is what keeps them in the same system as
  everything else rather than becoming a second, unrelated scale.
- **A layout measure is not a spacing step and never substitutes for one.** Do not use
  `--measure-plot-block` as a margin, and do not use `--space-8` as a plot height now that a
  name for it exists.
- **Two measures that happen to share a value are still two measures.** Name them for what they
  govern, never for how big they are.

`--measure-list-column-min` is what makes a list grid responsive without a breakpoint: the item
pool is two columns at a 1440px desktop, four when its panel goes full width, and one on a phone,
from the single declaration `repeat(auto-fit, minmax(var(--measure-list-column-min), 1fr))`.

**The gap between a damage number and its tag is NOT a spacing token.** This table used to list
"tag offset from its number" against `--space-0`, while §8 specified a thin space — two
instructions for one gap, and a component could satisfy either. **§8 governs, and this is the
resolution (2026-08-13): the separator is a real U+2009 THIN SPACE character inside the text, not
CSS margin or padding.**

The reason is that the tag is not adjacent decoration, it is **part of the value**. A user who
selects `214 P` and copies it must get `214 P`, because the report-a-wrong-number control
(SPECIFICATION §8) and every screenshot a coach pastes depend on the number carrying its type.
CSS spacing produces `214P` on the clipboard; a real character survives copy, paste, plain-text
mail and a screen reader's own spacing. Margin also collapses differently across the contexts a
damage figure appears in — table cell, riser label, tooltip, composition-bar segment — so the same
value would space differently in each, which is exactly what a fixed instrument must not do.

---

## 5. Radius, borders, elevation

This direction is an instrument. It reads as machined metal, not soft cards. Rounding is
minimal and functional.

### Radius (nothing exceeds 4px)

| Token | Value | Applies to |
|---|---|---|
| `--radius-cell` | 0px | Table cells, the plot grid, anything that aligns to a hard grid |
| `--radius-control` | 2px | Inputs, buttons, chips, icon-chips, toggles |
| `--radius-panel` | 4px | The outer corners of a panel / the instrument bezel |

2px on interactive elements is deliberate: it softens cut-sheet-metal edges just enough
to signal "interactive" without drifting toward the pill-shaped rounded-card look, and
the hard 0px grid on tables keeps columns reading as a precise readout. This is **not**
the banned zero-radius broadsheet look — that ban is about hairline rules on a
white/broadsheet layout; here borders are steel on graphite and carry visible weight.
Status dots and the champion-portrait "active" indicator are circles (they are glyphs,
not surfaces) and are exempt from the 4px cap.

### Borders (the primary means of separation)

| Token | Value | Use |
|---|---|---|
| `--border-hair` | 1px solid `--line-subtle` | Internal separators within a panel |
| `--border-steel` | 1px solid `--line-steel` | The default border on panels, inputs, chips, cells |
| `--border-strong` | 1px solid `--line-strong` | Emphasis; hovered control borders |
| `--border-active` | 2px solid `--text-primary` | Selected / active control (a bone border, not a hue) |

The instrument separates regions with **visible borders**, not drop shadows. Reach for a
border before a shadow.

### Elevation (restrained — real shadow is the exception)

| Token | Value | Use |
|---|---|---|
| `--elev-0` | none | Panels at rest — they sit by border + surface contrast |
| `--elev-1` | `0 1px 2px rgba(0,0,0,0.40)` + `inset 0 1px 0 rgba(255,255,255,0.03)` | A barely-raised panel; the top inset highlight reads as a machined edge |
| `--elev-2` | `0 6px 20px rgba(0,0,0,0.50)` | Popovers, dropdown pickers, menus — the only genuine shadow in the product |

No coloured shadows. No glows anywhere except the burndown-specific effects defined in
§7. If it is not a popover, it does not get `--elev-2`.

---

## 6. Verification status and interaction states (neutral, per §1)

Because hue is reserved for damage data, both of these are shown without colour.

**Verification status** (SPECIFICATION §8, shown on every ability that contributes to a
result) — a neutral glyph plus a text label, in `--text-secondary`:

| State | Glyph | Label |
|---|---|---|
| Verified | `●` filled dot | "Verified" |
| Derived | `◐` half dot | "Derived" |
| Incomplete — pending | `○` open dot | "Not yet modelled" |
| Incomplete — permanent | `⊘` open dot, struck through | "Cannot be completed" |
| No damage | `–` en dash, **no dot** | "No damage" |

**The dot encodes how much evidence sits behind a number, and its fill is the whole scale.**
Filled is independently re-derived; half is checked against the source three ways; open is
a number we will not show. Nothing else may be added to that axis.

**`⊘` — permanent versus pending.** The circle is still open and a line says it will not
close. That is the only difference between the two incomplete states, and it is enough: the
strike reads distinctly at 11px, survives greyscale, and depends on neither colour nor
weight. Its accessible name carries the missing fact, not a generic warning — "cannot be
completed — the source does not record whose armor this reads."

**`–` — no damage is not a point on the scale.** It takes no dot at all, because there is
nothing to have evidence about. The absence of the dot is the signal. This matches §9, where
a non-damaging icon-chip already takes an em-dash marker in place of a damage-type underline.

**Derived is the normal state and is styled as such.** Same size, weight and colour as
Verified — no italic, no parenthesis, no caution mark, nothing that reads as a shortfall.
Verified is an additional assurance where it exists, never the bar the rest fell short of.
The `⚠` mark once suggested here for Incomplete is **withdrawn**: it read as a defect warning
about the product rather than a deliberate refusal by it.

Never colour any of these. Every distinction above is glyph, weight and label only — the
reserved-hue law of §1 admits no exception for status, and a verified figure and a derived
figure must never differ by turning something green or amber.

**Interaction states** — brightness and weight, never hue:

- Rest: `--bg-panel`, `--border-steel`
- Hover: `--bg-panel-raised`, `--border-strong`
- Selected / active: `--border-active` (2px bone)
- Focus-visible: 2px bone outline (`--text-primary`) offset 2px — always visible,
  keyboard navigation is required (§10)
- Disabled: `--text-muted`, 50% opacity, no border emphasis

---

## 7. Signature element — the HP burndown

This is the one place the animation budget is spent (§10.1) and the product's remembered
object. It renders the combo resolving against the defender's health as a **burndown /
combo waterfall**: a stepped chart of remaining HP falling to zero, with the steps
coloured by damage type. Specified here in enough detail to build without further
decisions.

### Layout and axes

- A rectangular plot inside a `--bg-well` panel with `--border-steel` and
  `--radius-panel`.
- **Y axis** = HP, linear, `0` at the bottom and the defender's effective max HP at the
  top. Horizontal grid lines at rounded HP intervals in `--line-subtle`; the **zero line
  is `--line-strong`**. Y tick labels in `--type-num-s`, `--text-secondary`.
- **X axis** = **sequence** — one equal-width column per combo instance, left to right,
  plus a final `+DoT` column when DoT applies. It is an ordinal sequence, **not time**.
  A caption under the axis reads "sequence — not elapsed time" (SPECIFICATION §3.2). X
  labels in `--type-body-s`.

### The trace and the coloured steps

For each instance *i*, with remaining-HP-before `Rᵢ` and this instance's damage `dᵢ`:

- **Tread (horizontal):** a 2px line in `--hp-trace` at height `Rᵢ`, spanning column *i*.
  This is the remaining-HP plateau — neutral grey.
- **Riser (vertical):** at the right edge of column *i*, a 3px line dropping from `Rᵢ`
  to `max(0, Rᵢ − dᵢ)`, coloured by the instance's **damage type**
  (`--dmg-physical` / `--dmg-magic` / `--dmg-true`). Riser height is proportional to
  `dᵢ`, so the eye reads damage magnitude directly.
- **Label:** the value `dᵢ` with its mandatory damage-type tag (§8), in `--type-num-l`,
  in the damage-type colour, placed beside its riser.

So: grey plateaus mark where HP sits; coloured drops are the hits. A combo is a staircase
descending from full HP toward zero, tinted by what did the damage.

### The rolling total

Above or beside the plot, the cumulative combo total in `--type-num-hero`
(`--text-primary`, bone). As each step lands it **rolls** odometer-style to the new
value (§8: this total is a sum across damage types, so it is **type-agnostic — bone, no
tag**). Directly under it, a thin **composition bar** shows the physical/magic/true split
of the total as three segments in the damage hues, each segment carrying its
`phys`/`mag`/`true` tag so the split is colourblind-safe.

#### When a segment is too narrow to carry its tag (resolved 2026-08-14)

**THE BAR IS SIZED IN PROPORTION, ALWAYS. A segment is NEVER widened to fit its label.**

This section and §8 appeared to conflict, and a build had already resolved it the wrong way.
§7 says the segments are sized in proportion; §8 says the damage-type tag is mandatory and
never suppressed. On a short bar with a lopsided split — 42 physical against 225 magic — a
segment can be narrower than the text it must carry, and the tags collided into the
illegible string `4222 5 M`, losing the `P` entirely.

**Neither rule bends. The labels move.** When any segment is too narrow for its own tagged
value, **every** label leaves the bar and sits in a single row directly beneath it, in
source order, each still carrying its own `phys`/`mag`/`true` tag and its own damage hue. The
bar above becomes pure proportion; the row below carries the figures.

> **SINCE THE TAG BECAME A WORD (2026-08-14) THIS IS THE LAYOUT IN EVERY REAL CASE, and that is
> arithmetic rather than a new decision.** The threshold at which a segment is judged too narrow
> was recomputed from measurement: the longest inline label is 70px at `--type-num-s`, and the
> narrowest composition bar this product draws is the breakdown's running-total column at 109px,
> not the ~200px the original derivation assumed. 70/109 is 0.64, so the threshold is 0.65 — and
> two shares sum to 1, so they cannot both reach it. **The inline branch survives only for a
> single-type bar, and it is kept rather than deleted**, because the rule is about width and a
> wider bar in a later layout restores it with no code change. It must never be tuned back down
> to "get the inline layout back": the inline layout is what produced the illegible string. The
> same measurement showed the OLD 0.25 threshold was already too permissive for a 109px bar.

- **All the labels move together, never just the cramped one.** A row where two figures sit
  inside the bar and one sits below reads as three different kinds of thing.
- **The order is the bar's order**, so a reader maps label to segment by position.
- **The bar keeps its full width and its exact proportions.** That is the whole reason for
  the rule: *the bar exists to show proportion, so a bar that has been stretched to fit a
  word is a bar that lies about the data.* Widening the smallest segment overstates the
  smallest damage type, which is the number a reader is least able to check.
- Labels below the bar use `--type-num-m`; inside the bar they use `--type-num-s`. Both are
  existing roles and the tag's 10px floor (§8) applies to each.

See §8, which states the same resolution from the tag's side.

### The LETHAL rule (magenta) at the zero crossing

- The first instance *i* whose cumulative damage ≥ the defender's current HP is the kill.
  At that column boundary, draw a **2px solid `--lethal` vertical rule** spanning the full
  plot height.
- A callout chip sits at the top of the rule: `LETHAL · instance i`, bone text on
  `--bg-panel` with a 2px `--lethal` border. (Magenta is large/bold here, satisfying its
  contrast rule.)
- If the burst never crosses zero, draw no rule; the final tread ends above zero and a
  chip reads `SURVIVES · {remaining} HP` with a `--border-steel` (neutral) border.

### The healing riser — a trace that can also go up (added 2026-08-14)

Everything above describes a staircase that only descends. **A defender who heals mid-combo makes
it ascend**, and SPECIFICATION §5 requires the defender's own kit modelled — 121 defensive heals
were measured across the roster. Without this the last tread ended at one number while the verdict
printed beside it read another, which §7 of DATA-SOURCES §41.2 records as worse than drawing
nothing at all.

- **Healing riser (vertical, upward):** at the right of column *i*, after that column's damage
  riser, a **3px line rising** from the post-damage height to the post-heal height. It is drawn in
  **`--hp-trace`** — the neutral cool grey already used for the remaining-HP line, because a
  change in health is exactly what it is.
- **The non-colour cue is a DOTTED stroke.** `border-left: 3px dotted --hp-trace`, against the
  damage risers' solid fill. **No new hue is introduced and none may be**: §1's reserved-hue law
  admits no exception for healing, and green here would be the "success colour" that rule exists
  to forbid.
- **Label:** the value with a leading **`+`**, in `--type-num-l`, `--text-secondary`, placed at
  the top of the healing riser. **It carries NO damage-type tag** — a heal is not damage, and
  tagging it would make it read as one. The `+` is the cue that survives greyscale, copy-paste
  and a screen reader.
- **Overhealing is stated, never silently clamped.** The riser stops at the axis top, because a
  champion cannot exceed maximum health; the label then reads `+240 (120 wasted)`. That a bigger
  heal would have bought nothing is information a theorycrafter wants.
- **The recent-damage ghost (§7, `--flash-recent`) never fires on a heal.** It is "the chunk that
  was just taken", and playing it while health is restored would show the opposite of what
  happened.
- **Screen readers** get the word and the direction, which is the whole cue without any visual
  channel: *"Instance 3. Defender heals 90. Health 380 up to 470 of 1850."*

**Where a heal sits.** A heal that a source attributes to an instance is drawn in that instance's
column, after its damage. A heal that **no instance owns** — a defensive effect that is not a
response to any hit — gets its own column labelled `heal`, **before instance 1**, because that is
where the engine counts it: the reading most generous to the defender, and therefore the one that
says "this kills" less often. **A heal that would land after the kill is not drawn at all**, for
the same reason it is not counted. Dead is dead at the crossing.

```
  HP
 1850 ┼
      │                    ╎ +240 (120 wasted)   ← dotted, grey, "+", capped at the axis top
 1000 ┼· · · ·   ╎ +90     ╎
      │       ╲ 214 P     · · · ·
  800 ┼· · ·   · · · · · ╲ 180 M
      │                          · · ·
    0 ┼──────────────────────────────────
        heal   inst1   inst2   inst3
              sequence — not elapsed time
```

### The hatched DoT tail

- Damage over time is never folded into burst (SPECIFICATION §3.8). After the last burst
  column, an appended `+DoT` column draws a **riser filled with a 45° diagonal hatch**,
  in the DoT source's damage hue at ~50% saturation. The **hatch pattern is the
  non-colour cue** that separates DoT from burst — consistent with the colourblind
  philosophy of this whole product.
- If burst alone survives but burst + DoT kills, draw a **second, dashed `--lethal`
  rule** at the DoT crossing labelled `LETHAL +DoT · after combo`.
- Both verdicts are always printed as text below the plot, e.g.
  `Burst: SURVIVES 512 HP` and `Burst + DoT: LETHAL` — the two-verdict requirement made
  literal.

### The trailing recent-damage ghost (grafted from Direction 3)

When a step appears during playback, the band it just removed — the rectangle between the
old plateau `Rᵢ` and the new plateau `Rᵢ − dᵢ`, across column *i* — briefly fills with
`--flash-recent` at ~35% opacity, then eases out to zero over **600ms**. This is the
in-game "recent damage" catch-up: you see the chunk that was just taken, then it fades.
It is transient and positional; **motion carries it**, so no one has to classify it as a
colour, and it is absent from the settled/static chart. It never appears as a value.

### Interaction

Hovering or keyboard-focusing a riser freezes it and opens an `--elev-2` popover showing
that instance's full resistance-modifier math in the fixed order (flat reduction →
percentage reduction → percentage penetration → flat penetration → multiplier → final
value), every figure carrying its damage-type tag.

### ASCII schematic (orientation only — not to scale)

```
  TOTAL  2 480            ← --type-num-hero, odometer roll, bone, no tag
  split  [██ P ][███ M ][█ T ]   ← composition bar, tagged segments

  HP                                          · = --hp-trace plateau
 6000 ┼· · ·                                  ╲ = coloured riser (by type)
      │     ╲ 214 P
 5000 ┼      · · · ·
      │           ╲ 180 M
 4000 ┼            · · · · · ·
      │                     ╲ 240 T
 3000 ┼                      · · ·
      │  LETHAL · inst 4 →   ┃ ╲ 96 P
    0 ┼──────────────────────┃──╳──╱╱╱╱  ← magenta rule; hatch = DoT tail
        inst1   inst2   inst3 ┃ inst4  +DoT
                    sequence — not elapsed time
```

---

## 7a. Layout and the ad slots (locked)

**Layout decision (locked).** The page uses a stacked arrangement: attacker and defender
configuration panels across the top row, and the HP burndown full-width below them. This
keeps the top row's width requirement near ~900px, which lets the two §16 vertical ad
rails appear at roughly a **1280px** viewport instead of ~1440px — so laptop and
half-width second-monitor users see the rails. Below ~1280px the rails hide (per §16, they
render only where they don't compress the calculator) and the layout goes single-column.
The top and bottom banners are horizontal bands and render at effectively any desktop
width. The §16 slots are fixed-dimension reserved containers so ad loading causes no
layout shift (§13).

---

## 8. Damage type is never conveyed by colour alone (hard rule)

**Every rendered damage value carries a damage-type tag as well as its colour.** The tag
is the definitive channel; colour is the fast, redundant one.

### The cue: a `phys` / `mag` / `true` word tag (changed 2026-08-14 — it was a letter)

> **WHY THIS CHANGED, AND WHY IT IS NOT A RETREAT FROM THE RULE.** The tag was `P` / `M` / `T`
> until the project owner — who plays the game — read the `M` on an ability icon as an ability
> **slot** letter. Q, W, E and R are what a League player expects in that position on that object,
> so the cue was *correct and unreadable*, which makes it decoration rather than a cue.
>
> The fix removes the collision rather than softening it. **The ability SLOT now sits on the chip**
> (§9), where a player already expects it, and **the damage TYPE appears as a word wherever a
> number appears**. A slot letter never appears beside a figure and a type word never appears in a
> chip corner, so position alone tells them apart.
>
> **A word is a stronger non-colour channel than a letter, not a weaker one**: no legend, no
> learning, and it survives greyscale, copy-paste and a screen reader identically. The full
> reasoning, and the two options rejected, are DESIGN-AUDIT.md part 2.

- **`phys`** = Physical, **`mag`** = Magic, **`true`** = True. `true` is the whole word: it is
  already short, and `tru` would be the only abbreviation on the page that is not also a word.
- Rendered in **JetBrains Mono**, at **`max(10px, 0.7em)`** — 0.7em of the number it follows,
  **with a hard floor of 10px that it never goes below** — immediately after the number,
  separated by a thin space, in the **same colour as the number** (the word, not its colour,
  is the cue). Example forms: `214 phys`, `180 mag`, `240 true`.
- **The tag is about three times the width it was.** That is a real layout cost and it is paid,
  not avoided: the composition bar's inline-label threshold was recomputed from measurement and
  now moves the labels below the bar for every split of two or more types (see the note under
  §7). Anything that renders a damage figure in a narrow box must be sized against the word.

  **The separator is a real U+2009 THIN SPACE character**, not CSS margin — so the value copies
  as `214 P`. §4 records why, and `--space-0` is explicitly not used for this gap.

  **Why the floor exists (decided 2026-08-13, and not to be relitigated).** This section argues
  for letters over glyphs on the grounds that *"three distinct letterforms stay unambiguous at
  11px, where three small geometric glyphs (▲/◆/●) blur together."* But 0.7em applied to
  `--type-num-s`, the 11px numeric role, renders the tag at **7.7px** — below the size the
  argument itself rests on. The cue that carries the product's hard rule was, at its smallest,
  smaller than the premise that justified choosing it.
  A floor is the right fix rather than raising 0.7em, because at the hero and large numeric
  sizes 0.7em is correct and looks right; only the small end was broken. At
  `--type-num-m` (13px) 0.7em gives 9.1px and the floor also applies; at `--type-num-l` (16px)
  it gives 11.2px and the floor does not bind. So the floor changes exactly the two smallest
  roles, which are the two the original argument was about.
- It is **mandatory and never suppressed** — in the per-instance table, the burndown riser
  labels, the composition bar segments, tooltips, and the damage-versus-armor and
  damage-versus-level curves. The only figure without a tag is a **multi-type aggregate
  total**, which is bone with no tag and is instead broken down by the tagged composition
  bar.

  **"NEVER SUPPRESSED" DOES NOT LICENSE DISTORTING THE DATA TO KEEP IT (resolved
  2026-08-14).** A composition-bar segment can be narrower than its own tagged value, and a
  build resolved that by *widening the segment* — which kept every tag and made the bar
  overstate the smallest damage type. That is the wrong trade: **a tag is a label, and the
  bar is data.** Rather than bend either rule, the labels leave the bar and sit in a row
  beneath it, all of them together, each keeping its tag and its hue while the bar keeps its
  exact proportions. §7 specifies the layout; this is the rule it follows from.

  The general form, worth carrying to any future cue: **when a mandatory cue will not fit,
  move the cue — never resize the data to accommodate it.**
- **Screen readers:** the tag is visual; expose the full word to assistive technology via
  an accessible label so `214 P` is announced as "214 physical damage." The letter is
  never the only machine-readable signal.
- **An icon-chip carries the type as a WORD BENEATH IT, never in its corner** (§9). The corner
  of a chip is the ability SLOT. The chip's damage-type underline is the fast channel and the
  word beneath is the definitive one, so the chip stays colourblind-safe on the same terms as
  the values — **a chip is never left with hue as its only damage-type cue**, which matters most
  on the combo shelf, where a player is choosing abilities and no damage figure exists yet.

### Why a text tag (and not a glyph, or a border style)

- `phys`/`mag`/`true` are the words League players already use, so no legend is needed. This was
  the argument for the letters too; the words make it literal rather than nearly so.
- Text stays unambiguous at 11px, where three small geometric glyphs (▲/◆/●) blur together.
- Text survives copy-paste and screen readers; a glyph does not. `214 phys` pasted into a bug
  report still says what type it was.
- A border style (solid/dashed/dotted) is a second *visual-only* channel that also fails
  low-vision users and cannot ride alongside a floating combat number; text can.

**Why not a letter, which is what this section specified until 2026-08-14.** A single letter has
to be learned, and one of the three collided with a notation the product already uses elsewhere.
Three distinct letterforms do stay legible at 11px — the old argument was sound about legibility
and silent about ambiguity, and ambiguity is what failed. A word cannot be mistaken for a slot.

The DoT hatch (§7) and the verification glyphs (§6) follow the same philosophy: meaning is
never left to colour alone.

---

## 9. Official game art (Data Dragon)

Art is demoted to functional data-chips and semantic markers — it serves the readout, it
is never framed or gilded (that ornamental treatment belonged to a rejected direction).

### Icons as data-chips

- Ability, item, and rune icons render as small squares: **32px** in the combo builder,
  **24px** in tables, **20px** inline. `--radius-control` (2px), `--border-steel`.
- A **combat-relevant** icon-chip carries a **2px bottom underline in its damage-type
  colour**, a neutral **ability-slot corner tag** (`Q`/`W`/`E`/`R`/`P`), and the **damage type
  as a word beneath it** — `phys` / `mag` / `true` (§8). The underline is the fast cue; the word
  is what makes it colourblind-safe.

  **Changed 2026-08-14, and the reason is a comprehension failure rather than a defect in the
  cue.** The corner used to carry the damage type as `P`/`M`/`T`, and it was read as an ability
  slot — which is exactly what a League player expects in a chip's corner. The corner now says
  what it is read as, and the type moved to a word, matching the tag beside every figure.

  **The corner tag is NEUTRAL** (`--text-secondary`). A slot letter is not damage data, so §1's
  reserved-hue law forbids colouring it, and no per-type rule exists for it in the stylesheet.

  **Do not delete the word and leave the underline alone.** On the combo shelf a chip sits nowhere
  near a damage figure — the user has not run anything yet — so hue would be the only cue, which
  is the one channel SPECIFICATION §10.1 exists to forbid.
- A **non-damaging** ability/item/utility chip gets a neutral `--line-steel` underline and
  no tag (or an em-dash marker) — visibly "no damage type," not an omission.
- Hover brightens the chip (`--bg-panel-raised`); it never changes hue.

### The basic attack, which has no art (decided 2026-08-13)

Data Dragon ships four asset categories — champion portraits, ability icons, item icons,
rune icons — and **nothing for an auto-attack**. So the one control the combo builder
cannot give an icon is the one §10.1's "abilities as their in-game icons rather than as
lettered buttons" does not cover.

| Where | What is drawn | Tokens |
|---|---|---|
| Combo **shelf** | A plainly labelled control reading **"Basic attack"** — deliberately a different SHAPE from an icon-chip, so the two never read as the same class of thing | `--bg-well`, `--border-steel`, `--radius-control`, `--type-body-m` |
| Combo **sequence** | A chip-sized well carrying the mark **`AA`**, so every step keeps one rhythm | `--art-chip-combo` box, `--bg-base`, `--border-steel`, `--radius-control`, `--font-display` at `--type-eyebrow`, `--text-secondary` |

**No new design value is introduced** — every token above is already defined in this file.
This is the same construction the non-damaging chip above already uses: a visible marker
saying "no art here", never an omission.

**Why no art is borrowed, and this is the part not to relitigate.** The alternative is to
take an existing Data Dragon asset — an item icon, a summoner-spell icon, the attack-move
cursor — and let it stand for "basic attack". That is presenting official art as denoting
something it does not denote, in a product whose §15 asset terms rest on using Riot's art
as Riot ships it, and in an interface where **every other icon means exactly the thing it
depicts**. A user who learns that one chip means something other than what it shows can no
longer trust that any of them does. Drawing a bespoke icon is the same objection plus a new
asset class this file would then have to define.

The ban in §10.1 forbids substituting a letter for art **that exists**; its purpose is that
a player recognises Q by its icon rather than by reading a letter, and that purpose has no
application where there is no icon to recognise. A basic attack is also not an ability —
SPECIFICATION §3.4 lists it as its own instance type. The full reasoning is
DATA-SOURCES §42.6, and the code carries it on `BASIC_ATTACK_MARKER` in
`src/ui/combo/sequence.ts`.

### Portraits tinted until active

- Champion portraits are **desaturated and tinted toward `--bg-panel`** (low chroma) while
  the champion is unselected or inactive — this is a display filter, not an edit to the
  asset (§15). They resolve to **full colour only for the two active combatants**
  (attacker and defender), directing the eye to the two champions in play and keeping the
  dense build/picker lists calm.
- Portrait sizes: **64px** nameplate (the two combatants), **40px** picker/list rows.
  Square, `--border-steel`, `--radius-panel`. The active combatant's portrait takes
  `--border-active` (2px bone) and a circular status dot if a state is attached.

### Attribution

Data Dragon art is used within the asset usage permitted by SPECIFICATION §15. The art
itself is never recoloured beyond the desaturation display filter above.

---

## 10. Motion

**The budget is concentrated on the HP burndown (§7). Everywhere else motion is
functional and ≤ 140ms.** No parallax, no idle/ambient motion, no decorative loops.

### What animates

| Motion | Duration | Easing |
|---|---|---|
| Burndown trace drawing in (per step, staggered) | 120ms per step | ease-out `cubic-bezier(0.2, 0, 0, 1)` |
| Rolling total odometer | 300ms | linear |
| Recent-damage ghost fade (§7) | 600ms | ease-out (slow) |
| LETHAL rule strike-in | 180ms | ease-out |
| Popover / menu / picker open-close | 140ms | ease-out |
| Control hover / toggle | 90ms | ease-out |

### What does not animate

Panels, tables, layout, and champion/item/rune selection change **instantly**. Table row
highlight on hover is instant. There are no page transitions and no loading choreography
beyond a static skeleton where data is still lazy-loading (§13).

### Reduced motion

Honour `prefers-reduced-motion: reduce`: render the burndown in its **final settled
state immediately** — no trace draw, no odometer roll, no recent-damage ghost — and keep
only opacity fades of ≤ 100ms for popovers. The chart must be fully readable with all
motion disabled.

---

## 11. Quick reference for an agent starting a component

1. Backgrounds: `--bg-base` behind everything, `--bg-panel` for raised surfaces,
   `--bg-well` for inputs and the plot.
2. Text: bone `--text-primary`, secondary `--text-secondary`. Never invent a text colour.
3. A damage number is **always** `{value}` in its damage hue **plus** its `phys`/`mag`/`true` tag.
   No exceptions except multi-type totals (bone, no tag, with a composition bar).
4. Need to show success/error/status/interaction? Use a **neutral surface + glyph +
   label**, never a new hue (§1, §6).
5. Borders before shadows. `--elev-2` is popovers only.
6. Radius: 0 on grid/table cells, 2px on controls, 4px on panel corners. Nothing higher.
7. Numbers in JetBrains Mono; headers in Saira; everything else IBM Plex Sans.
8. Keyboard focus is always visible; the interface works with motion disabled.
