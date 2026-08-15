// WHERE A LEVEL CURVE IS DRAWN BELOW THE BUILD THE USER CONFIGURED.
//
// ═══ THE DEFECT THIS FILE EXISTS TO MAKE VISIBLE ═══
//
// `damageVsLevel` offers two rank policies. `as-configured` holds the user's ranks and REFUSES every
// level at which that build cannot legally exist — loud, and honest. `priority` spends one point per
// level in an order the caller states, which produces a full curve.
//
// MEASURED over the published roster on 2026-08-15, both policies with the same maxed level-18
// scenario: `as-configured` computes 166 points and refuses 2,948, and SEVEN champions compute
// nothing at all — Aphelios, Elise, Jayce, Karma, Nidalee, Udyr and Yuumi. Under `priority` that
// number is ZERO. Every one of those seven gets a full-looking curve.
//
// It does not get one by finding ranks it could not find before. `allocateRanks` caps each slot at
// `Math.min(target, maxRankAtLevel(...))`, so a build the schedule cannot express is quietly
// LOWERED to one it can:
//
//     Udyr      configured Q6 W6 E6 R6  ->  drawn at level 18  Q5 W5 E5 R3
//     Aphelios  configured Q6 W6 E6 R3  ->  drawn at level 18  Q5 W5 E5 R3
//     Jayce     configured Q6 W6 E6 R1  ->  drawn at level 18  Q5 W5 E5 R1
//     Yuumi     configured Q6 W5 E5 R3  ->  drawn at level 18  Q5 W5 E5 R3
//     Elise     configured Q5 W5 E5 R4  ->  drawn at level 18  Q5 W5 E5 R3
//     Karma     configured Q5 W5 E5 R4  ->  drawn at level 18  Q5 W5 E5 R3
//     Nidalee   configured Q5 W5 E5 R4  ->  drawn at level 18  Q5 W5 E5 R3
//
// RE-DERIVED THROUGH THE REAL ENGINE ON 2026-08-15, not taken on trust from this comment.
// `rank-shortfall.test.ts` ran `allocateRanks` and `damageVsLevel` over all 173 published champions
// and reproduced EVERY figure above exactly: the seven names, each champion's configured and drawn
// ranks, and the count of champions computing nothing under each policy. The table is a
// measurement, and it held.
//
// ═══ AND THEN THE ENGINE FIXED IT AT SOURCE, THE SAME DAY. READ THIS BEFORE THE REST. ═══
//
// `src/engine/level-sweep.ts` was rewritten on 2026-08-15 so that a build which can exist at NO
// champion level is REFUSED at every level under both policies, rather than quietly lowered. The
// seven champions above now draw nothing under `priority`, exactly as they already drew nothing
// under `as-configured`, and the engine's own note — which used to end "so the top of this curve is
// the configured build rather than a maxed one", false for these seven — now states the truth in
// three branches.
//
// So the specific defect this file was written for is GONE, and the roster figures moved with it:
// `priority` computes 996 and refuses 2,118 where it computed 1,039 and refused 2,075
// (`roster-curves.test.ts` carries the arithmetic that accounts for all 43 points).
//
// ═══ WHAT IS LEFT, AND WHY IT IS NOT NOTHING ═══
//
// The engine's fix closes the case where a rank is out of reach. It does NOT close the general
// case, which is: THE TOP OF THIS CURVE IS NOT THE BUILD YOU CONFIGURED. That still happens, with
// nothing refusing and no visual signature, whenever a sweep's `levels` stop below the level the
// build is reached at — a curve over levels 1–14 of a level-18 build is full, continuous, plausible
// and short. `RankShortfall.markedPoints` is keyed on that, not on the cause the engine removed.
//
// It also prints the LEVELLING ORDER, which is the other half of the job and was never about a
// defect: a reader cannot judge a curve whose rank schedule is invisible, and the same champion
// drawn Q-first and E-first is two different lines with neither one wrong.
//
// ═══ WHAT THIS FILE DOES, AND WHAT IT DELIBERATELY DOES NOT ═══
//
// It compares each point's `AppliedLevel.ranks` against the ranks the Scenario states and reports
// every slot that is short. It does not interpolate, does not switch policy, does not hide a point,
// does not adjust a number, and never softens a refusal. Nothing here touches damage. The whole
// output is text for the chart to print, plus the x positions to mark.
//
// The configured ranks arrive as an ARGUMENT because `AppliedLevel` did not carry them when this
// was written and the type contract is frozen (CLAUDE.md) — a caller that has the Scenario has
// them, so no contract change was needed. The engine has SINCE added `AppliedLevel.configuredRanks`,
// `AppliedLevel.rankShortfall` and `series.rankReport`, which are a better source than an argument
// because they cannot disagree with the series they describe. Moving onto them is raised to the
// lead, not done here: that work's own suite was failing when this was written.

