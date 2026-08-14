// One combatant's configuration — champion, level, ability ranks (SPECIFICATION §2 steps 1–3).
// What it does NOT yet configure is printed on screen, never assumed.

export { ChampionConfigPanel, NOT_YET_CONFIGURED } from './ChampionConfigPanel';
export type { ChampionConfigPanelProps } from './ChampionConfigPanel';

// The defender's conditional defences (SPECIFICATION §3.3, §5) — the user states which were up.
// Exported, not mounted: `src/ui/app/` is lead-only and an agent never wires its own component.
export {
  DefenderDefences,
  groupDefences,
  isDefenceUp,
  setDefenceUp,
  describeDefence,
  incompleteReasonFor,
  DEFENSIVE_KIND_LABEL,
} from './DefenderDefences';
export type { DefenderDefencesProps, DefenceGroup } from './DefenderDefences';
