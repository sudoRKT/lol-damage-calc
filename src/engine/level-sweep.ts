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
//
// A THIRD SENTENCE FROM THE SAME PAGE, added 2026-08-15 and read the same way:
//   "The first skill point can be spent on any BASIC ability."
// so the point granted at level 1 never goes to the ultimate, even under a schedule that offers
// one at level 1. See `allocateRanks`.
//
// ═══ THE RANK POLICY, AND THE DEFECT IT WAS REWRITTEN TO CLOSE (2026-08-15) ═══
//
// `priority` used to produce a full curve for ANY configured build, because `allocateRanks` caps
// each slot at `Math.min(target, maxRankAtLevel(...))`. A build the schedule cannot express was
// therefore quietly LOWERED to one it can and drawn as though it were the user's:
//
//     Udyr, configured Q6 W6 E6 R6, was drawn at level 18 as Q5 W5 E5 R3.
//
// Seven champions on the published roster are in that class (Aphelios, Elise, Jayce, Karma,
// Nidalee, Udyr, Yuumi). `as-configured` refuses all 18 of their levels; `priority` drew all 18.
// So the policy chosen because it refuses honestly did the opposite for them — it turned a refusal
// into a plausible wrong number, which is the failure this project exists to prevent.
//
// FOUR RULES NOW HOLD, and they are the specification for everything below:
//
//   1. THE ORDER IS THE CALLER'S. `order` states which slots get points first, and where the
//      ULTIMATE goes is stated too (`ultimate`), rather than being a convention the engine
//      applies behind the caller's back. An order that cannot produce the configured build —
//      a repeated slot, or a ranked slot it never spends on — REFUSES the sweep instead of
//      being half-obeyed.
//   2. THE ORDER IS REPORTABLE. `series.rankReport` carries the order, the ultimate rule, the
//      schedule, the configured build and whether the order was applied at all, as DATA. A
//      reader cannot judge a curve whose rank schedule is invisible, and the interface should
//      not have to parse it back out of an English sentence.
//   3. REFUSED LEVELS STAY REFUSED. A build that can exist at NO champion level is refused at
//      every level under BOTH policies (`impossibleBuildProblems`). A levelling order may only
//      ever draw a build the user is on the way TO — never a different, weaker one.
//   4. A POINT DRAWN BELOW THE CONFIGURED BUILD SAYS SO. Every point carries `configuredRanks`
//      and a per-slot `rankShortfall` with the CAUSE of each shortfall, so nothing is silently
//      lowered. Rule 3 makes `beyond-schedule` impossible on a computed point; the other two
//      causes are what a levelling order legitimately does.

import type { AbilitySlot } from '../types';
import type { ChampionConfig, Scenario } from '../types/scenario';
import { runCombo } from './combo';
import { planScenario, type Catalogue, type SimulationRefusal } from './simulate';
import {
  buildSeries,
  summarise,
  type ComputedSweepPoint,
  type SweepPoint,
  type SweepSeries,
} from './sweep';

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

/** The four rankable slots, in the order a player reads them off the HUD. */
export const RANKABLE_SLOTS: readonly RankableSlot[] = ['Q', 'W', 'E', 'R'];

/**
 * The highest level a champion reaches, and therefore the largest skill-point budget there is.
 *
 * https://wiki.leagueoflegends.com/en-us/Champion_ability (read 2026-08-15): "One skill point is
 * obtained each time the champion levels up, with the first being granted at level 1 always, and
 * a MAXIMUM OF 18 possible from leveling up."
 */
export const MAX_CHAMPION_LEVEL = 18;

/**
 * The most skill points any one slot can hold, under any champion's schedule.
 *
 * Same page, same reading: "Each ability slot can have a maximum number of skill points that
 * players can spend on, strictly from ZERO TO SIX."
 *
 * NOT ENFORCED as a rule anywhere below, and that is deliberate: the schedule is an argument, and
 * refusing a build against a hard 6 as well as against the schedule would give two different
 * answers to one question. It is recorded here because it is the sanity bound on any schedule a
 * caller passes — a schedule listing seven basic rank levels describes an ability the game has no
 * way to produce.
 */
export const MAX_RANKS_PER_SLOT = 6;

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