import {
  DEFAULT_RANK_SCHEDULE,
  maxRankAtLevel,
  type AppliedLevel,
  type LevelRankPolicy,
  type RankSchedule,
  type RankableSlot,
  type Ranks,
  type SweepSeries,
} from '../../engine';

/** The four rankable slots, in the order a player reads them. */
export const SLOTS: readonly RankableSlot[] = ['Q', 'W', 'E', 'R'];

/**
 * EVERY order of the three basic abilities. All six, none marked as preferred.
 *
 * The complete set is offered because the site has no way to know which one the user levels, and
 * naming a favourite would be the engine inventing a build — the same failure `as-configured`
 * exists to avoid. The arrangement below is alphabetical by the joined letters and carries no
 * meaning.
 *
 * NOT EVIDENCE FOR ANY ORDER: measured over the roster, Q>W>E, E>Q>W and W>E>Q each computed the
 * same number of points as each other. The figure is a property of a four-ability combo, not of an
 * order. (The absolute number has since moved with the engine's refusal fix; the equality between
 * orders is the part that mattered and it is what this note is for.)
 */
export const LEVELLING_ORDERS: ReadonlyArray<readonly RankableSlot[]> = [
  ['E', 'Q', 'W'],
  ['E', 'W', 'Q'],
  ['Q', 'E', 'W'],
  ['Q', 'W', 'E'],
  ['W', 'E', 'Q'],
  ['W', 'Q', 'E'],
];

/**
 * Why a slot is drawn below the configured build. Three causes, because they have three fixes.
 *
 *  • `beyond-schedule` — NO level reaches that rank under the rank schedule this curve used. This
 *    was the silent one, and it is the cause the engine's 2026-08-15 fix removed: such a build is
 *    now refused at every level, so this CANNOT appear on a computed point from `damageVsLevel`
 *    any more (pinned in `rank-shortfall.test.ts`). Kept because the schedule is an argument and
 *    this function is also called on hand-built series.
 *  • `level-cap` — the level has not unlocked that rank yet (rank 3 of a basic needs level 5). Any
 *    priority curve has this at its low levels and it is not a defect.
 *  • `order-priority` — the level allows the rank, and the stated order spent its points elsewhere.
 *    Also expected: it is what a levelling order IS.
 */
export type ShortfallCause = 'beyond-schedule' | 'level-cap' | 'order-priority';

/** One slot, at one point, drawn below the build the Scenario states. */
export interface SlotShortfall {
  slot: RankableSlot;
  /** The rank the Scenario states. */
  configured: number;
  /** The rank the sweep actually drew this point at. */
  drawn: number;
  cause: ShortfallCause;
}

/** One point of the curve whose drawn ranks are below the configured ones. */
export interface PointShortfall {
  x: number;
  label: string;
  attackerLevel: number;
  short: SlotShortfall[];
}

