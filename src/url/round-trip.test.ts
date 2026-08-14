// Round-trip tests for the shared link.
//
// The claim under test is exact: for every named scenario, decode(encode(s)) is DEEP-EQUAL to
// s across every field of Scenario. `toStrictEqual` is used rather than `toEqual` deliberately
// — it distinguishes a field that is absent from a field that is present and undefined, which
// is precisely the difference between "this step had no options" and "this step had an empty
// options bag", and it distinguishes 0 from -0.

import { describe, it, expect } from 'vitest';
import { NAMED_SCENARIOS } from './fixtures';
import {
  encodeScenario,
  decodeScenario,
  scenarioToUrl,
  scenarioFromUrl,
  CURRENT_URL_VERSION,
} from './index';

function decodedOrThrow(text: string) {
  const result = decodeScenario(text);
  if (!result.ok) {
    throw new Error(`decode failed: ${result.error.code} — ${result.error.message}`);
  }
  return result.scenario;
}

describe('named scenarios round-trip identically', () => {
  for (const { name, proves, scenario } of NAMED_SCENARIOS) {
    it(`${name} — ${proves}`, () => {
      const link = encodeScenario(scenario);
      expect(decodedOrThrow(link)).toStrictEqual(scenario);
    });
  }
});

describe('named scenarios round-trip through a full URL', () => {
  for (const { name, scenario } of NAMED_SCENARIOS) {
    it(`${name} survives scenarioToUrl -> scenarioFromUrl`, () => {
      const url = scenarioToUrl('https://example.com/', scenario);
      const result = scenarioFromUrl(url);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.scenario).toStrictEqual(scenario);
    });
  }
});

describe('order is the scenario', () => {
  const a = NAMED_SCENARIOS.find((s) => s.name === 'combo-order-q-then-auto')!.scenario;
  const b = NAMED_SCENARIOS.find((s) => s.name === 'combo-order-auto-then-q')!.scenario;

  it('two combos with the same steps in different orders produce different links', () => {
    expect(encodeScenario(a)).not.toBe(encodeScenario(b));
  });

  it('each of the pair decodes back to its own order, not the other', () => {
    expect(decodedOrThrow(encodeScenario(a)).combo.map((s) => s.id)).toStrictEqual(['x', 'y']);
    expect(decodedOrThrow(encodeScenario(b)).combo.map((s) => s.id)).toStrictEqual(['y', 'x']);
  });
});

describe('encoding is stable and deterministic', () => {
  it('the same scenario always produces the same link', () => {
    for (const { scenario } of NAMED_SCENARIOS) {
      expect(encodeScenario(scenario)).toBe(encodeScenario(scenario));
    }
  });

  it('every link starts with the current version and a tilde', () => {
    for (const { scenario } of NAMED_SCENARIOS) {
      expect(encodeScenario(scenario).startsWith(`${CURRENT_URL_VERSION}~`)).toBe(true);
    }
  });

  it('every link is URL-safe — no character needs percent-escaping', () => {
    for (const { scenario } of NAMED_SCENARIOS) {
      const link = encodeScenario(scenario);
      expect(encodeURIComponent(link)).toBe(link.replace(/~/g, '~'));
      expect(/^[0-9]+~[A-Za-z0-9_-]+~[0-9a-z]+$/.test(link)).toBe(true);
    }
  });
});