/** The highest rank a schedule describes for a slot AT ALL — its ceiling across every level. */
export function scheduleRankCap(
  slot: RankableSlot,
  schedule: RankSchedule = DEFAULT_RANK_SCHEDULE,
): number {
  // Probed at the maximum champion level rather than at infinity, because a schedule entry above
  // level 18 names a rank the game can never grant: the ceiling is what a REAL champion can hold.
  return maxRankAtLevel(slot, MAX_CHAMPION_LEVEL, schedule);
}

/**
 * Why a build can exist at NO champion level — an empty list means some level can hold it.
 *
 * THIS IS THE DISTINCTION THE WHOLE RANK POLICY TURNS ON, and it is the difference between
 * "not yet" and "never":
 *
 *   - Q5 W0 E0 R0 cannot exist at level 3 (rank 5 needs level 9, and it costs 5 points). It CAN
 *     exist at level 9. A levelling order is allowed to draw the lower ranks on the way to it,
 *     because every point it draws is a build the user really passes through.
 *   - Q6 W6 E6 R6 can exist at no level under the default schedule: there is no rank 6, and it
 *     would cost 24 points against a maximum of 18. NOTHING a levelling order draws is on the way
 *     to it, so every level is refused instead.
 *
 * It is measured by asking `rankProblems` at level 18, which is exactly right and not a shortcut:
 * at the maximum champion level every rank the schedule describes has been unlocked and the
 * skill-point budget is at its largest, so a problem that survives there survives everywhere. It
 * also guarantees the two policies agree with each other by construction — what `as-configured`
 * refuses at level 18 is precisely what `priority` refuses everywhere.
 */
export function impossibleBuildProblems(
  ranks: Ranks,
  schedule: RankSchedule = DEFAULT_RANK_SCHEDULE,
): string[] {
  return rankProblems(ranks, MAX_CHAMPION_LEVEL, schedule).map(
    (problem) => `no champion level can hold this build — ${problem}`,
  );
}

/**
 * Why a slot is drawn below the configured build. Three causes, because they have three fixes.
 *
 *  • `beyond-schedule` — NO level reaches that rank under the schedule this curve used. This is
 *    the silent one, and rule 3 in the header now makes it IMPOSSIBLE on a computed point: such a
 *    build is refused at every level instead. It survives as a cause so a refused point can still
 *    explain itself, and so a hand-built comparison can name the class.
 *  • `level-cap` — the level has not unlocked that rank yet (rank 3 of a basic needs level 5).
 *    Every priority curve has this at its low levels and it is not a defect.
 *  • `order-priority` — the level allows the rank and the stated order spent its points elsewhere.
 *    Also expected: it is what a levelling order IS.
 */
export type RankShortfallCause = 'beyond-schedule' | 'level-cap' | 'order-priority';

/** One slot, at one point of a curve, drawn below the rank the Scenario states. */
export interface SlotRankShortfall {
  slot: RankableSlot;
  /** The rank the Scenario states. */
  configured: number;
  /** The rank this point was actually evaluated at. */
  applied: number;
  cause: RankShortfallCause;
}

/**
 * Every slot drawn below its configured rank at one level, with the cause of each.
 *
 * The causes are tested in the order above because they are increasingly specific: a rank no
 * schedule reaches is not also "the level has not got there", and a rank the level has not
 * unlocked is not the order's doing.
 */
export function rankShortfallAt(
  configured: Ranks,
  applied: Ranks,
  attackerLevel: number,
  schedule: RankSchedule = DEFAULT_RANK_SCHEDULE,
): SlotRankShortfall[] {
  const short: SlotRankShortfall[] = [];
  for (const slot of RANKABLE_SLOTS) {
    const want = configured[slot];
    const got = applied[slot];
    if (got >= want) continue;
    const cause: RankShortfallCause =
      want > scheduleRankCap(slot, schedule)
        ? 'beyond-schedule'
        : want > maxRankAtLevel(slot, attackerLevel, schedule)
          ? 'level-cap'
          : 'order-priority';
    short.push({ slot, configured: want, applied: got, cause });
  }
  return short;
}

