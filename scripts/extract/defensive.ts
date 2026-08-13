// Detecting DEFENSIVE kit effects — effects that change the damage a champion RECEIVES.
//
// WHY THIS EXISTS. SPECIFICATION §5 requires the defender modelled in full and divides defensive
// kit effects by activation condition: always-active effects are baked into the resolved stat
// block, conditional effects are exposed as toggles. Nothing in this repository had ever measured
// how many such effects exist, so nobody knew how many toggles the interface owes the user.
//
// WHAT THIS FILE IS, AND WHAT IT IS NOT. It is a DETECTOR. It proposes candidates and records the
// evidence for each. It decides nothing. The project rule (CLAUDE.md) is that a detector proposes
// and a person confirms, and it is written into this project the expensive way: the variable-hit
// detector fired on 24 entries where a person reading the sentences found 17, and mis-shaped one
// of those. So every figure this file produces is a CANDIDATE figure, and the confirmed population
// is a separate, hand-read set recorded in `defensive-confirmed.ts`.
//
// THE TRAP THIS FILE IS BUILT AROUND. An effect that reduces the damage an ability DEALS reads
// almost identically to one that reduces the damage its owner TAKES:
//
//     "deals 50% reduced damage to targets beyond the first"   <- dealt. NOT ours.
//     "takes 50% reduced damage from the next instance"        <- received. Ours.
//
// Both are "50% reduced damage". Only the verb and its subject separate them, and the wiki writes
// both in the same sentence shape. The detector therefore never classifies on the words "reduced
// damage" alone: it records which side-marker it saw, and a sentence carrying a dealt-side marker
// is emitted as a candidate with that marker attached so the reader sees it.

import { parseFields, statRows } from './wikitext.ts';

/**
 * Flatten wikitext to the words a reader would see.
 *
 * WHY NOT `plainText` FROM wikitext.ts. That helper DELETES `{{…}}` blocks outright, which is
 * right for a leveling label and catastrophic here: the wiki wraps almost every game term in
 * `{{tip|…}}`, so `{{tip|shield}}`, `{{tip|invulnerable}}` and `{{tip|untargetable}}` all vanish
 * before any pattern can see them. Measured: with `plainText`, the immunity rules fired on 1 page
 * of 937 while `{{tip|untargetable}}` alone appears on 41. A detector that silently loses its
 * evidence is the failure this project keeps paying for, so this one UNWRAPS instead.
 *
 * Every template becomes its arguments joined by a space, innermost first, with `key=` prefixes
 * dropped. That deliberately errs toward saying too much: an over-firing candidate is read and
 * rejected by a person, an under-firing one is never seen at all.
 */
