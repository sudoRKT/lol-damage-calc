// THE DAMAGE-VERSUS-LEVEL CURVE (SPECIFICATION §11).
//
// "Damage-versus-level curve — how the combo's output changes across levels."
//
// ═══ TWO QUESTIONS §11 DOES NOT ANSWER, BOTH REQUIRED OF THE CALLER ═══
//
// 1. WHOSE LEVEL. A combo's output against a levelling defender falls even when the attacker
//    stands still, because the defender's resistances and health grow. "Both champions level
//    together" is the usual laning question; "only the attacker levels" isolates the build.
//    They are different curves and neither is the obvious default, so `who` is required.
//
// 2. WHICH ABILITY RANKS. A Scenario states ONE set of ability ranks — the ones the user
//    configured — and at level 4 a champion cannot have rank 5 of anything. Something has to give
//    and every choice is a claim:
//      - `{ kind: 'as-configured' }` holds the ranks exactly as stated and REFUSES every level at
//        which that build cannot legally exist. It invents nothing, and it is the honest default
//        for a user who has stated a level-18 build.
//      - `{ kind: 'priority', order }` spends one point per level in an order THE CALLER STATES,
//        taking the ultimate whenever the game allows. That produces a full curve, but the
//        levelling order is a convention the user supplied rather than a fact about the champion,
//        so every series says so in `notes` and every point reports the ranks it used.
//    There is no third mode that guesses an order. A curve whose early points quietly assume a
//    skill order nobody stated is the plausible-wrong-number failure this project exists to
//    prevent.
//
// ═══ THE LEVELLING RULES, AND ONE CONTRADICTION IN THE SOURCE ═══
//
// https://wiki.leagueoflegends.com/en-us/Champion_ability, read from the page's own wikitext
// through the MediaWiki API on 2026-08-14:
//
//   "One skill point is obtained each time the champion levels up, with the first being granted
//    at level 1 always, and a maximum of 18 possible from leveling up."
//   "Beyond level 1, the current rank of any ability cannot exceed half the champion's current
//    level rounded down. This rule practically limits each new rank for the same ability to every
//    odd, single-digit level."
//   "Ultimate abilities can only be learned/ranked upon reaching levels 6, 11, 16."
//   "Basic abilities usually have five ranks at most." / "Ultimate abilities usually have three
//    ranks at most."
//
// THE CONTRADICTION, STATED RATHER THAN QUIETLY RESOLVED. "Half the champion's current level
// rounded down" and "every odd, single-digit level" cannot both be true: rounded down, level 3
// would cap every ability at rank 1, and rank 5 would need level 10. The odd-level reading — rank
// r first exists at level 2r - 1, so 1, 3, 5, 7, 9 — is the one implemented here, for three
// reasons: it is the article's own gloss on its own sentence, it is what the ranks-per-level
// arithmetic requires (18 points, 5 + 5 + 5 + 3 ranks), and the "beyond level 1" caveat only
// exists because the rounded-down phrasing breaks at level 1. Stated as a wiki inconsistency, not
// as an engine convention.
//
// TWO EXCEPTIONS THE SAME PAGE NAMES, and neither is hardcoded here. "Spider Form / Human Form
// (Elise), Mantra (Karma) and Aspect of the Cougar (Nidalee) are all available at level 1 and each
// has four ranks (levels 1, 6, 11, and 16)", and Data Dragon's own `maxrank` records six-rank
// abilities for Udyr and Jayce (src/types/data.ts, `abilityMaxRanks`). So the schedule is an
// ARGUMENT with a documented default, and a caller holding the champion's real rank counts passes
// its own. The engine never reads a champion file to find out.

import type { AbilitySlot } from '../types';
import type { ChampionConfig, Scenario } from '../types/scenario';
import { runCombo } from './combo';
import { planScenario, type Catalogue, type SimulationRefusal } from './simulate';
import { buildSeries, summarise, type SweepPoint, type SweepSeries } from './sweep';

/** The four rankable slots. 'P' is innate and takes no skill points. */
export type RankableSlot = Exclude<AbilitySlot, 'P'>;
export type Ranks = Record<RankableSlot, number>;

/** Which champion levels are ranked at what. See the header for the source of the default. */
export interface RankSchedule {
  /** Levels at which successive ranks of a BASIC ability become available. */
  basicRankLevels: readonly number[];
  /** Levels at which successive ranks of the ULTIMATE become available. */
  ultimateRankLevels: readonly number[];
}

export const DEFAULT_RANK_SCHEDULE: RankSchedule = {
  basicRankLevels: [1, 3, 5, 7, 9],
  ultimateRankLevels: [6, 11, 16],
};

