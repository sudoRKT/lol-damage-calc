// WHAT RANK AXIS AN ABILITY IS ON, READ FROM WHAT THE SOURCE SAYS — never inferred.
//
// THE PROBLEM THIS EXISTS FOR. `Champion.abilityMaxRanks` carries ONE rank count per SLOT, taken
// from Data Dragon's `maxrank` (DATA-SOURCES §22). A slot can hold more than one ability, and the
// abilities in one slot do NOT always rank together:
//
//   Nidalee's Q slot holds Javelin Toss (human) and Takedown (cougar). Javelin Toss has five
//   ranks. Takedown has FOUR, because its own template says, in the leveling field itself:
//     "''Takedown'' scales with ''Aspect of the Cougar'' rank"
//   and Aspect of the Cougar is a four-rank ultimate. Storing Takedown against the Q slot's five
//   ranks moves every middle value, because `X to Y` interpolates across the count.
//
// §22 recorded this as "the residual, now loud instead of silent" and proposed no fix. This module
// is the fix for the part the source actually states, and only that part.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// EVERY POPULATION BELOW WAS MEASURED ON 2026-08-15 over the 937-page cache
// (`build/proposed-curated/ability-wikitext.json`, fetched 2026-08-13, alias-deduped by revision
// id) joined to `public/data/champions.json` (patch 16.16.1). `rank-shape.test.ts` re-measures
// each of them, so a figure that moves fails a test rather than ageing quietly in a comment.
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// THREE THINGS IT READS, IN DESCENDING ORDER OF HOW EXPLICIT THEY ARE:
//
//   1. A RANK-AXIS SENTENCE. The ability's own template says which ability's rank it follows.
//      MEASURED: exactly 9 pages, and they say it in one fixed shape — Heimerdinger Q/W/E follow
//      UPGRADE!!!, Karma Q/W/E follow Mantra, Nidalee Q/W/E follow Aspect of the Cougar. This is
//      the strongest statement available and nothing else is needed to accept it.
//   2. A RANK-COUNT SUFFIX. `{{ap|5 to 80 4}}` — a trailing bare integer AFTER the interpolation's
//      end value is the number of ranks the interpolation runs across (DATA-SOURCES §11, the
//      `X to Y for N` variant). MEASURED: 27 pages state one, 18 of them agreeing with Data
//      Dragon's count for the slot and 9 not. It is a statement about ONE expression, not
//      necessarily about the whole ability.
//   3. A PROSE SENTENCE stating a count or the levels: "which has 4 ranks", "can increase it at
//      levels 6, 11, and 16", "begins the game with … but cannot increase its rank". MEASURED: 1
//      page states a count in words (Elise R), 2 state unlock levels (Elise R, Nidalee R), 4 state
//      that the ability cannot be ranked (Jayce's two Transform pages, and the same sentence
//      repeated in a second field on one of them).
//
// A DEFECT THAT WAS IN THIS FILE, AND HOW IT WOULD HAVE READ. The first version of (2) matched
// `to` followed by any trailing integer, so `{{ap|80 to 240}}` — Lux Q, the most ordinary shape in
// the game — reported a "stated rank count" of 240. It fired on 708 of the 937 pages. It could not
// move a stored value, because a disagreeing count is never written (below), but it would have
// buried the 9 real statements under 699 fictional ones and made the report worthless. The reader
// now splits the body on whitespace and requires a token AFTER the interpolation's end value, so
// `80 to 240` states nothing and `5 to 80 4` states four.
//
// AND THE RULE THAT KEEPS (2) FROM LYING, which is the whole reason this file is careful. Aurelion
// Sol's Breath of Light — a perfectly ordinary five-rank ability — contains
// `{{ap|(45/8)*26 to ((45+(105-45)*(3/4))/8)*26 4}}`. The trailing 4 is a step count inside a
// derived display expression, not the ability's rank count. Read naively it would demote a
// five-rank ability to four and move three of its five values. Zilean's Time Warp does the same
// thing differently: `{{ap|40 to 85 4|99}}` interpolates over the FIRST FOUR of its five ranks and
// states the fifth separately.
//
//   SO: a stated count that DISAGREES with Data Dragon's slot maxrank is stored ONLY when a
//   second, independent statement corroborates it — a rank-axis sentence, or a prose count. On its
//   own it is REPORTED for a person to read and never written. This is CLAUDE.md's standing rule
//   ("a detector proposes, a person confirms") applied to a figure that multiplies damage: getting
//   a rank count wrong is a plausible wrong number at every rank except the first and last.
//
// MEASURED CONSEQUENCE OF THAT RULE: of the 9 pages stating a count Data Dragon does not, 6 are
// corroborated by a rank-axis sentence and are written; 3 are reported and not written — Aurelion
// Sol Q and Zilean E (the two display-expression cases above) and Aphelios's passive, whose "6"
// is the number of BONUS-STAT purchases his passive offers and not a rank count at all.
//
// A PAGE CAN STATE TWO COUNTS WITHOUT CONTRADICTING ITSELF, and an earlier draft of this file had
// that wrong. Karma's Soulflare carries `{{ap|40 to 220 4}}` and `{{ap|60 to 260 5}}` in ONE
// leveling row: the first is the Mantra bonus, which follows Mantra's 4 ranks, and the second is
// Inner Flame's own base damage, which has the Q slot's 5. Both are true and they are two terms on
// two axes. It is reported — not because the page is inconsistent, but because a single per-ability
// rank count cannot express that row, which is a shape question for a person.
//
// Everything here is pure: it takes wikitext in and gives findings out. No network, no filesystem.