export function flatten(s: string): string {
  let out = s;
  for (let pass = 0; pass < 12; pass += 1) {
    const next = out.replace(/\{\{([^{}]*)\}\}/g, (_m, inner: string) => {
      const parts = String(inner).split('|');
      return parts
        .slice(1)
        .map((a) => a.replace(/^\s*[A-Za-z_][\w -]*\s*=\s*/, '').trim())
        .filter(Boolean)
        .join(' ');
    });
    if (next === out) break;
    out = next;
  }
  return out
    .replace(/\[\[(?:[^\]|]*\|)?([^\]|]*)\]\]/g, '$1')
    .replace(/'''|''/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The kinds of defensive effect the census counts, each with the definition it is counted by. */
export const KINDS = {
  'damage-reduction':
    'the champion, or an ally, takes a stated flat or percentage less damage from incoming ' +
    'instances. Not a reduction of the damage this ability deals.',
  'type-specific-reduction':
    'the same, but stated as applying only to physical, magic or true damage. Kept separate ' +
    'because SPECIFICATION §5 names innate damage-type reductions explicitly.',
  'resistance-grant':
    'a grant of armor or magic resistance to the champion or an ally, flat or percentage.',
  shield:
    'an absorbing shield — a pool of hit points that soaks damage before health does. Includes ' +
    'health, magic-only and physical-only shields.',
  'spell-shield':
    'a shield that negates the next hostile ability outright rather than absorbing an amount.',
  immunity:
    'damage cannot be taken at all: invulnerability, stasis, untargetability, or a stated ' +
    'immunity to a damage source.',
  'execute-threshold':
    'the health at which the champion dies is changed: a minimum-health floor, a death ' +
    'prevention, or a revive.',
  heal:
    'health restored to the champion or an ally, or life steal / omnivamp granted by the ' +
    'ability, which offsets damage already taken within the sequence.',
  'health-grant':
    'bonus maximum health granted by the kit. Not a change to damage received, but it changes ' +
    'the survival verdict, and SPECIFICATION §5 names kit-scaled maximum health. Counted and ' +
    'reported SEPARATELY so it can be included or excluded on sight.',
  'attacker-debuff':
    "the enemy's own damage output is reduced (attack damage lowered, 'deals less damage'). " +
    'This lowers damage received indirectly and is NOT in the task definition. Counted and ' +
    'reported SEPARATELY, never folded into the main figure.',
} as const;

export type Kind = keyof typeof KINDS;

export interface Signal {
  kind: Kind;
  /** The template field the evidence was found in. */
  field: string;
  /** The sentence, flattened to readable text. This is what a person reads to confirm. */
  sentence: string;
  /** The literal pattern fragment that fired, so an over-firing rule can be identified. */
  matched: string;
  /**
   * True when a DEALT-side marker sits in the same sentence. The detector does not drop these —
   * it flags them, because the reader must decide which verb governs.
   */
  dealtSideMarker: string | null;
}

export interface PageSignals {
  key: string;
  champion: string;
  slot: string;
  abilityName: string;
  signals: Signal[];
  /** `{{st|Label|value}}` rows whose label names a defensive effect — the structural value route. */
  statRows: Array<{ label: string; value: string; kind: Kind }>;
  /** Which description fields open with an Active / Passive marker. Structural activation cue. */
  activationMarkers: Record<string, 'active' | 'passive' | null>;
  /** Whether the template declares a cooldown or a cost — an ability you press. */
  hasCooldown: boolean;
  hasCost: boolean;
  affects: string;
}

const DESC_FIELD = /^description\d*$/;

/**
 * Words that mark the DEALT side of a damage sentence. Their presence does not disqualify a
 * candidate; it is recorded so the person reading it knows what to weigh.
 *
 * The wording pairs that make this necessary are recorded in DATA-SOURCES §34.2 and in the brief
 * for this area: "reduced to 50% against those hit by subsequent waves" is a later hit on the
 * SAME champion, "reduced to 50% against targets beyond the first" is a DIFFERENT champion.
 */
const DEALT_MARKERS = [
  /deals?\s+(?:\d+%\s+)?(?:reduced|increased|less|more)\s+damage/i,
  /damage\s+(?:is\s+)?(?:reduced|increased)\s+(?:to|by)\s+[\d{]/i,
  /(?:against|to)\s+(?:secondary|subsequent|non-champion|minions?|monsters?|structures?|turrets?)/i,
  /beyond the first/i,
  /deals?\s+\d+%\s+damage\s+to/i,
];

interface Rule {
  kind: Kind;
  re: RegExp;
}

/**
 * The prose rules. Every one is deliberately RECEIVED-side: the subject of the verb must be the
 * thing taking the damage, or the effect must be a named defensive object (a shield, a heal).
 *
 * These WILL over-fire. That is expected and is why the output is called a candidate.
 */
const RULES: Rule[] = [
  // --- damage reduction, received side ---
  { kind: 'damage-reduction', re: /damage\s+(?:he|she|they|it|him|her|them)?\s*takes?/i },
  { kind: 'damage-reduction', re: /damage\s+taken/i },
  { kind: 'damage-reduction', re: /incoming damage/i },
  { kind: 'damage-reduction', re: /takes?\s+[^.]{0,40}?(?:reduced|less)\s+damage/i },
  { kind: 'damage-reduction', re: /reduc\w*\s+(?:the\s+)?damage\s+[^.]{0,30}?(?:receiv|suffer|sustain)/i },
  { kind: 'damage-reduction', re: /damage\s+(?:received|suffered|sustained)/i },
  { kind: 'damage-reduction', re: /damage reduction/i },
  { kind: 'damage-reduction', re: /mitigat\w+/i },
  { kind: 'damage-reduction', re: /absorb\w*\s+[^.]{0,30}damage/i },
  { kind: 'damage-reduction', re: /negat\w+\s+[^.]{0,40}damage/i },
  { kind: 'damage-reduction', re: /block\w*\s+[^.]{0,40}damage/i },
  { kind: 'damage-reduction', re: /durability/i },
  // --- damage-type-specific ---
  { kind: 'type-specific-reduction', re: /(?:physical|magic|true)\s+damage\s+(?:taken|received)/i },
  { kind: 'type-specific-reduction', re: /reduc\w*[^.]{0,40}(?:physical|magic|true)\s+damage\s+(?:taken|from)/i },
  // --- resistances ---
  { kind: 'resistance-grant', re: /\bgains?\b[^.]{0,80}?\barmor\b/i },
  { kind: 'resistance-grant', re: /\bgains?\b[^.]{0,80}?magic resistance/i },
  { kind: 'resistance-grant', re: /\bgrants?\b[^.]{0,80}?(?:armor|magic resistance|resistances)/i },
  { kind: 'resistance-grant', re: /bonus (?:armor|magic resistance|resistances)/i },
  { kind: 'resistance-grant', re: /\bresistances\b/i },
  // --- shields ---
  { kind: 'shield', re: /\bshield(?:s|ed|ing)?\b/i },
  { kind: 'shield', re: /\bbarrier\b/i },
  // --- spell shield ---
  { kind: 'spell-shield', re: /spell\s*shield/i },
  { kind: 'spell-shield', re: /block\w*\s+(?:the\s+)?next\s+[^.]{0,30}(?:ability|abilities|spell)/i },
  // --- immunity ---
  { kind: 'immunity', re: /invulnerab\w+/i },
  { kind: 'immunity', re: /\bstasis\b/i },
  { kind: 'immunity', re: /untargetab\w+/i },
  { kind: 'immunity', re: /immune to[^.]{0,40}damage/i },
  // --- execute threshold / death prevention ---
  { kind: 'execute-threshold', re: /minimum health/i },
  { kind: 'execute-threshold', re: /cannot (?:die|be reduced below)/i },
  { kind: 'execute-threshold', re: /(?:revive|resurrect)\w*/i },
  { kind: 'execute-threshold', re: /lethal damage/i },
  { kind: 'execute-threshold', re: /(?:survives?|prevent\w*)[^.]{0,30}death/i },
  { kind: 'execute-threshold', re: /\bexecute\w*\s+threshold/i },
  // --- heals and vamp ---
  { kind: 'heal', re: /\bheals?\b/i },
  { kind: 'heal', re: /\bhealing\b/i },
  { kind: 'heal', re: /restor\w+[^.]{0,30}health/i },
  { kind: 'heal', re: /life\s?steal/i },
  { kind: 'heal', re: /omnivamp/i },
  { kind: 'heal', re: /health regeneration/i },
  // --- max health ---
  { kind: 'health-grant', re: /\bgains?\b[^.]{0,60}?bonus health/i },
  { kind: 'health-grant', re: /\bbonus (?:maximum )?health\b(?![^.]{0,20}(?:damage|of the target))/i },
  // --- attacker debuff (reported separately) ---
  { kind: 'attacker-debuff', re: /(?:reduc\w+|lower\w+)[^.]{0,40}attack damage/i },
  { kind: 'attacker-debuff', re: /deal\w*\s+\d+%\s+less damage/i },
  { kind: 'attacker-debuff', re: /attack damage reduction/i },
];

/** The `{{st|…}}` labels that name a defensive effect, and the kind each one names. */
export const DEFENSIVE_STAT_LABELS: Array<{ re: RegExp; kind: Kind }> = [
  { re: /^(?:maximum |minimum |total |empowered |magic |physical )*shield(?: strength)?$/i, kind: 'shield' },
  { re: /shield strength$/i, kind: 'shield' },
  { re: /^(?:physical |magic |true )?damage reduction$/i, kind: 'damage-reduction' },
  { re: /^(?:bonus )?(?:armor|magic resistance|resistances)$/i, kind: 'resistance-grant' },
  { re: /^(?:ally|self) bonus (?:armor|magic resistance)$/i, kind: 'resistance-grant' },
  { re: /^bonus health$/i, kind: 'health-grant' },
  { re: /^(?:maximum |minimum |total |increased )*heal(?:ing)?(?: per tick| percentage)?$/i, kind: 'heal' },
  { re: /^(?:champion |non-champion )heal(?:ing)?$/i, kind: 'heal' },
  { re: /^life steal$/i, kind: 'heal' },
  { re: /^attack damage reduction$/i, kind: 'attacker-debuff' },
  { re: /^(?:armor|magic resistance|resistances) reduction$/i, kind: 'attacker-debuff' },
];

function sentencesOf(text: string): string[] {
  // Split on sentence enders and on list-item boundaries. Kept crude on purpose: a sentence is
  // only the unit a person reads, never the unit a decision is made from.
  return flatten(text)
    .split(/(?<=[.:;])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function scanPage(page: {
  champion: string;
  slot: string;
  abilityName: string;
  wikitext: string;
}): PageSignals {
  const f = parseFields(page.wikitext);
  const signals: Signal[] = [];
  const activationMarkers: Record<string, 'active' | 'passive' | null> = {};

  for (const [field, raw] of Object.entries(f)) {
    if (!DESC_FIELD.test(field)) continue;
    const opener = /\{\{sbc\|(Active|Passive|Innate|Toggle)/i.exec(raw);
    activationMarkers[field] = opener
      ? /active|toggle/i.test(opener[1]!)
        ? 'active'
        : 'passive'
      : null;
    for (const sentence of sentencesOf(raw)) {
      const dealt = DEALT_MARKERS.map((d) => d.exec(sentence)?.[0] ?? null).find((x) => x) ?? null;
      const seen = new Set<Kind>();
      for (const rule of RULES) {
        const m = rule.re.exec(sentence);
        if (!m) continue;
        if (seen.has(rule.kind)) continue;
        seen.add(rule.kind);
        signals.push({
          kind: rule.kind,
          field,
          sentence,
          matched: m[0],
          dealtSideMarker: dealt,
        });
      }
    }
  }

  const rows: PageSignals['statRows'] = [];
  for (const r of statRows(f)) {
    for (const l of DEFENSIVE_STAT_LABELS) {
      if (l.re.test(r.label.trim())) {
        rows.push({ label: r.label.trim(), value: r.value.trim(), kind: l.kind });
        break;
      }
    }
  }

  return {
    key: `${page.champion}/${page.slot}/${page.abilityName}`,
    champion: page.champion,
    slot: page.slot,
    abilityName: page.abilityName,
    signals,
    statRows: rows,
    activationMarkers,
    hasCooldown: Boolean(f['cooldown']?.trim()),
    hasCost: Boolean(f['cost']?.trim()),
    affects: (f['affects'] ?? '').trim(),
  };
}