/**
 * The ranks a champion would hold at a level, spending one point per level in a stated order.
 *
 * THE RULES, IN FULL. Two are the game's and one is the caller's:
 *   - GAME RULE. The point granted at level 1 goes to a BASIC ability. "The first skill point can
 *     be spent on any basic ability" (wiki, read 2026-08-15). Under the default schedule no
 *     ultimate exists at level 1 anyway, so this only bites under a schedule that offers one —
 *     Elise's, Karma's and Nidalee's four-rank ultimates.
 *   - GAME RULE. No slot may exceed its rank for the level, and one point is spent per level.
 *   - THE CALLER'S. `ultimate` says where the ultimate sits. `'first-available'` takes it at the
 *     first level the game allows, which is the convention every public build guide uses and the
 *     default here; `'in-order'` leaves it to its own position in `order`, for a caller that
 *     wants to state the whole schedule itself.
 *   - a point with nowhere to go is left unspent, which is what happens when the target build
 *     does not use all eighteen.
 *
 * `target` is the build the Scenario states — this never ranks an ability ABOVE what the user
 * configured.
 *
 * ═══ THE TRAP, STATED RATHER THAN HIDDEN ═══
 *
 * It also never ranks an ability above what the SCHEDULE allows, so a target the schedule cannot
 * express is silently LOWERED to one it can: `allocateRanks({Q:6,...}, 18, ...)` answers `Q:5`.
 * That is the defect described in the header. It is not fixed inside this function, because this
 * function is the pure schedule walk and refusing is the sweep's job — `damageVsLevel` calls
 * `impossibleBuildProblems` FIRST and never reaches this call with such a target. ANY OTHER
 * CALLER MUST DO THE SAME. `rank-policy.test.ts` pins the lowering as a known property so it
 * cannot be rediscovered as a surprise.
 */
export function allocateRanks(
  target: Ranks,
  level: number,
  order: readonly RankableSlot[],
  schedule: RankSchedule = DEFAULT_RANK_SCHEDULE,
  ultimate: UltimatePlacement = 'first-available',
): Ranks {
  const ranks: Ranks = { Q: 0, W: 0, E: 0, R: 0 };
  // 'first-available' is expressed by moving the ultimate to the front of the same single list,
  // rather than as a separate branch: one rule, applied one way, so the two placements cannot
  // drift apart.
  const spendOrder: readonly RankableSlot[] =
    ultimate === 'in-order' ? order : ['R', ...order.filter((slot) => slot !== 'R')];

  for (let atLevel = 1; atLevel <= level; atLevel += 1) {
    const slot = spendOrder.find((candidate) => {
      // The first skill point can be spent on any BASIC ability — never the ultimate.
      if (atLevel === 1 && candidate === 'R') return false;
      const cap = Math.min(target[candidate], maxRankAtLevel(candidate, atLevel, schedule));
      return ranks[candidate] < cap;
    });
    if (slot) ranks[slot] += 1;
  }
  return ranks;
}

// ---------------------------------------------------------------------------------------
// The curve
// ---------------------------------------------------------------------------------------

/**
 * Where the ultimate sits in a levelling order. STATED BY THE CALLER, never assumed.
 *
 *  • `first-available` — take it at the first level the game allows, whenever it is still below
 *    the configured rank. This is the convention every public build guide uses, and it is the
 *    default, but it is a convention and the series says so.
 *  • `in-order` — the ultimate takes its own place in `order`, like any other slot, for a caller
 *    that wants to state the whole schedule itself.
 */
export type UltimatePlacement = 'first-available' | 'in-order';

export type LevelRankPolicy =
  | { kind: 'as-configured' }
  | {
      kind: 'priority';
      /**
       * Which slots get points first. THE CALLER'S, not the engine's: there is no default and no
       * guessed order anywhere in this file. An order that cannot produce the configured build
       * refuses the sweep rather than being half-obeyed — see `priorityProblems`.
       */
      order: readonly RankableSlot[];
      /** Where the ultimate sits. Defaults to `first-available`. */
      ultimate?: UltimatePlacement;
    };

/** What a point of a level sweep was evaluated at. Present on refused points too. */
export interface AppliedLevel {
  attackerLevel: number;
  defenderLevel: number;
  /** The attacker's ability ranks used at this point. */
  ranks: Ranks;
  /** True when those are not the ranks the Scenario states. */
  ranksDifferFromScenario: boolean;
  /**
   * The ranks the Scenario states, echoed on every point.
   *
   * Carried rather than left to the caller so that a point is self-describing: a reader holding
   * one point can see both what was drawn and what was asked for, without also holding the
   * Scenario. `src/ui/curves/rank-shortfall.ts` takes them as an argument because this field did
   * not exist when it was written; it can stop doing that.
   */
  configuredRanks: Ranks;
  /**
   * Every slot drawn BELOW the configured build at this point, with the cause of each. Empty
   * when the point is the configured build exactly.
   *
   * This is rule 4 of the header: nothing is silently lowered. Note the invariant rule 3
   * installs — a COMPUTED point can never carry a `beyond-schedule` entry, because such a build
   * is refused at every level.
   */
  rankShortfall: readonly SlotRankShortfall[];
}

