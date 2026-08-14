// `simulate(scenario, catalogue) -> Result` — THE PUBLIC ENTRY POINT.
//
// Until this file existed the engine could not be called with a Scenario at all. `runCombo`
// takes a fully resolved `ComboPlan` — stat blocks already built, components already chosen —
// so everything ran on hand-authored plans and nothing turned a user's configuration into one.
// This is that layer, and it is the last unwritten piece of the spine.
//
// ═══ IT STILL READS NO DATA FILE ═══
//
// The engine's rule is that champion, item and rune values reach it only as arguments, so the
// calculation layer can be tested entirely on hand-authored fixtures. That rule is kept: the
// data arrives as a `Catalogue`, which the CALLER builds from `public/data/`. This file opens
// nothing and fetches nothing.
//
// ═══ IT REFUSES RATHER THAN GUESSES, AND SAYS WHAT IS MISSING ═══
//
// A scenario naming a champion the catalogue does not have, or an ability slot nothing was
// harvested for, does not produce a smaller number — it produces a refusal that names the
// thing. Where a STEP cannot be modelled but the rest of the combo can, the step becomes an
// `incomplete` instance contributing no damage and naming its reason, which is SPECIFICATION
// §8's promise applied at the point a scenario is assembled.

import type {
  Champion,
  CuratedAbility,
  CuratedDefensiveEffect,
  CuratedItemEffect,
  Item,
  Scenario,
  ChampionConfig,
  ComboStep,
} from '../types';
import type { IncompleteReason, Result, StatBlock } from '../types/result';
import { resolveAdaptiveForce } from './adaptive';
import { championStatAtLevel } from './champion-stats';
import { runCombo, type ComboPlan, type PlannedInstance } from './combo';
import { BASE_CRITICAL_STRIKE_MULTIPLIER } from './crit';

// ---------------------------------------------------------------------------------------
// What the caller supplies
// ---------------------------------------------------------------------------------------

/**
 * The data a scenario needs, supplied by the caller.
 *
 * Each returns `undefined` — or an empty list — for something it does not have, and `simulate`
 * turns that into a NAMED refusal rather than a default. **An empty list is a real answer**: it
 * means nothing has been harvested, which is a different statement from "this champion has no
 * abilities" and is reported as such.
 *
 * THE LAST TWO WERE ADDED 2026-08-14 (DATA-SOURCES §52). Until then this offered three lookups,
 * and the consequence was structural rather than cosmetic: the engine's machinery for item
 * effects and for the defender's own kit already existed and was tested — shields in all three
 * kinds, post-mitigation reduction, healing — and NOTHING COULD FILL IT FROM DATA. Every
 * defensive figure in a result came from a hand-authored plan, and every item-effect step
 * returned a pending instance.
 */
export interface Catalogue {
  champion(apiname: string): Champion | undefined;
  item(id: number): Item | undefined;
  /** Every curated ability for a champion. An empty list is a real answer — nothing harvested. */
  abilities(apiname: string): readonly CuratedAbility[];
  /**
   * Every curated effect on one item — its passives and its actives, keyed by item id.
   *
   * An item has more than one: `Module:ItemData/data` keys them `pass`, `pass2`, `pass3`, `act`
   * and `consume`, and 42 distinct items carry the 43 effects in the override file. So this
   * returns a list, never a single effect.
   */
  itemEffects(itemId: number): readonly CuratedItemEffect[];
  /**
   * Every curated defensive effect belonging to one champion's own kit — what their abilities do
   * to damage they RECEIVE (SPECIFICATION §5).
   *
   * Keyed by champion rather than by ability, because the defender is chosen as a champion and
   * the engine needs the whole set to decide which are up. **90 of the 155 stored entries are
   * ready to apply and every one of them is conditional**, so the scenario's entry state — not
   * this lookup — decides which ones actually resolve.
   */
  defensiveEffects(apiname: string): readonly CuratedDefensiveEffect[];
}

/** Why a scenario could not be simulated at all. Each names the exact thing that is missing. */
export interface SimulationRefusal {
  /** Where in the scenario, e.g. `attacker.apiname` or `defender.items[2]`. */
  path: string;
  reason: string;
}

export type SimulationResult =
  | { ok: true; result: Result }
  | { ok: false; refusals: SimulationRefusal[] };

// ---------------------------------------------------------------------------------------
// Item statistics
// ---------------------------------------------------------------------------------------

