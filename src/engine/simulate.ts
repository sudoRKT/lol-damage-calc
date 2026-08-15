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
  CuratedRune,
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
import { resolveDefences } from './defences';
import type { AttackerVamp } from './vamp';

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
   * Every curated effect on one rune, keyed by RUNE ID. Added 2026-08-15.
   *
   * Keyed by id and not by champion, because that is what the scenario names: `ChampionConfig`
   * carries a `RunePage` of `keystone`, `primary`, `secondary` and `shards`, so the engine
   * iterates the build and asks about each id. The catalogue never enumerates; the scenario does.
   * This is the same relationship `item(id)` and `itemEffects(itemId)` already have, and
   * deliberately NOT the relationship `defensiveEffects(apiname)` has — that one is keyed by
   * champion and must answer for a champion with no stored defences.
   *
   * A LIST, not one effect, for the same reason `itemEffects` is: a rune that later carries two
   * separate effects then needs no interface change.
   *
   * **AN EMPTY LIST FOR A RUNE THE BUILD CARRIES IS NOT SILENCE.** A build with no runes asks
   * nothing and is a legitimate build. But a rune that IS in the build and has no curated entry
   * must produce a named row saying its values are not published — never zero damage, which a
   * reader would read as "this rune does nothing". `planItemActive` already does exactly this for
   * an owned item with no stored active, and its wording is the model.
   *
   * STAT SHARDS ARE NOT THIS LOOKUP. They change the stat block rather than the combo and have
   * their own shape; none is modelled yet, and this is named here so that "runes are modelled" is
   * never said while shards are silently absent.
   */
  runeEffects(runeId: number): readonly CuratedRune[];
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
 * NINE are mapped below. The three that are not, and why — each is an EXCLUSION, not an
 * oversight, and each is stated on the result:
 *   - the two movement-speed keys and health regeneration change no damage figure and no
 *     survival verdict, because this engine models sequence rather than elapsed time (§3.2).
 *
 * `PercentLifeStealMod` WAS THE FOURTH UNTIL 2026-08-15. The note here said it was "real sustain"
 * dropped because turning a percentage into health restored needs the per-instance damage figure
 * this function does not have — which was true of THIS function and never true of the runner. It
 * is now collected here as a rate (7 of the 209 shipped items carry it) and turned into health by
 * `runCombo`, one instance at a time (vamp.ts). It is a RATE and not a stat: it does not enter the
 * stat block, because the frozen `StatBlock` has no field for it and none is needed — it travels
 * on the plan.
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
  'PercentLifeStealMod',
  // Known and deliberately not applied — see above.
  'PercentMovementSpeedMod',
  'FlatMovementSpeedMod',
  'FlatHPRegenMod',
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
  /**
   * Life steal, as a FRACTION, summed across the build — Data Dragon states it as a fraction
   * already (0.15 for a 15% item), and the wiki says sources "stack additively", so the sum is
   * the whole rule. It is not part of the stat block: it leaves this function on the plan.
   */
  lifesteal: number;
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
    lifesteal: 0,
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
        case 'PercentLifeStealMod':
          // ADDITIVE across the build, per the wiki's life-steal article (read 2026-08-15):
          // sources "stack additively". Two 10% items are 20%, never 21%.
          totals.lifesteal += value;
          break;
        default:
          // The three damage-irrelevant keys. Named in ITEM_STAT_KEYS so they are recognised
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
): {
  block: StatBlock;
  refusals: SimulationRefusal[];
  unknownItemStats: string[];
  /**
   * The vamp rates this build carries (§3.7). BESIDE the stat block, not in it: the frozen
   * `StatBlock` has no field for them, and they are not stats the damage arithmetic reads — they
   * are rates applied to damage already dealt. Only the attacker's are used; see `ComboPlan`.
   */
  vamp: AttackerVamp;
} {
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

  return {
    block,
    refusals: items.refusals,
    unknownItemStats: items.totals.unknownKeys,
    // ONLY WHAT THE BUILD ACTUALLY PROVIDES. A build with no life-steal item states no rate at
    // all rather than a rate of zero, so "nothing was carried" and "nothing was restored" stay
    // distinguishable further down.
    vamp: items.totals.lifesteal > 0 ? { lifesteal: items.totals.lifesteal } : {},
  };
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

/**
 * WHAT TRIGGERS EACH BURN, READ FROM THE SOURCE'S OWN SENTENCE — one entry per item, by id.
 *
 * **This is a READ POPULATION, not a pattern** (CLAUDE.md; the precedent is `READ_POPULATION` in
 * scripts/extract/variable-hits.ts). All 9 stored `periodic` effects were read sentence by
 * sentence on 2026-08-14 and classified here by hand. A regular expression over `sourceSays`
 * would have to tell "Dealing ability damage burns enemies" from "60/4 magic damage every 0.25
 * seconds" — two sentences that mean entirely different things about WHEN the burn happens — and
 * getting that wrong hands a build damage it never earned.
 *
 * **AN ITEM NOT IN THIS MAP IS REPORTED, NEVER GUESSED.** Adding a member means reading its
 * sentence, not widening anything.
 *
 * `'ability-damage'` — the sentence states the trigger in sequence terms this engine can honour:
 * the burn happens because an ability dealt damage. Three say exactly that.
 *
 * `'not-stated'` — the sentence states how much and how often and NOT what starts it. Malignance
 * and Zeke's Convergence are the live cases: both carry a tick figure and a tick count, and
 * neither stored sentence says what sets them off. They are named as incomplete rather than fired
 * unconditionally, because firing them would assert they always happen.
 */
/**
 * WHICH RUNES THE ENGINE APPLIES, AND HOW EACH REACHES ITS TARGET.
 *
 * ═══ A READ POPULATION, NOT A DETECTOR ═══
 *
 * `CuratedRune` carries no delivery field — no `appliesAs`, no condition. A rune states its
 * trigger in a sentence and nowhere else. Deciding "Scorch rides on an ability" from the rune's
 * NAME would be a detector deciding what a person must confirm, which CLAUDE.md forbids for
 * anything that multiplies a damage number.
 *
 * So this is the same shape as `BURN_TRIGGERS` above: one entry per rune whose sentence a person
 * has read, and **a rune absent from this map is REPORTED rather than guessed at**. Five runes
 * carry a curated value today and one is here, which is the honest state — the other four are
 * listed in `RUNES_READ_BUT_NOT_DELIVERABLE` with what each is waiting on.
 *
 * ═══ WHAT `ability-hit` MEANS AND WHAT IT LEAVES OUT ═══
 *
 * The rune fires once on the first ability instance of the sequence that deals damage. Scorch's
 * source states a 1-second delay before it lands and a 10-second cooldown; **neither is modelled,
 * because this engine models sequence and not elapsed time (§3.2)**, and both are disclosed in
 * `SIMULATION_EXCLUSIONS` rather than approximated. The cooldown is why it fires ONCE: a second
 * ability inside ten seconds would not re-trigger it in the game, and the engine has no clock to
 * tell it otherwise, so firing once is the reading that cannot overstate.
 *
 * The delay does NOT make this damage over time. It is one instance landed late, which is a
 * different fact from a figure delivered across a duration (§3.8).
 */
export const RUNE_DELIVERY: ReadonlyMap<number, 'ability-hit'> = new Map([
  // Scorch — "damaging an enemy champion with an ability sets them on fire". The trigger is
  // stated plainly and the entry's own notes record it: the damage must come from an ability,
  // not a basic attack.
  [8237, 'ability-hit'],
]);

/**
 * Runes with a stored value that this engine still cannot deliver, and what each waits on.
 *
 * Named rather than silently skipped, because "the file has seven runes" and "the calculator
 * applies one" are different facts and a reader is entitled to both.
 */
export const RUNES_READ_BUT_NOT_DELIVERABLE: ReadonlyMap<number, string> = new Map([
  [
    8126,
    'Cheap Shot — fires only against a target that is impaired. The condition is a fact the ' +
      'engine cannot know and the user must state, and no rune toggle exists in the interface yet.',
  ],
  [
    8143,
    'Sudden Impact — fires after a dash, blink or stealth exit. The engine models a sequence of ' +
      'damage instances and has no notion of movement, so nothing in a scenario can satisfy it.',
  ],
  [
    8437,
    'Grasp of the Undying — rides on a basic attack every four seconds, which is elapsed time ' +
      '(§3.2), and also grants permanent bonus health, which no step can express.',
  ],
  [
    8439,
    'Aftershock — fires on immobilising a champion. The engine has no notion of immobilising.',
  ],
]);

export const BURN_TRIGGERS: ReadonlyMap<number, 'ability-damage' | 'not-stated'> = new Map([
  [2503, 'ability-damage'], // Blackfire Torch — "Dealing ability damage burns enemies"
  [2508, 'ability-damage'], // Fated Ashes — "Dealing ability damage burns enemies"
  [6653, 'ability-damage'], // Liandry's Torment — the burn its ability damage applies
  [3118, 'not-stated'], // Malignance — tick and count stated, trigger not
  [3050, 'not-stated'], // Zeke's Convergence — tick and count stated, trigger not
]);

/**
 * THE BURN FAMILY, AS DAMAGE OVER TIME. Built 2026-08-14.
 *
 * **9 of the 43 stored item effects recur** (`appliesAs: 'periodic'`). SPECIFICATION §3.8 fixes
 * what happens to them: a DoT is NEVER folded into the burst total, it is reported as its own
 * line stating the total across the effect's full duration, and the survival verdict is given
 * twice. Until now nothing produced one, so the second verdict had been identical to the first
 * for every real scenario ever computed (DATA-SOURCES §56).
 *
 * ═══ THE FULL-DURATION TOTAL IS ARITHMETIC ON STORED DATA, NEVER AN INVENTED DURATION ═══
 *
 * The component holds ONE TICK and `overTime.totalInstances` holds how many times it lands, both
 * stated by the source. The total is one times the other, expressed through `AbilityComponent.hits`
 * — the field that already means "a fixed count the source states", evaluated as `perHit × hits`.
 * Checked against the source's own arithmetic: Blackfire Torch is 10 a tick over 6 ticks and its
 * sentence says "for a total of 60"; Fated Ashes is 2.5 over 6 and says "a total of 15".
 *
 * **NO INTERVAL IS READ AND NO DURATION IS DERIVED.** §3.2 gives this engine no time axis. "Every
 * 0.5 seconds over 3 seconds" is not converted to anything here — the count comes from the stored
 * count, and where there is no stored count there is no total.
 *
 * ═══ FOUR OF THE NINE CAN NEVER CARRY A FIGURE, AND SAY SO ═══
 *
 * Bami's Cinder, Hollow Radiance, Sunfire Aegis and Unending Despair burn for as long as an enemy
 * stays near, and the source states no number of ticks. They are named as INCOMPLETE DoT sources
 * with that reason rather than left absent — absent reads as "this item does nothing", which is
 * false and is the exact failure this project exists to prevent.
 */
function withBurns(
  planned: PlannedInstance[],
  combo: readonly ComboStep[],
  config: ChampionConfig,
  catalogue: Catalogue,
  rangeType: 'Melee' | 'Ranged',
): PlannedInstance[] {
  const burns = config.items.flatMap((id) => {
    const item = catalogue.item(id);
    return catalogue
      .itemEffects(id)
      .filter((e) => e.appliesAs === 'periodic')
      .map((effect) => ({ effect, itemName: item?.name ?? `item ${id}`, itemId: id }));
  });
  if (burns.length === 0) return planned;

  // Did an ability actually deal damage? A burn that the source says is applied BY ability damage
  // has not been applied if no ability landed. `verification === 'incomplete'` is the engine's
  // own statement that an instance contributed nothing.
  const anAbilityDealtDamage = planned.some(
    (instance, i) =>
      combo[i]?.kind === 'ability' && instance.damage !== undefined && instance.verification !== 'incomplete',
  );

  const out = [...planned];
  burns.forEach(({ effect, itemName, itemId }, ordinal) => {
    const label = `${itemName} — ${effect.name}`;
    const stepId = `burn-${ordinal}`;
    const components = effect.components ?? [];
    const ticks = effect.overTime?.totalInstances;
    const trigger = BURN_TRIGGERS.get(itemId);

    const incomplete = (note: string): PlannedInstance => ({
      stepId,
      sourceLabel: label,
      instanceType: 'dot-application',
      verification: 'incomplete',
      dot: {
        label,
        verification: 'incomplete',
        incompleteReason: { kind: 'pending', note },
        damage: { components: [], rank: 1, maxRank: 1 },
      },
    });

    if (effect.verification === 'incomplete' || components.length === 0) {
      out.push(
        incomplete(
          effect.notes ??
            `${itemName} burns over time and its entry is incomplete, so no total is published.`,
        ),
      );
      return;
    }
    if (ticks === undefined) {
      out.push(
        incomplete(
          `${itemName} burns for as long as its condition holds, and the source states no ` +
            `number of ticks — so no full-duration total exists to report. This engine models ` +
            `sequence rather than elapsed time, so a duration cannot be turned into a count.`,
        ),
      );
      return;
    }
    if (trigger === undefined || trigger === 'not-stated') {
      out.push(
        incomplete(
          `${itemName} states how much it burns for and how many times, but the source does ` +
            `not say what sets it off — so whether it fires in this combo cannot be decided ` +
            `without guessing.`,
        ),
      );
      return;
    }
    if (trigger === 'ability-damage' && !anAbilityDealtDamage) {
      out.push(
        incomplete(
          `${itemName} burns enemies hit by ability damage, and no ability in this combo dealt ` +
            `any. That is your combo rather than a gap in our data.`,
        ),
      );
      return;
    }

    // THE FULL-DURATION TOTAL. `hits` is the stored tick count, and nothing else here scales it.
    out.push({
      stepId,
      sourceLabel: label,
      instanceType: 'dot-application',
      verification: effect.verification,
      dot: {
        label,
        verification: effect.verification,
        damage: {
          components: components.map((c) => ({ ...c, hits: ticks })),
          rank: 1,
          maxRank: 1,
          holder: 'attacker',
          rangeType,
        },
      },
    });
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
  // Presentational only: it lets the burndown bracket this row under the attack that carried it,
  // without the engine merging the two instances (src/types/result.ts, `carriedBy`).
  const carriedBy = carrier.id;
  const components = effect.components ?? [];

  if (effect.verification === 'incomplete' || components.length === 0) {
    return {
      stepId,
      carriedBy,
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
    carriedBy,
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


/**
 * THE RUNE ROWS. Built 2026-08-15 — the first time a rune changes a figure in this product.
 *
 * A rune rides on the instance that triggered it, exactly as an on-hit item effect does, and for
 * the same two reasons `withRiders` gives: it keeps the carrier's resistance working intact when
 * the two damage types differ, and it keeps the rune out of a critical strike it does not share.
 *
 * ONLY RUNES IN `RUNE_DELIVERY` ARE APPLIED. A rune with a curated value and no read delivery is
 * NOT silently skipped — `runesNotDelivered` collects it so the caller can name it, because
 * "seven runes are stored" and "one rune moves a figure" are different facts.
 *
 * ONCE PER SEQUENCE. See `RUNE_DELIVERY` for why: the source states a cooldown, the engine has no
 * clock, and firing once is the reading that cannot overstate.
 */
function withRuneRows(
  planned: PlannedInstance[],
  combo: readonly ComboStep[],
  config: ChampionConfig,
  catalogue: Catalogue,
  rangeType: 'Melee' | 'Ranged',
): { instances: PlannedInstance[]; notDelivered: string[] } {
  const page = config.runes;
  const worn = [page.keystone, ...page.primary, ...page.secondary].filter(
    (id): id is number => typeof id === 'number',
  );

  const notDelivered: string[] = [];
  const toFire: Array<{ runeId: number; effect: CuratedRune }> = [];

  for (const runeId of worn) {
    const effects = catalogue.runeEffects(runeId);
    if (effects.length === 0) continue; // not curated: the caller's exclusions already say so
    for (const effect of effects) {
      if (RUNE_DELIVERY.get(runeId) === 'ability-hit') toFire.push({ runeId, effect });
      else {
        notDelivered.push(
          RUNES_READ_BUT_NOT_DELIVERABLE.get(runeId) ??
            `${effect.runeName ?? `rune ${runeId}`} — a value is stored and its delivery has not ` +
              `been read, so nothing is applied rather than a carrier being guessed at`,
        );
      }
    }
  }
  if (toFire.length === 0) return { instances: planned, notDelivered };

  // The first ability step in the sequence. A basic attack does not trigger these.
  const carrierIndex = combo.findIndex((step) => step.kind === 'ability');
  if (carrierIndex === -1) {
    for (const { effect } of toFire) {
      notDelivered.push(
        `${effect.runeName ?? 'a rune'} — it fires on an ability and this combo has none`,
      );
    }
    return { instances: planned, notDelivered };
  }

  const carrier = combo[carrierIndex]!;
  const out = [...planned];
  const at = out.findIndex((i) => i.stepId === carrier.id);
  let ordinal = 0;
  for (const { effect } of toFire) {
    out.splice(at + 1 + ordinal, 0, runeInstance(effect, carrier, ordinal, rangeType));
    ordinal += 1;
  }
  return { instances: out, notDelivered };
}

/** One rune's row, shaped exactly as an item rider's. */
function runeInstance(
  effect: CuratedRune,
  carrier: ComboStep,
  ordinal: number,
  rangeType: 'Melee' | 'Ranged',
): PlannedInstance {
  const stepId = `${carrier.id}-rune-${ordinal}`;
  const label = `${effect.runeName ?? 'Rune'} (rune)`;
  const components = effect.components ?? [];

  if (effect.verification === 'incomplete' || components.length === 0) {
    return {
      stepId,
      carriedBy: carrier.id,
      sourceLabel: label,
      instanceType: 'on-hit',
      verification: 'incomplete',
      incompleteReason: {
        kind: 'pending',
        note: effect.notes ?? 'a rune value is stored and the entry states no usable figure',
      } as IncompleteReason,
    };
  }

  return {
    stepId,
    carriedBy: carrier.id,
    sourceLabel: label,
    instanceType: 'on-hit',
    verification: effect.verification,
    damage: {
      components,
      rank: 1,
      maxRank: 1,
      // The rune is on the ATTACKER's page, so a `holder` ratio reads the attacker.
      holder: 'attacker',
      rangeType,
      // DELIBERATELY NO `crit`, for the reason the item riders give.
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

  // ═══ A RECURRING COMPONENT LEAVES THE BURST LINE (added 2026-08-14) ═══
  //
  // SPECIFICATION §3.8: damage over time is NEVER folded into the burst total. An ability can be
  // BOTH — Teemo E deals magic damage on hit AND a separate per-tick burn from the same entry —
  // so the split is per component, not per ability. Each half keeps its own line.
  const burstComponents = ability.components.filter((c) => !c.overTime);
  const overTimeComponents = ability.components.filter((c) => c.overTime);

  return {
    stepId: step.id,
    sourceLabel: label,
    instanceType: ability.instanceType,
    verification: ability.verification,
    ...(burstComponents.length > 0
      ? {
          damage: {
            components: burstComponents,
            rank,
            maxRank: ability.maxRank,
            ...(step.hitCounts ? { hitCounts: step.hitCounts } : {}),
            ...(step.options?.['forceCrit'] === true ? { crit: true } : {}),
          },
        }
      : {}),
    ...(overTimeComponents.length > 0
      ? {
          dot: {
            label,
            verification: ability.verification,
            damage: {
              components: overTimeComponents,
              rank,
              maxRank: ability.maxRank,
              ...(step.hitCounts ? { hitCounts: step.hitCounts } : {}),
              // NO CRIT. A crit multiplies the instance that struck; a burn ticking afterwards
              // is not that instance.
            },
          },
        }
      : {}),
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

  // ═══ SUSTAIN: WHAT IS CARRIED AND WHAT IS NOT (§3.7, added 2026-08-15) ═══
  //
  // Life steal IS modelled from item statistics. These three are the edges of it, and each is a
  // measurement rather than an impression — see the counts named in each line.
  'Omnivamp from items and runes — no stored source states a rate. Measured 2026-08-15 across ' +
    'the 209 shipped items and the shipped rune list: the item data states twelve stat keys in ' +
    'total and none of them is omnivamp, and the rune list states no stat values at all. ' +
    'Omnivamp does exist in game, carried by item PASSIVES and a few champion kits rather than ' +
    'by an item’s statistics, and neither route is read here. Life steal is the one of the ' +
    'three stats any stored source states, and 7 of the 209 items carry it',
  'Spell vamp — it has no sources in the game at all. The wiki lists it for archival purposes ' +
    'only, among the kinds of Vamp that "do not currently have any sources", its last source ' +
    'having been removed in V26.04 (read 2026-08-15). Nothing is missing from this engine on ' +
    'that account; the line is here so that a spell-vamp build coming back to the game is ' +
    'noticed rather than silently ignored',
  'Life steal on an item’s ON-HIT proc damage — AND THIS IS A KNOWN UNDER-COUNT, not a mechanic ' +
    'that does not exist. The wiki states that "the damage of most item on-hit effects benefits ' +
    'from life steal", so in game these procs usually DO heal. It is left out because "most" is ' +
    'not "all" — the wiki decides membership item by item and names exceptions — and no stored ' +
    'item record carries that fact. A build pairing life steal with an on-hit item therefore ' +
    'reports LESS sustain here than it would restore in game',
  'Life steal, omnivamp and spell vamp written into a champion’s own kit, an item PASSIVE or a ' +
    'rune rather than into an item’s statistics — only the item statistic is read',

  // ═══ THE THREE DEFENSIVE KINDS WITH NO STEP IN THE ENGINE ═══
  //
  // Added 2026-08-14 with the defensive wiring. Shields, damage reduction, type-specific
  // reduction, resistance grants and healing are now built from the defender's own kit; these
  // three are not, and each needs a new arm in the instance walk rather than a value in an
  // existing shape. Counted over the 155 stored entries in the curated file, patch 16.16.1.
  'Three kinds of defence the defender’s own kit can carry: invulnerability and dodge (18 ' +
    'stored entries), spell shields (3) and abilities that grant maximum health (6). Each needs ' +
    'a step this engine does not have — skipping an instance outright, cancelling one ability ' +
    'before it lands, or changing the size of a health pool mid-sequence. A scenario switching ' +
    'one on is told, by name, that it was not applied',

  // A DEFENCE THAT RECURS. Measured over the file at patch 16.16.1 on 2026-08-15: 21 entries
  // carry `overTime`, NOT ONE states `totalInstances`, and — the part this sentence used to get
  // wrong — NOT ONE says whether the figure it stores covers one occurrence or the whole
  // duration. The old wording ended "so no total can be formed", which is contradicted by the
  // file: Master Yi W stores 15 per tick AND 120 for the channel, and eight rows elsewhere carry
  // the same pairing. See `recurringRefusal` in defences.ts for the full arithmetic and for the
  // contract field this is waiting on.
  'Defensive effects that recur over a duration — 21 stored entries, chiefly channelled heals. ' +
    'None states how many times it occurs, and none says whether the figure it stores covers ' +
    'one occurrence or the whole duration, so applying it would mean choosing between ' +
    'understating the defender and overstating them',
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
  const rangeType = attackerChampion.stats.rangetype === 'Ranged' ? 'Ranged' : 'Melee';
  const withRiderRows = withRiders(planned, scenario.combo, scenario.attacker, catalogue, rangeType);
  const withRunes = withRuneRows(withRiderRows, scenario.combo, scenario.attacker, catalogue, rangeType);
  const instances = withBurns(
    withRunes.instances,
    scenario.combo,
    scenario.attacker,
    catalogue,
    rangeType,
  );

  // ═══ THE DEFENDER'S OWN KIT (SPECIFICATION §5) ═══
  //
  // Resolved against the defender's stat block BEFORE any resistance grant is folded in, because
  // Taric W grants armor as a share of his own armor and reading a block that already carried the
  // grant would compound it. See defences.ts.
  const defenderRangeType = defenderChampion.stats.rangetype === 'Ranged' ? 'Ranged' : 'Melee';
  const defences = resolveDefences({
    effects: catalogue.defensiveEffects(scenario.defender.apiname),
    abilities: catalogue.abilities(scenario.defender.apiname),
    config: scenario.defender,
    defender: defender.block,
    rangeType: defenderRangeType,
  });

  // A RESISTANCE GRANT IS A STAT, NOT A NEW MECHANISM. It is added here and then meets the fixed
  // four-step resistance-modifier order unchanged. It is added to the BONUS figure as well as the
  // total, because that is what it is — Leona W's 20–50 armor is bonus armor, and percentage
  // BONUS armor penetration reads that figure.
  const defenderBlock: StatBlock =
    defences.resistanceGrant.armor === 0 && defences.resistanceGrant.magicResist === 0
      ? defender.block
      : {
          ...defender.block,
          armor: defender.block.armor + defences.resistanceGrant.armor,
          armorBonus: defender.block.armorBonus + defences.resistanceGrant.armor,
          magicResist: defender.block.magicResist + defences.resistanceGrant.magicResist,
          magicResistBonus:
            defender.block.magicResistBonus + defences.resistanceGrant.magicResist,
        };

  const unknownStats = [...attacker.unknownItemStats, ...defender.unknownItemStats];
  const plan: ComboPlan = {
    patch: options.patch ?? attackerChampion.provenance.patch,
    scenario,
    attacker: attacker.block,
    defender: defenderBlock,
    instances,
    // THE ATTACKER'S ONLY, AND SAID PLAINLY: the defender does not act (SPECIFICATION §5), so a
    // life-steal item on their build has no damage of theirs to read and restores nothing. That
    // is a fact about the model, not a gap in it, so it is not an exclusion — it is the same
    // reason the defensive layer refuses a heal stored as a share of damage dealt.
    ...(attacker.vamp.lifesteal !== undefined ? { attackerVamp: attacker.vamp } : {}),
    ...(defences.shields.length > 0 ? { defenderShields: defences.shields } : {}),
    ...(defences.reductions.length > 0 ? { defenderReductions: defences.reductions } : {}),
    ...(defences.sustain.length > 0 ? { unplacedSustain: defences.sustain } : {}),
    excludedMechanics: [
      ...SIMULATION_EXCLUSIONS,
      // A DEFENCE THE READER SWITCHED ON AND THE ENGINE COULD NOT TAKE IS NAMED. Silence here
      // would show a toggle that visibly does nothing, which is worse than a stated refusal.
      ...defences.notes,
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
