// WHAT THE CALCULATOR APPLIES BESIDES ABILITY DAMAGE — counted, never claimed.
//
// ═══ WHY THIS SITS BESIDE `coverage.ts` RATHER THAN INSIDE IT ═══
//
// `coverage.ts` counts one population: the published ability entries, by verification status.
// That population answers "what do we know about each ability" and it answers nothing at all
// about items, runes, a champion's defensive kit, or damage over time. Until 2026-08-14 the site
// said nothing about any of those, which was survivable while none of them did anything. Item
// effects are now live and damage over time now exists, so silence has stopped being honest:
// a reader who is told only about abilities will assume the rest is either modelled or absent,
// and both assumptions are wrong in a way that changes the number they are looking at.
//
// ═══ THE SAME RULE AS THE ABILITY COUNTS: NOTHING HERE IS TYPED ═══
//
// Every figure is arithmetic over files anyone can download — `public/data/item-effects.json`,
// `public/data/runes.json`, `public/data/abilities/*.json` and the curated override file — plus
// ONE fact taken from the engine's own code rather than from data: which burns the engine will
// actually fire, which is `BURN_TRIGGERS` in `src/engine/simulate.ts`. Taking it from the engine
// is deliberate. It is a READ POPULATION — nine sentences a person read one at a time — and a
// page that re-derived it with its own rule could disagree with the engine while both looked
// right.
//
// `capability.test.ts` recomputes all of it from those files on every run and fails if the
// committed JSON differs by one.
//
// ═══ EVERY COUNT CARRIES ITS DEFINITION ═══
//
// Not in a comment here — beside the number, on the page. A count with no definition is a defect,
// because "43 item effects" can mean four different populations and the reader cannot tell which
// one they are being shown. The doc comment on each field below is the definition the page states.

/** One item effect, as `public/data/item-effects.json` publishes it. */
export interface CapabilityItemEffect {
  itemId: number;
  /** How the effect reaches the target. ABSENT is a real state: the source never says. */
  appliesAs?: 'on-hit' | 'spellblade' | 'active' | 'periodic' | string;
  verification: string;
  /** Present on a recurring effect. `totalInstances` absent means the source states no tick count. */
  overTime?: { totalInstances?: number | null } | null;
  components?: readonly unknown[] | null;
}

/** One ability entry, reduced to the two fields these counts read. */
export interface CapabilityAbility {
  verification: string;
  components?: readonly { label?: string | null; overTime?: unknown }[] | null;
}

/** One defensive entry from the curated override file. */
export interface CapabilityDefensive {
  kind: string;
  verification: string;
  value?: unknown;
  ratios?: readonly unknown[] | null;
}

export interface CapabilityInputs {
  patch: string;
  itemEffects: readonly CapabilityItemEffect[];
  /**
   * `BURN_TRIGGERS` from the engine. `'ability-damage'` is a trigger this engine can honour in
   * sequence terms; `'not-stated'` means the source never says what sets the burn off. An item
   * absent from the map has not been read, and is treated exactly like `'not-stated'`.
   */
  burnTriggers: ReadonlyMap<number, 'ability-damage' | 'not-stated'>;
  /** Every rune in `public/data/runes.json` — the pool the rune picker offers. */
  runesPublished: number;
  /** Curated rune effects. This is what the engine could read, and it is what "modelled" means. */
  runeEffectsCurated: number;
  defensiveEffects: readonly CapabilityDefensive[];
  /**
   * TRUE only if the catalogue the calculator runs against is given defensive entries at all.
   * Nothing the override file holds can reach a result until it is, so this — not the size of the
   * stored population — is what decides whether a defence is applied. `capability.test.ts` derives
   * it from the app's own catalogue construction, so it turns true on the day the wiring lands and
   * the committed figure goes red until the page is updated to match.
   */
  defensiveEffectsReachTheCalculator: boolean;
  /**
   * HOW MANY DEFENCES THE ENGINE ACTUALLY APPLIES, measured by the engine rather than inferred
   * from the entry shape. See `DEFENSIVE_APPLIED_MEASURED`.
   *
   * Absent falls back to the ready count, which is what a small fixture wants. The REAL page
   * must pass it: ready is 90 and applied is 77, and publishing the first as the second would
   * overstate the product by thirteen defences.
   */
  defensiveAppliedMeasured?: number;
  abilities: readonly CapabilityAbility[];
}

