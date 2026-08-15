// THE RUNE PAGE — SPECIFICATION §2, step 4: "The user selects a full rune page — keystone, minor
// runes, and stat shards."
//
// ═══ THE CONSTRAINT THIS IS BUILT AROUND, IN THE OWNER'S WORDS ═══
//
// **A rune page that silently drops 55 of 62 is worse than one that names them.** All 62 published
// runes are selectable — the 17 keystones and the 45 minor runes — and every one of them states,
// where it is chosen and where it is offered, whether it changes a number. Nothing is filtered out
// for being unmodelled, because a picker that offers only the runes that work teaches a reader that
// the runes it offers are the runes that exist.
//
// The three states a rune can be in, and the counts today, are read from the published data by
// `rune-page.ts` — never decided here:
//
//   • 1 of 62 CHANGES A NUMBER (Scorch). It carries its curated verification status exactly as an
//     ability does.
//   • 6 carry a STORED VALUE THE ENGINE CANNOT APPLY, each with the engine's own sentence saying
//     what it waits on.
//   • 55 have NO STORED VALUE AT ALL. They are worn and they add nothing, and they say so.
//
// ═══ WHAT IT IS BUILT IN THE IMAGE OF ═══
//
// `../items/ItemPicker.tsx`, deliberately, down to the live-region split settled there: a VISIBLE
// line owns POOL facts (how many runes, how many match, how many are drawn) and moves only when the
// user searches; a HIDDEN announcement owns PAGE facts (what was worn or removed, how many slots
// are used) and moves only when the user edits the page. Neither carries the other's fact, because
// two polite regions changing on one action may be coalesced, reordered or dropped.
//
// ═══ WHAT IT DOES NOT ENFORCE, AND WHY THAT IS A REFUSAL RATHER THAN AN OMISSION ═══
//
// The game's rune pages are legal only in certain shapes: the primary minor runes come from the
// keystone's own tree, one per row, and the secondary two from one other tree. **No source this
// project fetches states any of that.** `runes.json` states a rune's TREE and its ROW, and that is
// all. So this picker enforces exactly what the data states and what `RunePage` demands — a
// keystone is a slot-0 rune, a minor rune is a slot-1-to-3 rune, and the page holds 1 / 3 / 2 — and
// it PRINTS each rune's tree and row on its own control so a reader can see the page they are
// building. It will let you build a page the client would refuse.
//
// The alternative is to encode legality rules from memory, in a product whose only value is that
// its numbers come from somewhere. Raised with the lead on 2026-08-15, not resolved here.
//
// ═══ THE ART, AND THE ONE THING IT DELIBERATELY DOES NOT SAY ═══
//
// Rune icons are official Data Dragon art (DESIGN.md §9, CLAUDE.md), drawn through `RuneChip` —
// `art-usage.test.ts` refuses an `<img>` outside `src/ui/art/`, and that rule is what keeps every
// chip in the product one size, one border and one alt-text convention.
//
// The chip's neutral underline and em-dash corner say **the chip has no damage type**. They do NOT
// say the rune deals no damage. Whether a rune changes a number is answered by the row's status
// mark and its words, in one vocabulary, because a second quieter one competing with
// `VerificationStatusMark` is how a reader ends up trusting the wrong signal.

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CuratedRune, Rune, RunePage, StatShard } from '../../types';
import { RUNE_DELIVERY, RUNES_READ_BUT_NOT_DELIVERABLE } from '../../engine';
import { RuneChip } from '../art/RuneChip';
import { Disclosure, ExcludedAbility, VerificationStatusMark, focusAfterRemoval } from '../primitives';
import {
  DESTINATION_LABEL,
  PRIMARY_MINOR_SLOTS,
  RUNE_PAGE_SLOTS,
  RUNE_VISIBLE_MATCHES,
  SECONDARY_MINOR_SLOTS,
  SHARD_SLOTS,
  destinationsFor,
  effectCounts,
  filterRunes,
  runeEffect,
  runeEffectMarker,
  runeEffectSentence,
  runeOrigin,
  treeComposition,
  type RuneDestination,
  type RuneEffectSources,
} from './rune-page';
import './runes.css';

