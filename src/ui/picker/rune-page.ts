// WHAT A RUNE DOES TO A RESULT — READ FROM THE DATA, NEVER JUDGED HERE.
//
// ═══ THE ONE RULE THIS FILE EXISTS TO HOLD ═══
//
// The interface does not decide whether a rune changes a number. Three published facts decide it,
// and this file only looks them up:
//
//   1. `public/data/rune-effects.json` — the curated rune values. 7 entries today.
//   2. `RUNE_DELIVERY` (src/engine/simulate.ts) — the runes whose TRIGGER a person has read, so
//      the engine knows what to hang them on. 1 entry today (Scorch).
//   3. `RUNES_READ_BUT_NOT_DELIVERABLE` — a stored value the engine still cannot deliver, each
//      with the sentence saying what it is waiting on. Written for exactly this purpose.
//
// A rune outside all three has no stored value at all. That is 55 of the 62, and naming them is
// the whole point: **a rune page that silently drops 55 of 62 is worse than one that names them.**
// Every rune is selectable and every rune says which of the three it is.
//
// WHY THE ENGINE'S OWN MAPS AND NOT A LIST OF OUR OWN. "Which runes move a figure" is a fact about
// the engine, and a second list in the interface would be a second answer to it — the exact defect
// `tests/cross-area-seams.test.ts` was built for. When the engine learns to deliver a second rune,
// this picker's sentences change with it and no interface file is edited.

import type { CuratedRune, Rune, VerificationStatus } from '../../types';
import { normalize } from './filter';

/** Data Dragon's own slot numbering in `runes.json`: 0 is the keystone row, 1–3 the minor rows. */
export const KEYSTONE_SLOT = 0;

/**
 * The three places a rune sits on a page, and how many each holds.
 *
 * These are the sizes `RunePage` (src/types/scenario.ts) describes: one keystone, the primary
 * tree's minor runes, the secondary tree's two. They are the SHAPE of the object, not a legality
 * rule — see `RunePicker.tsx` for what this picker deliberately does not enforce and why.
 */
export const PRIMARY_MINOR_SLOTS = 3;
export const SECONDARY_MINOR_SLOTS = 2;
export const RUNE_PAGE_SLOTS = 1 + PRIMARY_MINOR_SLOTS + SECONDARY_MINOR_SLOTS;

/** Stat-shard slots on a page. Three, and NOTHING is published to put in them — see §7. */
export const SHARD_SLOTS = 3;

/**
 * How many matches are drawn at once. A COUNT, NOT A HEIGHT, for the same reason
 * `ItemPicker.VISIBLE_MATCHES` is one: DESIGN.md defines no height for a scrolling list region
 * and inventing one locally is what its preamble forbids. The panel prints the cap and the number
 * of matches, so nothing is hidden silently.
 */
export const RUNE_VISIBLE_MATCHES = 8;

export type RuneDestination = 'keystone' | 'primary' | 'secondary';

/** What each destination is called on screen and in a spoken name. */
export const DESTINATION_LABEL: Record<RuneDestination, string> = {
  keystone: 'keystone',
  primary: 'primary runes',
  secondary: 'secondary runes',
};

/** The three published facts, injected so a test can state its own population. */
export interface RuneEffectSources {
  /** Curated rune values keyed by rune id — `loadRuneEffects`' output, `Catalogue.runeEffects`. */
  effects: ReadonlyMap<number, readonly CuratedRune[]>;
  /** The engine's `RUNE_DELIVERY`: runes it knows how to fire. */
  delivery: ReadonlyMap<number, string>;
  /** The engine's `RUNES_READ_BUT_NOT_DELIVERABLE`: a stored value, and what it waits on. */
  notDeliverable: ReadonlyMap<number, string>;
}

/**
 * What wearing this rune does to a result. Three states, and every one of them is honest about
 * the number rather than about the data:
 *
 *   • `applied`            — the calculator adds this rune's damage. Carries the curated entry's
 *                            own verification status, which is shown exactly as an ability's is.
 *   • `stored-not-applied` — a value exists and nothing is applied. `why` is the engine's own
 *                            sentence, so the picker and the result say the same thing.
 *   • `no-stored-value`    — no rune value has been curated. It can still be worn; it moves
 *                            nothing.
 */