describe('a broken link fails visibly and never decodes into a different scenario', () => {
  const sample = NAMED_SCENARIOS.find((s) => s.name === 'maximal')!.scenario;
  const link = encodeScenario(sample);

  it('empty input reports "empty"', () => {
    expect(decodeScenario('')).toMatchObject({ ok: false, error: { code: 'empty' } });
    expect(decodeScenario('   ')).toMatchObject({ ok: false, error: { code: 'empty' } });
  });

  it('a link with the wrong number of fields reports "malformed"', () => {
    expect(decodeScenario('1~abc')).toMatchObject({ ok: false, error: { code: 'malformed' } });
    expect(decodeScenario('nonsense')).toMatchObject({ ok: false, error: { code: 'malformed' } });
    expect(decodeScenario('1~a~b~c')).toMatchObject({ ok: false, error: { code: 'malformed' } });
  });

  it('a version this build does not know reports "unknown-version" and names both numbers', () => {
    const future = link.replace(/^\d+~/, '4~');
    const result = decodeScenario(future);
    expect(result).toMatchObject({ ok: false, error: { code: 'unknown-version', foundVersion: 4 } });
    if (!result.ok) {
      expect(result.error.message).toContain('4');
      expect(result.error.message).toContain(String(CURRENT_URL_VERSION));
    }
  });

  it('a newer-version link is reported as newer even when its payload makes no sense to this build', () => {
    // A hypothetical version 3 could write its payload and checksum differently. This build
    // must still say "newer version", not "damaged" — the user can act on the first sentence
    // and cannot act on the second. (This said version 2 until 2026-08-14, when version 2
    // stopped being hypothetical.)
    const result = decodeScenario('3~SGVsbG8gZnJvbSB2Mw~notachecksum');
    expect(result).toMatchObject({ ok: false, error: { code: 'unknown-version', foundVersion: 3 } });
  });

  it('a non-numeric version reports "malformed", not a guess', () => {
    expect(decodeScenario(link.replace(/^\d+~/, 'v1~'))).toMatchObject({
      ok: false,
      error: { code: 'malformed' },
    });
  });

  it('truncation at EVERY length is refused — no prefix of a link decodes to anything', () => {
    let decodedSomething = 0;
    for (let cut = 1; cut < link.length; cut++) {
      const result = decodeScenario(link.slice(0, cut));
      if (result.ok) decodedSomething++;
    }
    expect(decodedSomething).toBe(0);
  });

  it('a single flipped character in the payload is refused', () => {
    const [version, payload, checksum] = link.split('~');
    let accepted = 0;
    for (let i = 0; i < payload.length; i++) {
      const swapped = payload[i] === 'A' ? 'B' : 'A';
      const damaged = `${version}~${payload.slice(0, i)}${swapped}${payload.slice(i + 1)}~${checksum}`;
      if (decodeScenario(damaged).ok) accepted++;
    }
    expect(accepted).toBe(0);
  });

  it('a payload outside the base64url alphabet is refused', () => {
    expect(decodeScenario('1~not base64!~abc')).toMatchObject({ ok: false });
    expect(decodeScenario('1~++++~abc')).toMatchObject({ ok: false });
  });

  it('a well-formed payload carrying the wrong shape is refused and names the field', () => {
    // A hand-built payload with attacker.level missing entirely.
    const bad = encodeRawForTest([
      ['Annie', null, [0, 0, 0, 0], [], [null, [], [], []], {}, {}],
      ['Annie', 1, [0, 0, 0, 0], [], [null, [], [], []], {}, {}],
      [],
    ]);
    const result = decodeScenario(bad);
    expect(result).toMatchObject({ ok: false, error: { code: 'shape' } });
    if (!result.ok) expect(result.error.path).toContain('attacker.level');
  });

  it('a level outside the documented 1..18 range is refused rather than clamped', () => {
    const bad = encodeRawForTest([
      ['Annie', 44, [0, 0, 0, 0], [], [null, [], [], []], {}, {}],
      ['Annie', 1, [0, 0, 0, 0], [], [null, [], [], []], {}, {}],
      [],
    ]);
    expect(decodeScenario(bad)).toMatchObject({ ok: false, error: { code: 'shape' } });
  });

  it('an unknown combo-step kind is refused rather than mapped to the nearest one', () => {
    const bad = encodeRawForTest([
      ['Annie', 1, [0, 0, 0, 0], [], [null, [], [], []], {}, {}],
      ['Annie', 1, [0, 0, 0, 0], [], [null, [], [], []], {}, {}],
      [['s', 99, 'Q']],
    ]);
    expect(decodeScenario(bad)).toMatchObject({ ok: false, error: { code: 'shape' } });
  });

  it('an entryState value that is neither number nor boolean is refused', () => {
    const bad = encodeRawForTest([
      ['Annie', 1, [0, 0, 0, 0], [], [null, [], [], []], {}, { stacks: 'two' }],
      ['Annie', 1, [0, 0, 0, 0], [], [null, [], [], []], {}, {}],
      [],
    ]);
    expect(decodeScenario(bad)).toMatchObject({ ok: false, error: { code: 'shape' } });
  });
});