/**
 * DATA DRAGON'S STAT KEYS, AND THE FOUR THIS DELIBERATELY DROPS.
 *
 * Measured over the shipped 209-item pool on 2026-08-14 — these twelve keys are ALL that appear:
 *
 *   FlatHPPoolMod 72 · FlatPhysicalDamageMod 66 · FlatMagicDamageMod 54 · FlatArmorMod 26 ·
 *   PercentAttackSpeedMod 26 · FlatSpellBlockMod 22 · PercentMovementSpeedMod 20 ·
 *   FlatCritChanceMod 16 · FlatMPPoolMod 15 · FlatMovementSpeedMod 15 · PercentLifeStealMod 7 ·
 *   FlatHPRegenMod 2
 *
 * Eight are mapped below. The four that are not, and why — each is an EXCLUSION, not an
 * oversight, and each is stated on the result:
 *   - the two movement-speed keys and health regeneration change no damage figure and no
 *     survival verdict, because this engine models sequence rather than elapsed time (§3.2);
 *   - `PercentLifeStealMod` is real sustain, and it is dropped HERE rather than modelled because
 *     turning a life-steal percentage into health restored needs the damage figure it applies
 *     to, which is a per-instance fact this function does not have. `Result.sustain` exists and
 *     is ready for it; wiring it is the next step, not a missing field.
 *
 * A key this map does not know is REPORTED, never silently ignored: a new patch adding one
 * would otherwise drop a stat with nobody noticing.
 */
const ITEM_STAT_KEYS = [
  'FlatHPPoolMod',
  'FlatPhysicalDamageMod',
  'FlatMagicDamageMod',
  'FlatArmorMod',
  'FlatSpellBlockMod',
  'FlatMPPoolMod',
  'FlatCritChanceMod',
  'PercentAttackSpeedMod',
  // Known and deliberately not applied — see above.
  'PercentMovementSpeedMod',
  'FlatMovementSpeedMod',
  'FlatHPRegenMod',
  'PercentLifeStealMod',
] as const;

interface ItemTotals {
  health: number;
  attackDamage: number;
  abilityPower: number;
  armor: number;
  magicResist: number;
  mana: number;
  critChance: number;
  percentAttackSpeed: number;
  /** Stat keys the catalogue carried that this map does not know. Reported, never dropped. */
  unknownKeys: string[];
}

function sumItems(ids: readonly number[], catalogue: Catalogue, path: string): {
  totals: ItemTotals;
  refusals: SimulationRefusal[];
} {
  const totals: ItemTotals = {
    health: 0,
    attackDamage: 0,
    abilityPower: 0,
    armor: 0,
    magicResist: 0,
    mana: 0,
    critChance: 0,
    percentAttackSpeed: 0,
    unknownKeys: [],
  };
  const refusals: SimulationRefusal[] = [];

  ids.forEach((id, index) => {
    const item = catalogue.item(id);
    if (!item) {
      refusals.push({
        path: `${path}.items[${index}]`,
        reason: `no item with id ${id} is in the catalogue`,
      });
      return;
    }
    for (const [key, value] of Object.entries(item.stats)) {
      if (!(ITEM_STAT_KEYS as readonly string[]).includes(key)) {
        totals.unknownKeys.push(`${item.name}: ${key}`);
        continue;
      }
      switch (key) {
        case 'FlatHPPoolMod':
          totals.health += value;
          break;
        case 'FlatPhysicalDamageMod':
          totals.attackDamage += value;
          break;
        case 'FlatMagicDamageMod':
          totals.abilityPower += value;
          break;
        case 'FlatArmorMod':
          totals.armor += value;
          break;
        case 'FlatSpellBlockMod':
          totals.magicResist += value;
          break;
        case 'FlatMPPoolMod':
          totals.mana += value;
          break;
        case 'FlatCritChanceMod':
          totals.critChance += value;
          break;
        case 'PercentAttackSpeedMod':
          totals.percentAttackSpeed += value;
          break;
        default:
          // The four damage-irrelevant keys. Named in ITEM_STAT_KEYS so they are recognised
          // rather than reported as unknown, and applied to nothing.
          break;
      }
    }
  });

  return { totals, refusals };
}

// ---------------------------------------------------------------------------------------
// The stat block
// ---------------------------------------------------------------------------------------

/**
 * One champion's fully resolved stat block (SPECIFICATION §2, step 9).
 *
 * **MANA IS POPULATED ONLY WHEN THE CHAMPION'S RESOURCE IS MANA.** `stats.mp_base` holds
 * whatever the resource is — 17 champions in the shipped roster state a non-mana resource with
 * a non-zero pool, Shen's 400 energy and Yone's 500 flow among them (DATA-SOURCES §43). Reading
 * the pool as mana would label those resources as mana and let a `maxMana` ratio resolve against
 * energy. A champion whose resource is anything else, or whose `resource` the catalogue does not
 * carry, gets NO mana figure, and a mana ratio is then refused by name rather than read as 0.
 */
