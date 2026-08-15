// The two pickers that select from a large published list — searchable and keyboard-navigable, as
// SPECIFICATION §10 requires: the champion roster, and the rune page.
//
// NOT WIRED INTO THE APP. `src/ui/app/` is outside this area; the lead mounts both. The champion
// picker needs a roster (from `../data/roster`), the champion in play and the patch its art is
// served for. The rune picker needs the published rune pool, the page, and the curated rune
// effects (`loadRuneEffects` in `../data/catalogue`) — it reads the engine's own delivery maps for
// what a rune actually does, so there is no second answer to that question in the interface.

export { ChampionPicker, optionName } from './ChampionPicker';
export type { ChampionPickerProps } from './ChampionPicker';
export { filterChampions, initials, matchScore, nameWords, normalize } from './filter';

export { RunePicker, addRuneName, removeRuneName, statusLine, fullNotice } from './RunePicker';
export type { RunePickerProps } from './RunePicker';
export {
  KEYSTONE_SLOT,
  PRIMARY_MINOR_SLOTS,
  SECONDARY_MINOR_SLOTS,
  RUNE_PAGE_SLOTS,
  SHARD_SLOTS,
  RUNE_VISIBLE_MATCHES,
  DESTINATION_LABEL,
  destinationsFor,
  effectCounts,
  filterRunes,
  runeEffect,
  runeEffectMarker,
  runeEffectSentence,
  runeMatchScore,
  runeOrigin,
  treeComposition,
} from './rune-page';
export type { RuneDestination, RuneEffect, RuneEffectSources } from './rune-page';
