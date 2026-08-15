// THE DEFENDER'S CONDITIONAL DEFENCES — the user says which ones were up.
//
// ═══ WHY THIS EXISTS ═══
//
// 152 of the 155 stored defensive entries are `conditional`, across 87 champions (measured over
// `curated/curated-data.json`, patch 16.16.1 — the same population `src/types/toggle-key.test.ts`
// asserts). **The engine cannot know whether Braum's shield was up when the combo landed.**
// SPECIFICATION §3.3 fixes where the answer lives: `ChampionConfig.entryState` holds
// "conditional-defence toggles". This panel is where a user states them.
//
// ═══ THE THREE RULES THIS FILE IS BUILT AROUND ═══
//
// 1. **THE KEY IS NEVER BUILT HERE.** `defensiveToggleKey` is exported from `src/types/data.ts`
//    and is called, never reimplemented. The interface writes these keys and the engine reads
//    them back; two areas deriving "the same" key from the same fields is exactly the cross-area
//    seam DATA-SOURCES §44 was written about — both suites pass and the toggle silently never
//    fires. `defences-logic.test.ts` asserts this file produces byte-identical keys to the
//    contract function over all 152 real entries.
//
// 2. **ABSENT MEANS NOT UP.** Turning a defence OFF deletes its keys rather than writing
//    `false`. The two are equivalent to a reader of `entryState` — the contract says absent means
//    not up — and deleting keeps a shared link short (SPECIFICATION §12). Nothing here ever
//    writes a toggle the user did not set: asserting a defence they never stated would mitigate
//    damage the game did not, which is a plausible wrong number in the defender's favour.
//
// 3. **AN INCOMPLETE ENTRY GETS NO TOGGLE.** 27 of the 152 are `incomplete`, 26 of them because
//    the source names a stat and never says whose (`unresolvable`). A toggle for one would be a
//    control that changes nothing while looking like it does. Those rows render as a named
//    refusal — `ExcludedAbility`, the same component the result's exclusion lists use — so the
//    ability and the missing fact are on screen rather than only in the accessibility tree.
//
// ═══ ONE TOGGLE IS ONE ABILITY, AND THAT IS MEASURED ═══
//
// 110 abilities carry the 152 entries. **35 of those abilities carry more than one entry, and in
// all 35 the `condition` string is IDENTICAL across them** — Garen W states one condition and
// grants damage reduction and a shield together. A user answers one question ("was Courage up?"),
// so one control writes every key on that ability. Grouping by entry instead would ask the same
// question up to three times and let a user answer it inconsistently.
//
// **Garen W is the one ability whose entries disagree about status** (one `derived`, one
// `incomplete`). It gets its toggle AND its refusal row: the part that can be stated is stated,
// and the part that cannot says so. A whole-ability rule in either direction would have been
// wrong for it.
//
// ═══ NO NUMBERS ON THIS PANEL, DELIBERATELY ═══
//
// A row names the ability, what kind of defence it is, and the source's own condition. It states
// no figure. The figure depends on ability rank, champion level and — for a `byRangeType` value —
// the holder's range type, and `CuratedDefensiveEffect` carries no `maxRank` to resolve a rank
// series against. A panel that printed "55%" beside a toggle would be printing a number nothing
// had checked, next to the number the result will actually use. The resolved figure belongs to
// the breakdown, which reports it with its verification status.

import type { CuratedDefensiveEffect, DefensiveKind, IncompleteReason } from '../../types';
import { defensiveToggleKey } from '../../types';
import { ExcludedAbility } from '../primitives';
import './defences.css';

/** Each of the nine kinds in words. Never a bare enum value, and never a colour (DESIGN.md §1). */
export const DEFENSIVE_KIND_LABEL: Record<DefensiveKind, string> = {
  'damage-reduction': 'Damage reduction',
  'type-specific-reduction': 'Damage reduction',
  'resistance-grant': 'Resistances',
  shield: 'Shield',
  'spell-shield': 'Spell shield',
  immunity: 'Immunity',
  'execute-threshold': 'Execute threshold',
  heal: 'Healing',
  'max-health-grant': 'Bonus maximum health',
};

