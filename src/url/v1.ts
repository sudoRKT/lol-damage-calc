// Version 1 of the scenario payload.
//
// THE POSITIONAL LAYOUT BELOW IS FROZEN. A position is never reordered and never reused;
// adding a field to Scenario means writing a v2 codec beside this one, because links already
// shared in the world are read by this file forever (FORMAT.md §3).
//
//   payload            = [ champion, champion, step[] ]        // attacker, defender, combo
//   champion           = [ apiname, level, ranks, items, runes, persistent, entryState ]
//   ranks              = [ Q, W, E, R ]
//   runes              = [ keystone, primary[], secondary[], shards[] ]
//   step               = [ id, kindIndex, ref ]                // options absent
//                      | [ id, kindIndex, ref, options ]       // options present
//
// The Scenario's own `version` field is NOT in the payload: it is the envelope's version
// field, so a decoder can read it without parsing a format it may not understand.

import type { ChampionConfig, ComboStep, ComboStepKind, RunePage, Scenario } from '../types/scenario';

export const V1 = 1;

/**
 * Frozen for version 1. The index IS the wire value, so this array is never reordered and
 * never has an entry removed. A new step kind is appended (which is a v1-compatible change
 * only for encoding new links — old builds will refuse them, correctly, as an unknown kind).
 */
export const V1_STEP_KINDS: readonly ComboStepKind[] = [
  'basic-attack',
  'ability',
  'empowered-attack',
  'item-active',
  'on-hit',
] as const;

/** Documented in src/types/scenario.ts as 1..18. Enforced, not clamped. */
const MIN_LEVEL = 1;
const MAX_LEVEL = 18;

const CHAMPION_KEYS = ['apiname', 'level', 'abilityRanks', 'items', 'runes', 'persistent', 'entryState'] as const;
const RUNE_KEYS = ['keystone', 'primary', 'secondary', 'shards'] as const;
const SCENARIO_KEYS = ['version', 'attacker', 'defender', 'combo'] as const;
const STEP_REQUIRED_KEYS = ['id', 'kind', 'ref'] as const;
const STEP_ALL_KEYS = ['id', 'kind', 'ref', 'options'] as const;

// ---------------------------------------------------------------------------
// One validator, used by BOTH directions.
//
// The encoder runs it on the Scenario it was handed, and the decoder runs it on the
// Scenario it rebuilt. Two separate implementations of "what a valid scenario is" would be
// two chances to disagree, and the disagreement would show up as a link that encodes but
// does not decode.
// ---------------------------------------------------------------------------

export interface Complaint {
  path: string;
  reason: string;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Finite, and not negative zero — JSON writes -0 as `0`, which would decode as a different value. */
function isCarriableNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0);
}

function isSafeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && !Object.is(value, -0);
}

export function checkExactKeys(value: Record<string, unknown>, allowed: readonly string[], path: string): Complaint | null {
  for (const key of allowed) {
    if (!(key in value)) return { path: `${path}.${key}`, reason: 'is missing' };
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      return { path: `${path}.${key}`, reason: 'is not part of the scenario contract' };
    }
  }
  return null;
}

/** Recursively confirms a step-options value is something JSON can carry losslessly. */
export function checkJsonCarriable(value: unknown, path: string): Complaint | null {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return null;
  if (typeof value === 'number') {
    return isCarriableNumber(value)
      ? null
      : { path, reason: 'is a number a link cannot carry (NaN, infinite, or negative zero)' };
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const complaint = checkJsonCarriable(value[i], `${path}[${i}]`);
      if (complaint) return complaint;
    }
    return null;
  }
  if (isPlainObject(value)) {
    for (const key of Object.keys(value)) {
      const complaint = checkJsonCarriable(value[key], `${path}.${key}`);
      if (complaint) return complaint;
    }
    return null;
  }
  return { path, reason: 'is a value a link cannot carry (only null, booleans, strings, finite numbers, arrays and plain objects can be shared)' };
}

function checkNumberArray(value: unknown, path: string): Complaint | null {
  if (!Array.isArray(value)) return { path, reason: 'must be a list' };
  for (let i = 0; i < value.length; i++) {
    if (!isSafeInt(value[i])) return { path: `${path}[${i}]`, reason: 'must be a whole-number id' };
  }
  return null;
}

