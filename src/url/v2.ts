// Version 2 of the link payload. THE ONLY DIFFERENCE FROM VERSION 1 IS THE COMBO STEP.
//
// ═══ WHY IT EXISTS ═══
//
// `ComboStep.hitCounts` was added to the frozen contract on 2026-08-13, for the abilities whose
// hit count is a property of the SITUATION rather than of the ability (DATA-SOURCES §38). The
// encoder was never told, so version 1's step-key list did not include it and `encodeScenario`
// REFUSED any scenario carrying one — with a message saying the field "is not part of the
// scenario contract", which was itself untrue.
//
// The failure was loud rather than silent, which is the good direction: nothing was ever shared
// wrongly. But SPECIFICATION §12 says any scenario is shareable as a link that reproduces it
// exactly, and a scenario using any of the 7 abilities that store `variableHits` could not be
// shared at all. Found by `tests/cross-area-seams.test.ts` (DATA-SOURCES §44.3).
//
// ═══ WHY A NEW VERSION AND NOT AN EXTENDED VERSION 1 ═══
//
// The step is POSITIONAL: `[id, kindIndex, ref]` or `[id, kindIndex, ref, options]`. Adding a
// fifth slot to version 1 in place would mean a version 1 decoder — any page a user has open,
// any older build — reading a 5-element step and either mis-reading slot 4 or refusing the link
// as damaged. FORMAT.md §3 fixes the rule: **every version ever published stays readable
// forever, and a new version adds a second decoder beside the old one rather than editing it.**
//
// ═══ WHAT SHARING v1's HELPERS DOES AND DOES NOT MEAN ═══
//
// Champion encoding is IDENTICAL in both versions, so this file imports it from `v1.ts` rather
// than copying it. That is safe only because the promise is enforced MECHANICALLY rather than by
// isolation: `round-trip.test.ts` pins frozen version 1 links against the exact scenarios they
// must still decode to, so any change to shared code that altered version 1's behaviour fails a
// test. **If a future version 3 needs a different champion shape, it writes its own — it does
// NOT edit the shared helper.**

import type { ComboStep, Scenario } from '../types/scenario';
import type { Complaint } from './v1';
import {
  V1_STEP_KINDS,
  championToArray,
  checkChampion,
  checkExactKeys,
  checkJsonCarriable,
  isPlainObject,
  readChampion,
} from './v1';

export const V2 = 2;

/**
 * Frozen for version 2. The index IS the wire value, so this array is never reordered and never
 * has an entry removed. Identical to version 1's, and imported from it rather than re-listed:
 * two copies of one list is one more thing that can drift.
 */
export const V2_STEP_KINDS = V1_STEP_KINDS;

const SCENARIO_KEYS = ['version', 'attacker', 'defender', 'combo'] as const;
const STEP_REQUIRED_KEYS = ['id', 'kind', 'ref'] as const;
/** THE ONE LINE THAT DIFFERS FROM VERSION 1: `hitCounts` is carried. */
const STEP_ALL_KEYS = ['id', 'kind', 'ref', 'options', 'hitCounts'] as const;

/**
 * `hitCounts` is `Record<string, number>` — component id to a count the USER stated.
 *
 * Checked rather than trusted, because a link is the only copy of a scenario: a count that
 * arrived as text, as a fraction or as a negative number would resolve to a different damage
 * figure than the sharer saw, which is the whole failure this module exists to prevent. A
 * non-integer is refused rather than rounded.
 */
function checkHitCounts(value: unknown, path: string): Complaint | null {
  if (!isPlainObject(value)) return { path, reason: 'must be a set of hit counts' };
  for (const [componentId, count] of Object.entries(value)) {
    // NEGATIVE ZERO IS REFUSED, not accepted as zero. Added 2026-08-15, after this check was read
    // against the rule the rest of the format follows: `Number.isInteger(-0)` is true and
    // `-0 < 0` is false, so -0 was the ONE value in this slot that encoded happily and came back
    // DIFFERENT — JSON writes it as `0`. Measured before the fix: a -0 count produced a 431-character
    // link that decoded to +0. Everywhere else a link refuses -0 rather than change it
    // (FORMAT.md §7, `isCarriableNumber` in v1.ts); this slot now does too. The wire format is
    // untouched — nothing that encoded before encodes differently now, one value simply stops
    // encoding at all.
    if (Object.is(count, -0)) {
      return {
        path: `${path}.${componentId}`,
        reason: 'is a negative zero, which a link writes as 0 and so cannot carry back unchanged',
      };
    }
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
      return {
        path: `${path}.${componentId}`,
        reason: 'must be a whole number of hits, zero or more',
      };
    }
  }
  return null;
}

function checkStep(value: unknown, path: string): Complaint | null {
  if (!isPlainObject(value)) return { path, reason: 'must be a combo step' };
  for (const key of STEP_REQUIRED_KEYS) {
    if (!(key in value)) return { path: `${path}.${key}`, reason: 'is missing' };
  }
  for (const key of Object.keys(value)) {
    if (!(STEP_ALL_KEYS as readonly string[]).includes(key)) {
      return { path: `${path}.${key}`, reason: 'is not part of the scenario contract' };
    }
  }

  const step = value as unknown as ComboStep;
  if (typeof step.id !== 'string') return { path: `${path}.id`, reason: 'must be text' };
  if (typeof step.ref !== 'string') return { path: `${path}.ref`, reason: 'must be text' };
  if (typeof step.kind !== 'string' || !V2_STEP_KINDS.includes(step.kind)) {
    return { path: `${path}.kind`, reason: 'is not one of the five combo-step kinds' };
  }

  // Absent and `undefined` are the same thing under this project's TypeScript settings, and are
  // both carried as absent (FORMAT.md §4).
  if ('options' in value && step.options !== undefined) {
    if (!isPlainObject(step.options)) {
      return { path: `${path}.options`, reason: 'must be a set of step options' };
    }
    const complaint = checkJsonCarriable(step.options, `${path}.options`);
    if (complaint) return complaint;
  }
  if ('hitCounts' in value && step.hitCounts !== undefined) {
    return checkHitCounts(step.hitCounts, `${path}.hitCounts`);
  }
  return null;
}