export function buildStatBlock(
  champion: Champion,
  config: ChampionConfig,
  catalogue: Catalogue,
): { block: StatBlock; refusals: SimulationRefusal[]; unknownItemStats: string[] } {
  const level = config.level;
  const s = champion.stats;
  const items = sumItems(config.items, catalogue, config.apiname);

  const baseHp = championStatAtLevel(s.hp_base, s.hp_lvl, level);
  const baseArmor = championStatAtLevel(s.arm_base, s.arm_lvl, level);
  const baseMr = championStatAtLevel(s.mr_base, s.mr_lvl, level);
  const baseAd = championStatAtLevel(s.ad_base, s.ad_lvl, level);

  const maxHp = baseHp + items.totals.health;
  const bonusAd = items.totals.attackDamage;
  const abilityPower = items.totals.abilityPower;

  // ADAPTIVE FORCE IS RESOLVED, NOT COPIED. The champion's `adaptivetype` is only the TIE-BREAK
  // for a champion carrying equal bonus attack damage and ability power (adaptive.ts); which one
  // an adaptive effect actually grants depends on the build.
  const adaptive = resolveAdaptiveForce(
    0,
    { bonusAttackDamage: bonusAd, abilityPower },
    s.adaptivetype,
  );

  const hasMana = champion.resource === 'Mana';
  const maxMana = hasMana
    ? championStatAtLevel(s.mp_base ?? 0, s.mp_lvl ?? 0, level) + items.totals.mana
    : undefined;

  const block: StatBlock = {
    level,
    // ENTRY HEALTH IS THE MAXIMUM unless the scenario states otherwise. `ChampionConfig` has no
    // current-health field yet, so a "moment in time" that starts below full (SPECIFICATION §3.3)
    // is expressed through `entryState`, and `currentHp` there is honoured.
    hp: readEntryNumber(config, 'currentHp') ?? maxHp,
    maxHp,
    maxHpBase: baseHp,
    maxHpBonus: items.totals.health,
    ...(maxMana !== undefined
      ? { maxMana, mana: readEntryNumber(config, 'currentMana') ?? maxMana }
      : {}),
    armor: baseArmor + items.totals.armor,
    armorBase: baseArmor,
    armorBonus: items.totals.armor,
    magicResist: baseMr + items.totals.magicResist,
    magicResistBase: baseMr,
    magicResistBonus: items.totals.magicResist,
    attackDamage: { base: baseAd, bonus: bonusAd, total: baseAd + bonusAd },
    abilityPower,
    // Data Dragon states critical strike chance as a fraction, which is the unit `StatBlock`
    // uses. Capped at 1: a build over 100% does not crit more than every time.
    critChance: Math.min(1, items.totals.critChance),
    // THE BASE MULTIPLIER ONLY. Item modifiers to critical damage live in item PASSIVES, which
    // are curated and not yet merged, so applying none is honest — and it is disclosed.
    critDamage: BASE_CRITICAL_STRIKE_MULTIPLIER,
    attackSpeed: s.as_base * (1 + items.totals.percentAttackSpeed),
    adaptiveType: adaptive.granted === 'Physical' ? 'physical' : 'magic',
    // Penetration comes from item passives and runes, neither of which is merged yet.
    penetration: {
      flatArmor: 0,
      percentArmor: 0,
      percentBonusArmor: 0,
      flatMagic: 0,
      percentMagic: 0,
    },
  };

  return { block, refusals: items.refusals, unknownItemStats: items.totals.unknownKeys };
}

/** A numeric entry-state value, or undefined. Booleans are not health figures. */
function readEntryNumber(config: ChampionConfig, key: string): number | undefined {
  const value = config.entryState[key];
  return typeof value === 'number' ? value : undefined;
}

// ---------------------------------------------------------------------------------------
// The combo
// ---------------------------------------------------------------------------------------

const NOT_MODELLED: Record<string, string> = {
  // 'item-active' was here until 2026-08-14. It is modelled now — see planItemActive. Its note
  // said the values "have not been merged into the curated file", which stopped being true when
  // they were, and a note describing a state the product has left is worse than no note.
  // An on-hit effect is a RIDER, not a step: it attaches to the basic attack that carried it
  // (see withRiders). A step explicitly asking for one is therefore asking for something the
  // combo does not express, and it says so rather than silently doing nothing.
  'on-hit':
    'an on-hit effect is not a step of its own — it rides on the basic attack that triggers it. ' +
    'Add a basic attack and every on-hit effect on the attacker’s items fires with it.',
  'empowered-attack':
    'empowered basic attacks are not modelled yet: their stack behaviour is recorded per ' +
    'ability in the curated data (SPECIFICATION §3.4) and has not been harvested',
};