describe('the encoder refuses what a link cannot carry, rather than mangling it', () => {
  const base = NAMED_SCENARIOS[0].scenario;

  it('refuses a NaN accumulation', () => {
    const s = structuredClone(base);
    s.attacker.persistent = { stacks: NaN };
    expect(() => encodeScenario(s)).toThrow(/persistent/);
  });

  it('refuses an infinite accumulation', () => {
    const s = structuredClone(base);
    s.defender.entryState = { shred: Infinity };
    expect(() => encodeScenario(s)).toThrow(/entryState/);
  });

  it('refuses negative zero, which JSON would silently turn into zero', () => {
    const s = structuredClone(base);
    s.attacker.persistent = { stacks: -0 };
    expect(() => encodeScenario(s)).toThrow(/persistent/);
  });

  it('refuses a step-options value JSON cannot represent', () => {
    const s = structuredClone(base);
    s.combo = [{ id: 'a', kind: 'ability', ref: 'Q', options: { when: new Date() } }];
    expect(() => encodeScenario(s)).toThrow(/options/);

    const s2 = structuredClone(base);
    s2.combo = [{ id: 'a', kind: 'ability', ref: 'Q', options: { fn: () => 1 } as Record<string, unknown> }];
    expect(() => encodeScenario(s2)).toThrow(/options/);
  });

  it('refuses a scenario carrying a version it does not know how to write', () => {
    const s = structuredClone(base);
    s.version = 7;
    expect(() => encodeScenario(s)).toThrow(/version/);
  });

  it('every named scenario is accepted by the encoder — the refusals above are not over-broad', () => {
    for (const { scenario } of NAMED_SCENARIOS) {
      expect(() => encodeScenario(scenario)).not.toThrow();
    }
  });
});

describe('the fragment, not the query string', () => {
  const scenario = NAMED_SCENARIOS[0].scenario;

  it('scenarioToUrl puts the scenario after the # so no server ever receives it', () => {
    const url = scenarioToUrl('https://example.com/', scenario);
    expect(url).toContain('#s=');
    expect(new URL(url).search).toBe('');
  });

  it('a URL with no scenario in it reports "empty" rather than returning a blank scenario', () => {
    expect(scenarioFromUrl('https://example.com/')).toMatchObject({
      ok: false,
      error: { code: 'empty' },
    });
  });

  it('other fragment parameters alongside the scenario are tolerated', () => {
    const url = `${scenarioToUrl('https://example.com/', scenario)}&tab=runes`;
    const result = scenarioFromUrl(url);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.scenario).toStrictEqual(scenario);
  });
});