/** How many runes each destination holds. The keystone holds one. */
const CAPACITY: Record<RuneDestination, number> = {
  keystone: 1,
  primary: PRIMARY_MINOR_SLOTS,
  secondary: SECONDARY_MINOR_SLOTS,
};

/** The order the three destinations are drawn and counted in — the order a page is built in. */
const DESTINATIONS: RuneDestination[] = ['keystone', 'primary', 'secondary'];

/** One sentence per destination, stating why nothing more can go in it. VISIBLE, never live. */
export function fullNotice(destination: RuneDestination): string {
  const label = DESTINATION_LABEL[destination];
  return destination === 'keystone'
    ? 'The keystone slot is full. Remove the keystone to choose another.'
    : `All ${CAPACITY[destination]} ${label} slots are full. Remove one to choose another.`;
}

/**
 * THE VISIBLE LINE. Pool facts only — see the header, and `ItemPicker.statusLine` for the
 * measurement that split the two regions apart.
 */
export function statusLine(state: { showPool: boolean; matched: number; total: number }): string {
  if (!state.showPool) return `${state.total} runes — search to wear one`;
  const capped =
    state.matched > RUNE_VISIBLE_MATCHES
      ? ` Showing the first ${RUNE_VISIBLE_MATCHES} — keep typing to narrow.`
      : '';
  return `${state.matched} of ${state.total} runes match.${capped}`;
}

/** The one text node an add control announces. It always ends with what the rune does to a total. */
export function addRuneName(
  rune: Rune,
  destination: RuneDestination,
  role: string,
  effectSentence: string,
): string {
  return (
    `Wear ${rune.name} as the ${role}'s ${DESTINATION_LABEL[destination]} — ` +
    `${runeOrigin(rune)} — ${effectSentence}`
  );
}

/** The one text node a remove control announces. */
export function removeRuneName(
  runeName: string,
  destination: RuneDestination,
  role: string,
  position: number,
  of: number,
): string {
  return `Remove ${runeName} from the ${role}'s ${DESTINATION_LABEL[destination]}, ${position} of ${of}`;
}

export interface RunePickerProps {
  /** "attacker" or "defender" — spoken inside every control's name. */
  role: string;
  /** The full published pool. 62 runes across 5 trees; never truncated, only the DRAWN list is. */
  runes: readonly Rune[];
  /** The page as `ChampionConfig.runes` carries it. */
  page: RunePage;
  onChange: (page: RunePage) => void;
  /**
   * The curated rune values, keyed by rune id — `loadRuneEffects`' output.
   *
   * REQUIRED, with no default. A default of "none" would print "no stored value" against Scorch,
   * which is the one rune that does move a figure — a plausible wrong statement, which is the
   * class of failure this product exists to prevent. A caller with nothing to pass passes an
   * empty map deliberately.
   */
  effects: ReadonlyMap<number, readonly CuratedRune[]>;
  /** The engine's read population. Defaults to the engine's own map, which is the only answer. */
  delivery?: ReadonlyMap<number, string>;
  /** The engine's "stored but undeliverable" sentences. Defaults to the engine's own map. */
  notDeliverable?: ReadonlyMap<number, string>;
  /**
   * The published stat shards. **Empty today and that is the published state**: `curated.shards`
   * holds nothing, and SPECIFICATION §7 records that shards appear in no fetched source at all.
   * The row is still drawn and says so — see the shard section below.
   */
  shards?: readonly StatShard[];
}