/**
 * An instance that contributes NO damage and says why.
 *
 * The shape is the whole contract: `verification: 'incomplete'`, a reason, and **no `damage`
 * key at all**. `resolveDamage` in ./combo.ts short-circuits on the status, and the ability is
 * pushed onto `Result.incompleteContributors` with its reason. Nothing downstream has to
 * cooperate.
 *
 * `label` overrides the fallback `"<kind> — <ref>"`. Callers that know the real ability should
 * pass `"R — Final Spark"`: the fallback exists for steps where nothing was harvested and there
 * is no name to give, not as the normal case.
 */
function pendingInstance(
  step: ComboStep,
  note: string,
  label?: string,
  cause?: IncompleteReason['cause'],
): PlannedInstance {
  const reason: IncompleteReason = { kind: 'pending', note, ...(cause ? { cause } : {}) };
  return {
    stepId: step.id,
    sourceLabel: label ?? `${step.kind} — ${step.ref}`,
    instanceType: step.kind === 'basic-attack' ? 'basic-attack' : 'damaging-ability',
    verification: 'incomplete',
    incompleteReason: reason,
  };
}

/**
 * What a reader is told when they cast an ability they have not put a point in.
 *
 * IT IS NOT PHRASED AS A DATA GAP, and that distinction is the reason this is a named constant.
 * SPECIFICATION §8's `pending` normally means "the value exists in a source and this product has
 * not extracted it yet — it will improve with work". Here nothing is missing from the data and no
 * work will change it: the scenario says the ability is unlearned, so it deals nothing, and the
 * fix is one keystroke in the reader's own hands. The sentence says so.
 */
export function unlearnedNote(slot: string): string {
  return (
    `no point has been put into ${slot}, so it deals no damage. This is your build rather than ` +
    `a gap in our data — raise ${slot} above rank 0 to include it.`
  );
}

/**
 * AN ITEM ACTIVE — a step the user places, resolving like an ability with no rank axis.
 *
 * Built 2026-08-14, the first thing to read the item-effect lookup. **7 of the 43 stored effects
 * are actives** (DATA-SOURCES §52.2) and every one of them is single-component and `derived`.
 *
 * THREE REFUSALS, EACH NAMING ITS OWN CAUSE, because they mean different things to a reader:
 *
 *   1. the step's `ref` is not a number at all — a malformed scenario, not a data gap;
 *   2. the attacker does not OWN the item. This is a real check and not pedantry: an active a
 *      champion has not bought cannot be pressed, and returning its damage would hand a build
 *      damage it has no access to. It is the same class of error as the unlearned ability, so it
 *      is reported the same way — a fact about the build, not a gap in the data;
 *   3. the item is owned but nothing is stored for it. 43 effects across 42 items is a small
 *      part of a 209-item pool, so this is the COMMON case and must not read like a fault.
 *
 * A NON-DAMAGING ACTIVE IS NOT A FAILURE. An item whose active grants a stat or a shield has no
 * damage components, and the step reports `no-damage` rather than an absence.
 *
 * No rank axis: an item active is the same figure at every ability rank, so rank and maxRank are
 * both 1 — the same convention gate 1 checks these entries under.
 */
