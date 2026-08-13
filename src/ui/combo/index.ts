// The combo builder — an ability SHELF of icon-chips, never lettered buttons (§10.1).
//
// NOT WIRED INTO THE APP. `src/main.tsx` is outside this area; the lead mounts it.

export { ComboBuilder } from './ComboBuilder';
export type { ComboBuilderProps } from './ComboBuilder';
export {
  BASIC_ATTACK_MARKER,
  BASIC_ATTACK_REF,
  SLOT_ORDER,
  UNKNOWN_REF_MARKER,
  appendStep,
  damageTypeClause,
  moveName,
  moveStep,
  nextStepId,
  removeName,
  removeStep,
  shelfButtonName,
  sortBySlot,
  stepLabel,
  stepName,
  viewSteps,
} from './sequence';
export type { ShelfAbility, StepView } from './sequence';