/**
 * The defensive kinds the engine already has a step for. Anything else — immunity, a resistance
 * grant, a spell shield, a maximum-health grant — has no arm in the instance walk, so it could
 * not be applied even if it were published.
 */
const DEFENSIVE_KINDS_WITH_A_STEP = new Set(['heal', 'shield', 'damage-reduction']);

/** A component whose harvested label states a per-tick figure. The label is the wiki's own
 *  leveling-row name, so this is a stored fact rather than a reading of prose. */
export function statesAPerTickFigure(label: string | null | undefined): boolean {
  return /per tick/i.test(label ?? '');
}

export interface Capability {
  patch: string;

  // ── ITEM EFFECTS ───────────────────────────────────────────────────────────
  /** Item effects in the curated override file and published to `public/data/item-effects.json`. */
  itemEffectsStored: number;
  /** `appliesAs: 'active'` — an item active the user places in the combo as its own step. */
  itemActives: number;
  /** `appliesAs: 'on-hit'` — fires on every basic attack, as its own row, and never crits. */
  itemOnHit: number;
  /** `appliesAs: 'spellblade'` — fires on the first basic attack after an ability, once. */
  itemSpellblade: number;
  /** On-hit plus Spellblade: effects that ride on another instance rather than standing alone. */
  itemRiders: number;
  /** `appliesAs: 'periodic'` — the burn family, which belongs to the damage-over-time line. */
  itemBurns: number;
  /** Burns that can produce a figure: complete, with a stated tick count AND a stated trigger. */
  itemBurnsThatFire: number;
  /** Burns the source gives no number of ticks for. No full-duration total exists to report. */
  itemBurnsWithNoTickCount: number;
  /** Burns that state how much and how often, and never what sets them off. */
  itemBurnsWithNoStatedTrigger: number;
  /** Effects whose delivery the source never states. Not guessed onto a carrier. */
  itemEffectsWithNoStatedDelivery: number;

  // ── RUNES ──────────────────────────────────────────────────────────────────
  /** Runes published to the site — the pool the picker offers. */
  runesPublished: number;
  /** Runes whose effect the calculator can apply. */
  runesModelled: number;

  // ── DEFENSIVE KIT ──────────────────────────────────────────────────────────
  /** Defensive entries confirmed and stored in the curated override file. */
  defensiveStored: number;
  /** Of those: states a number, is not incomplete, and names a kind the engine has a step for. */
  defensiveReadyToApply: number;
  /** Of those: how many reach a result today. */
  defensiveApplied: number;

  // ── DAMAGE OVER TIME ───────────────────────────────────────────────────────
  /** Ability components read by a person and marked as recurring. These go to the DoT line. */
  abilityComponentsOverTime: number;
  /** Ability entries carrying at least one such component. */
  abilitiesWithOverTime: number;
  /** Components whose label states a per-tick figure, over every published entry. */
  perTickComponents: number;
  /** Ability entries carrying at least one of those components. */
  perTickAbilities: number;
  /** Of those entries: how many show no damage, because nobody has read their sentence yet. */
  perTickAbilitiesHeldBack: number;
}

/**
 * Count them.
 *
 * IT THROWS ON AN ITEM DELIVERY IT DOES NOT KNOW, for the same reason `summariseCoverage` throws
 * on a fifth verification status: a new `appliesAs` arm would otherwise vanish from the totals and
 * the page would print a breakdown that quietly stops adding up to its own total.
 */
/**
 * DEFENCES THE ENGINE ACTUALLY APPLIES, measured by the engine over the real data rather than
 * derived from the entry shape.
 *
 * DEFINITION: stored defensive entries which, switched on ONE AT A TIME against a level-11
 * defender, changed the figure the engine returned. **77 of 155.** The rest are 76 refused with a
 * stated reason and 2 whose activation the source never states.
 *
 * It is a CONSTANT and not a computation because deriving it means running the engine across the
 * roster, which is not something a page render may do. It is the engine's number; when the
 * engine's coverage changes it must be RE-MEASURED, never adjusted to taste.
 */
export const DEFENSIVE_APPLIED_MEASURED = 77;