export interface RankShortfall {
  /** The ranks the Scenario states, echoed so a caller can print the comparison. */
  configured: Ranks;
  /** Computed points, in series order, that drew at least one slot below the configured build. */
  points: PointShortfall[];
  /** How many points were computed at all. Refused points draw nothing and are not counted. */
  computedCount: number;
  /**
   * Computed points whose `applied` payload really did carry ability ranks, so the comparison
   * could be made. `computedCount - unreadableCount`.
   */
  readableCount: number;
  /**
   * COMPUTED POINTS THIS COULD NOT CHECK, because their `applied` payload carries no ability
   * ranks at all.
   *
   * A resistance sweep's payload is `AppliedResistances` and has none, and a hand-authored series
   * may carry `null`. Counting them is the difference between "nothing is short" and "nothing was
   * looked at" — two answers that print identically if the second is not named, and the second is
   * the one that hides a shortfall.
   */
  unreadableCount: number;
  /** The x values of `points`. Every point drawn below the build, marked or not. */
  shortXs: number[];
  /**
   * THE CALLER'S `configured` DISAGREES WITH WHAT THE SERIES SAYS IT WAS DRAWN AGAINST.
   *
   * `configured` is an argument, so nothing stops a caller passing one champion's build alongside
   * another champion's curve — and every sentence this file produces would then be confidently
   * wrong. Points now carry `AppliedLevel.configuredRanks`, so the two can be compared, and a
   * disagreement is REPORTED rather than silently resolved in favour of either.
   *
   * False when no point states a configured build, which is not agreement — it is silence.
   */
  configuredMismatch: { stated: Ranks; seriesSays: Ranks } | null;
  /**
   * THE POINTS THAT GET A MARK ON THE PLOT: those short in a slot THE CURVE NEVER RECOVERS FROM.
   *
   * ═══ THE RULE, AND THE TWO WRONG RULES IT REPLACED ═══
   *
   * A point is marked when at least one of the slots it is short in is ALSO short at the top of
   * the curve. If the top is the configured build, nothing is marked at all.
   *
   * WRONG RULE 1 — mark every short point. MEASURED: under a levelling order, Garen's curve draws
   * 6 points and 5 of them sit below his level-18 build, because that is what levelling IS. That
   * rule puts the same mark on all 173 curves, and a mark that appears everywhere says nothing.
   *
   * WRONG RULE 2 — mark the `beyond-schedule` cause only. That was this file's rule until
   * 2026-08-15 and it was right about the defect it was written for. Then `src/engine/level-sweep.ts`
   * FIXED that defect at source: a build no champion level can hold is now refused at every level
   * rather than quietly lowered, so `beyond-schedule` can no longer appear on a computed point at
   * all. A trigger nothing can pull is not a safety feature.
   *
   * The rule above is live and is the fact a reader actually needs: it fires exactly when this
   * curve never shows you the build you configured — including the case the engine's fix does not
   * cover, a sweep whose `levels` stop below the level the build is reached at.
   */
  markedPoints: PointShortfall[];
  /** The x values of `markedPoints`, for marking on the axis. */
  markedXs: number[];
  /** The computed point at the highest attacker level — the top of the curve. */
  top: PointShortfall | null;
  /**
   * TRUE WHEN THE TOP OF THE CURVE IS NOT THE CONFIGURED BUILD.
   *
   * This is exactly the condition under which `level-sweep.ts`'s note — "the top of this curve is
   * the configured build rather than a maxed one" — is false, so it is also the condition under
   * which `annotateNotes` marks that note as not applying.
   */
  topBelowConfigured: boolean;
  /** True when at least one slot is short with cause `beyond-schedule` anywhere on the curve. */
  anyUnreachable: boolean;
}

/** The rank schedule's own ceiling for a slot: the highest rank ANY level can hold. */
export function scheduleCap(slot: RankableSlot, schedule: RankSchedule): number {
  return maxRankAtLevel(slot, Number.MAX_SAFE_INTEGER, schedule);
}

/** Every slot drawn below its configured rank at one level, with the cause of each. */
export function shortfallAt(
  configured: Ranks,
  drawn: Ranks,
  attackerLevel: number,
  schedule: RankSchedule = DEFAULT_RANK_SCHEDULE,
): SlotShortfall[] {
  const short: SlotShortfall[] = [];
  for (const slot of SLOTS) {
    const want = configured[slot];
    const got = drawn[slot];
    if (!(got < want)) continue;
    const cause: ShortfallCause =
      want > scheduleCap(slot, schedule)
        ? 'beyond-schedule'
        : want > maxRankAtLevel(slot, attackerLevel, schedule)
          ? 'level-cap'
          : 'order-priority';
    short.push({ slot, configured: want, drawn: got, cause });
  }
  return short;
}