// ---------------------------------------------------------------------------
// Test-only helper: builds a link around a hand-written payload so the decoder's
// shape checks can be attacked with payloads the encoder would never produce.
// It deliberately reimplements nothing but the envelope.
// ---------------------------------------------------------------------------
function encodeRawForTest(payload: unknown): string {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  let h = 0x811c9dc5;
  for (let i = 0; i < b64.length; i++) {
    h ^= b64.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `1~${b64}~${h.toString(36)}`;
}

// =========================================================================================
// FROZEN VERSION 1 LINKS — the compatibility promise, made mechanical.
//
// FORMAT.md §3: "every version ever published stays readable forever. A link shared in a
// YouTube video two years ago must still open." That was a promise in prose until 2026-08-14,
// when version 2 arrived and version 1's decoder stopped being the one in daily use.
//
// The links below were produced by version 1's encoder and are pasted here as CONSTANTS. They
// are never regenerated — regenerating them would test the current code against itself, which
// is the one thing they must not do. Each is asserted to decode to the scenario it was made
// from, and to report `version: 1`, because a scenario that came out of a version 1 link IS a
// version 1 scenario and saying otherwise is a claim about provenance that is not true.
//
// v2.ts shares v1.ts's champion encoding rather than copying it. THESE VECTORS ARE WHAT MAKES
// THAT SAFE: any edit to the shared helpers that changed version 1's behaviour fails here.
// =========================================================================================

describe('frozen version 1 links still open', () => {
  const FROZEN_V1: ReadonlyArray<{ name: string; link: string }> = [
    { name: 'minimal', link: '1~W1siQW5uaWUiLDEsWzAsMCwwLDBdLFtdLFtudWxsLFtdLFtdLFtdXSx7fSx7fV0sWyJBbm5pZSIsMSxbMCwwLDAsMF0sW10sW251bGwsW10sW10sW11dLHt9LHt9XSxbXV0~7ek510' },
    { name: 'canonical-mock', link: '1~W1siQWF0cm94IiwxMSxbNSwzLDMsMl0sWzMwNzEsNjYzMCwzMDUzXSxbODAxMCxbOTExMSw5MTA0LDgwMTRdLFs4NDQ2LDgyNDJdLFsiYWRhcHRpdmUiLCJhZGFwdGl2ZSIsImFybW9yIl1dLHt9LHsiY29ucXVlcm9yU3RhY2tzIjoyLCJibGFja0NsZWF2ZXJTdGFja3MiOjB9XSxbIkdhcmVuIiwxMSxbNSwzLDUsMl0sWzMwNDcsMzE0MywzMDY4XSxbODQzNyxbODQ0Niw4NDI5LDg0NTFdLFs1MDA4LDUwMDJdLFsiYWRhcHRpdmUiLCJhcm1vciIsImhlYWx0aCJdXSx7fSx7ImJvbmVQbGF0aW5nIjp0cnVlfV0sW1siczEiLDEsIlEiLHsiY2FzdCI6MX1dLFsiczIiLDAsImJhc2ljIix7ImZvcmNlQ3JpdCI6dHJ1ZX1dLFsiczMiLDEsIlciXSxbInM0Iiw0LCJtb2NrLXRydWUtcHJvYyJdLFsiczUiLDAsImJhc2ljIl1dXQ~1pu8yin' },
    { name: 'maximal', link: '1~W1siVmVpZ2FyIiwxOCxbNSw1LDUsM10sWzMxNTcsMzA4OSw0NjQ1LDMxMzUsMzAyMCwzMTE2XSxbODExMixbODEyNiw4MTM4LDgxMDZdLFs4MjI2LDgyMTBdLFsiYWRhcHRpdmUiLCJhZGFwdGl2ZSIsImhlYWx0aCJdXSx7InZlaWdhclN0YWNrcyI6MzQwLCJkYXJrSGFydmVzdFN0YWNrcyI6MjcsImdhdGhlcmluZ1N0b3JtIjo0fSx7ImVsZWN0cm9jdXRlUmVhZHkiOnRydWUsIm1hbmFmbG93U3RhY2tzIjoxMCwiY2hlYXBTaG90VXNlZCI6ZmFsc2V9XSxbIk9ybm4iLDE4LFs1LDUsNSwzXSxbMzA2OCwzMTQzLDMxMTAsMzA3NSwzMTkzLDMwNDddLFs4NDM3LFs4NDQ2LDg0MjksODQ1MV0sWzUwMDgsNTAwMl0sWyJhcm1vciIsImhlYWx0aCIsImhlYWx0aCJdXSx7ImNob2dhdGhGZWFzdFN0YWNrcyI6Nn0seyJib25lUGxhdGluZyI6dHJ1ZSwiaGVtb3JyaGFnZVN0YWNrcyI6Miwic2Vjb25kV2luZFJlYWR5IjpmYWxzZX1dLFtbInMxIiwxLCJRIix7ImNhc3QiOjF9XSxbInMyIiwwLCJiYXNpYyIseyJmb3JjZUNyaXQiOnRydWV9XSxbInMzIiwyLCJXIix7InN3ZWV0c3BvdCI6dHJ1ZX1dLFsiczQiLDMsIjMxNTMiLHsiY2hhcmdlZCI6ZmFsc2V9XSxbInM1Iiw0LCJsaWNoLWJhbmUiLHsic3RhY2tzIjozfV1dXQ~usprtg' },
  ];

  it.each(FROZEN_V1.map((v) => [v.name, v] as const))(
    'a version 1 link made before version 2 existed still decodes: %s',
    (_name, vector) => {
      const decoded = decodeScenario(vector.link);
      expect({ name: vector.name, ok: decoded.ok }).toEqual({ name: vector.name, ok: true });
      if (!decoded.ok) return;
      const expected = NAMED_SCENARIOS.find((s) => s.name === vector.name)!.scenario;
      // Everything but the version is identical; the version is 1, because that is the link's.
      expect(decoded.scenario).toEqual({ ...expected, version: 1 });
    },
  );

  it('re-sharing an old link upgrades it to the current format, losing nothing', () => {
    const decoded = decodeScenario(FROZEN_V1[1]!.link);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    const reshared = decodeScenario(encodeScenario(decoded.scenario));
    expect(reshared.ok).toBe(true);
    if (!reshared.ok) return;
    expect(reshared.scenario).toEqual({ ...decoded.scenario, version: CURRENT_URL_VERSION });
  });

  it('the vectors really are version 1 links, not current ones relabelled', () => {
    // Without this the suite would pass if someone regenerated them with today's encoder.
    for (const v of FROZEN_V1) expect(v.link.startsWith('1~')).toBe(true);
    expect(CURRENT_URL_VERSION).toBeGreaterThan(1);
  });
});

// =========================================================================================
// hitCounts — THE FIELD VERSION 2 EXISTS FOR (DATA-SOURCES §44.3, §46)
// =========================================================================================

describe('a variable hit count survives the link', () => {
  const withHitCounts = (hitCounts: Record<string, number>) => ({
    ...NAMED_SCENARIOS.find((s) => s.name === 'canonical-mock')!.scenario,
    combo: [{ id: 'z1', kind: 'ability' as const, ref: 'E', hitCounts }],
  });

  it('carries the count a user stated, which version 1 refused outright', () => {
    // Ziggs E: the user says five mines were contacted. Before version 2 this scenario could not
    // be shared at all — `encodeScenario` threw "hitCounts is not part of the scenario contract".
    // Silently dropping it would have been worse: the link would reproduce the MINIMUM count
    // (DATA-SOURCES §38.4) and a fivefold-smaller number, with nothing on screen to say so.
    const scenario = withHitCounts({ 'ziggs-e-mine': 5 });
    const decoded = decodedOrThrow(encodeScenario(scenario));
    expect(decoded).toEqual(scenario);
  });

  it('keeps hit counts and options apart when a step carries only hit counts', () => {
    // The positional slot 4 is `null` in that case, and `null` must read back as ABSENT rather
    // than as an empty options bag — the two are different things elsewhere in this suite.
    const decoded = decodedOrThrow(encodeScenario(withHitCounts({ a: 2 })));
    expect('options' in decoded.combo[0]!).toBe(false);
    expect(decoded.combo[0]!.hitCounts).toEqual({ a: 2 });
  });

  it('carries both when a step has options AND hit counts', () => {
    const scenario = {
      ...withHitCounts({ 'ziggs-e-mine': 3 }),
      combo: [
        {
          id: 'z1',
          kind: 'ability' as const,
          ref: 'E',
          options: { sweetspot: true },
          hitCounts: { 'ziggs-e-mine': 3 },
        },
      ],
    };
    expect(decodedOrThrow(encodeScenario(scenario))).toEqual(scenario);
  });

  it('a count of ZERO is carried, because it means the ability missed entirely', () => {
    // `ComboStep.hitCounts` documents 0 for `repeatsAtFullRate` as "the ability missed", which
    // is a legitimate scenario and must not be confused with an absent key.
    const decoded = decodedOrThrow(encodeScenario(withHitCounts({ 'xayah-q-feather': 0 })));
    expect(decoded.combo[0]!.hitCounts).toEqual({ 'xayah-q-feather': 0 });
  });

  it('REFUSES a count that is not a whole number of hits', () => {
    // A link is the only copy of a scenario, so a count that would resolve to a different damage
    // figure than the sharer saw is refused rather than rounded.
    for (const bad of [{ a: 1.5 }, { a: -1 }, { a: Number.NaN }]) {
      expect(() => encodeScenario(withHitCounts(bad))).toThrow(/whole number of hits/);
    }
  });
});
