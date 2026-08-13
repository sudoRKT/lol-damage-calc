// The champion picker — searchable, keyboard-navigable, over the full roster (§10).
//
// NOT WIRED INTO THE APP. `src/main.tsx` is outside this area; the lead mounts it. It needs
// only a roster (from `../data/roster`), the champion currently in play, and the patch the art
// is served for.

export { ChampionPicker, optionName } from './ChampionPicker';
export type { ChampionPickerProps } from './ChampionPicker';
export { filterChampions, initials, matchScore, nameWords, normalize } from './filter';