/**
 * What a point was drawn at, read back out of an `applied` payload of unknown shape.
 *
 * `DamageCurve` takes `SweepSeries<unknown>` on purpose — it is one component for the level curve
 * and the resistance curve, and it never reads the payload that differs between them. So this
 * checks the shape at runtime rather than asserting a type, and returns null instead of throwing:
 * a resistance sweep handed to this function is a caller mistake to REPORT, not a crash.
 */
export function appliedLevelRanks(
  applied: unknown,
): { ranks: Ranks; attackerLevel: number; configuredRanks: Ranks | null } | null {
  if (typeof applied !== 'object' || applied === null) return null;
  const record = applied as Record<string, unknown>;
  const level = record['attackerLevel'];
  if (typeof level !== 'number') return null;
  const ranks = readRanks(record['ranks']);
  if (ranks === null) return null;
  // `configuredRanks` arrived on AppliedLevel after this file was written and is optional here on
  // purpose: a hand-built series need not carry it, and its ABSENCE is not an error. Its PRESENCE
  // is what lets `rankShortfall` catch a caller comparing against the wrong build.
  return { ranks, attackerLevel: level, configuredRanks: readRanks(record['configuredRanks']) };
}

/** One `Ranks` out of an unknown value, or null when it is not one. */
function readRanks(value: unknown): Ranks | null {
  if (typeof value !== 'object' || value === null) return null;
  const source = value as Record<string, unknown>;
  const read: Partial<Ranks> = {};
  for (const slot of SLOTS) {
    const rank = source[slot];
    if (typeof rank !== 'number') return null;
    read[slot] = rank;
  }
  return read as Ranks;
}

/**
 * The whole curve, compared point by point against the configured build.
 *
 * REFUSED POINTS ARE NOT INSPECTED. A refused point draws no line and states its own reason; it is
 * already honest, and counting it here would inflate a figure about ink that was never laid down.
 * It also stays refused on screen — nothing here removes, softens or replaces a refusal.
 */
export function rankShortfall(
  series: SweepSeries<AppliedLevel> | SweepSeries<unknown>,
  configured: Ranks,
  schedule: RankSchedule = DEFAULT_RANK_SCHEDULE,
): RankShortfall {
  const computed = series.points.filter((point) => point.status === 'computed');
  const readable = computed
    .map((point) => ({ point, applied: appliedLevelRanks(point.applied) }))
    .filter((entry): entry is { point: (typeof computed)[number]; applied: NonNullable<ReturnType<typeof appliedLevelRanks>> } =>
      entry.applied !== null,
    );

  const points: PointShortfall[] = [];
  for (const { point, applied } of readable) {
    const short = shortfallAt(configured, applied.ranks, applied.attackerLevel, schedule);
    if (short.length > 0) {
      points.push({
        x: point.x,
        label: point.label,
        attackerLevel: applied.attackerLevel,
        short,
      });
    }
  }

  let topEntry: (typeof readable)[number] | null = null;
  for (const entry of readable) {
    if (topEntry === null || entry.applied.attackerLevel >= topEntry.applied.attackerLevel) {
      topEntry = entry;
    }
  }
  const top: PointShortfall | null =
    topEntry === null
      ? null
      : {
          x: topEntry.point.x,
          label: topEntry.point.label,
          attackerLevel: topEntry.applied.attackerLevel,
          short: shortfallAt(
            configured,
            topEntry.applied.ranks,
            topEntry.applied.attackerLevel,
            schedule,
          ),
        };

  // The slots the curve NEVER RECOVERS IN — those still short at its highest drawn point. Empty
  // when the top IS the configured build, which is what leaves a healthy curve unmarked.
  const neverRecovered = new Set((top?.short ?? []).map((slot) => slot.slot));
  const markedPoints = points.filter((point) =>
    point.short.some((slot) => neverRecovered.has(slot.slot)),
  );

  // The first point whose own record of the configured build differs from the one passed in.
  const disagreeing = readable.find(
    (entry) =>
      entry.applied.configuredRanks !== null &&
      SLOTS.some((slot) => entry.applied.configuredRanks![slot] !== configured[slot]),
  );

  return {
    configured,
    configuredMismatch: disagreeing
      ? { stated: configured, seriesSays: disagreeing.applied.configuredRanks! }
      : null,
    points,
    computedCount: computed.length,
    readableCount: readable.length,
    unreadableCount: computed.length - readable.length,
    shortXs: points.map((point) => point.x),
    markedPoints,
    markedXs: markedPoints.map((point) => point.x),
    top,
    topBelowConfigured: top !== null && top.short.length > 0,
    anyUnreachable: points.some((point) =>
      point.short.some((slot) => slot.cause === 'beyond-schedule'),
    ),
  };
}