/**
 * What one entry does, in words, refined by the two fields that change the answer.
 *
 * `grantedStat` and `appliesToDamageType` are not decoration. `kind: 'resistance-grant'` plus a
 * number cannot distinguish armor from magic resistance, and that is the difference between
 * mitigating physical damage and mitigating magic damage (src/types/data.ts). A row that said
 * only "Resistances" would leave a Leona W user unable to tell their two toggles apart.
 */
export function describeDefence(entry: CuratedDefensiveEffect): string {
  if (entry.kind === 'resistance-grant') {
    if (entry.grantedStat === 'armor') return 'Armor';
    if (entry.grantedStat === 'magicResist') return 'Magic resistance';
    if (entry.grantedStat === 'both') return 'Armor and magic resistance';
    return DEFENSIVE_KIND_LABEL[entry.kind];
  }
  if (entry.appliesToDamageType) {
    const type =
      entry.appliesToDamageType === 'magic'
        ? 'magic'
        : entry.appliesToDamageType === 'physical'
          ? 'physical'
          : 'true';
    return `${DEFENSIVE_KIND_LABEL[entry.kind]} against ${type} damage`;
  }
  return DEFENSIVE_KIND_LABEL[entry.kind];
}

/**
 * Why an entry cannot be stated, in the shape the status mark already reads.
 *
 * `unresolvable` means no source states the fact, so nobody can ever supply it — `permanent`, the
 * `⊘` state, "Cannot be completed". An `incomplete` entry with no `unresolvable` is `pending`:
 * somebody has not got to it yet. Claiming permanent on missing evidence would be the stronger
 * claim on the weaker grounds, so the fallback is pending (SPECIFICATION §8).
 */
export function incompleteReasonFor(entry: CuratedDefensiveEffect): IncompleteReason {
  if (entry.unresolvable && entry.unresolvable.length > 0) {
    return { kind: 'permanent', missingFacts: entry.unresolvable };
  }
  // A `not-stated` entry is NOT missing data. The source states its condition perfectly well —
  // this engine has no way to represent it (a distance, a location outside combat). So the note
  // is the source's own words, and never the generic "not read yet", which would blame the
  // harvest for something the harvest did correctly.
  if (entry.activation === 'not-stated' && entry.condition) {
    return { kind: 'pending', note: entry.condition };
  }
  return {
    kind: 'pending',
    note: 'this defence is recorded but its value has not been read from the source yet',
  };
}

/** One ability's worth of conditional defence — the unit a user answers one question about. */
export interface DefenceGroup {
  /** Stable React key and test handle. Not a toggle key; those are in `toggleKeys`. */
  id: string;
  slot: string;
  abilityName: string;
  /** "W — Courage", the way every other surface in this product names an ability. */
  sourceLabel: string;
  /** The source's own words for what has to be true. Present on all 152 conditional entries. */
  condition: string;
  /**
   * The `entryState` keys this one control writes, from `defensiveToggleKey` and nowhere else.
   * Empty when every entry on the ability is incomplete — which is what makes the control absent.
   */
  toggleKeys: string[];
  /** What turning it on asserts, in words — one phrase per statable entry, deduplicated. */
  effects: string[];
  /** Entries that cannot be stated, each with the reason the status mark will announce. */
  refusals: Array<{ entry: CuratedDefensiveEffect; reason: IncompleteReason }>;
  /** `'conditional'` is a toggle. `'not-stated'` is a refusal the engine cannot represent. */
  activation: CuratedDefensiveEffect['activation'];
}

/**
 * Group a champion's defensive entries into the controls this panel shows.
 *
 * FILTERS `always-active` OUT. Those bake into the resolved stat block and are not a question
 * anyone answers; showing one as a toggle would invite a user to switch off something that is
 * always on. `not-stated` entries are kept, as refusals: the source states a condition this
 * engine has no way to represent (a distance, a location outside combat), and a refusal that is
 * visible is honest where an entry that silently vanished is not.
 */