/**
 * The rank policy a level curve actually ran under, as DATA rather than as an English sentence.
 *
 * The interface has to print this on the chart: a reader cannot judge a curve whose rank schedule
 * is invisible. It is reported structurally so the interface never has to parse it back out of
 * `notes` — which is what `src/ui/curves/rank-shortfall.ts` currently does, with a regular
 * expression and a comment saying it is a cross-check rather than a source.
 */
export interface LevelRankReport {
  policy: LevelRankPolicy['kind'];
  /** The order the caller stated, verbatim. Empty under `as-configured`. */
  order: readonly RankableSlot[];
  /** The ultimate rule that was in force. `not-applicable` under `as-configured`. */
  ultimate: UltimatePlacement | 'not-applicable';
  /** The rank schedule this curve used — the default unless the caller passed its own. */
  schedule: RankSchedule;
  /** The ranks the Scenario states. */
  configuredRanks: Ranks;
  /**
   * FALSE WHEN NO POINT WAS RE-RANKED, whatever the policy said.
   *
   * Three ways that happens: `as-configured`; a defender-only sweep, where the attacker's build
   * is the user's untouched; and a configured build no level can hold, where the order is refused
   * rather than applied. Printing "levelling order Q then W then E" beside any of those would
   * describe something that did not happen.
   */
  applied: boolean;
  /** Why the configured build can exist at no level at all. Empty when it can exist somewhere. */
  impossible: readonly string[];
  /** The computed point at the highest attacker level — the top of the curve. Null if none. */
  top: {
    attackerLevel: number;
    ranks: Ranks;
    short: readonly SlotRankShortfall[];
  } | null;
  /** True when there is a top and it is BELOW the configured build. */
  topBelowConfigured: boolean;
}

export type LevelSweepSeries = SweepSeries<AppliedLevel> & { rankReport: LevelRankReport };

/**
 * Why a levelling order cannot produce the configured build — an empty list means it can.
 *
 * A MALFORMED REQUEST REFUSES; IT IS NOT HALF-OBEYED. Two of these used to pass silently and both
 * ended in a curve that looked complete and was not:
 *
 *  • An order that names a slot twice spends one point where the caller meant two.
 *  • An order that omits a slot the build ranks never gives that slot a point at all, so the
 *    curve draws a build that is missing an ability at EVERY level including the top.
 *  • An order that names `R` while the ultimate rule is taking it first has stated a position the
 *    engine then ignores. That silent override is the hard-coded convention this work removes, so
 *    it is reported instead, naming the option that honours the request.
 */