// ---------------------------------------------------------------------------------------
// The same facts, in words the chart prints
// ---------------------------------------------------------------------------------------

/**
 * A levelling order in speech: "Q then W then E".
 *
 * Not "Q > W > E". The engine writes it that way in its own notes, and a screen reader says
 * "greater than" — which in a document full of damage comparisons is a sentence that could be read
 * as a claim about damage. The word "then" says the one thing meant and says it identically on
 * screen and out loud.
 */
export function orderPhrase(order: readonly RankableSlot[]): string {
  return order.join(' then ');
}

/** The rank policy as the one line printed on the chart. */
export function policyPhrase(policy: LevelRankPolicy): string {
  return policy.kind === 'priority'
    ? `Levelling order: ${orderPhrase(policy.order)}`
    : 'Ability ranks: held exactly as configured';
}

/** The sentence under it, saying what the policy does with a level it cannot satisfy. */
export function policyDetail(policy: LevelRankPolicy): string {
  return policy.kind === 'priority'
    ? 'One skill point per level in that order, taking the ultimate at the first level the game ' +
        'allows. The order was supplied with this curve; it is not a fact about this champion.'
    : 'No level is re-ranked. A level at which this build cannot legally exist is refused rather ' +
        'than adjusted.';
}

/**
 * Whether the series' own notes confirm the policy the caller says produced it.
 *
 * A CROSS-CHECK, not decoration. The whole requirement is that a reader never has to guess which
 * path produced the line; printing the caller's policy beside a series computed under a different
 * one would defeat that more thoroughly than printing nothing. The engine writes its policy into
 * `notes` in words, so the two can be compared without a contract change.
 *
 * `absent` is a real answer and is not treated as agreement: a hand-built series carries whatever
 * notes its author wrote.
 */
export function noteConfirmation(
  notes: readonly string[],
  policy: LevelRankPolicy,
): 'confirmed' | 'contradicted' | 'absent' {
  const priority = notes.find((note) => note.includes('leveling order '));
  const asConfigured = notes.some((note) => note.includes('held exactly as configured'));

  if (policy.kind === 'priority') {
    if (priority !== undefined) {
      return priority.includes(`leveling order ${policy.order.join(' > ')},`)
        ? 'confirmed'
        : 'contradicted';
    }
    return asConfigured ? 'contradicted' : 'absent';
  }
  if (asConfigured) return 'confirmed';
  return priority === undefined ? 'absent' : 'contradicted';
}

/** What the notes say instead, when they contradict the stated policy. */
export function noteContradictionText(notes: readonly string[]): string {
  const priority = notes.find((note) => note.includes('leveling order '));
  const match = priority?.match(/leveling order ([QWER](?: > [QWER])*)/);
  if (match) {
    return (
      `The engine’s own notes say this curve was computed with the levelling order ` +
      `${match[1]!.split(' > ').join(' then ')}. The order printed above may not be the one that ` +
      `produced this line.`
    );
  }
  return (
    'The engine’s own notes say the ability ranks were held exactly as configured, so no levelling ' +
    'order was applied to this curve.'
  );
}

/** "Q, W and E" — a list of slots in a sentence. */
function slotList(slots: readonly RankableSlot[]): string {
  if (slots.length === 1) return slots[0]!;
  return `${slots.slice(0, -1).join(', ')} and ${slots[slots.length - 1]!}`;
}