export type RuneEffect =
  | { kind: 'applied'; verification: VerificationStatus; runeName: string }
  | { kind: 'stored-not-applied'; why: string }
  | { kind: 'no-stored-value' };

/**
 * Drop a leading "<rune name> — " from the engine's sentence.
 *
 * MEASURED ON THE LIVE PAGE, 2026-08-15: Sudden Impact's row printed its name THREE times — once
 * as the row's own name, once as the exclusion's label, and once more inside the sentence. The
 * engine writes those sentences for a result page, where the rune is NOT otherwise named, and its
 * wording is right there; here the name is always immediately adjacent.
 *
 * IT REMOVES A DUPLICATE, NEVER A FACT. Only an exact "<name> — " prefix goes, so a sentence that
 * mentions the rune anywhere else keeps every word, and a sentence the engine changes keeps
 * working. The two texts stay one voice, which is the point of reading them from the engine at all.
 */
function withoutLeadingName(sentence: string, runeName: string): string {
  const prefix = `${runeName} — `;
  return sentence.startsWith(prefix) ? sentence.slice(prefix.length) : sentence;
}

/**
 * THE LOOKUP. No pattern matching on names, no guessing from a rune's text — three map reads.
 *
 * A curated entry with no delivery falls to `stored-not-applied` even when
 * `RUNES_READ_BUT_NOT_DELIVERABLE` has no sentence for it, using the same fallback wording
 * `simulate` uses in that case. Two of the seven curated runes are in exactly that position
 * (Hail of Blades, Bone Plating), so this is a live branch and not a defensive one.
 */
export function runeEffect(runeId: number, sources: RuneEffectSources): RuneEffect {
  const curated = sources.effects.get(runeId) ?? [];
  if (curated.length === 0) return { kind: 'no-stored-value' };

  const first = curated[0]!;
  if (sources.delivery.has(runeId)) {
    return { kind: 'applied', verification: first.verification, runeName: first.runeName };
  }

  const stated =
    sources.notDeliverable.get(runeId) ??
    `${first.runeName} — a value is stored and its delivery has not been read, so nothing is ` +
      `applied rather than a carrier being guessed at`;
  return { kind: 'stored-not-applied', why: withoutLeadingName(stated, first.runeName) };
}

/**
 * The sentence a rune carries wherever it appears — in the pool, on the page, and inside the
 * spoken name of every control that adds or removes it.
 *
 * IT ALWAYS SAYS WHETHER A NUMBER MOVES, in those words. "Not modelled" and "no value" are facts
 * about our data; "changes no number in this result" is the fact a reader is actually deciding
 * with, and it is the one an incomplete ability states too (SPECIFICATION §8).
 */
export function runeEffectSentence(effect: RuneEffect): string {
  switch (effect.kind) {
    case 'applied':
      return 'changes a number in the result';
    case 'stored-not-applied':
      return `changes no number in this result — ${effect.why}`;
    case 'no-stored-value':
      return (
        'changes no number in this result — no rune value has been curated for it, so it is ' +
        'worn and nothing is added'
      );
    default: {
      const never: never = effect;
      throw new Error(`runeEffectSentence: unknown effect ${String(never)}`);
    }
  }
}

/** The short marker beside a rune in a dense list. The full sentence is in the spoken name. */
export function runeEffectMarker(effect: RuneEffect): string {
  switch (effect.kind) {
    case 'applied':
      return 'changes a number';
    case 'stored-not-applied':
      return 'stored, not applied';
    case 'no-stored-value':
      return 'no stored value';
    default: {
      const never: never = effect;
      throw new Error(`runeEffectMarker: unknown effect ${String(never)}`);
    }
  }
}

/**
 * Where a rune sits in the source, as a reader can check it: "Domination · keystone",
 * "Sorcery · row 2". Both facts are stated by `runes.json` and neither is inferred.
 */
export function runeOrigin(rune: Rune): string {
  return rune.slot === KEYSTONE_SLOT
    ? `${rune.tree} · keystone`
    : `${rune.tree} · row ${rune.slot}`;
}