/**
 * The highest rank a slot may hold at a champion level.
 *
 * It counts the entries of the slot's schedule that the level has reached, so rank 3 of a basic
 * ability needs level 5 and the first rank of an ultimate needs level 6. Returns 0 for a slot the
 * level has not unlocked at all, which is a real state: an unlearned ability cannot be cast.
 */
export function maxRankAtLevel(
  slot: RankableSlot,
  level: number,
  schedule: RankSchedule = DEFAULT_RANK_SCHEDULE,
): number {
  const levels = slot === 'R' ? schedule.ultimateRankLevels : schedule.basicRankLevels;
  return levels.filter((required) => level >= required).length;
}

/** Skill points a champion has spent-able at a level. One per level, the first at level 1. */
export function skillPointsAtLevel(level: number): number {
  // The Elixir of Skill's extra point is NOT counted: it is an item a scenario does not state,
  // and counting it would let an impossible build pass as possible.
  return level;
}

/**
 * Why a set of ability ranks cannot exist at a level — an empty list means it can.
 *
 * Two independent rules, reported separately because they have different fixes: a rank that the
 * level has not unlocked, and a build that costs more skill points than the level grants.
 */
export function rankProblems(
  ranks: Ranks,
  level: number,
  schedule: RankSchedule = DEFAULT_RANK_SCHEDULE,
): string[] {
  const problems: string[] = [];
  for (const slot of ['Q', 'W', 'E', 'R'] as RankableSlot[]) {
    const rank = ranks[slot];
    const allowed = maxRankAtLevel(slot, level, schedule);
    if (rank > allowed) {
      const levels = slot === 'R' ? schedule.ultimateRankLevels : schedule.basicRankLevels;
      const needed = levels[rank - 1];
      problems.push(
        `${slot} is at rank ${rank}, which a champion cannot have at level ${level}: ` +
          (needed === undefined
            ? `the ability has no rank ${rank}`
            : `rank ${rank} of this slot requires level ${needed}`) +
          ` (at level ${level} the highest is rank ${allowed})`,
      );
    }
  }

  const spent = ranks.Q + ranks.W + ranks.E + ranks.R;
  const available = skillPointsAtLevel(level);
  if (spent > available) {
    problems.push(
      `these ranks cost ${spent} skill points and a champion at level ${level} has ${available}`,
    );
  }
  return problems;
}

/**
 * The ranks a champion would hold at a level, spending one point per level in a stated order.
 *
 * THE CONVENTION, IN FULL, because it is a convention and not a game rule:
 *   - the ultimate is taken at the first level the game allows, whenever it is still below the
 *     target build's rank. Skipping an available ultimate point is a choice almost no player
 *     makes, and taking it is the convention every public build guide uses;
 *   - otherwise the point goes to the first ability in `order` that is below both its cap for
 *     this level and its rank in the target build;
 *   - a point with nowhere to go is left unspent, which is what happens when the target build
 *     does not use all eighteen.
 *
 * `target` is the build the Scenario states — the sweep never ranks an ability ABOVE what the
 * user configured, so the top of the curve is the user's own build and not a maxed one.
 */
export function allocateRanks(
  target: Ranks,
  level: number,
  order: readonly RankableSlot[],
  schedule: RankSchedule = DEFAULT_RANK_SCHEDULE,
): Ranks {
  const ranks: Ranks = { Q: 0, W: 0, E: 0, R: 0 };
  const basicOrder = order.filter((slot) => slot !== 'R');

  for (let atLevel = 1; atLevel <= level; atLevel += 1) {
    const ultimateCap = Math.min(target.R, maxRankAtLevel('R', atLevel, schedule));
    if (ranks.R < ultimateCap) {
      ranks.R += 1;
      continue;
    }
    const slot = basicOrder.find(
      (candidate) =>
        ranks[candidate] < Math.min(target[candidate], maxRankAtLevel(candidate, atLevel, schedule)),
    );
    if (slot) ranks[slot] += 1;
  }
  return ranks;
}

// ---------------------------------------------------------------------------------------
// The curve
// ---------------------------------------------------------------------------------------

export type LevelRankPolicy =
  | { kind: 'as-configured' }
  | { kind: 'priority'; order: readonly RankableSlot[] };

/** What a point of a level sweep was evaluated at. Present on refused points too. */
export interface AppliedLevel {
  attackerLevel: number;
  defenderLevel: number;
  /** The attacker's ability ranks used at this point. */
  ranks: Ranks;
  /** True when those are not the ranks the Scenario states. */
  ranksDifferFromScenario: boolean;
}

export type LevelSweepSeries = SweepSeries<AppliedLevel>;