function planItemActive(
  step: ComboStep,
  config: ChampionConfig,
  catalogue: Catalogue,
): PlannedInstance {
  const itemId = Number(step.ref);
  if (!Number.isInteger(itemId)) {
    return pendingInstance(
      step,
      `this step names the item "${step.ref}", which is not an item id`,
    );
  }

  const item = catalogue.item(itemId);
  const label = item ? `${item.name} — active` : `Item ${itemId} — active`;

  if (!config.items.includes(itemId)) {
    return pendingInstance(
      step,
      `${item ? item.name : `item ${itemId}`} is not in this build, so its active cannot be ` +
        `used. This is your build rather than a gap in our data — add the item to include it.`,
      label,
      'unlearned',
    );
  }

  const actives = catalogue.itemEffects(itemId).filter((e) => e.kind === 'active');
  if (actives.length === 0) {
    // THE ENGINE MAY ONLY SPEAK ABOUT WHAT IT WAS GIVEN. An earlier wording said the active
    // "has not been harvested yet", which this function cannot know: it sees a catalogue, not the
    // harvest. 7 actives ARE stored today and nothing publishes them, so that sentence would have
    // been false for every one of them — a plausible wrong statement, which is the same failure
    // as a plausible wrong number in a place nobody would check.
    return pendingInstance(
      step,
      `the catalogue carries no active for ${item ? item.name : `item ${itemId}`}, so this step ` +
        `contributes nothing. Either the item has no active, or its values have not been ` +
        `published to this build of the site.`,
      label,
    );
  }
  // One item, one active. `Module:ItemData/data` keys a second as 'act2', which nothing in the
  // stored set uses — measured at 7 actives across 7 distinct items. If that ever changes this
  // refuses rather than silently picking the first.
  if (actives.length > 1) {
    return pendingInstance(
      step,
      `${item ? item.name : `item ${itemId}`} stores ${actives.length} actives and the step does ` +
        `not say which. It is refused rather than guessed.`,
      label,
    );
  }

  const active = actives[0]!;
  const named = `${item ? item.name : `item ${itemId}`} — ${active.name}`;
  const components = active.components ?? [];

  if (active.verification === 'incomplete' || components.length === 0) {
    return {
      stepId: step.id,
      sourceLabel: named,
      instanceType: 'item-active',
      verification: active.verification === 'no-damage' ? 'no-damage' : 'incomplete',
      ...(active.verification === 'no-damage'
        ? {}
        : {
            incompleteReason: {
              kind: (active.unresolvable?.length ?? 0) > 0 ? 'permanent' : 'pending',
              ...((active.unresolvable?.length ?? 0) > 0
                ? { missingFacts: active.unresolvable }
                : {
                    note:
                      active.notes ??
                      'the data records no reason for this — the effect is marked incomplete ' +
                        'and nothing states why, which is itself a gap in the harvested data ' +
                        'rather than a fact about the item',
                  }),
            } as IncompleteReason,
          }),
    };
  }

  return {
    stepId: step.id,
    sourceLabel: named,
    instanceType: 'item-active',
    verification: active.verification,
    damage: {
      components,
      rank: 1,
      maxRank: 1,
      ...(step.hitCounts ? { hitCounts: step.hitCounts } : {}),
      // Deliberately no `forceCrit`. No stored active states a critical strike, and letting the
      // option through would apply the attacker's crit multiplier to a figure no source says
      // can crit.
    },
  };
}

/**
 * RIDERS — item effects that reach the target ON ANOTHER INSTANCE. Built 2026-08-14.
 *
 * **21 of the 43 stored item effects are riders**: 15 on-hit and 6 spellblade. They are not steps
 * the user places; they fire because a basic attack landed.
 *
 * ═══ EACH GETS ITS OWN ROW, AND THAT WAS A DECISION ═══
 *
 * The alternative was folding a rider's damage into the instance that carried it, which is
 * fewer rows and is wrong twice over (DATA-SOURCES §53.3):
 *
 *   1. **10 of the 21 riders deal MAGIC damage** and a basic attack deals physical. An instance
 *      dealing two types is given NO `resistanceSteps` at all, because the contract carries one
 *      four-step breakdown and a mixed instance meets two. Folding would delete the resistance
 *      working from the most common instance in the game.
 *   2. **Crit multiplies a WHOLE instance** (combo.ts) and no component carries its own crit
 *      eligibility. A basic attack crits; an on-hit effect does not. Folding a rider into a
 *      critting attack would silently multiply the rider too — arithmetic that is internally
 *      consistent, so no test would catch it.
 *
 * So a rider is its own instance, and NO RIDER EVER CRITS: `crit` is not passed on, which is the
 * whole point of keeping them separate.
 *
 * ═══ WHEN EACH FIRES ═══
 *
 * **On-hit** fires on every basic attack. **Spellblade** is the Sheen family: it fires on the
 * first basic attack AFTER an ability. This engine models sequence and not elapsed time
 * (SPECIFICATION §3.2), so the source's "within 10 seconds" and its 1.5-second cooldown cannot be
 * represented — the sequence rule is applied and the omission is disclosed in ENGINE_EXCLUSIONS
 * rather than approximated with a made-up interval.
 *
 * ═══ WHAT IS DELIBERATELY NOT DONE ═══
 *
 * An effect whose `appliesAs` the source does not state is NOT guessed onto a carrier. It stays
 * unmodelled and says so, which is 6 of the 43 (§52.2).
 */
