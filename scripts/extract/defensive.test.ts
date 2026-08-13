// Known-answer tests for the defensive-effect detector and the census's own counting rules.
//
// Every fixture below is real wikitext, quoted from the page it names, so a test that passes is
// evidence about the source rather than about the code's opinion of itself.

import { describe, expect, it } from 'vitest';

import { flatten, scanPage, type Kind } from './defensive.ts';
import { CONFIRMED, REJECTED } from './defensive-confirmed.ts';

const page = (champion: string, slot: string, abilityName: string, wikitext: string) =>
  scanPage({ champion, slot, abilityName, wikitext });

const kindsOf = (s: ReturnType<typeof scanPage>): Set<Kind> =>
  new Set([...s.signals.map((x) => x.kind), ...s.statRows.map((r) => r.kind)]);

describe('flatten', () => {
  // THE DEFECT THIS GUARDS. wikitext.ts's plainText() deletes {{…}} blocks entirely. The wiki
  // wraps almost every game term in {{tip|…}}, so a detector built on plainText cannot see
  // "shield", "untargetable" or "invulnerable" at all. Measured on the real roster: the immunity
  // rules fired on 1 page of 937 with plainText and on 54 with this flattener.
  it('unwraps a tip to its words instead of deleting it', () => {
    expect(flatten('gains a {{tip|spell shield}} for 1.5 seconds')).toBe(
      'gains a spell shield for 1.5 seconds',
    );
  });

  it('unwraps nested templates innermost first', () => {
    expect(flatten('{{as|{{ap|55 to 75}}%}}')).toBe('55 to 75%');
  });

  it('drops a named argument key but keeps its value', () => {
    expect(flatten('{{st|Damage Reduction|value = 40%}}')).toBe('Damage Reduction 40%');
  });
});

describe('the received-side / dealt-side distinction', () => {
  // Xayah Q, quoted. This is THE trap: it reads exactly like a defensive reduction and is its
  // opposite. The detector is allowed to propose it; the confirmed population must not contain it.
  const xayah = page(
    'Xayah',
    'Q',
    'Double Daggers',
    '|description = Targets hit after the first take 50% reduced damage.',
  );

  it('proposes the dealt-side sentence as a candidate', () => {
    expect(kindsOf(xayah).has('damage-reduction')).toBe(true);
  });

  it('is recorded as REJECTED, not confirmed', () => {
    expect(CONFIRMED.some((c) => c.key === 'Xayah/Q/Double Daggers')).toBe(false);
    const r = REJECTED.find((x) => x.key === 'Xayah/Q/Double Daggers');
    expect(r?.rejectedAs).toBe('dealt-side-reduction');
  });

  it('confirms the received-side sentence that reads almost the same', () => {
    // Jax E, quoted.
    const jax = page(
      'Jax',
      'E',
      'Counter Strike',
      '|description = a defensive stance that causes him to dodge all incoming non-turret basic ' +
        'attacks and take 25% reduced damage from all {{tip|area of effect}} abilities sourced ' +
        'from {{tip|champions}}.',
    );
    expect(kindsOf(jax).has('damage-reduction')).toBe(true);
    expect(CONFIRMED.some((c) => c.key === 'Jax/E/Counter Strike')).toBe(true);
  });
});

describe('structural value route', () => {
  it('reads a Damage Reduction leveling row', () => {
    // Alistar R, quoted.
    const alistar = page(
      'Alistar',
      'R',
      'Unbreakable Will',
      "|description  = {{sbc|Active:}} '''Alistar''' reduces incoming damage taken.\n" +
        '|leveling     = {{st|Damage Reduction|{{ap|55 to 75}}%}}\n',
    );
    expect(alistar.statRows).toEqual([
      { label: 'Damage Reduction', value: '{{ap|55 to 75}}%', kind: 'damage-reduction' },
    ]);
  });

  it('reads a Shield Strength leveling row', () => {
    const annie = page(
      'Annie',
      'E',
      'Molten Shield',
      '|leveling = {{st|Shield Strength|{{ap|60 to 200}} {{as|(+ 40% AP)}}}}\n',
    );
    expect(annie.statRows[0]?.kind).toBe('shield');
  });

  it('records the Active / Passive opener as the activation cue', () => {
    const p = page(
      'Braum',
      'E',
      'Unbreakable',
      '|description  = {{sbc|Active:}} sets his shield.\n|description2 = While raised, he gains speed.\n',
    );
    expect(p.activationMarkers['description']).toBe('active');
    expect(p.activationMarkers['description2']).toBe(null);
  });
});

describe('the confirmed population', () => {
  it('has no duplicate keys', () => {
    const keys = CONFIRMED.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every confirmed effect at least one kind and a stated activation', () => {
    for (const c of CONFIRMED) {
      expect(c.kinds.length, c.key).toBeGreaterThan(0);
      expect(['always-active', 'conditional', 'not-stated'], c.key).toContain(c.activation);
      expect(c.activationEvidence.length, c.key).toBeGreaterThan(0);
    }
  });

  // SPECIFICATION §5 splits activation two ways. This project splits it THREE ways on purpose:
  // an effect whose activation the source does not settle is not a coin toss.
  it('keeps a not-stated bucket rather than forcing every effect into the §5 two-way split', () => {
    expect(CONFIRMED.some((c) => c.activation === 'not-stated')).toBe(true);
  });

  it('gives every rejection a named class', () => {
    for (const r of REJECTED) expect(r.rejectedAs, r.key).toBeTruthy();
  });
});

describe('what is deliberately NOT counted', () => {
  it('does not treat "post-mitigation damage" as a defensive effect', () => {
    // Aatrox P, quoted. "post-mitigation" is the wiki's own tooltip for WHICH damage number a
    // heal scales from. It was the single largest over-fire in the run.
    const s = page(
      'Aatrox',
      'P',
      'Deathbringer Stance',
      "|description = '''Aatrox''' heals for the post-mitigation bonus damage dealt.",
    );
    // The detector proposes it…
    expect(kindsOf(s).has('damage-reduction')).toBe(true);
    // …and the reading rejects it as a damage reduction while keeping the heal.
    const confirmed = CONFIRMED.find((c) => c.key === 'Aatrox/P/Deathbringer Stance');
    expect(confirmed?.kinds).toEqual(['heal']);
  });

  it('does not treat "armor penetration" as a resistance grant', () => {
    // Darius E, quoted.
    const s = page('Darius', 'E', 'Apprehend', "|description = '''Darius''' gains {{tip|armor penetration}}.");
    expect(CONFIRMED.some((c) => c.key === 'Darius/E/Apprehend')).toBe(false);
    expect(kindsOf(s).has('resistance-grant')).toBe(true); // proposed, then rejected by reading
  });

  it('does not count untargetability as damage immunity', () => {
    // Vladimir W, quoted. The source says untargetable; it does not say damage is prevented.
    expect(CONFIRMED.some((c) => c.key === 'Vladimir/W/Sanguine Pool' && c.kinds.includes('immunity'))).toBe(
      false,
    );
    // Karthus P, quoted, DOES say it: "prevents all incoming damage".
    const karthus = CONFIRMED.find((c) => c.key === 'Karthus/P/Death Defied');
    expect(karthus?.kinds).toContain('immunity');
  });
});