export interface LevelSweepOptions {
  /** Whose level moves. Required — see the header. */
  who: 'attacker' | 'defender' | 'both';
  /** How ability ranks follow the level. Required — see the header. */
  ranks: LevelRankPolicy;
  /** Levels to evaluate. Defaults to all 18. */
  levels?: readonly number[];
  schedule?: RankSchedule;
  include?: 'summary' | 'result';
}

export type LevelSweepOutcome =
  | { ok: true; series: LevelSweepSeries }
  | { ok: false; refusals: SimulationRefusal[] };

export const ALL_LEVELS: readonly number[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18,
];

/**
 * The curve.
 *
 * Every level is re-planned from the Scenario rather than patched onto one plan, because a level
 * changes both champions' base statistics AND the ability ranks the combo resolves at — there is
 * nothing to override, only to rebuild.
 *
 * REFUSES WHOLESALE when the scenario cannot be assembled at all, and — for a defender-only sweep
 * — when the attacker's configured ranks cannot exist at the attacker's fixed level, since every
 * point would then refuse for one reason that is not about the axis.
 */
export function damageVsLevel(
  scenario: Scenario,
  catalogue: Catalogue,
  options: LevelSweepOptions,
): LevelSweepOutcome {
  const schedule = options.schedule ?? DEFAULT_RANK_SCHEDULE;
  const levels = options.levels ?? ALL_LEVELS;
  const configured = scenario.attacker.abilityRanks as Ranks;

  // A scenario that cannot be assembled at all refuses before any point is evaluated.
  const probe = planScenario(scenario, catalogue);
  if (!probe.ok) return { ok: false, refusals: probe.refusals };

  const sweepsAttacker = options.who === 'attacker' || options.who === 'both';
  const sweepsDefender = options.who === 'defender' || options.who === 'both';

  if (!sweepsAttacker) {
    // The attacker stands still, so its ranks are the user's own at one fixed level. If that
    // build is impossible there, it is impossible at every point of a defender sweep.
    const problems = rankProblems(configured, scenario.attacker.level, schedule);
    if (problems.length > 0) {
      return {
        ok: false,
        refusals: problems.map((problem) => ({ path: 'attacker.abilityRanks', reason: problem })),
      };
    }
  }

  const excluded = new Set<string>();
  const points: SweepPoint<AppliedLevel>[] = levels.map((level) => {
    const attackerLevel = sweepsAttacker ? level : scenario.attacker.level;
    const defenderLevel = sweepsDefender ? level : scenario.defender.level;

    // THE RANK POLICY APPLIES ONLY WHERE THE ATTACKER ACTUALLY MOVES. On a defender-only sweep
    // the attacker's build is the user's, untouched: re-allocating it from a levelling order
    // would silently replace the build the user configured with a different one.
    const ranks =
      sweepsAttacker && options.ranks.kind === 'priority'
        ? allocateRanks(configured, attackerLevel, options.ranks.order, schedule)
        : configured;

    const applied: AppliedLevel = {
      attackerLevel,
      defenderLevel,
      ranks,
      ranksDifferFromScenario: !sameRanks(ranks, configured),
    };
    const label = labelFor(options.who, level);

    // 1. Can this build exist at this level at all?
    const problems = rankProblems(ranks, attackerLevel, schedule);
    if (problems.length > 0) {
      return {
        x: level,
        label,
        applied,
        status: 'refused',
        refusals: problems.map((problem) => ({ path: 'attacker.abilityRanks', reason: problem })),
      };
    }

    // 2. Does the combo cast something this level has not learned?
    //
    // A rank of 0 means UNLEARNED, and an unlearned ability cannot be cast — the cast is not a
    // weaker cast, it is not a cast. The sweep refuses the level rather than resolving it,
    // because the alternative readings both state something false: rank-1 damage claims a point
    // the champion has not spent, and zero damage claims a cast that could not happen.
    const unlearned = unlearnedCasts(scenario, ranks);
    if (unlearned.length > 0) {
      return { x: level, label, applied, status: 'refused', refusals: unlearned };
    }

    const planned = planScenario(atLevel(scenario, attackerLevel, defenderLevel, ranks), catalogue);
    if (!planned.ok) {
      return { x: level, label, applied, status: 'refused', refusals: planned.refusals };
    }

    const result = runCombo(planned.plan);
    for (const mechanic of result.excludedMechanics) excluded.add(mechanic);
    return {
      x: level,
      label,
      applied,
      status: 'computed',
      summary: summarise(result),
      ...(options.include === 'result' ? { result } : {}),
    };
  });

  return {
    ok: true,
    series: buildSeries({
      kind: 'level',
      axisLabel: axisLabel(options.who),
      points,
      excludedMechanics: excluded,
      notes: notesFor(options, schedule),
    }),
  };
}