function withRiders(
  planned: PlannedInstance[],
  combo: readonly ComboStep[],
  config: ChampionConfig,
  catalogue: Catalogue,
  rangeType: 'Melee' | 'Ranged',
): PlannedInstance[] {
  const riders = config.items
    .flatMap((id) => {
      const item = catalogue.item(id);
      return catalogue
        .itemEffects(id)
        .filter((e) => e.appliesAs === 'on-hit' || e.appliesAs === 'spellblade')
        .map((effect) => ({ effect, itemName: item?.name ?? `item ${id}` }));
    })
    // Stable order: the build order the user stated. Nothing here depends on the order, but two
    // runs of the same scenario must produce the same rows in the same places.
    .map((r, i) => ({ ...r, ordinal: i }));

  if (riders.length === 0) return planned;

  const out: PlannedInstance[] = [];
  let anAbilityHasBeenCast = false;

  planned.forEach((instance, i) => {
    out.push(instance);
    const step = combo[i]!;
    if (step.kind === 'ability') anAbilityHasBeenCast = true;
    if (step.kind !== 'basic-attack') return;

    // A basic attack that itself contributed nothing carries nothing with it. An instance the
    // engine refused is not a hit that landed.
    if (instance.verification === 'incomplete') return;

    for (const { effect, itemName, ordinal } of riders) {
      if (effect.appliesAs === 'spellblade' && !anAbilityHasBeenCast) continue;
      out.push(riderInstance(effect, itemName, step, ordinal, rangeType));
    }
    // Spellblade is consumed by the attack that used it.
    anAbilityHasBeenCast = false;
  });

  return out;
}

/** One rider, as its own instance. Never crits, and carries the holder's range type. */
function riderInstance(
  effect: CuratedItemEffect,
  itemName: string,
  carrier: ComboStep,
  ordinal: number,
  rangeType: 'Melee' | 'Ranged',
): PlannedInstance {
  const stepId = `${carrier.id}-rider-${ordinal}`;
  const label = `${itemName} — ${effect.name}`;
  const components = effect.components ?? [];

  if (effect.verification === 'incomplete' || components.length === 0) {
    return {
      stepId,
      sourceLabel: label,
      instanceType: 'on-hit',
      verification: effect.verification === 'no-damage' ? 'no-damage' : 'incomplete',
      ...(effect.verification === 'no-damage'
        ? {}
        : {
            incompleteReason: {
              kind: (effect.unresolvable?.length ?? 0) > 0 ? 'permanent' : 'pending',
              ...((effect.unresolvable?.length ?? 0) > 0
                ? { missingFacts: effect.unresolvable }
                : {
                    note:
                      effect.notes ??
                      'the data records no reason for this — the effect is marked incomplete ' +
                        'and nothing states why, which is itself a gap in the harvested data ' +
                        'rather than a fact about the item',
                  }),
            } as IncompleteReason,
          }),
    };
  }

  return {
    stepId,
    sourceLabel: label,
    instanceType: 'on-hit',
    verification: effect.verification,
    damage: {
      components,
      // No rank axis, exactly as an item active has none.
      rank: 1,
      maxRank: 1,
      // The effect is on the ATTACKER's build, so a `holder` ratio reads the attacker.
      holder: 'attacker',
      rangeType,
      // DELIBERATELY NO `crit`. See the header — this is the correctness the separate row buys.
    },
  };
}

