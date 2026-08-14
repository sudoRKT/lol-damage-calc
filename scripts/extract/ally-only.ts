// EFFECTS THAT PROTECT ONLY SOMEONE ELSE, and therefore are not the defender's at all.
//
// ═══ THE DECISION ═══
//
// The defender model is ONE champion (SPECIFICATION §5: the defender is modelled in full, and a
// scenario has one of them). An effect that only ever protects an ALLY is not a defensive entry
// for its owner: storing it grants a defender protection they never receive, which is a
// plausible wrong number in the direction that matters most — it makes a combo look survivable
// when it is not.
//
// Decided 2026-08-14. Braum W had already been handled this way locally, by dropping its "Ally
// Bonus Armor" rows and keeping its "Self" ones; this is the same rule applied to the whole
// population instead of to the one entry that surfaced it.
//
// ═══ WHY THIS IS A READ LIST AND NOT A PATTERN ═══
//
// **A WORD SEARCH DOES NOT FIND THESE.** Sweeping all 161 proposed entries for "ally" or "allied"
// found 12 — and MISSED SHEN R, the case that prompted the decision, whose stored condition reads
// only "Active channel; scales with target's missing health". The word that decides it is in the
// source's own sentence ("granting the target allied champion a shield"), not in anything the
// entry carries.
//
// So each member below was found by reading the ability's own description on its wiki page, and
// the sentence it rests on is quoted. This is CLAUDE.md's rule: a detector proposes, a person
// confirms, and storage is gated on the confirmed population. **Adding a member means reading its
// sentence, not widening a pattern.**
//
// ═══ WHERE AN EFFECT PROTECTS BOTH, THE SELF PORTION STAYS ═══
//
// Only effects that NEVER protect the owner are listed. Kayle R ("grants herself or a target
// allied champion"), Milio E ("envelops himself or the target allied champion"), Senna Q ("Senna
// and allied champions hit"), K'Sante E and Braum W all protect the owner too and are kept.
//
// Milio W is the one worth recording as a near miss: its heal reads "Allied champions near the
// fuemigo", which looks ally-only until the page's own footnote settles it — ***"Milio counts as
// an allied champion."*** The source states it outright, so it is kept, and it is kept because a
// source says so rather than because it looked likely.

/** One ability that protects nobody but an ally, with the sentence that establishes it. */
export interface AllyOnlyEffect {
  champion: string;
  slot: 'P' | 'Q' | 'W' | 'E' | 'R';
  /** Restricts the removal to one kind where an ability grants several. Absent means every kind
   *  on that ability — used only where the whole ability protects nobody but an ally. */
  kind?: string;
  /** The source's own words. Quoted so the judgement is checkable without re-reading the page. */
  sourceSays: string;
  why: string;
}

export const ALLY_ONLY: readonly AllyOnlyEffect[] = [
  {
    champion: 'Shen',
    slot: 'R',
    kind: 'shield',
    sourceSays:
      'granting the target allied champion a shield for 5 seconds at the time of cast, increased ' +
      "by the target's missing health",
    why:
      'the shield is placed on the ally Shen channels toward; Shen himself only travels to them ' +
      'afterwards and receives nothing. THE CASE THAT PROMPTED THIS RULE — and a word search over ' +
      'the stored entry finds nothing, because its condition says only "scales with target\'s ' +
      'missing health".',
  },
  {
    champion: 'Kalista',
    slot: 'R',
    kind: 'immunity',
    sourceSays: 'the Oathsworn is untargetable and may select a target location',
    why:
      'Fate\'s Call makes the OATHSWORN ally invulnerable and untargetable. Kalista is the caster ' +
      'and gains nothing defensive.',
  },
  {
    champion: 'Tahm Kench',
    slot: 'R',
    kind: 'shield',
    sourceSays: 'If the target is an ally, they are granted a shield that lasts a short time',
    why:
      'the shield is conditional on the devoured champion being an ally, and it is granted to ' +
      'THEM. Tahm Kench receives none of it.',
  },
  {
    champion: 'Taric',
    slot: 'W',
    kind: 'shield',
    sourceSays:
      'Taric gains armor and forms a tether to the ally bound by Bastion. While the tether ' +
      'persists, the ally gains the shield',
    why:
      'Bastion splits across two recipients and the source separates them in one sentence: the ' +
      'ARMOR is Taric\'s and stays, the shield is the ally\'s and goes. This is the "protects ' +
      'both" case resolved by keeping only the self portion.',
  },
];

/**
 * Effects a person could NOT settle from the source, and which are therefore not stored either.
 *
 * Not the same thing as ally-only, and kept in its own list so nobody reads a refusal as a
 * finding. These are revisitable: SPECIFICATION §8's PENDING, where ally-only is a decided fact.
 */
export const RECIPIENT_NOT_READ: readonly AllyOnlyEffect[] = [
  {
    champion: 'Yuumi',
    slot: 'R',
    kind: 'heal',
    sourceSays:
      'Allied champions hit by the waves are healed, with each heal instance beyond maximum ' +
      'health being converted into a shield',
    why:
      'Yuumi channels at the origin and launches the waves outward, and the source never says ' +
      'whether she is among the "allied champions hit". Milio W settles the identical question ' +
      'with an explicit footnote and this page carries none. NOT GUESSED IN EITHER DIRECTION: ' +
      'storing it would grant a defender protection that may never arrive, and dropping it ' +
      'silently would remove protection that may be real, so it is dropped WITH THIS REASON and ' +
      'someone can settle it by reading the ability in the game.',
  },
];

const key = (champion: string, slot: string, kind: string): string => `${champion}|${slot}|${kind}`;

const ALLY_ONLY_KEYS = new Set(
  ALLY_ONLY.flatMap((e) => (e.kind ? [key(e.champion, e.slot, e.kind)] : [])),
);
const ALLY_ONLY_ABILITIES = new Set(
  ALLY_ONLY.filter((e) => !e.kind).map((e) => `${e.champion}|${e.slot}`),
);
const NOT_READ_KEYS = new Set(
  RECIPIENT_NOT_READ.flatMap((e) => (e.kind ? [key(e.champion, e.slot, e.kind)] : [])),
);

/** Why this (champion, slot, kind) is not the defender's, or null if it is. */
export function recipientRefusal(
  champion: string,
  slot: string,
  kind: string,
): { reason: 'ally-only' | 'recipient-not-read'; detail: AllyOnlyEffect } | null {
  if (ALLY_ONLY_KEYS.has(key(champion, slot, kind)) || ALLY_ONLY_ABILITIES.has(`${champion}|${slot}`)) {
    const detail = ALLY_ONLY.find(
      (e) => e.champion === champion && e.slot === slot && (!e.kind || e.kind === kind),
    )!;
    return { reason: 'ally-only', detail };
  }
  if (NOT_READ_KEYS.has(key(champion, slot, kind))) {
    const detail = RECIPIENT_NOT_READ.find(
      (e) => e.champion === champion && e.slot === slot && e.kind === kind,
    )!;
    return { reason: 'recipient-not-read', detail };
  }
  return null;
}