export function checkScenario(value: unknown): Complaint | null {
  if (!isPlainObject(value)) return { path: 'scenario', reason: 'must be a scenario' };
  const keys = checkExactKeys(value, SCENARIO_KEYS, 'scenario');
  if (keys) return keys;

  const scenario = value as unknown as Scenario;
  // A SCENARIO WRITTEN FOR VERSION 1 IS STILL SHAREABLE. `Scenario.version` is the URL schema
  // version the scenario was built against, and every version this codec can express is one it
  // can write; refusing a version 1 scenario would break every link the interface holds.
  if (scenario.version !== V2 && scenario.version !== 1) {
    return {
      path: 'scenario.version',
      reason: `is ${String(scenario.version)}, and this codec writes version ${V2}`,
    };
  }

  const attacker = checkChampion(scenario.attacker, 'attacker');
  if (attacker) return attacker;
  const defender = checkChampion(scenario.defender, 'defender');
  if (defender) return defender;

  if (!Array.isArray(scenario.combo)) {
    return { path: 'combo', reason: 'must be an ordered list of steps' };
  }
  for (let i = 0; i < scenario.combo.length; i++) {
    const complaint = checkStep(scenario.combo[i], `combo[${i}]`);
    if (complaint) return complaint;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------

/**
 * `[id, kindIndex, ref]`, `[…, options]`, or `[…, options, hitCounts]`.
 *
 * A step with hit counts and NO options writes `null` in slot 4, so slot 5 keeps its position.
 * `null` is unambiguous here — an options bag is always an object, so it can never be null, and
 * the reader turns it back into "absent" rather than into an empty bag. An empty bag and an
 * absent one are different things the round-trip test pins separately.
 */
function stepToArray(step: ComboStep): unknown[] {
  const head: unknown[] = [step.id, V2_STEP_KINDS.indexOf(step.kind), step.ref];
  if (step.hitCounts !== undefined) {
    return [...head, step.options ?? null, step.hitCounts];
  }
  return step.options === undefined ? head : [...head, step.options];
}

/** Assumes `checkScenario` has already passed. Returns the payload TEXT, not the link. */
export function writeV2Payload(scenario: Scenario): string {
  return JSON.stringify([
    championToArray(scenario.attacker),
    championToArray(scenario.defender),
    scenario.combo.map(stepToArray),
  ]);
}

// ---------------------------------------------------------------------------
// Decoding
// ---------------------------------------------------------------------------

function readStep(raw: unknown, path: string): { value: ComboStep } | { complaint: Complaint } {
  if (!Array.isArray(raw) || raw.length < 3 || raw.length > 5) {
    return { complaint: { path, reason: 'must be a combo step' } };
  }
  const kindIndex = raw[1];
  if (typeof kindIndex !== 'number' || !V2_STEP_KINDS[kindIndex]) {
    return { complaint: { path: `${path}.kind`, reason: 'is not one of the five combo-step kinds' } };
  }
  const step: ComboStep = {
    id: raw[0] as string,
    kind: V2_STEP_KINDS[kindIndex]!,
    ref: raw[2] as string,
  };
  // Slot 4 is the options bag, and `null` there means the sharer's step had none — it is the
  // placeholder that lets slot 5 exist without one.
  if (raw.length >= 4 && raw[3] !== null && raw[3] !== undefined) {
    step.options = raw[3] as Record<string, unknown>;
  }
  if (raw.length === 5 && raw[4] !== null && raw[4] !== undefined) {
    step.hitCounts = raw[4] as Record<string, number>;
  }
  return { value: step };
}

export function readV2Payload(
  payload: unknown,
): { ok: true; scenario: Scenario } | { ok: false; complaint: Complaint } {
  if (!Array.isArray(payload) || payload.length !== 3) {
    return { ok: false, complaint: { path: 'scenario', reason: 'is not a version 2 scenario' } };
  }

  const attacker = readChampion(payload[0], 'attacker');
  if ('complaint' in attacker) return { ok: false, complaint: attacker.complaint };
  const defender = readChampion(payload[1], 'defender');
  if ('complaint' in defender) return { ok: false, complaint: defender.complaint };

  const rawCombo = payload[2];
  if (!Array.isArray(rawCombo)) {
    return { ok: false, complaint: { path: 'combo', reason: 'must be an ordered list of steps' } };
  }
  const combo: ComboStep[] = [];
  for (let i = 0; i < rawCombo.length; i++) {
    const step = readStep(rawCombo[i], `combo[${i}]`);
    if ('complaint' in step) return { ok: false, complaint: step.complaint };
    combo.push(step.value);
  }

  const scenario: Scenario = {
    version: V2,
    attacker: attacker.value,
    defender: defender.value,
    combo,
  };
  const complaint = checkScenario(scenario);
  return complaint ? { ok: false, complaint } : { ok: true, scenario };
}