function planStep(
  step: ComboStep,
  config: ChampionConfig,
  abilities: readonly CuratedAbility[],
  attacker: StatBlock,
  catalogue: Catalogue,
): PlannedInstance {
  if (step.kind === 'basic-attack') {
    // A BASIC ATTACK DEALS THE ATTACKER'S TOTAL ATTACK DAMAGE, as physical damage. That is the
    // one instance type needing no curated data, which is why it is modelled here and the other
    // three are not.
    return {
      stepId: step.id,
      sourceLabel: 'Basic attack',
      instanceType: 'basic-attack',
      verification: 'derived',
      damage: {
        components: [
          {
            id: `${step.id}-attack`,
            damageType: 'physical',
            base: { scaling: 'explicit', perRank: [attacker.attackDamage.total] },
            ratios: [],
          },
        ],
        rank: 1,
        maxRank: 1,
        crit: step.options?.['forceCrit'] === true,
      },
    };
  }

  if (step.kind === 'item-active') return planItemActive(step, config, catalogue);

  if (step.kind !== 'ability') {
    return pendingInstance(step, NOT_MODELLED[step.kind] ?? 'this step kind is not modelled yet');
  }

  const ability = abilities.find((a) => a.slot === step.ref);
  if (!ability) {
    return pendingInstance(
      step,
      `nothing has been harvested for this champion's ${step.ref} slot`,
    );
  }
  if (ability.verification === 'incomplete' || ability.components.length === 0) {
    return {
      stepId: step.id,
      sourceLabel: `${ability.slot} — ${ability.abilityName}`,
      instanceType: ability.instanceType,
      verification: ability.verification === 'no-damage' ? 'no-damage' : 'incomplete',
      ...(ability.verification === 'no-damage'
        ? {}
        : {
            incompleteReason: {
              kind: (ability.unresolvable?.length ?? 0) > 0 ? 'permanent' : 'pending',
              ...((ability.unresolvable?.length ?? 0) > 0
                ? { missingFacts: ability.unresolvable }
                : {
                  // NEVER INVENT A REASON. Where the harvester recorded one it is printed; where
                  // it recorded none, the interface says exactly that rather than a sentence that
                  // merely sounds like an explanation. "Recorded as incomplete" was the old
                  // wording and it is worse than useless: it restates the status as though it
                  // were the cause (SPECIFICATION §8).
                  note:
                    ability.notes ??
                    'the data records no reason for this — the ability is marked incomplete and ' +
                      'nothing states why, which is itself a gap in the harvested data rather ' +
                      'than a fact about the ability',
                }),
            } as IncompleteReason,
          }),
    };
  }

  const label = `${ability.slot} — ${ability.abilityName}`;

  // A PASSIVE TAKES NO POINT. It is innate, so it has no rank to be zero, and it is pinned to 1
  // here rather than read from the scenario — `Scenario.abilityRanks` carries Q/W/E/R only.
  const rank = step.ref === 'P' ? 1 : (config.abilityRanks[step.ref as 'Q' | 'W' | 'E' | 'R'] ?? 1);

  // ═══ AN UNLEARNED ABILITY CONTRIBUTES NOTHING, AND SAYS SO ═══
  //
  // This line used to be `rank: Math.max(1, rank)` — sitting directly beneath a comment claiming
  // the opposite rule, which is worse than no comment at all. The clamp silently promoted an
  // unlearned ability to rank 1 and returned that ability's full rank-1 damage.
  //
  // MEASURED IN THE SHIPPED INTERFACE, not inferred: Lux's R set to rank 0 showed Final Spark at
  // 217 magic damage, identical to rank 1, and an earlier probe returned the same figure marked
  // `verified` — this product's strongest evidence claim, on a build that cannot exist. It is
  // reachable in three keystrokes, because `min={1}` on the rank field is an HTML hint that
  // `parseNumericInput` does not enforce, and `src/url/v1.ts` makes rank 0 explicitly legal in a
  // shared link ("must be a rank of zero or more").
  //
  // NO CHAMPION IS EXCEPTED, and none can be: measured over all 937 ability entries across 173
  // champions, NO entry carries a `maxRank` of 0 or null, so there is no data signal for a
  // rankless ability anywhere in the roster. Aphelios's Q/W/E carry `maxRank: 6`, identical to
  // Jayce's and Udyr's form-swapping abilities. The wiki's remark that his abilities "do not
  // feature ranks" is a question about whether 6 is the right harvested value for his weapons —
  // a data question, raised separately, not a reason to write a champion name into the engine.
  //
  // Rank 0 is a statement the SCENARIO makes, not a property of the ability. If a scenario says
  // R is rank 0, the reader set it to 0.
  if (step.ref !== 'P' && rank < 1) {
    // `cause: 'unlearned'` is what lets the interface say "you have not learned this" rather
    // than "we could not model this". Without it the only way to tell the two apart is to match
    // on the prose above, and the product ends up apologising for the reader's own build.
    return pendingInstance(step, unlearnedNote(ability.slot), label, 'unlearned');
  }

  return {
    stepId: step.id,
    sourceLabel: label,
    instanceType: ability.instanceType,
    verification: ability.verification,
    damage: {
      components: ability.components,
      rank,
      maxRank: ability.maxRank,
      ...(step.hitCounts ? { hitCounts: step.hitCounts } : {}),
      ...(step.options?.['forceCrit'] === true ? { crit: true } : {}),
    },
  };
}

// ---------------------------------------------------------------------------------------
// The entry point
// ---------------------------------------------------------------------------------------

/**
 * What this layer does NOT model, stated on every result it produces.
 *
 * These are additional to `ENGINE_EXCLUSIONS`, which describes the runner. Everything here is
 * "the data does not exist yet" rather than "the engine cannot": each is a merge away.
 */