/** Which destinations a rune may be added to. Read from its slot, which the source states. */
export function destinationsFor(rune: Rune): RuneDestination[] {
  return rune.slot === KEYSTONE_SLOT ? ['keystone'] : ['primary', 'secondary'];
}

/**
 * THE PAGE'S TREE COMPOSITION, STATED BACK AS A FACT — added 2026-08-15 on the lead's ruling.
 *
 * "keystone: Domination · primary runes: 2 Domination, 1 Precision · secondary runes: 2 Resolve".
 *
 * Every word of it is arithmetic over `Rune.tree`, which `runes.json` states for all 62. **It says
 * what the page IS and never what it may not be.** The game's legality rules — primary minors from
 * the keystone's own tree, one per row, secondary from one other tree — are stated by no source
 * this project fetches, so this picker refuses to adjudicate them and instead shows the reader the
 * composition they built, which a player recognises at a glance. That is the same move the product
 * makes with a `contested` base statistic: use what the source gives, show it plainly, decline to
 * settle what nothing settles.
 *
 * A worn id the pool does not carry — a shared link from another patch — is counted as `unknown`
 * rather than dropped, for the same reason its row is drawn.
 */
export function treeComposition(ids: readonly number[], byId: ReadonlyMap<number, Rune>): string {
  if (ids.length === 0) return 'none';
  const tally = new Map<string, number>();
  for (const id of ids) {
    const tree = byId.get(id)?.tree ?? 'unknown';
    tally.set(tree, (tally.get(tree) ?? 0) + 1);
  }
  return [...tally.entries()]
    .sort((a, b) => (a[1] !== b[1] ? b[1] - a[1] : a[0].localeCompare(b[0])))
    .map(([tree, n]) => (ids.length === 1 ? tree : `${n} ${tree}`))
    .join(', ');
}

/** How well a rune matches what was typed. LOWER IS BETTER; `null` is no match. */
export function runeMatchScore(rune: Rune, normalizedQuery: string): number | null {
  if (normalizedQuery === '') return 0;
  const name = normalize(rune.name);
  if (name === normalizedQuery) return 0;
  if (name.startsWith(normalizedQuery)) return 1;
  const words = rune.name
    .split(/[^A-Za-z0-9]+/)
    .map(normalize)
    .filter((w) => w.length > 0);
  if (words.some((w) => w.startsWith(normalizedQuery))) return 2;
  if (name.includes(normalizedQuery)) return 3;
  // A TREE NAME IS A SEARCH TERM. "sorcery" is how a player asks for that tree's runes, and the
  // tree is a published field on every rune, so it costs nothing to honour. It scores last so a
  // rune whose own NAME matches is never pushed below one that merely shares a tree.
  if (normalize(rune.tree).startsWith(normalizedQuery)) return 4;
  return null;
}

/** The pool, narrowed and ordered. An empty query returns all 62, alphabetically. */
export function filterRunes(runes: readonly Rune[], query: string): Rune[] {
  const q = normalize(query);
  const scored: Array<{ rune: Rune; score: number }> = [];
  for (const rune of runes) {
    const score = runeMatchScore(rune, q);
    if (score !== null) scored.push({ rune, score });
  }
  scored.sort((a, b) =>
    a.score !== b.score ? a.score - b.score : a.rune.name.localeCompare(b.rune.name),
  );
  return scored.map((s) => s.rune);
}

/**
 * How many of the pool are in each of the three states.
 *
 * COUNTED FROM THE DATA ON EVERY RENDER, never typed. `capability.json` carries the same figure
 * for the page-level disclaimer; this one is over the pool actually handed to the picker, so a
 * test that passes a smaller population gets counts that describe it rather than the roster.
 */
export function effectCounts(
  runes: readonly Rune[],
  sources: RuneEffectSources,
): { applied: number; stored: number; none: number; total: number } {
  let applied = 0;
  let stored = 0;
  let none = 0;
  for (const rune of runes) {
    const effect = runeEffect(rune.id, sources);
    if (effect.kind === 'applied') applied += 1;
    else if (effect.kind === 'stored-not-applied') stored += 1;
    else none += 1;
  }
  return { applied, stored, none, total: runes.length };
}