/** A scenario with both levels and the attacker's ranks replaced. Nothing else is touched. */
function atLevel(
  scenario: Scenario,
  attackerLevel: number,
  defenderLevel: number,
  ranks: Ranks,
): Scenario {
  return {
    ...scenario,
    attacker: withLevel(scenario.attacker, attackerLevel, ranks),
    defender: withLevel(scenario.defender, defenderLevel),
  };
}

function withLevel(config: ChampionConfig, level: number, ranks?: Ranks): ChampionConfig {
  return { ...config, level, ...(ranks ? { abilityRanks: { ...ranks } } : {}) };
}

/**
 * Combo steps that cast an ability the attacker has no points in.
 *
 * EXPORTED BECAUSE IT IS A CHECK, NOT A DETAIL. `simulate` resolves such a step at rank 1
 * (simulate.ts, `rank: Math.max(1, rank)`) directly beneath a comment stating the opposite rule —
 * "A RANK OF ZERO IS A REAL STATE ... and the ability then deals nothing rather than its rank 1
 * figure". Whichever of the two is meant, an impossible configuration currently returns a
 * real-looking number, so any caller assembling a scenario can run this over it first. The sweep
 * uses it to refuse such a level; `auditSweeps` uses it to find every scenario it happens in.
 *
 * IT PROPOSES RATHER THAN DECIDES, for one reason worth knowing: a few kits do not rank the way
 * the model assumes. The wiki's own ability article notes that Aphelios's basic and ultimate
 * abilities "uniquely do not feature ranks", so a rank of 0 there may not mean unlearned at all.
 */
export function unlearnedCasts(scenario: Scenario, ranks: Ranks): SimulationRefusal[] {
  const refusals: SimulationRefusal[] = [];
  scenario.combo.forEach((step, index) => {
    if (step.kind !== 'ability') return;
    // The innate passive takes no skill points and is always available.
    if (step.ref === 'P') return;
    const slot = step.ref as RankableSlot;
    if (ranks[slot] === undefined || ranks[slot]! > 0) return;
    refusals.push({
      path: `combo[${index}]`,
      reason:
        `the combo casts ${slot}, and at this level the build has 0 points in ${slot} — an ` +
        `unlearned ability cannot be cast`,
    });
  });
  return refusals;
}

function sameRanks(a: Ranks, b: Ranks): boolean {
  return a.Q === b.Q && a.W === b.W && a.E === b.E && a.R === b.R;
}

function axisLabel(who: LevelSweepOptions['who']): string {
  if (who === 'attacker') return 'attacker level';
  if (who === 'defender') return 'defender level';
  return 'both champions’ level';
}

function labelFor(who: LevelSweepOptions['who'], level: number): string {
  if (who === 'attacker') return `attacker level ${level}`;
  if (who === 'defender') return `defender level ${level}`;
  return `level ${level}`;
}

function notesFor(options: LevelSweepOptions, schedule: RankSchedule): string[] {
  const notes: string[] = [];

  if (options.who === 'attacker') {
    notes.push('Only the attacker levels. The defender stays at its configured level.');
  } else if (options.who === 'defender') {
    notes.push(
      'Only the defender levels — their health and resistances grow while the attacker’s ' +
        'build and ability ranks stay exactly as configured.',
    );
  } else {
    notes.push('Both champions level together.');
  }

  if (options.ranks.kind === 'priority' && options.who !== 'defender') {
    notes.push(
      `Ability ranks follow the leveling order ${options.ranks.order.join(' > ')}, one point per ` +
        'level, taking the ultimate at the first level the game allows. That order is a ' +
        'convention supplied with the request, not a fact about this champion; each point states ' +
        'the ranks it used.',
    );
    notes.push(
      'No ability is ranked above the build the scenario states, so the top of this curve is ' +
        'the configured build rather than a maxed one.',
    );
  } else {
    notes.push(
      'Ability ranks are held exactly as configured. A level at which that build cannot legally ' +
        'exist is refused rather than adjusted.',
    );
  }

  notes.push(
    `Rank availability: a basic ability gains ranks at levels ` +
      `${schedule.basicRankLevels.join(', ')} and the ultimate at ` +
      `${schedule.ultimateRankLevels.join(', ')}. Champions whose ability ranks differ from that ` +
      '(the four-rank ultimates of Elise, Karma and Nidalee; the six-rank abilities of Udyr and ' +
      'Jayce) need their own schedule passed in.',
  );
  notes.push(
    'The Elixir of Skill’s extra skill point is not counted, so a build costing 19 points is ' +
      'treated as impossible at level 18.',
  );
  return notes;
}