export function groupDefences(entries: readonly CuratedDefensiveEffect[]): DefenceGroup[] {
  const order: string[] = [];
  const byAbility = new Map<string, CuratedDefensiveEffect[]>();

  for (const entry of entries) {
    if (entry.activation === 'always-active') continue;
    const id = `${entry.slot}|${entry.abilityName}`;
    if (!byAbility.has(id)) {
      byAbility.set(id, []);
      order.push(id);
    }
    byAbility.get(id)!.push(entry);
  }

  return order.map((id) => {
    const group = byAbility.get(id)!;
    const first = group[0]!;
    const statable = group.filter(
      (e) => e.verification !== 'incomplete' && e.activation === 'conditional',
    );
    const refused = group.filter(
      (e) => e.verification === 'incomplete' || e.activation !== 'conditional',
    );

    return {
      id,
      slot: first.slot,
      abilityName: first.abilityName,
      sourceLabel: `${first.slot} — ${first.abilityName}`,
      condition: first.condition ?? '',
      // THE ONE PRODUCER OF A TOGGLE KEY. Never a template string built here.
      toggleKeys: statable.map((e) => defensiveToggleKey(e)),
      effects: [...new Set(statable.map(describeDefence))],
      refusals: refused.map((entry) => ({ entry, reason: incompleteReasonFor(entry) })),
      activation: first.activation,
    };
  });
}

/**
 * Is this defence stated as up?
 *
 * TRUE ONLY WHEN EVERY KEY IS SET. A group with some keys set and some not is a state this panel
 * cannot produce, but a link or a hand-edited scenario can; reading it as "up" would apply
 * mitigation the user never stated for the missing half. Reading it as "not up" is the
 * conservative direction — it can only ever overstate the damage taken, never understate it.
 */
export function isDefenceUp(
  entryState: Readonly<Record<string, number | boolean>>,
  group: DefenceGroup,
): boolean {
  if (group.toggleKeys.length === 0) return false;
  return group.toggleKeys.every((key) => entryState[key] === true);
}

/**
 * The entry state with this defence set up or not up.
 *
 * Returns a new object; never mutates. Setting it NOT UP deletes the keys rather than writing
 * `false`, because absent means not up and a shorter object is a shorter link.
 */
export function setDefenceUp(
  entryState: Readonly<Record<string, number | boolean>>,
  group: DefenceGroup,
  up: boolean,
): Record<string, number | boolean> {
  const next = { ...entryState };
  for (const key of group.toggleKeys) {
    if (up) next[key] = true;
    else delete next[key];
  }
  return next;
}

export interface DefenderDefencesProps {
  /** The defender, named on screen and in every accessible name. */
  championName: string;
  /** Every defensive entry the catalogue holds for that champion, in any activation. */
  entries: readonly CuratedDefensiveEffect[];
  /** The defender's `ChampionConfig.entryState`, read for the current answers. */
  entryState: Readonly<Record<string, number | boolean>>;
  /** Called with the WHOLE next entry state. The caller writes it back to its config. */
  onChange: (entryState: Record<string, number | boolean>) => void;
  /**
   * Does the engine apply these yet?
   *
   * DEFAULTS TO FALSE, AND THAT IS THE MEASURED TRUTH TODAY. `Catalogue.defensiveEffects` is
   * declared on the engine's interface (src/engine/simulate.ts:80) and never called, so no
   * defensive entry of any kind reaches a damage figure. A panel of controls that silently do
   * nothing is the thing this product exists not to be, so it says so. Flip this when the engine
   * consumes them; the note disappears and nothing else changes.
   */
  appliedByEngine?: boolean;
}

/**
 * The defender's conditional defences, as one question per ability.
 *
 * NO HUE ANYWHERE — a defence is not damage data, and DESIGN.md §1 reserves every hue for the
 * three damage types. Every distinction here is border, weight, glyph and label.
 */
