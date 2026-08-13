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
    const future = link.replace(/^1~/, '4~');
    const result = decodeScenario(future);
    expect(result).toMatchObject({ ok: false, error: { code: 'unknown-version', foundVersion: 4 } });
    if (!result.ok) {
      expect(result.error.message).toContain('4');
      expect(result.error.message).toContain(String(CURRENT_URL_VERSION));
    }
  });

  it('a newer-version link is reported as newer even when its payload makes no sense to this build', () => {
    // A hypothetical version 2 could write its payload and checksum differently. This build
    // must still say "newer version", not "damaged" — the user can act on the first sentence
    // and cannot act on the second.
    const result = decodeScenario('2~SGVsbG8gZnJvbSB2Mg~notachecksum');
    expect(result).toMatchObject({ ok: false, error: { code: 'unknown-version', foundVersion: 2 } });
  });

  it('a non-numeric version reports "malformed", not a guess', () => {
    expect(decodeScenario(link.replace(/^1~/, 'v1~'))).toMatchObject({
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