export function priorityProblems(
  policy: { order: readonly RankableSlot[]; ultimate?: UltimatePlacement },
  configured: Ranks,
): string[] {
  const problems: string[] = [];
  const ultimate = policy.ultimate ?? 'first-available';
  const seen = new Set<RankableSlot>();

  for (const slot of policy.order) {
    if (!RANKABLE_SLOTS.includes(slot)) {
      problems.push(`the levelling order names “${slot}”, which is not a rankable ability slot`);
      continue;
    }
    if (seen.has(slot)) {
      problems.push(
        `the levelling order names ${slot} twice — one point per level is spent, so a repeated ` +
          'slot cannot mean what it looks like it means',
      );
    }
    seen.add(slot);
  }

  if (ultimate === 'first-available' && seen.has('R')) {
    problems.push(
      'the levelling order names R, but the ultimate rule in force is “first-available”, which ' +
        'takes the ultimate at the first level the game allows and would ignore that position. ' +
        'Pass ultimate: "in-order" to have R levelled where the order puts it',
    );
  }

  for (const slot of RANKABLE_SLOTS) {
    if (configured[slot] <= 0) continue;
    if (slot === 'R' && ultimate === 'first-available') continue;
    if (seen.has(slot)) continue;
    problems.push(
      `the configured build ranks ${slot} to ${configured[slot]}, and the levelling order ` +
        `${policy.order.join(' > ')} never spends a point on it — the curve would draw a build ` +
        `with no ${slot} at every level, including the top`,
    );
  }

  return problems;
}

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
 * REFUSES WHOLESALE in three cases: the scenario cannot be assembled at all; the levelling order
 * the caller stated cannot produce the configured build (`priorityProblems`); and — for a
 * defender-only sweep — the attacker's configured ranks cannot exist at the attacker's fixed
 * level, since every point would then refuse for one reason that is not about the axis.
 *
 * REFUSES EVERY LEVEL, but still returns the series, when the configured build can exist at NO
 * champion level. That is rule 3 of the header, and it is a per-point refusal rather than a
 * wholesale one on purpose: the axis still has 18 positions and a chart should be able to draw
 * eighteen refusal marks and a reason, rather than an empty box.
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

  // THE RANK POLICY APPLIES ONLY WHERE THE ATTACKER ACTUALLY MOVES. On a defender-only sweep the
  // attacker's build is the user's, untouched: re-allocating it from a levelling order would
  // silently replace the build the user configured with a different one.
  const priority = options.ranks.kind === 'priority' ? options.ranks : null;
  const ultimate: UltimatePlacement = priority?.ultimate ?? 'first-available';

  if (priority && sweepsAttacker) {
    const bad = priorityProblems(priority, configured);
    if (bad.length > 0) {
      return {
        ok: false,
        refusals: bad.map((reason) => ({ path: 'options.ranks.order', reason })),
      };
    }
  }

  // RULE 3: A BUILD NO LEVEL CAN HOLD IS REFUSED AT EVERY LEVEL, UNDER EVERY POLICY. Computed
  // once, from the CONFIGURED ranks, before any allocation happens — the whole point is that the
  // levelling order never gets the chance to lower it into something legal.
  const impossible = sweepsAttacker ? impossibleBuildProblems(configured, schedule) : [];
  const reRanks = priority !== null && sweepsAttacker && impossible.length === 0;

  const excluded = new Set<string>();
  const points: SweepPoint<AppliedLevel>[] = levels.map((level) => {
    const attackerLevel = sweepsAttacker ? level : scenario.attacker.level;
    const defenderLevel = sweepsDefender ? level : scenario.defender.level;

    const ranks = reRanks
      ? allocateRanks(configured, attackerLevel, priority!.order, schedule, ultimate)
      : configured;

    const applied: AppliedLevel = {
      attackerLevel,
      defenderLevel,
      ranks,
      ranksDifferFromScenario: !sameRanks(ranks, configured),
      configuredRanks: { ...configured },
      rankShortfall: rankShortfallAt(configured, ranks, attackerLevel, schedule),
    };
    const label = labelFor(options.who, level);

    // 0. Can this build exist at ANY level? Then no level of this curve may draw it, and a
    //    levelling order is not applied — it would draw a LOWER build and report its damage as
    //    the user's own.
    if (impossible.length > 0) {
      const refusals: SimulationRefusal[] = impossible.map((reason) => ({
        path: 'attacker.abilityRanks',
        reason,
      }));
      if (priority) {
        refusals.push({
          path: 'options.ranks',
          reason:
            'the levelling order was NOT applied to this level: it can only reach a LOWER build ' +
            'than the one configured, and drawing that would report damage for a build the user ' +
            'did not ask for',
        });
      }
      return { x: level, label, applied, status: 'refused', refusals };
    }

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

  // THE TOP OF THE CURVE is the COMPUTED point at the highest attacker level. Computed, because a
  // refused point draws no ink, and a note about "the top of this curve" is a claim about what
  // was drawn. Read off the points rather than assumed to be level 18: a caller may sweep any
  // subset of levels, and a curve that stops at 10 has its top at 10.
  let topPoint: ComputedSweepPoint<AppliedLevel> | null = null;
  for (const point of points) {
    if (point.status !== 'computed') continue;
    if (topPoint === null || point.applied.attackerLevel >= topPoint.applied.attackerLevel) {
      topPoint = point;
    }
  }

  const rankReport: LevelRankReport = {
    policy: options.ranks.kind,
    order: priority ? [...priority.order] : [],
    ultimate: priority ? ultimate : 'not-applicable',
    schedule,
    configuredRanks: { ...configured },
    applied: reRanks,
    impossible,
    top:
      topPoint === null
        ? null
        : {
            attackerLevel: topPoint.applied.attackerLevel,
            ranks: topPoint.applied.ranks,
            short: topPoint.applied.rankShortfall,
          },
    topBelowConfigured: topPoint !== null && topPoint.applied.rankShortfall.length > 0,
  };

  return {
    ok: true,
    series: {
      ...buildSeries({
        kind: 'level',
        axisLabel: axisLabel(options.who),
        points,
        excludedMechanics: excluded,
        notes: notesFor(options, schedule, rankReport),
      }),
      rankReport,
    },
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

/** "Q is drawn at rank 3 where the build states 5" — one shortfall, in a sentence. */
function shortfallPhrase(short: SlotRankShortfall): string {
  return `${short.slot} is drawn at rank ${short.applied} where the build states ${short.configured}`;
}

/**
 * The conventions this sweep applied, in plain English, for showing rather than logging.
 *
 * ═══ THE NOTE THAT USED TO BE FALSE IN THE WRONG DIRECTION ═══
 *
 * A priority curve used to carry, unconditionally:
 *
 *     "No ability is ranked above the build the scenario states, so the top of this curve is the
 *      configured build rather than a maxed one."
 *
 * The first clause is always true. The SECOND is a claim about what was actually drawn, and for
 * the seven roster champions in the header it was false in the more damaging direction — the top
 * was BELOW the configured build, not equal to it. It is also false for any caller sweeping a
 * subset of levels that stops short of the top.
 *
 * So the claim is now made only when it has been MEASURED to hold, from the computed points
 * themselves (`report.top`), and the opposite is said plainly when it does not. Both branches keep
 * the phrase "ranked above the build the scenario states", which `src/ui/curves/rank-shortfall.ts`
 * matches on to place its own correction; a note that quietly stopped appearing would be worse
 * than one that never existed.
 */
function notesFor(
  options: LevelSweepOptions,
  schedule: RankSchedule,
  report: LevelRankReport,
): string[] {
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

  const order = report.order.join(' > ');
  const ultimateClause =
    report.ultimate === 'in-order'
      ? 'taking the ultimate at its own place in that order'
      : 'taking the ultimate at the first level the game allows';

  if (options.ranks.kind === 'priority' && options.who !== 'defender' && !report.applied) {
    // The order was requested and REFUSED, because the configured build exists at no level.
    notes.push(
      `Ability ranks follow the leveling order ${order}, one point per level, ${ultimateClause} ` +
        '— but that order was NOT APPLIED to this curve. The configured build cannot exist at ' +
        'any champion level, so an order could only ever reach a LOWER build than the one you ' +
        'configured. Every level is refused instead, and each says why.',
    );
    notes.push(
      ...report.impossible.map((problem) => `Why the build cannot exist: ${problem}.`),
    );
  } else if (options.ranks.kind === 'priority' && options.who !== 'defender') {
    notes.push(
      `Ability ranks follow the leveling order ${order}, one point per level, ${ultimateClause}. ` +
        'That order is a convention supplied with the request, not a fact about this champion; ' +
        'each point states the ranks it used.',
    );
    if (report.top === null) {
      notes.push(
        'No ability is ranked above the build the scenario states. No level of this curve ' +
          'computed at all, so it has no top to compare against that build.',
      );
    } else if (report.topBelowConfigured) {
      notes.push(
        'No ability is ranked above the build the scenario states. The highest level drawn on ' +
          `this curve (level ${report.top.attackerLevel}) does NOT reach it either: the top of ` +
          'this curve is BELOW the configured build — ' +
          `${report.top.short.map(shortfallPhrase).join('; ')}.`,
      );
    } else {
      notes.push(
        'No ability is ranked above the build the scenario states, and the highest level drawn ' +
          `on this curve (level ${report.top.attackerLevel}) reaches it exactly — so the top of ` +
          'this curve is the configured build rather than a maxed one.',
      );
    }
  } else {
    notes.push(
      'Ability ranks are held exactly as configured. A level at which that build cannot legally ' +
        'exist is refused rather than adjusted.',
    );
    if (report.impossible.length > 0) {
      notes.push(
        ...report.impossible.map((problem) => `Why every level is refused: ${problem}.`),
      );
    }
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
