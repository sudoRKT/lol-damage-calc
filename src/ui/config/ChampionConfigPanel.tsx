// ONE COMBATANT'S CONFIGURATION — champion, level, ability ranks.
//
// SPECIFICATION §2, steps 1–7: a champion is chosen, then a level, then ability ranks, then
// items, then a full rune page, then entry state — for each of the two champions. This panel
// covers the first three and SAYS SO ON SCREEN about the rest. That is deliberate: a
// configuration panel that silently omits items and runes invites a user to read a result as
// though their build had been modelled.
//
// EVERY NUMBER GOES THROUGH `NumberInput`. It is the only place negative zero is clamped, and
// `../inputs/negative-zero-sweep.test.tsx` fails, naming the file, if any component in this area
// hand-rolls a numeric field instead.
//
// ABILITY RANK LIMITS ARE READ, NEVER INFERRED. `Champion.abilityMaxRanks` comes from Data
// Dragon's own `maxrank` (src/types/data.ts), because the familiar "5 for Q/W/E, 3 for R" is
// wrong for 21 abilities across 8 champions — Udyr's stances rank to 6, Karma's ultimate to 4.
// Where the roster records no rank count for a slot, the field is DISABLED and says why rather
// than offering a limit this product made up.

import type { Champion, ChampionConfig } from '../../types';
import { ChampionPicker } from '../picker';
import { NumberInput } from '../inputs';
import { CombatantNameplate } from '../stats';
import { portraitUrl } from '../data/roster';
import { CAPABILITY } from '../coverage';
import './config.css';

/** The four rankable slots, in the order the game prints them. */
const RANK_SLOTS = ['Q', 'W', 'E', 'R'] as const;
type RankSlot = (typeof RANK_SLOTS)[number];

/** What this panel does NOT configure yet. Printed on screen, never left to be assumed. */
export const NOT_YET_CONFIGURED = [
  'Items',
  'Entry state — stacks and debuffs already active when the combo begins',
];

/**
 * THE LINE THIS PANEL WILL NOT PRINT, AND WHY IT IS NAMED HERE RATHER THAN DELETED.
 *
 * Until 2026-08-15 the footnote list carried this string under the eyebrow "NOT CONFIGURED IN THIS
 * PANEL YET". Measured on the live page, that was the ONLY mention of runes on the calculator, and
 * it said the wrong thing twice over:
 *
 *   1. "in this panel yet" is what the list says about ITEMS — and items really are configured in
 *      the panel below, in the same list, in so many words. So the grammar of the list promises a
 *      rune control somewhere else on the page. There is none, anywhere.
 *   2. It describes a CONFIGURATION gap. The actual gap is a MODELLING one: `capability.json`
 *      records 0 of 62 runes with a modelled effect, so a rune control would move no figure even
 *      if one existed. A reader who took the list at its word would go looking for a control, not
 *      adjust their reading of the total.
 *
 * The honest statement is a different KIND of claim from the rest of the list, so it is its own
 * sentence below the list rather than another middle-dot item in it, and its figures are read from
 * `capability.json` — the same committed file the landing page reads, so the two pages cannot
 * disagree about how many runes are modelled.
 *
 * The string survives as a constant because `src/ui/app/App.tsx` (the lead's file, which this area
 * may not write) still passes it in `CONFIGURED_ELSEWHERE`. The panel refuses it by exact identity
 * rather than printing a claim it knows to be false. When the lead removes that line the filter
 * becomes a no-op and this constant can go with it; `ChampionConfigPanel.test.tsx` reads App.tsx as
 * text and fails if the line is ever REWORDED, because a reworded line would slip past the filter
 * and the contradiction would be back on screen with nothing to catch it.
 */
export const SUPERSEDED_RUNE_ENTRY = 'Runes — keystone, minor runes and stat shards';