/** "1–18", "6, 9 and 12" — levels compressed into runs so a full curve is one short phrase. */
export function levelRanges(levels: readonly number[]): string {
  const sorted = [...new Set(levels)].sort((a, b) => a - b);
  if (sorted.length === 0) return '';
  const runs: string[] = [];
  let start = sorted[0]!;
  let previous = start;
  for (const level of sorted.slice(1)) {
    if (level === previous + 1) {
      previous = level;
      continue;
    }
    runs.push(start === previous ? `${start}` : `${start}–${previous}`);
    start = level;
    previous = level;
  }
  runs.push(start === previous ? `${start}` : `${start}–${previous}`);
  return runs.length === 1 ? runs[0]! : `${runs.slice(0, -1).join(', ')} and ${runs[runs.length - 1]!}`;
}

/**
 * The slots short at one point, grouped into sentences.
 *
 * Grouped by the pair of ranks and the cause, so Udyr's three six-rank basics are one sentence
 * rather than three identical ones — a warning nobody finishes reading is a warning that did not
 * work.
 */
export function shortfallSentences(short: readonly SlotShortfall[]): string[] {
  const groups = new Map<string, SlotShortfall[]>();
  for (const slot of short) {
    const key = `${slot.drawn}/${slot.configured}/${slot.cause}`;
    groups.set(key, [...(groups.get(key) ?? []), slot]);
  }
  return [...groups.values()].map((group) => {
    const first = group[0]!;
    const slots = slotList(group.map((entry) => entry.slot));
    const verb = group.length === 1 ? 'is' : 'are';
    return (
      `${slots} ${verb} drawn at rank ${first.drawn}, and your build states rank ` +
      `${first.configured}.`
    );
  });
}

/** How a curve that never reaches the configured build explains itself. */
export function unreachableSentence(schedule: RankSchedule = DEFAULT_RANK_SCHEDULE): string {
  return (
    `No level on this curve can reach those ranks: the rank schedule it used describes ` +
    `${schedule.basicRankLevels.length} ranks for a basic ability and ` +
    `${schedule.ultimateRankLevels.length} for the ultimate. This champion’s ability ranks are ` +
    `outside it, so the whole curve is a weaker build than the one you configured.`
  );
}

/**
 * Everything the chart prints about the shortfall, as separate lines.
 *
 * Empty when nothing is short — a curve that draws the configured build says nothing about ranks
 * beyond the policy line, because there is nothing to say.
 */
export function shortfallWarnings(
  shortfall: RankShortfall,
  schedule: RankSchedule = DEFAULT_RANK_SCHEDULE,
): string[] {
  const lines: string[] = [];

  // SAID BEFORE ANYTHING ELSE, because if this fires then every other sentence below is about the
  // wrong build and the reader needs to distrust the whole block rather than one line of it.
  if (shortfall.configuredMismatch) {
    lines.push(
      `This comparison may be against the wrong build. The build stated with this chart is ` +
        `${ranksPhrase(shortfall.configuredMismatch.stated)}, and the curve itself records that it ` +
        `was drawn against ${ranksPhrase(shortfall.configuredMismatch.seriesSays)}. Nothing below ` +
        'has been adjusted to fit either one.',
    );
  }

  // SAID EARLY, AND SAID EVEN WHEN NOTHING IS SHORT. "No point is below your build" and "no point
  // was looked at" are the same silence otherwise, and the second is the one that hides a
  // shortfall.
  if (shortfall.unreadableCount > 0) {
    lines.push(
      `${shortfall.unreadableCount} of the ${shortfall.computedCount} computed points do not ` +
        'record the ability ranks they were drawn at, so they could not be compared with your ' +
        'build. Nothing here says they match it.',
    );
  }

  if (shortfall.points.length === 0) return lines;

  if (shortfall.topBelowConfigured && shortfall.top) {
    lines.push(
      `The top of this curve is BELOW the build you configured. At ${shortfall.top.label} — the ` +
        'highest point drawn — the ranks are not yours.',
    );
    lines.push(...shortfallSentences(shortfall.top.short));
    if (shortfall.top.short.some((slot) => slot.cause === 'beyond-schedule')) {
      lines.push(unreachableSentence(schedule));
    }
  }

  // THE TWO COUNTS ARE SEPARATE SENTENCES BECAUSE THEY MEAN DIFFERENT THINGS, and merging them
  // into one figure is how the defect hid in the first place: "5 of 6 points are below your build"
  // is true of almost every champion and therefore tells a reader nothing.
  const marked = shortfall.markedPoints;
  const notYet = shortfall.points.filter((point) => !marked.includes(point));

  if (marked.length > 0) {
    lines.push(
      `Marked on the plot: ${marked.length} of the ${shortfall.readableCount} points this curve ` +
        `draws — ${
          marked.length === shortfall.readableCount
            ? 'every one of them'
            : `levels ${levelRanges(marked.map((point) => point.attackerLevel))}`
        } — are short in an ability this curve never reaches your rank in.`,
    );
  }
  if (notYet.length > 0) {
    lines.push(
      `${notYet.length} further ${notYet.length === 1 ? 'point is' : 'points are'} below your ` +
        `build only because the level has not bought those ranks yet — levels ` +
        `${levelRanges(notYet.map((point) => point.attackerLevel))}. The curve does reach your ` +
        'build above them, so they are not marked.',
    );
  }
  return lines;
}