export function RunePicker({
  role,
  runes,
  page,
  onChange,
  effects,
  delivery = RUNE_DELIVERY,
  notDeliverable = RUNES_READ_BUT_NOT_DELIVERABLE,
  shards = [],
}: RunePickerProps) {
  const [query, setQuery] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [focused, setFocused] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  /** The position among the remove controls that was just removed, or null. */
  const removedControl = useRef<number | null>(null);

  // A LAYOUT effect with no dependency array, both of which are `focusAfterRemoval`'s rules and
  // not this component's: focus lands before paint, and the second and third removals still fire.
  useLayoutEffect(() => {
    const index = removedControl.current;
    if (index === null) return;
    removedControl.current = null;
    focusAfterRemoval(pageRef.current, '.runes__remove', index, searchRef.current);
  });

  const sources: RuneEffectSources = useMemo(
    () => ({ effects, delivery, notDeliverable }),
    [effects, delivery, notDeliverable],
  );
  const byId = useMemo(() => new Map(runes.map((r) => [r.id, r])), [runes]);
  const matches = useMemo(() => filterRunes(runes, query), [runes, query]);
  const drawn = matches.slice(0, RUNE_VISIBLE_MATCHES);
  const counts = useMemo(() => effectCounts(runes, sources), [runes, sources]);

  /** The ids worn in each destination, in the order the page carries them. */
  const worn: Record<RuneDestination, number[]> = {
    keystone: page.keystone === null ? [] : [page.keystone],
    primary: [...page.primary],
    secondary: [...page.secondary],
  };
  const used = DESTINATIONS.reduce((n, d) => n + worn[d].length, 0);
  const isWorn = (id: number) => DESTINATIONS.some((d) => worn[d].includes(id));

  /** Whether the pool is drawn. Closed at rest, exactly as the item pool is. */
  const showPool = focused || query.trim() !== '';

  const write = (destination: RuneDestination, ids: number[]) => {
    if (destination === 'keystone') onChange({ ...page, keystone: ids[0] ?? null });
    else onChange({ ...page, [destination]: ids });
  };

  const add = (rune: Rune, destination: RuneDestination) => {
    if (worn[destination].length >= CAPACITY[destination] || isWorn(rune.id)) return;
    write(destination, [...worn[destination], rune.id]);
    const effect = runeEffect(rune.id, sources);
    const nowUsed = used + 1;
    setAnnouncement(
      `${rune.name} worn as the ${DESTINATION_LABEL[destination]} — ${runeEffectSentence(effect)}. ` +
        `${nowUsed} of ${RUNE_PAGE_SLOTS} rune slots used.`,
    );
    // FOCUS RETURNS TO THE SEARCH FIELD. The control just used becomes disabled (the rune is now
    // worn), a disabled element cannot hold focus, and the pool would close under the user the
    // instant they used it. Same rule, same reason, as the item pool.
    searchRef.current?.focus();
  };

  const remove = (
    runeName: string,
    destination: RuneDestination,
    index: number,
    controlIndex: number,
  ) => {
    // Armed BEFORE the state change, so the layout effect after the re-render knows what vanished.
    removedControl.current = controlIndex;
    write(
      destination,
      worn[destination].filter((_, i) => i !== index),
    );
    setAnnouncement(
      `${runeName} removed from the ${DESTINATION_LABEL[destination]}. ` +
        `${used - 1} of ${RUNE_PAGE_SLOTS} rune slots used.`,
    );
  };

  /** Remove controls are numbered across the whole page, in the order they are drawn. */
  let controlOrdinal = 0;

  const notCurated = runes.filter((r) => runeEffect(r.id, sources).kind === 'no-stored-value');
  const storedNotApplied = runes.filter(
    (r) => runeEffect(r.id, sources).kind === 'stored-not-applied',
  );

  return (
    <section className="runes" aria-label={`${role} runes`}>
      <header className="runes__head">
        <h3 className="runes__title">Runes</h3>
        <p className="runes__count">
          {used} of {RUNE_PAGE_SLOTS} rune slots used
        </p>
      </header>

      {/* WHAT WEARING A RUNE DOES, COUNTED FROM THE DATA ON EVERY RENDER. Not a typed number and
          not a claim about the roster: it counts the pool this picker was handed. */}
      <p className="runes__modelled">
        <strong className="runes__modelled-claim">
          {counts.applied} of {counts.total} runes change a number.
        </strong>{' '}
        {counts.stored} more carry a stored value the calculator cannot apply yet, and{' '}
        {counts.none} have no stored value at all. Every one of them can be worn, and each says
        which it is.
      </p>

      {/* THE PAGE'S TREE COMPOSITION, as a fact rather than a verdict. Arithmetic over
          `Rune.tree`, which the source states for all 62 — it says what the page IS and makes no
          claim about what the client would accept, because no source here states the legality
          rules. See `treeComposition`. Drawn only once something is worn: "none · none · none"
          is a line that costs a row and tells a reader nothing they cannot see. */}
      {used > 0 ? (
        <p className="runes__composition">
          {DESTINATIONS.map(
            (d) => `${DESTINATION_LABEL[d]}: ${treeComposition(worn[d], byId)}`,
          ).join(' · ')}
        </p>
      ) : null}

      {/* ═══ THE PAGE ═══ */}
      <div className="runes__page" ref={pageRef}>
        {DESTINATIONS.map((destination) => {
          const ids = worn[destination];
          const full = ids.length >= CAPACITY[destination];
          return (
            <div className="runes__slot-group" key={destination}>
              <p className="runes__slot-label">
                {DESTINATION_LABEL[destination]} — {ids.length} of {CAPACITY[destination]}
              </p>
              {ids.length === 0 ? (
                <p className="runes__empty">
                  No {DESTINATION_LABEL[destination]} chosen. The page is that much emptier, and no
                  figure is affected either way.
                </p>
              ) : (
                <ul className="runes__worn">
                  {ids.map((id, index) => {
                    const rune = byId.get(id);
                    const effect = runeEffect(id, sources);
                    const name = rune?.name ?? `rune id ${id}`;
                    const controlIndex = controlOrdinal;
                    controlOrdinal += 1;
                    return (
                      <li className="runes__row" key={`${id}-${index}`}>
                        <span className="runes__ident">
                          {/* `decorative`: the row's own text already names the rune, and two
                              labelled elements in one row announce it twice. An id the pool does
                              not carry has no icon URL, so it gets no chip — and the line beside
                              it says why rather than leaving a gap. */}
                          {rune ? (
                            <RuneChip src={rune.icon} runeName={rune.name} size="table" decorative />
                          ) : null}
                          <span className="runes__name">{name}</span>
                          <span className="runes__where">
                            {rune
                              ? runeOrigin(rune)
                              : 'not in this patch’s rune pool — it was carried in from a link'}
                          </span>
                        </span>

                        {/* THE HONEST STATEMENT, drawn exactly as an excluded ability is drawn.
                            `ExcludedAbility` for the two states that move nothing — mark, name and
                            reason, all on screen rather than only in the accessibility tree — and
                            the plain status mark for the one that does, carrying the curated
                            entry's own verification status. */}
                        {effect.kind === 'applied' ? (
                          <span className="runes__effect">
                            <VerificationStatusMark
                              status={effect.verification}
                              spokenSubject={`${name}, ${runeEffectSentence(effect)}`}
                            />
                          </span>
                        ) : (
                          <span className="runes__effect">
                            <ExcludedAbility
                              sourceLabel={name}
                              reason={{ kind: 'pending', note: runeEffectSentence(effect) }}
                              spokenContext={`worn as the ${role}'s ${DESTINATION_LABEL[destination]}`}
                            />
                          </span>
                        )}

                        <button
                          type="button"
                          className="runes__remove"
                          aria-label={removeRuneName(
                            name,
                            destination,
                            role,
                            index + 1,
                            ids.length,
                          )}
                          onClick={() => remove(name, destination, index, controlIndex)}
                        >
                          <span aria-hidden="true">✕</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {full ? <p className="runes__full">{fullNotice(destination)}</p> : null}
            </div>
          );
        })}

        {/* ═══ STAT SHARDS — THE ROW IS DRAWN BECAUSE NOTHING IS PUBLISHED, NOT DESPITE IT ═══
            SPECIFICATION §2 step 4 includes stat shards in a full rune page, and §7 records that
            they appear in NO fetched source: `curated.shards` is empty, so there are zero to
            offer. Omitting the row would leave a reader to conclude the page they built was
            complete. An id carried in on a shared link is still shown, for the same reason an
            unknown item id is: a slot that silently disappears is a slot a user cannot fix. */}
        <div className="runes__slot-group">
          <p className="runes__slot-label">
            stat shards — {page.shards.length} of {SHARD_SLOTS}
          </p>
          {page.shards.length > 0 ? (
            <ul className="runes__worn">
              {page.shards.map((id, index) => (
                <li className="runes__row" key={`${id}-${index}`}>
                  <span className="runes__ident">
                    <span className="runes__name">{id}</span>
                    <span className="runes__where">
                      carried in from a link — no stat shard is published, so nothing describes it
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="runes__empty">
            {shards.length === 0
              ? `No stat shards are published — they appear in no fetched source and none has been ` +
                `hand-entered yet, so there are ${SHARD_SLOTS} slots and nothing to put in them. ` +
                `A page built here is a page without shards, and no shard changes a number.`
              : `${shards.length} stat shards are published.`}
          </p>
        </div>
      </div>

      {/* ═══ THE POOL. Not drawn at rest; one focus scope, exactly as the item pool is. ═══ */}
      <div
        className="runes__find"
        onFocus={() => setFocused(true)}
        onBlur={(e) => {
          if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) setFocused(false);
        }}
      >
        <label className="runes__search">
          <span className="runes__search-label">{`Search ${role} runes`}</span>
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
        </label>

        {/* POOL FACTS ONLY. It moves when the user searches and at no other time. */}
        <p className="runes__status" role="status" aria-live="polite">
          {statusLine({ showPool, matched: matches.length, total: runes.length })}
        </p>

        {showPool ? (
          <ul className="runes__pool">
            {drawn.map((rune) => {
              const effect = runeEffect(rune.id, sources);
              const sentence = runeEffectSentence(effect);
              const already = isWorn(rune.id);
              return (
                <li className="runes__match" key={rune.id}>
                  <span className="runes__ident">
                    <RuneChip src={rune.icon} runeName={rune.name} size="table" decorative />
                    <span className="runes__name">{rune.name}</span>
                    <span className="runes__where">{runeOrigin(rune)}</span>
                  </span>
                  {/* The short marker on screen; the whole sentence is in every button's name
                      below, so no rune is ever offered without saying what it does to a total. */}
                  <span className="runes__marker">{runeEffectMarker(effect)}</span>
                  <span className="runes__actions">
                    {destinationsFor(rune).map((destination) => {
                      const full = worn[destination].length >= CAPACITY[destination];
                      return (
                        <button
                          type="button"
                          className="runes__add"
                          key={destination}
                          aria-label={addRuneName(rune, destination, role, sentence)}
                          disabled={full || already}
                          onClick={() => add(rune, destination)}
                        >
                          {already ? 'worn' : DESTINATION_LABEL[destination]}
                        </button>
                      );
                    })}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      {/* ═══ THE GAP, NAMED AT ROSTER SCALE AND NOT ONLY RUNE BY RUNE ═══
          Each rune already states its own case where it is offered. These two say how big the gap
          is, which is the fact a reader calibrates their trust against. Both are collapsed with
          their count ON the control — SPECIFICATION §11, and `collapsed-sections.test.ts` refuses
          a Disclosure without one. */}
      <Disclosure
        className="runes__gap"
        label="Runes with a stored value the calculator cannot apply"
        count={storedNotApplied.length}
        noun="rune"
      >
        <ul className="runes__gap-list">
          {storedNotApplied.map((rune) => {
            const effect = runeEffect(rune.id, sources);
            return (
              <li key={rune.id}>
                <ExcludedAbility
                  sourceLabel={rune.name}
                  reason={{ kind: 'pending', note: runeEffectSentence(effect) }}
                  spokenContext={`published, and offered in this picker`}
                />
              </li>
            );
          })}
        </ul>
      </Disclosure>

      <Disclosure
        className="runes__gap"
        label="Runes with no stored value at all"
        count={notCurated.length}
        noun="rune"
      >
        {/* ONE SENTENCE AND THE NAMES, rather than one block per rune. The reason is identical for
            every one of them — no value has been curated — so repeating it 55 times would bury the
            names, and it is the NAMES that answer "is the rune I want in here?". */}
        <p className="runes__gap-why">
          No rune value has been curated for any of these. Each can be worn, and each adds nothing
          to a result:
        </p>
        <p className="runes__gap-names">{notCurated.map((r) => r.name).join(', ')}</p>
      </Disclosure>

      <span className="u-visually-hidden" role="status" aria-live="polite">
        {announcement}
      </span>
    </section>
  );
}