export interface ChampionConfigPanelProps {
  /** "Attacker" or "Defender". */
  role: string;
  champions: readonly Champion[];
  /** The champion currently in play, or null before one is chosen. */
  champion: Champion | null;
  config: ChampionConfig;
  onChange: (config: ChampionConfig, champion: Champion) => void;
  patch: string;
  /**
   * What this panel does NOT configure, printed on screen. Defaults to `NOT_YET_CONFIGURED`.
   *
   * IT IS A PROP BECAUSE THE LIST STOPPED BEING FIXED. The page composed in `../app/App.tsx`
   * configures items in a panel of its own, so leaving "Items" in the default list would print a
   * sentence that is no longer true — and a panel that misstates what was modelled is worse than
   * one that lists nothing, because a user calibrates their trust against it.
   *
   * ONE ENTRY IS REFUSED: `SUPERSEDED_RUNE_ENTRY`. The panel states the rune fact itself, from
   * generated counts, and will not also print a caller's claim that contradicts it.
   */
  notConfigured?: readonly string[];
}

export function ChampionConfigPanel({
  role,
  champions,
  champion,
  config,
  onChange,
  patch,
  notConfigured = NOT_YET_CONFIGURED,
}: ChampionConfigPanelProps) {
  const listed = notConfigured.filter((item) => item !== SUPERSEDED_RUNE_ENTRY);

  const update = (next: Partial<ChampionConfig>) => {
    if (!champion) return;
    onChange({ ...config, ...next }, champion);
  };

  return (
    <section className="config" aria-label={`${role} configuration`}>
      {/* THE NAMEPLATE AND THE PICKER SIT SIDE BY SIDE. Both are ~68px tall and neither needs
          the full panel width, so stacking them cost a whole row of height for nothing. This
          is layout only: the same two components, the same accessible names. */}
      <div className="config__top">
        <CombatantNameplate
          role={role}
          championName={champion?.name ?? 'No champion chosen'}
          portraitSrc={champion ? portraitUrl(patch, champion.icon) : null}
          level={config.level}
        />

        <div className="config__pick">
          <ChampionPicker
            label={`${role} champion`}
            champions={champions}
            selected={champion}
            onSelect={(picked) =>
              onChange(
                // A new champion resets nothing else: level and ranks are the user's, and
                // silently rewriting them would change a scenario they did not edit.
                { ...config, apiname: picked.apiname },
                picked,
              )
            }
            patch={patch}
          />
        </div>
      </div>

      <div className="config__fields">
        <NumberInput
          label={`${role} level`}
          value={config.level}
          min={1}
          max={18}
          step={1}
          hint="1 to 18"
          onChange={(level) => update({ level })}
        />

        {RANK_SLOTS.map((slot) => {
          const max = champion?.abilityMaxRanks?.[slot];
          return (
            <NumberInput
              key={slot}
              label={`${slot} rank`}
              value={config.abilityRanks[slot as RankSlot]}
              min={1}
              max={max}
              step={1}
              disabled={!champion || max === undefined}
              hint={
                champion === null
                  ? 'choose a champion first'
                  : max === undefined
                    ? 'the roster records no rank count for this slot'
                    : `1 to ${max}`
              }
              onChange={(rank) =>
                update({ abilityRanks: { ...config.abilityRanks, [slot]: rank } })
              }
            />
          );
        })}
      </div>

      {/* WHAT IS NOT MODELLED HERE STAYS ON SCREEN, in full, unabridged — a panel that
          silently omits what it left out invites a user to read a result as though their build had
          been modelled. What changed is only its SHAPE: an eyebrow plus a three-line bulleted list
          took ~100px of the first screen to say three short things, so it is now one wrapping
          footnote row. Every item is still its own element with its own exact text. */}
      <div className="config__note">
        <p className="config__eyebrow">Not configured in this panel yet</p>
        <ul className="config__missing">
          {listed.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      {/* RUNES — stated, not promised. See SUPERSEDED_RUNE_ENTRY above for what this replaced.
          Both counts come from `capability.json`, which is generated from `public/data/runes.json`
          and the curated overrides, so neither can be typed wrong or go quietly stale after a
          patch. It sits outside `.config__note` because it is not a configuration gap. */}
      <p className="config__runes">
        <strong className="config__runes-claim">
          {CAPABILITY.runesModelled} of {CAPABILITY.runesPublished} runes change a number.
        </strong>{' '}
        The whole pool is published; almost none of it is applied. There is no rune control here
        yet, so a rune that does have a modelled effect reaches a result only through a shared
        link. Read a total on this page as a total with {CAPABILITY.runesModelled === 0 ? 'no' : 'almost no'}{' '}
        runes in it.
      </p>
    </section>
  );
}