import type { AbilitySlot } from '../../src/types/data.ts';

// ---------------------------------------------------------------------------------------
// What a single page states
// ---------------------------------------------------------------------------------------

/** The ability whose rank this ability's values are indexed by, as the page itself states it. */
export interface RankAxisStatement {
  /** The ability named as the axis, e.g. "Aspect of the Cougar". */
  followsAbility: string;
  /** The champion that ability belongs to, as written in the same template call. */
  championNamed: string;
  /** The source sentence, so a reader can check the reading without re-fetching. */
  quote: string;
}

/** A count or a set of unlock levels the page states in words. */
export interface ProseRankStatement {
  /** "which has 4 ranks" → 4. */
  statedCount?: number;
  /** "can increase it at levels 6, 11, and 16" → [6, 11, 16]. The level-1 rank is added by
   *  `rankUnlockLevels` only when the same page also says the champion begins with one rank. */
  statedLevels?: number[];
  /** True when the page says the ability begins at rank 1 and is never ranked again. */
  cannotBeRanked?: boolean;
  /** True when the page says the champion starts the game holding this ability. */
  beginsWithOneRank?: boolean;
  quotes: string[];
}

/**
 * "''X'' scales with ''Y'' rank" — the leveling field's own header on an ability that does not
 * rank on its own.
 *
 * The shape is fixed enough to match strictly: an `{{ai|…}}` or `{{ais|…}}` template call carrying
 * the ability name and its champion, wrapped in wiki italics, followed by the word "rank". A
 * looser pattern would start matching the ordinary English sentence "damage scales with ability
 * rank", which says nothing about WHICH ability.
 *
 * WHAT THE STRICTNESS COSTS, measured rather than assumed: 6 other lines in the roster contain
 * "scales with" and "rank" and are not matched. Every one was read on 2026-08-15 and none is a
 * rank-axis statement about its own page — four are about a different champion's ability or about
 * range rather than rank, one is Varus R describing a per-stack term, and one is Yunara R stating
 * that two OTHER abilities follow it, which is the same fact written from the other end and is
 * reported by `ability-index.ts` rather than read here. See the test named for each.
 */
export function readRankAxisStatement(wikitext: string): RankAxisStatement | null {
  const match = wikitext.match(
    /scales?\s+with\s+''\{\{ais?\|([^|}]+)\|([^|}]+?)(?:\|[^}]*)?\}\}''\s*rank/i,
  );
  if (!match) return null;
  return {
    followsAbility: match[1].trim(),
    championNamed: match[2].trim(),
    quote: match[0].replace(/\s+/g, ' ').trim(),
  };
}

/**
 * Every explicit rank count written as a trailing integer inside an `{{ap|…}}` body.
 *
 * THE READING RULE, stated precisely because the loose version of it was wrong (see the header):
 * split the body on whitespace, find the LAST `to`, and require at least two tokens after it — the
 * interpolation's end value, and then the count. So:
 *
 *     {{ap|80 to 240}}            → nothing stated   (the ordinary two-value shape)
 *     {{ap|5 to 80 4}}            → 4
 *     {{ap|40+40 to 220+310 4}}   → 4                (arithmetic in the end value, still one token)
 *     {{ap|(5 to 80)*(1+(1 to 1.75)) 4}} → 4         (nested spans; the LAST `to` is the one)
 *     {{ap|40 to 85 4|99}}        → 4                (a further template argument follows)
 *     {{ap|675|675|775}}          → nothing stated   (an explicit per-rank list has no `to`)
 *
 * Returned as a SET of every distinct count the page states, not a single value, because a page
 * that states two different counts is a finding rather than a value to pick from.
 */