/**
 * A set of ranks as the chart prints them: `Q5 W5 E5 R3`.
 *
 * The slot letters are the ones a League player already reads on their own ability bar, so no
 * legend is needed. It is one string rather than four cells because the four ranks are one fact —
 * a build — and splitting them across columns would invite comparing a column down the table
 * instead of a row across it.
 */
export function ranksPhrase(ranks: Ranks): string {
  return SLOTS.map((slot) => `${slot}${ranks[slot]}`).join(' ');
}

/**
 * The short slots in the narrowest honest form, for one cell of the point-by-point table.
 *
 * `Q 5 of 6, W 5 of 6` rather than the full sentences: this appears on up to eighteen rows, and
 * eighteen repetitions of a paragraph is a warning nobody reads. The sentences are still printed
 * once, above the plot, where the top of the curve is explained.
 *
 * The two wordings differ by whether the point is MARKED, and that is the whole point of the
 * function: "never reached" is the phrase in the cell, in the legend and in the figure's spoken
 * description, so a reader meets one fact under one name in three places.
 */
/**
 * The label as TWO LINES, which is how the cell renders it.
 *
 * IT IS SPLIT FOR A MEASURED LAYOUT REASON, not for looks. A table cell sizes to its longest
 * unbreakable line, and inside `overflow-x: auto` there is no width to wrap against — so the
 * one-line form MEASURED 387px in a browser, made the table 1,335px against a 1,167px scroller,
 * and pushed the PAGE sideways by 49px. Two block lines make the cell's natural width the wider of
 * the two rather than the sum, with no cap and no new design token.
 *
 * The alternative was a `max-inline-size`, and `--measure-prose-max` (640px) is the only measure
 * that fits a wrapping cell today — four times too wide here, and named for a paragraph. DESIGN.md
 * §4a is explicit that a measure is named for what it governs; there is no table-column measure, so
 * one is RAISED rather than borrowed.
 */
export function shortfallCellParts(
  short: readonly SlotShortfall[],
  marked = false,
): { label: string; figures: string } {
  return {
    label: marked ? 'below your build, never reached' : 'below your build',
    figures: short.map((slot) => `${slot.slot} ${slot.drawn} of ${slot.configured}`).join(', '),
  };
}

/**
 * The shortfall marks in one sentence, appended to the figure's own description.
 *
 * The plot is `aria-hidden` (`DamageCurve.tsx`), so a mark drawn on it reaches a screen-reader
 * user through this sentence and through the table's rank column, never through the mark itself.
 * Null when there is nothing marked, so the description does not grow a sentence saying nothing.
 */
