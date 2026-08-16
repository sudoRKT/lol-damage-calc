// THE DEFENDER'S OWN KIT, BUILT FROM DATA — SPECIFICATION §5.
//
// ═══ WHAT WAS MISSING ═══
//
// The machinery for the defender has existed and been tested for some time: `shields.ts` models
// all three shield kinds, `damage-reduction.ts` models post-mitigation reduction, and `combo.ts`
// resolves healing. `ComboPlan` accepts `defenderShields`, `defenderReductions` and
// `unplacedSustain`. NOTHING FILLED ANY OF IT FROM DATA. Every defensive figure a Result has ever
// carried came from a hand-authored plan, which means no user configuration has ever produced one.
//
// This file is that filling. It turns `Catalogue.defensiveEffects(defender)` plus the user's
// toggles into the three shapes `runCombo` already understands, plus one stat adjustment.
//
// ═══ ABSENT MEANS NOT UP ═══
//
// 152 of the 155 stored entries are conditional (measured over `curated/curated-data.json`, patch
// 16.16.1). The engine cannot know whether Braum's shield was raised when the combo landed, so the
// user says, through `ChampionConfig.entryState` keyed by `defensiveToggleKey`. A key that is
// absent, or is anything other than boolean `true`, means THE DEFENCE WAS NOT UP. There is no
// default the other way and there must not be: asserting a defence the reader never stated would
// understate the damage, and a plausible wrong number is this product's one fatal failure.
//
// **The key is never rebuilt here.** `defensiveToggleKey` is imported from the frozen contract and
// called. The interface writes these keys and this file reads them; two areas deriving "the same"
// key from the same fields is exactly the cross-area seam DATA-SOURCES §44 exists to catch, and it
// fails silently — both suites pass and the toggle simply never fires.
//
// ═══ WHAT IT REFUSES, AND WHY REFUSING IS THE POINT ═══
//
// A toggled-on entry this file cannot take contributes NOTHING and produces a sentence naming the
// entry and the reason, which `planScenario` puts on `Result.excludedMechanics`. It is never
// approximated. Four kinds have no step in the engine at all (immunity, spell-shield,
// max-health-grant and any `not-stated` activation) and they are refused by class rather than
// half-modelled — SPECIFICATION §11: every excluded mechanic is stated visibly.
//
// ═══ ONE EVALUATOR, NOT TWO ═══
//
// A defensive value is a base plus ratios at an ability rank, which is precisely what
// `evaluateComponent` already resolves — including every named refusal for an owner the source
// never stated. So an effect is turned into a synthetic component and passed through it, rather
// than growing a second expander here. The synthetic component's `damageType` is meaningless and
// is never read: nothing in this file produces damage.

import type {
  AbilityComponent,
  ChampionConfig,
  CuratedAbility,
  CuratedDefensiveEffect,
  DamageType,
  DefensiveKind,
  OverTimeFigure,
  Ratio,
} from '../types';
import { defensiveToggleKey } from '../types';
import type { StatBlock } from '../types/result';
import type { PlannedSustain } from './combo';
import {
  ComponentEvaluationError,
  evaluateComponent,
  type ComponentContext,
  type OwnedStats,
} from './component';
import type { DefenderDamageReduction } from './damage-reduction';
import type { ShieldPool } from './shields';

// ---------------------------------------------------------------------------------------
// What comes out
// ---------------------------------------------------------------------------------------

/** One defence that actually resolved, for reporting and for tests to count. */
export interface AppliedDefence {
  /** The `entryState` key it was switched on under. */
  key: string;
  kind: DefensiveKind;
  /** Shown to the user, e.g. "W — Eclipse (Bonus Armor)". */
  label: string;
  /** The resolved figure, in the unit of its kind: points of shield, points of armor, health
   *  restored, or a fraction of 1 for a percentage reduction. */
  amount: number;
}

/** One defence that was switched ON and could not be taken. Never silently dropped. */
export interface RefusedDefence {
  key: string;
  kind: DefensiveKind;
  label: string;
  /** Plain English, naming what is missing. Reaches the user on `Result.excludedMechanics`. */
  reason: string;
}

/**
 * Everything the defender's own kit contributes to one scenario.
 *
 * The first three go straight onto the `ComboPlan`. `resistanceGrant` is NOT a new mechanism: it
 * is added to the defender's armor and magic resistance and then meets the fixed four-step
 * resistance-modifier order exactly as item armor does (SPECIFICATION §3.6). The order is not
 * touched, reordered or bypassed anywhere in this file.
 */
export interface ResolvedDefences {
  shields: ShieldPool[];
  reductions: DefenderDamageReduction[];
  /** Points to add to the defender's armor and magic resistance, as BONUS resistance. */
  resistanceGrant: { armor: number; magicResist: number };
  sustain: PlannedSustain[];
  applied: AppliedDefence[];
  refused: RefusedDefence[];
  /** One sentence per refusal, for `excludedMechanics`. */
  notes: string[];
}

