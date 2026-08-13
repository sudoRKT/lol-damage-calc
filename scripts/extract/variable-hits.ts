// DETECTING A VARIABLE HIT COUNT, and deriving its rate and ceiling FROM THE SOURCE'S OWN NUMBERS.
//
// Some abilities have no fixed hit count (DATA-SOURCES §38). The count is a property of the
// situation, so it comes from the scenario. But the RATE a repeat deals and the CEILING on how
// many can land are both stated by the source, and neither has to be guessed:
//
//   Ziggs E:  full 30, "Reduced Damage per Mine" 12          -> rate = 12/30 = 0.4
//             "Maximum Total Magic Damage" 150               -> (150/30 - 1) / 0.4 = 10 additional
//
// That is arithmetic on three numbers the wiki prints, not an inference about the game. If any of
// the three is missing or the division does not land on a whole number, NOTHING is stored and the
// entry says why — the same rule as everywhere else: a row that cannot be read in full is not
// stored in part.
//
// THE PROSE DECIDES WHETHER IT APPLIES AT ALL, because two nearly identical wordings mean opposite
// things. "reduced to 50% against those hit by subsequent WAVES" is a later hit on the same
// champion. "reduced to 50% against TARGETS beyond the first" is a different champion. Only the
// first is a variable hit count. Getting this wrong put Xayah Q in the wrong class for a day.

import type { VariableHitCount } from '../../src/types/data.ts';

/**
 * THE POPULATION A PERSON ACTUALLY READ, and the only entries a shape may be STORED on.
 *
 * The prose test below is a good detector and a poor certifier. Run over all 937 pages it fires on
 * 24 entries where a person reading the sentences found 17, and it mis-shaped one of them — it put
 * Gwen R and Teemo R in, which are not repeats against the same champion, and read Swain Q as
 * "every instance full" when its own prose says the repeats are reduced. A 20% false-store rate on
 * a field that multiplies damage is not shippable.
 *
 * So detection and storage are separated, the same way gate 5 is a detector and not a certifier.
 * An entry OUTSIDE this list that trips the prose test is REPORTED for a person to read, never
 * stored. An entry inside it still has to derive its rate and ceiling from the source's own
 * printed numbers, and is still refused if they do not divide.
 *
 * Established 2026-08-13 by reading 48 candidate sentences (DATA-SOURCES §38.2). Each member is
 * here because its source says one champion can be damaged more than once by a single cast.
 * ADDING A MEMBER MEANS READING ITS SENTENCE — not widening the regular expression.
 */
export const READ_POPULATION = new Set([
  'Aurora/Q', 'Gnar/Q', 'Heimerdinger/W', 'Jhin/E', "Kai'Sa/Q", 'Kled/Q', 'Lulu/Q',
  'Master Yi/Q', 'Nautilus/E', 'Shyvana/E', 'Smolder/W', 'Swain/Q', 'Taliyah/Q',
  'Xayah/Q', 'Yuumi/R', 'Zac/R', 'Ziggs/E',
]);

/** Is this entry one a person has read and confirmed? `champion/slot`. */
export function inReadPopulation(champion: string, slot: string): boolean {
  return READ_POPULATION.has(`${champion}/${slot}`);
}

/** A later hit on a champion ALREADY HIT by the same cast. */
const SAME_TARGET_REPEAT =
  /\b(subsequent|further|repeat(ed)?)\s+(wave|mine|hit|explosion|cast|tick|bolt|missile|rocket|blade|strike|attack|dagger|feather|bounce|shuriken|pellet|trap)s?\b|\b(wave|mine|rocket|bolt|missile|pellet|bounce|explosion|dagger|feather)s?\s+beyond (the|their) first\b|\bhit by subsequent\b|\bagainst the same target\b|\bthose (already )?hit\b|\bcan be hit by multiple\b|\bthe same enemies again\b|\bfrom a second\b/i;

/** A DIFFERENT champion, not a later hit. Never a variable hit count. */
const SECONDARY_TARGET =
  /\btargets? (hit )?(after|beyond) the (first|closest|primary)\b|\benemies beyond the (first|closest)\b|\bsecondary targets?\b|\badditional enemies\b/i;

/** A stack or buff timer refreshing is not a damage instance. 42 of 75 raw matches were this. */
const STACK_REFRESH = /refresh(ing|es|ed)?\s+(on|with)\s+subsequent/i;