export function DefenderDefences({
  championName,
  entries,
  entryState,
  onChange,
  appliedByEngine = false,
}: DefenderDefencesProps) {
  const groups = groupDefences(entries);
  const toggleable = groups.filter((g) => g.toggleKeys.length > 0);

  return (
    <section className="defences" aria-label={`${championName} conditional defences`}>
      <div className="defences__head">
        <p className="defences__eyebrow">Defender conditional defences</p>
        <p className="defences__lede">
          {groups.length === 0
            ? `No conditional defence is recorded for ${championName}.`
            : `Say which of ${championName}'s defences were up when the combo landed. ` +
              `Anything left unticked is treated as not up.`}
        </p>
      </div>

      {!appliedByEngine && toggleable.length > 0 ? (
        // SAID PLAINLY, NOT BURIED. The engine does not read defensive entries yet, so a tick
        // here changes no damage figure. Stating that is the difference between a control that
        // is not wired up and a control that lies about being wired up.
        <p className="defences__pending">
          These answers are recorded in the scenario, but nothing applies them to the damage
          figures yet — the calculation does not read defensive abilities.
        </p>
      ) : null}

      {groups.length > 0 ? (
        <ul className="defences__list">
          {groups.map((group) => {
            const controlId = `defence-${championName}-${group.id}`.replace(/[^A-Za-z0-9-]+/g, '-');
            const describedBy = `${controlId}-detail`;
            const up = isDefenceUp(entryState, group);

            return (
              <li className="defences__row" key={group.id}>
                {group.toggleKeys.length > 0 ? (
                  // THE ROW IS THE TARGET, AND IT IS A <label> FOR THAT REASON (WCAG 2.2 AA
                  // 2.5.8). It used to be a <div> holding a checkbox and a separate bound label,
                  // and browser measurement at 375px showed why that fails: the div was 293 x
                  // 30.50px and accepted no pointer anywhere, the checkbox was 13 x 13.00px and
                  // the text 141.63 x 22.50px, with 11px of dead box between them. Both live
                  // pieces were under 24px on the block axis. Wrapping makes the one box a
                  // contiguous target and costs no layout at all.
                  <label className="defences__control" htmlFor={controlId}>
                    <input
                      className="defences__check"
                      type="checkbox"
                      id={controlId}
                      checked={up}
                      aria-describedby={describedBy}
                      onChange={(event) =>
                        onChange(setDefenceUp(entryState, group, event.target.checked))
                      }
                    />
                    {/* THE NAME IS A SENTENCE, NEVER A SLOT LETTER. SPECIFICATION §10.1 bans a
                        control named by a bare letter, and "W" would be exactly that. The
                        condition is NOT in the name — it is up to 126 characters of the source's
                        own prose, which belongs in a description a reader reaches on focus
                        rather than in a name read out every time the control is announced.

                        A <span>, not a nested <label>: the row above is the label now, and a
                        label inside a label is invalid and would split one target into two. */}
                    <span className="defences__label">{group.sourceLabel} was up</span>
                  </label>
                ) : (
                  <p className="defences__label defences__label--static">{group.sourceLabel}</p>
                )}

                <div className="defences__detail" id={describedBy}>
                  {group.effects.length > 0 ? (
                    <p className="defences__effects">{group.effects.join(' · ')}</p>
                  ) : null}
                  {group.condition ? (
                    <p className="defences__condition">
                      <span className="defences__conditionLead">When:</span> {group.condition}
                    </p>
                  ) : null}
                  {group.refusals.map(({ entry, reason }) => (
                    <p className="defences__refusal" key={defensiveToggleKey(entry)}>
                      <ExcludedAbility
                        sourceLabel={`${describeDefence(entry)} on ${group.sourceLabel}`}
                        reason={reason}
                        spokenContext="cannot be stated here"
                      />
                    </p>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