/**
 * The three kinds the engine has NO step for, named as a class.
 *
 * Each needs a new arm in the instance walk — an instance that is skipped outright (immunity), an
 * ability's damage cancelled before it lands (spell-shield), or a health pool that changes size
 * mid-sequence (max-health-grant). None of the three can be approximated into an existing shape
 * without inventing a rule, so none is.
 */
export const UNMODELLED_DEFENSIVE_KINDS: readonly DefensiveKind[] = [
  'immunity',
  'spell-shield',
  'max-health-grant',
];

/** Why each of the three is refused, in the words a reader gets. */
const UNMODELLED_REASON: Record<string, string> = {
  immunity:
    'the engine has no step that skips an instance outright. Modelling it means deciding which ' +
    'instances of the combo the immunity covers, and the engine has no time axis to decide it on',
  'spell-shield':
    'the engine has no step that cancels one ability before it lands. Which ability a spell ' +
    'shield eats depends on order and timing, and nothing in the scenario states it',
  'max-health-grant':
    'the engine has no step that changes the size of a health pool mid-sequence. Whether the ' +
    'grant also raises CURRENT health, and what a bonus-health ratio should read once it has, ' +
    'are not stated by the stored entry',
};

// ---------------------------------------------------------------------------------------
// Reading the toggle
// ---------------------------------------------------------------------------------------

/**
 * Whether one stored defence was up when the combo landed.
 *
 * `always-active` is up unconditionally — it is a property of the champion, not of the moment.
 * `conditional` is up only when the scenario says so. `not-stated` is NEVER up: the source states
 * a condition this engine has no way to represent (a distance, a location outside combat), so
 * there is nothing for a toggle to mean, and applying it either way would be a guess.
 */
export function defenceIsUp(effect: CuratedDefensiveEffect, config: ChampionConfig): boolean {
  if (effect.activation === 'always-active') return true;
  if (effect.activation === 'not-stated') return false;
  return config.entryState[defensiveToggleKey(effect)] === true;
}

/** The name a reader sees. Slot and ability, plus the source's own row label where it has one. */
function labelFor(effect: CuratedDefensiveEffect): string {
  const base = `${effect.slot} — ${effect.abilityName}`;
  return effect.label ? `${base} (${effect.label})` : base;
}

// ---------------------------------------------------------------------------------------
// Resolving one stored value to a number
// ---------------------------------------------------------------------------------------

type Resolution = { ok: true; amount: number } | { ok: false; reason: string };

/**
 * One champion's stats as a ratio may read them.
 *
 * The same mapping `combo.ts` uses, and deliberately the same fields: a stat the block does not
 * carry is left ABSENT so the evaluator refuses the ratio by name rather than resolving it
 * against an invented zero.
 */
function statsView(block: StatBlock): OwnedStats {
  return {
    attackDamage: block.attackDamage,
    abilityPower: block.abilityPower,
    maxHP: block.maxHp,
    currentHP: block.hp,
    bonusHP: block.maxHpBonus,
    armor: block.armor,
    bonusArmor: block.armorBonus,
    magicResist: block.magicResist,
    bonusMagicResist: block.magicResistBonus,
    ...(block.maxMana !== undefined ? { maxMana: block.maxMana } : {}),
    ...(block.mana !== undefined ? { currentMana: block.mana } : {}),
  };
}

/**
 * The rank the defender holds in the ability this defence belongs to.
 *
 * A PASSIVE takes no point and is pinned to 1, the same convention `planStep` uses. An ability
 * the defender has put no point into is refused rather than promoted to rank 1 — the same defect
 * that returned Lux's rank-1 Final Spark for a rank-0 R, applied on the defensive side.
 */
function rankFor(effect: CuratedDefensiveEffect, config: ChampionConfig): Resolution {
  if (effect.slot === 'P') return { ok: true, amount: 1 };
  const rank = config.abilityRanks[effect.slot as 'Q' | 'W' | 'E' | 'R'] ?? 0;
  if (rank < 1) {
    return {
      ok: false,
      reason:
        `no point has been put into ${effect.slot}, so this defence does not exist on this ` +
        `build. This is the defender's build rather than a gap in our data`,
    };
  }
  return { ok: true, amount: rank };
}

/**
 * The stored figure, at this rank, with its ratios resolved against the DEFENDER.
 *
 * A defensive effect is written from the point of view of the champion who owns the ability, so
 * every core ratio — ability power, attack damage — reads the DEFENDER's stat block, and
 * `owner: 'caster'` means the defender too.
 *
 * **`owner: 'target'` IS REFUSED HERE, deliberately, and not by the general evaluator's message.**
 * On an ABILITY, "target" is unambiguous: the champion being hit. On a DEFENSIVE effect it is not.
 * Trundle R reads a share of the enemy's maximum health — the attacker. Seraphine W reads the
 * missing health of the ally she heals — a champion the scenario does not contain at all. The two
 * are stored identically, and picking the attacker for both would hand Seraphine a heal computed
 * off the wrong champion. It is refused with the ambiguity named.
 */