function checkRunes(value: unknown, path: string): Complaint | null {
  if (!isPlainObject(value)) return { path, reason: 'must be a rune page' };
  const keys = checkExactKeys(value, RUNE_KEYS, path);
  if (keys) return keys;

  const runes = value as unknown as RunePage;
  if (runes.keystone !== null && !isSafeInt(runes.keystone)) {
    return { path: `${path}.keystone`, reason: 'must be a rune id or explicitly none' };
  }
  return (
    checkNumberArray(runes.primary, `${path}.primary`) ??
    checkNumberArray(runes.secondary, `${path}.secondary`) ??
    (() => {
      if (!Array.isArray(runes.shards)) return { path: `${path}.shards`, reason: 'must be a list' };
      for (let i = 0; i < runes.shards.length; i++) {
        if (typeof runes.shards[i] !== 'string') {
          return { path: `${path}.shards[${i}]`, reason: 'must be a stat-shard id' };
        }
      }
      return null;
    })()
  );
}

export function checkChampion(value: unknown, path: string): Complaint | null {
  if (!isPlainObject(value)) return { path, reason: 'must be a champion configuration' };
  const keys = checkExactKeys(value, CHAMPION_KEYS, path);
  if (keys) return keys;

  const champion = value as unknown as ChampionConfig;

  if (typeof champion.apiname !== 'string') return { path: `${path}.apiname`, reason: 'must be a champion name' };
  if (!isSafeInt(champion.level) || champion.level < MIN_LEVEL || champion.level > MAX_LEVEL) {
    return { path: `${path}.level`, reason: `must be a whole number from ${MIN_LEVEL} to ${MAX_LEVEL}` };
  }

  if (!isPlainObject(champion.abilityRanks)) return { path: `${path}.abilityRanks`, reason: 'must be the four ability ranks' };
  const rankKeys = checkExactKeys(champion.abilityRanks, ['Q', 'W', 'E', 'R'], `${path}.abilityRanks`);
  if (rankKeys) return rankKeys;
  for (const slot of ['Q', 'W', 'E', 'R'] as const) {
    const rank = (champion.abilityRanks as Record<string, unknown>)[slot];
    if (!isSafeInt(rank) || (rank as number) < 0) {
      return { path: `${path}.abilityRanks.${slot}`, reason: 'must be a rank of zero or more' };
    }
  }

  const items = checkNumberArray(champion.items, `${path}.items`);
  if (items) return items;

  const runes = checkRunes(champion.runes, `${path}.runes`);
  if (runes) return runes;

  // Persistent accumulations (SPEC §3.3): numbers only. They fold into the stat block.
  if (!isPlainObject(champion.persistent)) return { path: `${path}.persistent`, reason: 'must be a set of accumulations' };
  for (const key of Object.keys(champion.persistent)) {
    if (!isCarriableNumber((champion.persistent as Record<string, unknown>)[key])) {
      return { path: `${path}.persistent.${key}`, reason: 'must be a finite number' };
    }
  }

  // Combat state (SPEC §3.3): numbers or toggles. Seeded at entry, then mutated.
  if (!isPlainObject(champion.entryState)) return { path: `${path}.entryState`, reason: 'must be a set of entry-state values' };
  for (const key of Object.keys(champion.entryState)) {
    const stateValue = (champion.entryState as Record<string, unknown>)[key];
    if (typeof stateValue !== 'boolean' && !isCarriableNumber(stateValue)) {
      return { path: `${path}.entryState.${key}`, reason: 'must be a finite number or a true/false toggle' };
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
  if (typeof step.kind !== 'string' || !V1_STEP_KINDS.includes(step.kind)) {
    return { path: `${path}.kind`, reason: 'is not one of the five combo-step kinds' };
  }

  // `options` absent and `options: undefined` are the same thing under this project's
  // TypeScript settings, and are both carried as absent (FORMAT.md §4).
  if ('options' in value && step.options !== undefined) {
    if (!isPlainObject(step.options)) return { path: `${path}.options`, reason: 'must be a set of step options' };
    return checkJsonCarriable(step.options, `${path}.options`);
  }
  return null;
}

export function checkScenario(value: unknown): Complaint | null {
  if (!isPlainObject(value)) return { path: 'scenario', reason: 'must be a scenario' };
  const keys = checkExactKeys(value, SCENARIO_KEYS, 'scenario');
  if (keys) return keys;

  const scenario = value as unknown as Scenario;
  if (scenario.version !== V1) {
    return { path: 'scenario.version', reason: `is ${String(scenario.version)}, and this codec writes version ${V1}` };
  }

  const attacker = checkChampion(scenario.attacker, 'attacker');
  if (attacker) return attacker;
  const defender = checkChampion(scenario.defender, 'defender');
  if (defender) return defender;

  if (!Array.isArray(scenario.combo)) return { path: 'combo', reason: 'must be an ordered list of steps' };
  for (let i = 0; i < scenario.combo.length; i++) {
    const complaint = checkStep(scenario.combo[i], `combo[${i}]`);
    if (complaint) return complaint;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------

export function championToArray(champion: ChampionConfig): unknown[] {
  return [
    champion.apiname,
    champion.level,
    [champion.abilityRanks.Q, champion.abilityRanks.W, champion.abilityRanks.E, champion.abilityRanks.R],
    champion.items,
    [champion.runes.keystone, champion.runes.primary, champion.runes.secondary, champion.runes.shards],
    champion.persistent,
    champion.entryState,
  ];
}

function stepToArray(step: ComboStep): unknown[] {
  const head = [step.id, V1_STEP_KINDS.indexOf(step.kind), step.ref];
  return step.options === undefined ? head : [...head, step.options];
}

/** Assumes `checkScenario` has already passed. Returns the payload TEXT, not the link. */
export function writeV1Payload(scenario: Scenario): string {
  return JSON.stringify([
    championToArray(scenario.attacker),
    championToArray(scenario.defender),
    scenario.combo.map(stepToArray),
  ]);
}

// ---------------------------------------------------------------------------
// Decoding
// ---------------------------------------------------------------------------

/**
 * Reads the positional payload back into a candidate Scenario. It places values without
 * judging them; `checkScenario` then judges the whole rebuilt object, so every complaint
 * comes out with a Scenario-shaped path like `attacker.runes.shards[2]` rather than an
 * array index nobody can act on.
 */
export function readV1Payload(payload: unknown): { ok: true; scenario: Scenario } | { ok: false; complaint: Complaint } {
  if (!Array.isArray(payload) || payload.length !== 3) {
    return { ok: false, complaint: { path: 'scenario', reason: 'is not a version 1 scenario' } };
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

  const scenario = { version: V1, attacker: attacker.value, defender: defender.value, combo } as Scenario;
  const complaint = checkScenario(scenario);
  if (complaint) return { ok: false, complaint };
  return { ok: true, scenario };
}

export function readChampion(raw: unknown, path: string): { value: ChampionConfig } | { complaint: Complaint } {
  if (!Array.isArray(raw) || raw.length !== CHAMPION_KEYS.length) {
    return { complaint: { path, reason: 'must be a champion configuration' } };
  }
  const ranks = raw[2];
  if (!Array.isArray(ranks) || ranks.length !== 4) {
    return { complaint: { path: `${path}.abilityRanks`, reason: 'must be the four ability ranks' } };
  }
  const runes = raw[4];
  if (!Array.isArray(runes) || runes.length !== RUNE_KEYS.length) {
    return { complaint: { path: `${path}.runes`, reason: 'must be a rune page' } };
  }
  return {
    value: {
      apiname: raw[0],
      level: raw[1],
      abilityRanks: { Q: ranks[0], W: ranks[1], E: ranks[2], R: ranks[3] },
      items: raw[3],
      runes: { keystone: runes[0], primary: runes[1], secondary: runes[2], shards: runes[3] },
      persistent: raw[5],
      entryState: raw[6],
    } as ChampionConfig,
  };
}

function readStep(raw: unknown, path: string): { value: ComboStep } | { complaint: Complaint } {
  if (!Array.isArray(raw) || (raw.length !== 3 && raw.length !== 4)) {
    return { complaint: { path, reason: 'must be a combo step' } };
  }
  const kindIndex = raw[1];
  if (!isSafeInt(kindIndex) || kindIndex < 0 || kindIndex >= V1_STEP_KINDS.length) {
    return { complaint: { path: `${path}.kind`, reason: 'is not one of the five combo-step kinds' } };
  }
  const step: ComboStep = { id: raw[0], kind: V1_STEP_KINDS[kindIndex], ref: raw[2] };
  // Four elements means the sharer's step HAD an options bag; three means it did not, and
  // the difference is preserved rather than normalised.
  if (raw.length === 4) step.options = raw[3] as Record<string, unknown>;
  return { value: step };
}