export function shortfallDescription(shortfall: RankShortfall): string | null {
  if (shortfall.markedPoints.length === 0) return null;
  return (
    `${shortfall.markedPoints.length} of the ${shortfall.readableCount} drawn points are marked ` +
    'with a dotted vertical rule, because they are short in an ability this curve never reaches ' +
    'your configured rank in.'
  );
}

/**
 * The engine note this correction answers, matched on its own stable phrase.
 *
 * Matched on a PHRASE rather than the whole sentence: an exact-string match would fail silently the
 * first time the engine rewords its note, and a correction that quietly stops appearing is worse
 * than one that never existed. `annotateNotes` still appends the correction when no note matches,
 * so the reader is told either way.
 *
 * ═══ CORRECTED 2026-08-15. IT MATCHED THE TRUE HALF OF THE SENTENCE. ═══
 *
 * The engine writes one sentence with two clauses (`level-sweep.ts`, verbatim):
 *
 *     "No ability is ranked above the build the scenario states, so the top of this curve is
 *      the configured build rather than a maxed one."
 *
 * The FIRST clause is true for all 173 champions, including the seven — `allocateRanks` really
 * never ranks anything above the target. It is the SECOND clause that is false for the seven, and
 * false in the wrong direction: the top is below the configured build, not equal to it.
 *
 * This constant was `'ranked above the build the scenario states'`, which is the first clause. That
 * is the wrong half to key on, and not merely inelegant: an engine session is currently rewriting
 * this note, and the likely rewrite keeps the true premise while fixing the false conclusion. Keyed
 * on the first clause, this file would then contradict a note that had just become correct — the
 * interface calling the engine a liar about a sentence the engine had already fixed.
 *
 * Keyed on the false clause, both outcomes are safe: if the wording survives, it is contradicted in
 * place; if it is fixed or removed, nothing matches and `annotateNotes` appends its own standalone
 * statement, which is true regardless of what the notes say.
 *
 * ═══ AND THAT IS WHAT HAPPENED, WITHIN THE HOUR. THIS CORRECTION IS NOW DORMANT. ═══
 *
 * `level-sweep.ts` was rewritten the same day and now writes three different sentences depending on
 * whether the curve has a top, reaches the build, or falls short — the false one is gone. So
 * `annotateNotes` currently matches nothing on real engine output and appends its own statement
 * instead, which is exactly the fallback this constant was re-keyed to allow.
 *
 * IT IS KEPT RATHER THAN DELETED, and the reason is not sentiment: this file's whole job is that a
 * reader is never shown a note that contradicts the curve beside it, and the interface cannot know
 * which revision of the engine produced a series it was handed. A guard that does not fire costs a
 * string comparison. `rank-shortfall.test.ts` pins BOTH facts — that the engine no longer writes
 * the sentence, and that the correction still fires if it ever comes back.
 */
export const TOP_OF_CURVE_NOTE = 'the top of this curve is the configured build';

/**
 * The series' notes with the false one marked as not applying.
 *
 * The engine's own words are QUOTED rather than rewritten. A reader who sees the sentence
 * contradicted in place cannot come away thinking the interface endorsed it, and the engine's text
 * stays auditable against `level-sweep.ts`.
 */
export function annotateNotes(
  notes: readonly string[],
  shortfall: RankShortfall,
  schedule: RankSchedule = DEFAULT_RANK_SCHEDULE,
): string[] {
  if (!shortfall.topBelowConfigured || shortfall.top === null) return [...notes];

  const detail = [
    ...shortfallSentences(shortfall.top.short),
    ...(shortfall.top.short.some((slot) => slot.cause === 'beyond-schedule')
      ? [unreachableSentence(schedule)]
      : []),
  ].join(' ');

  const correction = (quoted: string | null) =>
    `THIS DOES NOT APPLY TO THIS CURVE. ${
      quoted === null
        ? 'The engine normally states that the top of the curve is the configured build.'
        : `The engine states: “${quoted}”`
    } It is not true here — the top of this curve is BELOW the configured build. ${detail}`;

  const index = notes.findIndex((note) => note.includes(TOP_OF_CURVE_NOTE));
  if (index === -1) return [...notes, correction(null)];
  return notes.map((note, at) => (at === index ? correction(note) : note));
}