function resolveAmount(
  effect: CuratedDefensiveEffect,
  ability: CuratedAbility | undefined,
  config: ChampionConfig,
  defender: StatBlock,
  rangeType: 'Melee' | 'Ranged' | undefined,
): Resolution {
  if (!ability) {
    return {
      ok: false,
      reason:
        `no single harvested ability on this champion's ${effect.slot} slot is named ` +
        `"${effect.abilityName}", so the number of ranks it has is unknown and its value cannot ` +
        `be read at any rank`,
    };
  }

  const rank = rankFor(effect, config);
  if (!rank.ok) return rank;

  const ratios = effect.ratios ?? [];
  const targetOwned = ratios.filter((r) => r.owner === 'target');
  if (targetOwned.length > 0) {
    return {
      ok: false,
      reason:
        `it reads the TARGET's ${targetOwned.map((r) => r.stat).join(' and ')}, and on a ` +
        `defensive effect "target" is ambiguous — for some entries it is the attacker, for ` +
        `others an ally being healed who is not in this scenario at all. Nothing states which, ` +
        `so it is refused rather than resolved against a guess`,
    };
  }

  // The synthetic component. `damageType` is required by the shape and is never read: this file
  // produces shields, resistances and healing, none of which has a damage type of its own.
  // An entry with ratios but no `value` has a base of zero at every rank — that is the source
  // saying the whole figure is a ratio, not a missing number.
  const component: AbilityComponent = {
    id: `defence:${effect.champion}:${effect.slot}:${effect.id ?? effect.label ?? effect.kind}`,
    damageType: 'true',
    base: effect.value ?? {
      scaling: 'explicit',
      perRank: Array.from({ length: ability.maxRank }, () => 0),
    },
    ratios: ratios as Ratio[],
  };

  const context: ComponentContext = {
    rank: rank.amount,
    maxRank: ability.maxRank,
    level: config.level,
    caster: statsView(defender),
    ...(rangeType ? { rangeType } : {}),
    // NO `target`. See the note above: the ambiguity is caught before this point, and leaving the
    // field absent means a `holder` ratio is also refused by name rather than resolved.
  };

  try {
    return { ok: true, amount: evaluateComponent(component, context).perHit };
  } catch (error) {
    if (error instanceof ComponentEvaluationError) {
      return { ok: false, reason: error.reasons.join('; ') };
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------------------
// The pass
// ---------------------------------------------------------------------------------------

/**
 * Why a recurring defence contributes nothing, in the words the reader gets.
 *
 * ═══ THIS SENTENCE USED TO STATE A FALSE CONCLUSION, AND HALF THE TIME IT FIRED ═══
 *
 * It read: "it recurs over a duration and the source states no number of occurrences, so no total
 * can be formed." The first clause is true of every stored entry. **The second is contradicted by
 * arithmetic over the stored file itself**, measured over `curated/curated-data.json` at patch
 * 16.16.1 on 2026-08-15.
 *
 * Master Yi W is the clearest case and it is checkable on paper. The ability stores four rows.
 * "Minimum Heal Per Tick" is 15 (+12.5% AP) at rank 1; "Minimum Total Heal" is 120 (+100% AP) —
 * exactly eight times it, on the base AND on the ratio, at every one of the five ranks. The
 * source sentence stored on both rows says the channel runs up to 4 seconds healing every 0.5
 * seconds, and 4 / 0.5 is eight. A total can plainly be formed for the second row: it is already
 * formed, and stored.
 *
 * FOUR ABILITIES CARRY THAT SAME ARITHMETIC — one row an exact integer multiple of another, on
 * every term at every rank, with the multiple equal to the duration / interval the source's own
 * stored sentence states: Master Yi W (x8, on two separate pairs), Lissandra R (x10, two pairs),
 * Fiora R (x20) and Janna R (x12). Three more carry the multiple with no duration in the stored
 * sentence to check it against: Milio W (x25), Soraka Q (x12) and Hwei W (x2 over its initial
 * shield). Nine rows in all look like whole-duration figures; the engine is refusing every one of
 * them with a sentence saying no such figure can exist.
 *
 * ═══ WHAT IS ACTUALLY MISSING ═══
 *
 * Nothing on the entry says whether its figure covers ONE OCCURRENCE or the WHOLE DURATION.
 * `CuratedDefensiveEffect.overTime` carries `totalInstances` and `sourceSays` and no third field,
 * so the only thing separating "Minimum Heal Per Tick" from "Minimum Total Heal" is the row's own
 * label — and deciding something that multiplies a number by reading a label is exactly the move
 * this project forbids (CLAUDE.md: a detector proposes, a person confirms). DATA-SOURCES §48.3
 * records a stored "Maximum Total Heal" where "total" means across every target hit rather than
 * across a duration, so the word does not settle it even when it is present.
 *
 * That missing field is RAISED, not invented here. Until it exists the entry is refused, and the
 * refusal names the gap instead of asserting something untrue about the data.
 *
 * ═══ A STATED COUNT IS NOT ENOUGH EITHER ═══
 *
 * `totalInstances` is in the frozen contract and NO stored entry uses it — 0 of 21 recurring
 * entries, measured the same day. If one ever does, a count alone still does not release the
 * entry: multiplying a figure that is already the whole duration double-counts it. The refusal
 * quotes the count back so the reader can see the engine read it, and says what is still absent.
 *
 * NO NUMBER MOVED when this changed. Every entry refused before is refused now; only the sentence
 * differs.
 *
 * ═══ THE MISSING FIELD NOW EXISTS, AND THIS FUNCTION IS THE `ABSENT` ARM OF IT ═══
 *
 * `overTime.figureIs` was added to the frozen contract on 2026-08-15. When it is present the entry
 * says what its figure means and `figureIsRefusal` / the applying path below take over. **This
 * function is now reached only when it is ABSENT**, which is unchanged behaviour and unchanged
 * wording: the source does not say, and picking either reading silently is how a heal gets counted
 * eight times.
 */
function recurringRefusal(overTime: { totalInstances?: number; sourceSays: string }): string {
  const quoted = ` The source says: "${overTime.sourceSays}"`;
  const missing =
    `the entry does not state whether the figure it stores covers one occurrence or the whole ` +
    `duration`;
  if (overTime.totalInstances !== undefined) {
    return (
      `it recurs over a duration, and although the source states that it lands ` +
      `${overTime.totalInstances} times, ${missing}. Multiplying a figure that is already the ` +
      `whole duration would count it ${overTime.totalInstances} times over, so neither reading ` +
      `is taken.${quoted}`
    );
  }
  return (
    `it recurs over a duration, the source states no number of occurrences, and ${missing}. ` +
    `Forming a total needs one of those two facts and the entry carries neither.${quoted}`
  );
}

/**
 * THE KINDS WHOSE OCCURRENCES ADD UP INTO ONE WHOLE-DURATION FIGURE.
 *
 * ═══ WHY THIS IS NOT SIMPLY "EVERY KIND" ═══
 *
 * `figureIs: 'per-instance'` states the arithmetic plainly (src/types/data.ts): the whole-duration
 * total is the figure times `totalInstances`. That is true **of the figure**, and it is what this
 * file does — but whether the resulting total is a thing the DEFENDER GETS depends on the kind, and
 * the two questions are not the same question.
 *
 * **HEALTH RESTORED ACCUMULATES.** Eight ticks of 15 health is 120 health: the defender really did
 * regain all of it, the engine's sustain model already takes one total, and nothing about the
 * mechanism is in doubt. Master Yi W proves it from the data's own side — its per-tick row is
 * exactly one eighth of its channel-total row at every rank.
 *
 * **A SHIELD, A RESISTANCE GRANT AND A DAMAGE REDUCTION ARE STATES, NOT QUANTITIES.** A 60-point
 * shield reapplied eight times is either one 60-point pool refreshed eight times or a single
 * 480-point pool, and **nothing on the entry says which** — the two readings differ by the whole
 * count. 50 armor reapplied eight times is not 400 armor. A 55% reduction applied eight times is
 * not a 440% reduction, which is not a number that means anything at all.
 *
 * So the multiplication is performed for healing and refused, by name, for the rest. **The refusal
 * is the safe side of an ambiguity, not a claim that the entry is unreadable**, and if the project
 * later establishes that reapplications stack, this list is the one line that changes.
 *
 * `full-duration` is unaffected: that figure is the SOURCE's own whole-duration statement rather
 * than a total this engine formed, so it is applied for every kind exactly as it stands.
 */
const ACCUMULATES_OVER_OCCURRENCES: readonly DefensiveKind[] = ['heal'];

/**
 * Why a recurring defence that DOES say what its figure means still contributes nothing.
 *
 * Two cases, and only two — a `full-duration` figure is never refused here at all:
 *
 * 1. `per-instance` with no `totalInstances`. The entry says its figure is one occurrence and the
 *    source never says how many there are, so the whole-duration total cannot be formed. Applying
 *    one occurrence as though it were the whole would understate the defence.
 * 2. `per-instance` on a kind whose occurrences do not add up. See `ACCUMULATES_OVER_OCCURRENCES`.
 *
 * Returns `undefined` when there is nothing to refuse.
 */
function figureIsRefusal(
  kind: DefensiveKind,
  overTime: { totalInstances?: number; sourceSays: string; figureIs?: OverTimeFigure },
): string | undefined {
  if (overTime.figureIs !== 'per-instance') return undefined;
  const quoted = ` The source says: "${overTime.sourceSays}"`;

  if (overTime.totalInstances === undefined) {
    return (
      `it recurs over a duration and the entry states that its figure covers ONE occurrence, but ` +
      `the source states no number of occurrences — so the whole duration cannot be totalled. ` +
      `Applying a single occurrence as though it were the whole would understate it, and this ` +
      `engine models sequence rather than elapsed time, so a duration cannot be turned into a ` +
      `count.${quoted}`
    );
  }

  if (!ACCUMULATES_OVER_OCCURRENCES.includes(kind)) {
    const n = overTime.totalInstances;
    return (
      `it recurs over a duration and the entry states that its figure covers ONE occurrence of ` +
      `${n}, but occurrences of a '${kind}' do not add into one whole-duration figure: nothing ` +
      `on the entry says whether a reapplication ADDS to what is already there or REPLACES it, ` +
      `and those two readings differ by a factor of ${n}. Health restored accumulates and this ` +
      `does not, so it is refused rather than multiplied.${quoted}`
    );
  }

  return undefined;
}

/**
 * WHAT AN ENTRY'S OVER-TIME FIELDS SAY THAT WOULD REFUSE IT — or `undefined` when they say nothing
 * that would.
 *
 * One place, two callers, and that is the point: the main pass asks it of an entry that is
 * otherwise ready, and the `incomplete` arm asks it of an entry that records no reason of its own.
 * Both readers get the same sentence for the same data, which they did not before.
 *
 * `full-duration` returns `undefined` — that figure is applied as it stands, so the over-time
 * fields refuse nothing and an incomplete entry carrying one is genuinely silent about its gap.
 */
function overTimeRefusal(
  kind: DefensiveKind,
  overTime: { totalInstances?: number; sourceSays: string; figureIs?: OverTimeFigure },
): string | undefined {
  if (overTime.figureIs === undefined) return recurringRefusal(overTime);
  return figureIsRefusal(kind, overTime);
}

/** A shield's kind, from the one damage type the source restricted it to. */
function shieldKind(type: DamageType | undefined): ShieldPool['kind'] {
  if (type === 'physical') return 'physical';
  if (type === 'magic') return 'magic';
  // Absent means all types, which is the ordinary case (data.ts on `appliesToDamageType`).
  return 'general';
}

/**
 * Build the defender's defences from the catalogue and the scenario's toggles.
 *
 * Nothing here reads a file. The effects and the abilities are passed in, exactly as every other
 * value reaches this engine.
 *
 * `defender` is the stat block BEFORE any resistance grant, and it must be: Taric W grants armor
 * as a share of his own armor, so resolving it against a block that already carried the grant
 * would compound it.
 */
export function resolveDefences(args: {
  effects: readonly CuratedDefensiveEffect[];
  /** The DEFENDER's curated abilities, for each ability's own rank count. */
  abilities: readonly CuratedAbility[];
  /** The defender's configuration — its ability ranks, level and toggles. */
  config: ChampionConfig;
  defender: StatBlock;
  /** The defender's range type, for a `byRangeType` value. Absent is a real state. */
  rangeType?: 'Melee' | 'Ranged';
}): ResolvedDefences {
  const { effects, abilities, config, defender, rangeType } = args;

  const shields: ShieldPool[] = [];
  const reductions: DefenderDamageReduction[] = [];
  const resistanceGrant = { armor: 0, magicResist: 0 };
  const sustain: PlannedSustain[] = [];
  const applied: AppliedDefence[] = [];
  const refused: RefusedDefence[] = [];

  const up = effects.filter((e) => defenceIsUp(e, config));
  const upIds = new Set(
    up.map((e) => `${e.champion}|${e.slot}|${e.abilityName}|${e.id ?? ''}`),
  );

  const refuse = (effect: CuratedDefensiveEffect, reason: string): void => {
    refused.push({
      key: defensiveToggleKey(effect),
      kind: effect.kind,
      label: labelFor(effect),
      reason,
    });
  };

  for (const effect of up) {
    const label = labelFor(effect);

    // ═══ TWO ALTERNATIVES CANNOT BOTH BE UP ═══
    //
    // 23 stored entries are `alternativeTo` a sibling — a Maximum Heal beside a Minimum Heal, an
    // empowered shield beside its base. Only one of the pair applies at a time, and summing them
    // hands the defender both. Each carries its own toggle, so a scenario CAN switch both on;
    // when it does, the pair is refused rather than resolved by preferring one, because nothing
    // says which the reader meant.
    if (effect.relation?.kind === 'alternativeTo') {
      const sibling = `${effect.champion}|${effect.slot}|${effect.abilityName}|${effect.relation.componentId}`;
      if (upIds.has(sibling)) {
        refuse(
          effect,
          `it is stored as an alternative to "${effect.relation.componentId}" on the same ` +
            `ability, and both are switched on. Only one of the two applies at a time and ` +
            `nothing states which, so neither is applied — switch one off`,
        );
        continue;
      }
    }

    // An entry the data itself calls incomplete contributes nothing, and says what is missing.
    //
    // ═══ THE THIRD BRANCH EXISTS BECAUSE A POPULATION MOVED UNDER THE SECOND ═══
    //
    // The second sentence — "records no reason" — was true of every entry that reached it until
    // `figureIs` landed on 2026-08-15. Nine per-tick heal rows then moved to `incomplete` carrying
    // `figureIs: 'per-instance'` and no occurrence count, SEVEN of them with no `unresolvable`, so
    // they were handed a sentence saying their entry was silent while the entry stated the reason
    // in two fields the engine already reads. `src/types/data.ts` on `figureIs`: "'per-instance' —
    // the figure is one occurrence; the whole-duration total is it times `totalInstances`, and
    // without a count the entry stays incomplete."
    //
    // So an entry with no reason of its own is asked its OVER-TIME fields before being called
    // silent, and the answer is the same sentence it would have got had it not been incomplete.
    // A stored `unresolvable` is still preferred: it is the more specific fact of the two.
    if (effect.verification === 'incomplete') {
      const missing = effect.unresolvable?.map((u) => `${u.field}: ${u.why}`).join('; ');
      const fromOverTime = effect.overTime ? overTimeRefusal(effect.kind, effect.overTime) : undefined;
      refuse(
        effect,
        missing
          ? `the stored entry is incomplete — ${missing}`
          : fromOverTime
            ? `the stored entry is marked incomplete, and its own over-time fields say why: ` +
              fromOverTime
            : 'the stored entry is marked incomplete and records no reason, which is itself a gap ' +
              'in the harvested data rather than a fact about the ability',
      );
      continue;
    }

    // The three kinds with no step in this engine.
    if (UNMODELLED_DEFENSIVE_KINDS.includes(effect.kind)) {
      refuse(effect, `${effect.kind} is not modelled: ${UNMODELLED_REASON[effect.kind]}`);
      continue;
    }

    // ═══ AN OVER-TIME DEFENCE, AND WHAT ITS FIGURE COVERS ═══
    //
    // 21 stored entries recur — a heal spread over a channel, a shield reapplied per tick. 18 of
    // them are otherwise ready to apply, and they split in half: 9 store one occurrence and 9
    // store the whole duration. Applying a per-occurrence figure as though it were the total
    // understates the defender; multiplying a whole-duration figure by its tick count overstates
    // them. `overTime.figureIs` is the field that tells the two apart, and it decides three ways:
    //
    //   ABSENT          — the source does not say. Refused, unchanged, in `recurringRefusal`.
    //   'full-duration' — applied AS IT STANDS. Falls straight through; `occurrences` stays 1 and
    //                     any `totalInstances` beside it is descriptive and is never read.
    //   'per-instance'  — the total is the figure times `totalInstances`. Refused without a count,
    //                     and refused on a kind whose occurrences do not add up.
    let occurrences = 1;
    if (effect.overTime) {
      const refusal = overTimeRefusal(effect.kind, effect.overTime);
      if (refusal !== undefined) {
        refuse(effect, refusal);
        continue;
      }
      if (effect.overTime.figureIs === 'per-instance') {
        // Guarded by `figureIsRefusal` immediately above: a per-instance entry that reaches here
        // has a count and is a kind whose occurrences add up.
        occurrences = effect.overTime.totalInstances!;
      }
    }

    // ═══ THE ABILITY IS FOUND BY NAME, NOT BY SLOT ALONE ═══
    //
    // A slot can hold more than one curated ability: 57 (champion, slot) pairs across the roster
    // do, and 9 of them carry a defensive entry — Nidalee's E is Primal Surge with 5 ranks AND
    // Swipe with 4. Matching on slot alone takes whichever was harvested first, and the rank
    // count is what every stored value is expanded against, so the wrong one silently moves every
    // figure. Measured over the file, all 155 entries name-match exactly one ability.
    const named = abilities.filter(
      (a) => a.slot === effect.slot && a.abilityName === effect.abilityName,
    );
    const ability = named.length === 1 ? named[0] : undefined;
    const resolved = resolveAmount(effect, ability, config, defender, rangeType);
    if (!resolved.ok) {
      refuse(effect, resolved.reason);
      continue;
    }
    // THE ONE PLACE A RECURRING FIGURE IS MULTIPLIED. `occurrences` is 1 for every entry that does
    // not recur and for every `full-duration` figure, so this line changes nothing for them.
    const amount = resolved.amount * occurrences;

    switch (effect.kind) {
      case 'shield': {
        if (effect.unit !== undefined && effect.unit !== 'flat') {
          refuse(
            effect,
            `its strength is stored as '${effect.unit}', and a shield's strength is points of ` +
              `damage absorbed. Nothing states what the percentage is a share OF`,
          );
          break;
        }
        shields.push({ label, kind: shieldKind(effect.appliesToDamageType), remaining: amount });
        applied.push({ key: defensiveToggleKey(effect), kind: effect.kind, label, amount });
        break;
      }

      case 'damage-reduction':
      case 'type-specific-reduction': {
        // The damage types this rule touches. For a type-specific reduction the type IS the whole
        // meaning of the kind, and gate 1 requires it; for a general reduction, absent means all
        // three and `damage-reduction.ts` reads an absent list exactly that way.
        const damageTypes = effect.appliesToDamageType ? [effect.appliesToDamageType] : undefined;
        if (effect.unit === 'percent') {
          // Stored in percentage points; `DefenderDamageReduction.percent` is a fraction of 1.
          reductions.push({
            label,
            percent: amount / 100,
            ...(damageTypes ? { damageTypes } : {}),
          });
          applied.push({
            key: defensiveToggleKey(effect),
            kind: effect.kind,
            label,
            amount: amount / 100,
          });
        } else if (effect.unit === 'flat' || effect.unit === undefined) {
          reductions.push({ label, flat: amount, ...(damageTypes ? { damageTypes } : {}) });
          applied.push({ key: defensiveToggleKey(effect), kind: effect.kind, label, amount });
        } else {
          refuse(
            effect,
            `its amount is stored as '${effect.unit}', which is neither points off an instance ` +
              `nor a share of it, so nothing says what to subtract`,
          );
        }
        break;
      }

      case 'resistance-grant': {
        // NOT A NEW MECHANISM. The grant is added to the defender's resistance and then meets the
        // fixed four-step order (flat reduction, percentage reduction, percentage penetration,
        // flat penetration) exactly as an item's armor does. Nothing about that order changes.
        if (effect.unit !== undefined && effect.unit !== 'flat') {
          refuse(
            effect,
            `it is stored as '${effect.unit}', and a resistance grant is points of armor or ` +
              `magic resistance. Nothing states what the percentage is a share OF`,
          );
          break;
        }
        if (!effect.grantedStat) {
          refuse(
            effect,
            'nothing on the entry says WHICH resistance it grants, and armor against magic ' +
              'resistance is the difference between mitigating physical and magic damage',
          );
          break;
        }
        if (effect.grantedStat === 'armor' || effect.grantedStat === 'both') {
          resistanceGrant.armor += amount;
        }
        if (effect.grantedStat === 'magicResist' || effect.grantedStat === 'both') {
          resistanceGrant.magicResist += amount;
        }
        applied.push({ key: defensiveToggleKey(effect), kind: effect.kind, label, amount });
        break;
      }

      case 'heal': {
        if (effect.unit === 'percent-of-damage-dealt') {
          refuse(
            effect,
            'it restores a share of the damage the DEFENDER deals, and SPECIFICATION §5 states ' +
              'that the defender does not act in this model. There is no damage of theirs for ' +
              'the rate to apply to',
          );
          break;
        }
        if (effect.unit === 'healing-multiplier') {
          refuse(
            effect,
            'it amplifies OTHER healing rather than restoring any itself, and the engine has no ' +
              'step that scales one healing source by another',
          );
          break;
        }
        if (effect.unit !== undefined && effect.unit !== 'flat') {
          refuse(
            effect,
            `it is stored as '${effect.unit}', and nothing states what the percentage is a ` +
              `share OF`,
          );
          break;
        }
        // UNPLACED, and that word is load-bearing. No instance of the attacker's combo caused
        // this heal — the defender cast it — so the engine has no position to put it in (§3.2).
        // `runCombo` treats unplaced healing as available from the START, which is the reading
        // most generous to the defender and therefore says "this kills" less often. It is
        // disclosed on every result by `ENGINE_EXCLUSIONS`.
        sustain.push({
          label,
          kind: 'heal',
          restoresTo: 'defender',
          amount,
          verification: effect.verification,
        });
        applied.push({ key: defensiveToggleKey(effect), kind: effect.kind, label, amount });
        break;
      }

      default: {
        // `execute-threshold` is in the contract's kind list and no entry stores one. Refusing by
        // name beats falling through silently if one ever lands.
        refuse(effect, `the engine has no step for a '${effect.kind}' defence`);
        break;
      }
    }
  }

  const notes = refused.map(
    (r) => `${r.label} was switched on and was NOT applied — ${r.reason}`,
  );

  return { shields, reductions, resistanceGrant, sustain, applied, refused, notes };
}

/**
 * ═══ HOW MANY STORED DEFENCES THIS ENGINE ACTUALLY APPLIES — DERIVED, NEVER TYPED ═══
 *
 * Added 2026-08-16, and it exists because of a specific failure.
 *
 * `src/ui/coverage/capability.ts` published this figure as a HAND-TYPED CONSTANT,
 * `DEFENSIVE_APPLIED_MEASURED`, and `capability.test.ts` fed that constant back into its own
 * derivation before comparing the result to the committed JSON. **The check compared the number
 * against itself.** It could not go red however far the data moved, and it did move: a merge on
 * 2026-08-16 changed the answer from 86 to 92 and every test stayed green.
 *
 * Worse, the lead then reported having "re-measured, not re-typed" it — by reading that same test's
 * output. It was re-typed through a route that looked like measurement, and a false conclusion was
 * drawn from it and published.
 *
 * **So the figure comes from here now.** The coverage area calls this; nobody types it.
 *
 * ═══ WHY THE SCENARIO IS FIXED INSIDE THIS FUNCTION AND NOT A PARAMETER ═══
 *
 * "How many defences apply" has no answer without a scenario, and two harnesses that chose
 * different ones got 92 and 90 for the same data. A caller free to pick would produce a figure that
 * drifts with the caller. **The scenario is therefore part of the definition**, pinned here:
 *
 *   - level 11, the midpoint of the ability-rank range;
 *   - one entry switched on AT A TIME, so no two defences can mask each other;
 *   - a defender stat block with a real value in every field an effect might read, because a zero
 *     makes an effect that applies look like one that does nothing;
 *   - ability ranks at their maxima, since a rank-gated defence must be reachable.
 *
 * The figure was proved insensitive to the choices most likely to be wrong: it is identical at
 * ranks 1/1/1/1, 4/4/4/2 and 5/5/5/3, and identical with and without mana on the stat block.
 *
 * ═══ WHAT "APPLIED" MEANS, BECAUSE THE OBVIOUS DEFINITION IS USELESS ═══
 *
 * NOT "changes a Result" — that is true of all 155 stored entries, because `perInstance[]`
 * echoes the defender's entry state, so flipping any toggle changes the Result object by
 * construction. Even an immunity the engine refuses outright would count.
 *
 * **Applied means `resolveDefences` accepted the entry and returned it in `applied`.** That is the
 * engine's own verdict on whether it knows what to do with the effect.
 */
export interface AppliedDefenceCount {
  /** Conditional entries that are not `incomplete` — the population a user could switch on. */
  ready: number;
  /** Of those, the ones `resolveDefences` accepted. */
  applied: number;
  /** Ready and refused, named, so the gap is never an unexplained subtraction. */
  refused: string[];
}

/**
 * Count them. Pure: no file access, no clock, no randomness — the same inputs always give the
 * same answer, which is what lets a test assert it.
 */
export function countAppliedDefences(
  effects: readonly CuratedDefensiveEffect[],
  abilities: readonly CuratedAbility[],
): AppliedDefenceCount {
  const ready = effects.filter(
    (e) => e.activation === 'conditional' && e.verification !== 'incomplete',
  );

  // Every field an effect might read carries a real value. A zero here would make an effect that
  // APPLIES with an amount of zero indistinguishable from one the engine refused.
  const defender = {
    maxHp: 2000,
    maxHpBase: 1200,
    maxHpBonus: 800,
    currentHp: 2000,
    armor: 80,
    armorBase: 50,
    armorBonus: 30,
    magicResist: 50,
    magicResistBase: 40,
    magicResistBonus: 10,
    attackDamage: 100,
    totalAD: 100,
    bonusAD: 40,
    abilityPower: 100,
    maxMana: 800,
    currentMana: 800,
    level: 11,
  } as unknown as StatBlock;

  let applied = 0;
  const refused: string[] = [];
  for (const e of ready) {
    const config = {
      apiname: e.champion,
      level: 11,
      items: [],
      runes: [],
      abilityRanks: { Q: 5, W: 5, E: 5, R: 3 },
      entryState: { [defensiveToggleKey(e)]: true },
    } as unknown as ChampionConfig;

    let accepted = false;
    try {
      const out = resolveDefences({
        effects: [e],
        abilities: abilities.filter((a) => a.champion === e.champion),
        config,
        defender,
      });
      accepted = out.applied.length > 0;
    } catch {
      accepted = false;
    }
    if (accepted) applied += 1;
    else refused.push(`${e.champion}/${e.slot}/${e.label ?? e.kind}`);
  }

  return { ready: ready.length, applied, refused };
}