export function summariseCapability(input: CapabilityInputs): Capability {
  const known = new Set(['on-hit', 'spellblade', 'active', 'periodic']);
  const by = { 'on-hit': 0, spellblade: 0, active: 0, periodic: 0, undelivered: 0 };

  let burnsThatFire = 0;
  let burnsWithNoTickCount = 0;
  let burnsWithNoStatedTrigger = 0;

  for (const effect of input.itemEffects) {
    if (effect.appliesAs === undefined || effect.appliesAs === null) {
      by.undelivered += 1;
      continue;
    }
    if (!known.has(effect.appliesAs)) {
      throw new Error(
        `summariseCapability: unknown item delivery "${effect.appliesAs}". Add it here rather ` +
          `than letting the breakdown silently stop adding up to ${input.itemEffects.length}.`,
      );
    }
    by[effect.appliesAs as keyof typeof by] += 1;

    if (effect.appliesAs !== 'periodic') continue;

    // The order below is the engine's own order in `withBurns`, and it matters: an entry with
    // neither a tick count nor a trigger must be counted once, under the reason the engine gives.
    const ticks = effect.overTime?.totalInstances;
    const complete = effect.verification !== 'incomplete' && (effect.components?.length ?? 0) > 0;
    if (!complete || ticks === undefined || ticks === null) {
      burnsWithNoTickCount += 1;
    } else if (input.burnTriggers.get(effect.itemId) !== 'ability-damage') {
      burnsWithNoStatedTrigger += 1;
    } else {
      burnsThatFire += 1;
    }
  }

  let defensiveReady = 0;
  for (const entry of input.defensiveEffects) {
    const statesANumber =
      (entry.value !== undefined && entry.value !== null) || (entry.ratios?.length ?? 0) > 0;
    if (
      statesANumber &&
      entry.verification !== 'incomplete' &&
      DEFENSIVE_KINDS_WITH_A_STEP.has(entry.kind)
    ) {
      defensiveReady += 1;
    }
  }

  let abilityComponentsOverTime = 0;
  let abilitiesWithOverTime = 0;
  let perTickComponents = 0;
  let perTickAbilities = 0;
  let perTickAbilitiesHeldBack = 0;

  for (const ability of input.abilities) {
    const components = ability.components ?? [];
    const overTime = components.filter((c) => Boolean(c.overTime));
    const perTick = components.filter((c) => statesAPerTickFigure(c.label));
    abilityComponentsOverTime += overTime.length;
    if (overTime.length > 0) abilitiesWithOverTime += 1;
    perTickComponents += perTick.length;
    if (perTick.length > 0) {
      perTickAbilities += 1;
      if (ability.verification === 'incomplete') perTickAbilitiesHeldBack += 1;
    }
  }

  return {
    patch: input.patch,
    itemEffectsStored: input.itemEffects.length,
    itemActives: by.active,
    itemOnHit: by['on-hit'],
    itemSpellblade: by.spellblade,
    itemRiders: by['on-hit'] + by.spellblade,
    itemBurns: by.periodic,
    itemBurnsThatFire: burnsThatFire,
    itemBurnsWithNoTickCount: burnsWithNoTickCount,
    itemBurnsWithNoStatedTrigger: burnsWithNoStatedTrigger,
    itemEffectsWithNoStatedDelivery: by.undelivered,
    runesPublished: input.runesPublished,
    runesModelled: input.runeEffectsCurated,
    defensiveStored: input.defensiveEffects.length,
    defensiveReadyToApply: defensiveReady,
    // CORRECTED BY THE LEAD the same day this was written. "Ready" and "applied" are NOT the
    // same figure and this equated them: `defensiveReady` is 90 by DATA-SOURCES §52.3's
    // definition, while the engine's own measurement is 77. Publishing 90 would overstate the
    // product by thirteen defences. The wiring flag still gates it — zero is the right answer
    // when the entries never reach the calculator.
    defensiveApplied: input.defensiveEffectsReachTheCalculator
      ? (input.defensiveAppliedMeasured ?? defensiveReady)
      : 0,
    abilityComponentsOverTime,
    abilitiesWithOverTime,
    perTickComponents,
    perTickAbilities,
    perTickAbilitiesHeldBack,
  };
}

/** The four item deliveries plus the undelivered must account for every stored effect. */
export function itemEffectsAddUp(c: Capability): boolean {
  return (
    c.itemRiders + c.itemActives + c.itemBurns + c.itemEffectsWithNoStatedDelivery ===
    c.itemEffectsStored
  );
}

/** Every burn is either firing, missing a tick count, or missing a trigger. Nothing falls through. */
export function burnsAddUp(c: Capability): boolean {
  return (
    c.itemBurnsThatFire + c.itemBurnsWithNoTickCount + c.itemBurnsWithNoStatedTrigger === c.itemBurns
  );
}
