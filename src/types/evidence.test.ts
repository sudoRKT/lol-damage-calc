// THE EVIDENCE AN ENTRY CARRIES ABOUT ITSELF (added 2026-08-14).
//
// Before this, a `verified` entry's evidence lived only in `verification/gate5-passes.json` and a
// batch report. Validating the override file on its own therefore failed all 10 of its verified
// entries, on a file with nothing wrong with it — a gate that fails the honest state teaches
// people to skip the gate.
//
// The ledger still WRITES the record. It is no longer needed to PROVE it.
//
// Every test below states which behaviour it pins. The ones marked BACK-COMPAT must keep passing
// unchanged, because an entry with no record must still be judged exactly as it was before.

import { describe, expect, it } from 'vitest';

import type { CuratedAbility, CuratedFile, Provenance } from './data.ts';
import { gateSchema, gateStatusHonesty } from './validate-curated.ts';

const PROV: Provenance = {
  source: 'Template:Data Lux/Light Binding',
  url: 'https://wiki.leagueoflegends.com/en-us/Template:Data_Lux/Q',
  patch: '16.16.1',
  fetched: '2026-08-14',
};

function ability(over: Partial<CuratedAbility> = {}): CuratedAbility {
  return {
    champion: 'Lux',
    slot: 'Q',
    abilityName: 'Light Binding',
    instanceType: 'damaging-ability',
    damageType: 'magic',
    maxRank: 5,
    components: [
      {
        id: 'damage',
        label: 'Magic Damage',
        damageType: 'magic',
        base: { scaling: 'linear', from: 80, to: 240 },
        ratios: [{ stat: 'AP', scaling: 'linear', from: 75, to: 75 }],
      },
    ],
    verification: 'verified',
    sourceRevision: 12345,
    provenance: PROV,
    ...over,
  };
}

function file(abilities: CuratedAbility[]): CuratedFile {
  return {
    version: 1,
    patch: '16.16.1',
    fetched: '2026-08-14',
    abilities,
    itemEffects: [],
    runes: [],
    shards: [],
    exclusions: [],
  };
}

/** Gate 6 with NOTHING handed in — the way anyone validating the file alone would call it. */
const noLedger = { roundTripPassed: new Set<string>(), independentlyChecked: new Set<string>() };

const FULL_EVIDENCE: NonNullable<CuratedAbility['evidence']> = {
  roundTrip: { kind: 'template', rowsCompared: 2 },
  independentCheck: { ledger: 'verification/gate5-passes.json', recordedOn: '2026-08-13' },
};

describe("gate 6 — a 'verified' entry that carries its own evidence", () => {
  it('passes with no ledger at all, which is the whole point', () => {
    const r = gateStatusHonesty(file([ability({ evidence: FULL_EVIDENCE })]), noLedger);
    expect(r.failed).toBe(0);
  });

  it('still fails when it carries nothing and no ledger is handed in', () => {
    const r = gateStatusHonesty(file([ability()]), noLedger);
    expect(r.failed).toBe(1);
    const all = r.findings.map((f) => f.message).join(' | ');
    expect(all).toMatch(/gate 2 \(round-trip\) has no pass recorded/);
    expect(all).toMatch(/gate 5 \(independent re-derivation\) has no pass recorded/);
  });

  it('fails when it carries only half the evidence', () => {
    const half = gateStatusHonesty(
      file([ability({ evidence: { roundTrip: { kind: 'prose', rowsCompared: 1 } } })]),
      noLedger,
    );
    expect(half.findings.map((f) => f.message).join(' ')).toMatch(/gate 5/);
    expect(half.findings.map((f) => f.message).join(' ')).not.toMatch(/gate 2/);
  });

  it('REFUSES a round-trip that compared zero rows — a comparison of nothing is not a pass', () => {
    const r = gateStatusHonesty(
      file([
        ability({
          evidence: { ...FULL_EVIDENCE, roundTrip: { kind: 'template', rowsCompared: 0 } },
        }),
      ]),
      noLedger,
    );
    expect(r.failed).toBe(1);
    expect(r.findings.map((f) => f.message).join(' ')).toMatch(/comparison of nothing is not a pass/);
  });

  it('names WHICH round-trip agreed, because the three reach different entries', () => {
    // Aphelios Q and Ambessa P were once refused promotion because only the prose round-trip had
    // run and nobody had wired it in (DATA-SOURCES §36.2). A record saying merely "a round-trip
    // passed" would have hidden that. Both really do carry 'prose' in the merged file.
    const prose = ability({
      evidence: { ...FULL_EVIDENCE, roundTrip: { kind: 'prose', rowsCompared: 1 } },
    });
    expect(gateStatusHonesty(file([prose]), noLedger).failed).toBe(0);
    expect(prose.evidence!.roundTrip!.kind).toBe('prose');
  });

  it('BACK-COMPAT: the ledger alone still works, exactly as before', () => {
    const r = gateStatusHonesty(file([ability()]), {
      roundTripPassed: new Set(['Lux/Q/Light Binding']),
      independentlyChecked: new Set(['Lux/Q/Light Binding']),
    });
    expect(r.failed).toBe(0);
  });

  it('BACK-COMPAT: sourceRevision is still required and evidence does not excuse it', () => {
    const r = gateStatusHonesty(
      file([ability({ evidence: FULL_EVIDENCE, sourceRevision: undefined })]),
      noLedger,
    );
    expect(r.findings.map((f) => f.message).join(' ')).toMatch(/carries no sourceRevision/);
  });

  it('says nothing about a derived entry, which claims no evidence', () => {
    const r = gateStatusHonesty(file([ability({ verification: 'derived' })]), noLedger);
    expect(r.failed).toBe(0);
  });
});

describe('gate 1 — the evidence record must be well-formed', () => {
  // Gate 6 reads this to decide whether a 'verified' claim stands, so a malformed record is a
  // claim resting on nothing.
  it('refuses a round-trip kind that is not one of the three', () => {
    const r = gateSchema(
      file([
        ability({
          evidence: {
            roundTrip: { kind: 'guesswork' as 'template', rowsCompared: 1 },
          },
        }),
      ]),
    );
    expect(r.findings.map((f) => f.message).join(' ')).toMatch(/evidence.roundTrip: bad kind/);
  });

  it('refuses a negative or fractional row count', () => {
    const r = gateSchema(
      file([ability({ evidence: { roundTrip: { kind: 'template', rowsCompared: -1 } } })]),
    );
    expect(r.findings.map((f) => f.message).join(' ')).toMatch(/rowsCompared must be an integer/);
  });

  it('refuses an independent check that names no ledger and no date', () => {
    const r = gateSchema(
      file([ability({ evidence: { independentCheck: { ledger: '', recordedOn: '' } } })]),
    );
    const all = r.findings.map((f) => f.message).join(' | ');
    expect(all).toMatch(/must name the ledger/);
    expect(all).toMatch(/must state when the pass was recorded/);
  });

  it("refuses evidence on an entry marked 'no-damage', which claims there is nothing to check", () => {
    const r = gateSchema(
      file([
        ability({
          verification: 'no-damage',
          instanceType: 'non-damaging-ability',
          components: [],
          evidence: FULL_EVIDENCE,
        }),
      ]),
    );
    expect(r.findings.map((f) => f.message).join(' ')).toMatch(/nothing to check/);
  });

  it('accepts an entry with no evidence record at all — it is optional', () => {
    expect(gateSchema(file([ability({ verification: 'derived' })])).failed).toBe(0);
  });
});