/** Does the prose state that ONE champion can be damaged more than once by a single cast? */
export function statesSameTargetRepeat(prose: string): { yes: boolean; sentence: string } {
  for (const sentence of prose.split(/(?<=\.)\s+/)) {
    if (STACK_REFRESH.test(sentence)) continue;
    if (SECONDARY_TARGET.test(sentence) && !SAME_TARGET_REPEAT.test(sentence)) continue;
    if (SAME_TARGET_REPEAT.test(sentence)) {
      return { yes: true, sentence: sentence.replace(/\s+/g, ' ').trim().slice(0, 220) };
    }
  }
  return { yes: false, sentence: '' };
}

export interface VariableHitDerivation {
  shape?: VariableHitCount;
  /** Why nothing was derived, when nothing was. Reported as an issue, never silent. */
  refusedBecause?: string;
}

/**
 * Derive the shape from the source's own three numbers, at rank 1.
 *
 * @param fullAtRank1     the full per-instance value
 * @param reducedAtRank1  the reduced per-instance value, or undefined when the source states none
 * @param totalAtRank1    the whole-ability total the source prints, or undefined
 * @param sentence        the prose sentence the detection rests on, for the record
 */
/**
 * A repeat that deals MORE than the first, which neither shape can express.
 *
 * Swain Q: "Subsequent bolts against an enemy deal bonus magic damage." The repeats are not the
 * same as the first and not a fraction of it — they are larger. Shape B would store them as equal
 * and understate the ability; shape A cannot hold a rate above 1 by construction. A third shape
 * may be justified if the population grows, but inventing one from a single case is the guess this
 * project refuses, so the entry is refused instead.
 */
const REPEAT_DEALS_MORE = /\b(bonus|increased|additional|more|amplified|empowered)\b[^.]{0,30}\bdamage\b/i;

export function deriveVariableHits(
  fullAtRank1: number,
  reducedAtRank1: number | undefined,
  totalAtRank1: number | undefined,
  sentence: string,
): VariableHitDerivation {
  if (REPEAT_DEALS_MORE.test(sentence)) {
    return {
      refusedBecause:
        'the source says the repeats deal MORE than the first instance, which neither shape can ' +
        'express — a rate above 1 is not a reduction, and treating them as equal understates it',
    };
  }
  if (!(fullAtRank1 > 0)) return { refusedBecause: 'the full per-instance value is zero or absent' };
  if (totalAtRank1 === undefined || !(totalAtRank1 > 0)) {
    return {
      refusedBecause:
        'the source states repeats but prints no whole-ability total, so the ceiling on how many ' +
        'can land is not stated anywhere and must not be invented',
    };
  }

  // SHAPE B: no reduced value stated, so every instance is full and the total is N x full.
  if (reducedAtRank1 === undefined) {
    const n = totalAtRank1 / fullAtRank1;
    const whole = Math.round(n);
    if (whole < 2 || Math.abs(n - whole) > 0.02) {
      return {
        refusedBecause: `the stated total is ${n.toFixed(3)}x the per-instance value, which is not a whole number of instances`,
      };
    }
    return {
      shape: { kind: 'repeatsAtFullRate', maxInstances: whole, sourceSays: sentence },
    };
  }

  // SHAPE A: rate is the printed ratio; the ceiling falls out of the printed total.
  const rate = reducedAtRank1 / fullAtRank1;
  if (!(rate > 0) || rate >= 1) {
    return { refusedBecause: `the reduced value is not a fraction of the full value (ratio ${rate.toFixed(3)})` };
  }
  const additional = (totalAtRank1 / fullAtRank1 - 1) / rate;
  const whole = Math.round(additional);
  if (whole < 1 || Math.abs(additional - whole) > 0.02) {
    return {
      refusedBecause:
        `the stated total implies ${additional.toFixed(3)} additional instances at ${Math.round(rate * 100)}%, ` +
        `which is not a whole number — the three printed values do not describe one first hit plus N repeats`,
    };
  }
  return {
    shape: {
      kind: 'repeatsAtReducedRate',
      // Round the rate to the precision the wiki prints, so 0.39999 does not travel.
      rate: Math.round(rate * 1000) / 1000,
      maxAdditional: whole,
      sourceSays: sentence,
    },
  };
}