export function readStatedRankCounts(wikitext: string): number[] {
  const counts = new Set<number>();
  for (const block of wikitext.matchAll(/\{\{ap\|([^{}]*?)\}\}/g)) {
    const tokens = block[1].trim().split(/\s+/);
    const lastTo = tokens.lastIndexOf('to');
    if (lastTo < 0) continue;
    const after = tokens.slice(lastTo + 1);
    // One token after `to` is the end value alone: the ordinary `X to Y`, which states no count.
    if (after.length < 2) continue;
    // A further template argument may follow the count: `{{ap|40 to 85 4|99}}`.
    const last = after[after.length - 1].split('|')[0];
    if (!/^\d+$/.test(last)) continue;
    counts.add(Number(last));
  }
  return [...counts].sort((a, b) => a - b);
}

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
};

/**
 * The prose statements a page makes about how it ranks. Absent fields mean the page is silent.
 *
 * Each pattern below is here because a person read the sentence it matches. Widening one so it
 * stores more is the move CLAUDE.md forbids; adding a member means reading its sentence.
 */
export function readProseRankStatement(wikitext: string): ProseRankStatement {
  const quotes: string[] = [];
  const out: ProseRankStatement = { quotes };

  // Elise R: "'''Elise''' begins with one rank in ''Spider Form / Human Form'', which has 4 ranks."
  const count = wikitext.match(/which has (\w+) ranks/i);
  if (count) {
    const n = WORD_NUMBERS[count[1].toLowerCase()] ?? Number(count[1]);
    if (Number.isFinite(n)) {
      out.statedCount = n;
      quotes.push(count[0]);
    }
  }

  // Elise R and Nidalee R: "… and can increase it at levels 6, 11, and 16."
  const levels = wikitext.match(/can increase it at levels ([0-9,\sand]+)\./i);
  if (levels) {
    const found = [...levels[1].matchAll(/\d+/g)].map((m) => Number(m[0]));
    if (found.length > 0) {
      out.statedLevels = found;
      quotes.push(levels[0].trim());
    }
  }

  // Jayce R: "'''Jayce''' begins the game with ''Transform'' but cannot increase its rank."
  // The two halves are read separately because only Jayce writes them together, and the second
  // half on its own ("cannot increase its rank") is what says the ability has a single rank.
  const cannot = wikitext.match(/cannot increase its rank/i);
  if (cannot) {
    out.cannotBeRanked = true;
    quotes.push(cannot[0]);
  }

  // Karma R, Nidalee R, Elise R: "begins with one rank in ''Mantra''".
  // Jayce R: "begins the game with ''Transform'' but cannot increase its rank" — the same fact
  // without the words "one rank", which is why the second alternative exists.
  const begins =
    wikitext.match(/begins (?:the game )?with one rank/i) ??
    wikitext.match(/begins the game with ''[^']+'' but cannot increase its rank/i);
  if (begins) {
    out.beginsWithOneRank = true;
    quotes.push(begins[0]);
  }

  return out;
}

/**
 * The champion levels at which successive ranks of this ability become available, where the page
 * states enough to say so — otherwise null.
 *
 * The only combinations accepted are "begins with one rank" plus an explicit list of further levels
 * (exactly how Elise's and Nidalee's templates write it), and "begins with it but cannot increase
 * its rank" (Jayce's Transform), which is a one-entry schedule. A page giving a count but no levels
 * does NOT get a schedule invented for it from the count.
 */
export function rankUnlockLevels(prose: ProseRankStatement): number[] | null {
  if (prose.cannotBeRanked && prose.beginsWithOneRank) return [1];
  if (!prose.beginsWithOneRank || !prose.statedLevels) return null;
  return [1, ...prose.statedLevels];
}

// ---------------------------------------------------------------------------------------
// Deciding what may be stored
// ---------------------------------------------------------------------------------------

export interface AbilityPage {
  champion: string;
  slot: AbilitySlot;
  abilityName: string;
  revid: number;
  wikitext: string;
}

export type RankAxis =
  /** Ranks on its own, on the slot's own count. */
  | { kind: 'own'; ranks: number; statedBy: string }
  /** Indexed by another ability's rank; that ability's own count applies. */
  | { kind: 'follows'; ability: string; ranks: number | null; statedBy: string }
  /** Nothing in any source settles it. Never a default — a refusal. */
  | { kind: 'unstated'; why: string };

export interface RankShapeFinding {
  champion: string;
  slot: AbilitySlot;
  abilityName: string;
  revid: number;
  axis: RankAxis;
  /** Every count the page's own `{{ap|…}}` bodies state. */
  statedCounts: number[];
  /** Data Dragon's count for the SLOT this ability sits in. */
  slotMaxRank: number | null;
  /** Levels at which each rank unlocks, where a source states them. */
  unlockLevels: number[] | null;
  /** Findings a person must read. A count is never written on the strength of one. */
  reports: string[];
  quotes: string[];
}

/**
 * Read one page and decide what may be claimed about its rank shape.
 *
 * `resolveCount` looks up the rank count of another ability by name — it is how a `follows`
 * statement acquires a number without this module guessing one. It returns null for an ability
 * whose count is itself unknown, and a null count is carried through rather than filled in.
 */
export function readRankShape(
  page: AbilityPage,
  slotMaxRank: number | null,
  resolveCount: (abilityName: string) => number | null,
): RankShapeFinding {
  const axisStatement = readRankAxisStatement(page.wikitext);
  const prose = readProseRankStatement(page.wikitext);
  const statedCounts = readStatedRankCounts(page.wikitext);
  const quotes = [...prose.quotes];
  const reports: string[] = [];
  if (axisStatement) quotes.push(axisStatement.quote);

  const disagreeing = statedCounts.filter((n) => n !== slotMaxRank);

  let axis: RankAxis;
  if (axisStatement) {
    // (1) The strongest statement there is: the page names its own axis.
    const ranks = resolveCount(axisStatement.followsAbility);
    axis = {
      kind: 'follows',
      ability: axisStatement.followsAbility,
      ranks,
      statedBy: `the ability's own template: "${axisStatement.quote}"`,
    };
    if (ranks === null) {
      reports.push(
        `states that it follows "${axisStatement.followsAbility}" rank, and that ability's own ` +
          `rank count is not known here — so no count could be resolved`,
      );
    } else if (statedCounts.length > 0 && !statedCounts.includes(ranks)) {
      // The page names an axis AND states counts, none of which is that axis's count. Two
      // statements pointing different ways is exactly what must never be resolved silently.
      reports.push(
        `follows "${axisStatement.followsAbility}" (${ranks} ranks) while its own {{ap|…}} ` +
          `bodies state ${statedCounts.join(' and ')} — contested, and the followed ability's ` +
          `count was used because the sentence is the more explicit statement`,
      );
    }
    if (statedCounts.length > 1) {
      reports.push(
        `states more than one rank count (${statedCounts.join(' and ')}) in one leveling row, so ` +
          `the row mixes rank axes: a single rank count cannot express it`,
      );
    }
  } else if (prose.cannotBeRanked && prose.beginsWithOneRank) {
    axis = {
      kind: 'own',
      ranks: 1,
      statedBy: `the ability's own template: "${prose.quotes.join('; ')}"`,
    };
    if (slotMaxRank !== null && slotMaxRank !== 1) {
      reports.push(
        `its own template says it cannot be ranked while Data Dragon says ${slotMaxRank} for the ` +
          `slot`,
      );
    }
  } else if (prose.statedCount !== undefined) {
    // (3) A prose count is a statement about the whole ability, so it stands on its own.
    axis = {
      kind: 'own',
      ranks: prose.statedCount,
      statedBy: `the ability's own template prose: "${prose.quotes.join('; ')}"`,
    };
  } else if (slotMaxRank !== null && statedCounts.length === 1 && statedCounts[0] === slotMaxRank) {
    // (2) agreeing with Data Dragon — two sources, no conflict.
    axis = {
      kind: 'own',
      ranks: slotMaxRank,
      statedBy: `Data Dragon maxrank and the template's own {{ap|… ${slotMaxRank}}} suffix agree`,
    };
  } else if (slotMaxRank !== null && disagreeing.length === 0) {
    axis = { kind: 'own', ranks: slotMaxRank, statedBy: `Data Dragon maxrank for the slot` };
  } else if (slotMaxRank !== null) {
    // A lone suffix disagreeing with Data Dragon. THIS IS THE AURELION SOL CASE — reported, and
    // the slot's count is kept, because one derived display expression is not a rank count.
    axis = { kind: 'own', ranks: slotMaxRank, statedBy: `Data Dragon maxrank for the slot` };
    reports.push(
      `an {{ap|…}} body states a rank count of ${disagreeing.join('/')} while Data Dragon says ` +
        `${slotMaxRank} for the slot, and nothing corroborates the difference — kept at ` +
        `${slotMaxRank} and reported rather than changed`,
    );
  } else if (statedCounts.length > 0) {
    // No Data Dragon count at all (the passive slot). A statement with nothing to check it
    // against is not a rank count: Aphelios's passive states 6 and means six stat purchases.
    axis = { kind: 'unstated', why: 'no source consulted here states a rank count for this slot' };
    reports.push(
      `an {{ap|…}} body states a rank count of ${statedCounts.join('/')} and Data Dragon states ` +
        `none for this slot, so there is nothing to corroborate it against — reported, not stored`,
    );
  } else {
    axis = { kind: 'unstated', why: 'no source consulted here states a rank count for this slot' };
  }

  return {
    champion: page.champion,
    slot: page.slot,
    abilityName: page.abilityName,
    revid: page.revid,
    axis,
    statedCounts,
    slotMaxRank,
    unlockLevels: rankUnlockLevels(prose),
    reports,
    quotes,
  };
}

// ---------------------------------------------------------------------------------------
// Slots holding more than one ability
// ---------------------------------------------------------------------------------------

export type SlotShape =
  /** One ability. The ordinary case. */
  | { kind: 'single' }
  /** Several abilities, every one of them on the slot's own rank axis. Candidate for a FORM or a
   *  second cast — the source consulted here does not say which, so a person names it. */
  | { kind: 'several-own-rank'; abilities: string[] }
  /** Several abilities, at least one indexed by a DIFFERENT ability's rank. */
  | { kind: 'mixed-rank-axis'; abilities: string[]; followers: string[] };

/**
 * How a slot is shaped, from the findings of the pages in it.
 *
 * IT DELIBERATELY DOES NOT DECIDE WHAT A FORM IS. Elise's Q holds Neurotoxin and Venomous Bite —
 * two genuine forms. Lee Sin's Q holds Sonic Wave and Resonating Strike — one ability cast twice.
 * Both look identical here: two pages, one slot, same rank count. Telling them apart is reading,
 * not pattern-matching, so this reports the shape and leaves the naming to a person. Calling a
 * second cast a "form" would let a user pick a form that does not exist; calling a form a second
 * cast would hand a champion damage it cannot reach.
 */
export function classifySlot(findings: RankShapeFinding[]): SlotShape {
  if (findings.length <= 1) return { kind: 'single' };
  const abilities = findings.map((f) => f.abilityName);
  const followers = findings.filter((f) => f.axis.kind === 'follows').map((f) => f.abilityName);
  if (followers.length > 0) return { kind: 'mixed-rank-axis', abilities, followers };
  return { kind: 'several-own-rank', abilities };
}

/**
 * Whether a set of ability ranks can be paid for at all.
 *
 * 18 skill points exist, one per level (the wiki's Champion ability article; the Elixir of Skill's
 * extra point is not counted, since it is an item a scenario does not state).
 *
 * MEASURED over all 173 champions on 2026-08-15: exactly 7 champions have slot maximums summing
 * above 18 — Aphelios 21, Udyr 24, and Elise, Jayce, Karma, Nidalee and Yuumi at 19. They are the
 * same seven whose level curve computes nothing, and the two facts are connected: four of them
 * hold an ability from level 1 without paying for it (Elise, Karma and Nidalee's ultimates, Jayce's
 * Transform, Yuumi's You and Me!), so their real cost is 18. Udyr's 24 is NOT of that kind — he
 * simply cannot max all four, which is a true fact about him rather than a data defect.
 */
export const SKILL_POINTS_AT_18 = 18;

export function maxedBuildCost(maxRanks: Partial<Record<AbilitySlot, number>>): number {
  return (['Q', 'W', 'E', 'R'] as AbilitySlot[]).reduce(
    (total, slot) => total + (maxRanks[slot] ?? 0),
    0,
  );
}