export const SIMULATION_EXCLUSIONS: readonly string[] = [
  'Item passives that are neither on-hit, Spellblade nor an active — 22 of the 43 stored ' +
    'effects, chiefly the burn family, which recurs over time and needs its own damage-over-time ' +
    'line, and 6 whose delivery the source never states',
  'Spellblade’s cooldown and its 10-second window — the engine models sequence and not elapsed ' +
    'time, so it fires on the first basic attack after an ability and no interval is applied',
  'Every rune, including keystones and stat shards — no rune value is in the curated file, and ' +
    'stat shards appear in no fetched source at all',
  'Critical-strike damage above the base multiplier, and every form of penetration — both come ' +
    'from item passives and runes',
  'Movement speed, health regeneration and attack-speed effects on the number of attacks — the ' +
    'engine models sequence rather than elapsed time',
];

/**
 * A Scenario and a Catalogue in; a Result, or a named refusal, out.
 *
 * REFUSES WHOLESALE only when something the WHOLE scenario needs is missing — a champion that is
 * not in the catalogue, an item id that does not exist. A single unmodellable STEP does not
 * refuse the scenario: it becomes an incomplete instance that contributes no damage and says
 * why, which is what SPECIFICATION §8 asks for.
 */
export function simulate(
  scenario: Scenario,
  catalogue: Catalogue,
  options: { patch?: string } = {},
): SimulationResult {
  const planned = planScenario(scenario, catalogue, options);
  if (!planned.ok) return { ok: false, refusals: planned.refusals };
  return { ok: true, result: runCombo(planned.plan) };
}

/** A plan, or the same named refusals `simulate` would have given. */
export type ScenarioPlan =
  | { ok: true; plan: ComboPlan }
  | { ok: false; refusals: SimulationRefusal[] };

/**
 * EVERYTHING `simulate` DOES EXCEPT RUNNING THE COMBO — split out 2026-08-14 for the sweeps.
 *
 * SPECIFICATION §11's damage-versus-armor curve moves a figure that is NOT a field of a
 * Scenario: a defender's armor is their base armor at their level plus what their items give,
 * so "the same scenario against 150 armor" cannot be expressed as a Scenario at all. The sweep
 * therefore builds the plan once and re-runs `runCombo` against a defender stat block whose
 * resistance has been overridden — which needs the plan, not the Result.
 *
 * It is exported so there is ONE lookup-and-assembly path rather than a second copy of it in the
 * sweep, and `simulate` above is now a two-line call into it. Behaviour is unchanged.
 */
export function planScenario(
  scenario: Scenario,
  catalogue: Catalogue,
  options: { patch?: string } = {},
): ScenarioPlan {
  const refusals: SimulationRefusal[] = [];

  const attackerChampion = catalogue.champion(scenario.attacker.apiname);
  const defenderChampion = catalogue.champion(scenario.defender.apiname);
  if (!attackerChampion) {
    refusals.push({
      path: 'attacker.apiname',
      reason: `no champion named "${scenario.attacker.apiname}" is in the catalogue`,
    });
  }
  if (!defenderChampion) {
    refusals.push({
      path: 'defender.apiname',
      reason: `no champion named "${scenario.defender.apiname}" is in the catalogue`,
    });
  }
  if (!attackerChampion || !defenderChampion) return { ok: false, refusals };

  const attacker = buildStatBlock(attackerChampion, scenario.attacker, catalogue);
  const defender = buildStatBlock(defenderChampion, scenario.defender, catalogue);
  refusals.push(...attacker.refusals, ...defender.refusals);
  if (refusals.length > 0) return { ok: false, refusals };

  const abilities = catalogue.abilities(scenario.attacker.apiname);
  const planned = scenario.combo.map((step) =>
    planStep(step, scenario.attacker, abilities, attacker.block, catalogue),
  );
  const instances = withRiders(
    planned,
    scenario.combo,
    scenario.attacker,
    catalogue,
    attackerChampion.stats.rangetype === 'Ranged' ? 'Ranged' : 'Melee',
  );

  const unknownStats = [...attacker.unknownItemStats, ...defender.unknownItemStats];
  const plan: ComboPlan = {
    patch: options.patch ?? attackerChampion.provenance.patch,
    scenario,
    attacker: attacker.block,
    defender: defender.block,
    instances,
    excludedMechanics: [
      ...SIMULATION_EXCLUSIONS,
      // A STAT KEY NOBODY MAPPED IS NAMED, not dropped quietly. A patch adding one would
      // otherwise remove a stat from the build with nothing on screen to say so.
      ...(unknownStats.length > 0
        ? [
            `Item statistics this build does not know how to apply, so they were left out: ` +
              `${[...new Set(unknownStats)].join(', ')}`,
          ]
        : []),
    ],
  };

  return { ok: true, plan };
}
