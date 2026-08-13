// Named test scenarios for the shared-link round trip.
//
// Every scenario here has a NAME, and results are reported against those names rather than
// as a count of anonymous assertions. Each one exists to exercise something specific about
// the Scenario type that could plausibly be lost in a link; the comment on each says what.
//
// Area F (src/url/). Reads the frozen contract in src/types/; writes nothing there.

import type { Scenario, ChampionConfig, ComboStep } from '../types/scenario';
import { MOCK_SCENARIO } from '../types/mock-result';

/** A champion config with everything at its emptiest legal value. */
function bareChampion(apiname: string): ChampionConfig {
  return {
    apiname,
    level: 1,
    abilityRanks: { Q: 0, W: 0, E: 0, R: 0 },
    items: [],
    runes: { keystone: null, primary: [], secondary: [], shards: [] },
    persistent: {},
    entryState: {},
  };
}

export interface NamedScenario {
  name: string;
  /** What this scenario is here to prove survives the round trip. */
  proves: string;
  scenario: Scenario;
}

const fullCombo: ComboStep[] = [
  { id: 's1', kind: 'ability', ref: 'Q', options: { cast: 1 } },
  { id: 's2', kind: 'basic-attack', ref: 'basic', options: { forceCrit: true } },
  { id: 's3', kind: 'empowered-attack', ref: 'W', options: { sweetspot: true } },
  { id: 's4', kind: 'item-active', ref: '3153', options: { charged: false } },
  { id: 's5', kind: 'on-hit', ref: 'lich-bane', options: { stacks: 3 } },
];

export const NAMED_SCENARIOS: NamedScenario[] = [
  {
    name: 'minimal',
    proves: 'the emptiest legal scenario — no items, no runes, no state, no combo at all',
    scenario: {
      version: 1,
      attacker: bareChampion('Annie'),
      defender: bareChampion('Annie'),
      combo: [],
    },
  },

  {
    name: 'canonical-mock',
    proves: 'the one shared mock in src/types/ — the scenario every other area builds against',
    scenario: MOCK_SCENARIO,
  },

  {
    name: 'maximal',
    proves: 'every optional field populated at once: six items, full rune page, both kinds of entry state, options on every combo step',
    scenario: {
      version: 1,
      attacker: {
        apiname: 'Veigar',
        level: 18,
        abilityRanks: { Q: 5, W: 5, E: 5, R: 3 },
        items: [3157, 3089, 4645, 3135, 3020, 3116],
        runes: {
          keystone: 8112,
          primary: [8126, 8138, 8106],
          secondary: [8226, 8210],
          shards: ['adaptive', 'adaptive', 'health'],
        },
        persistent: { veigarStacks: 340, darkHarvestStacks: 27, gatheringStorm: 4 },
        entryState: { electrocuteReady: true, manaflowStacks: 10, cheapShotUsed: false },
      },
      defender: {
        apiname: 'Ornn',
        level: 18,
        abilityRanks: { Q: 5, W: 5, E: 5, R: 3 },
        items: [3068, 3143, 3110, 3075, 3193, 3047],
        runes: {
          keystone: 8437,
          primary: [8446, 8429, 8451],
          secondary: [5008, 5002],
          shards: ['armor', 'health', 'health'],
        },
        persistent: { chogathFeastStacks: 6 },
        entryState: { bonePlating: true, hemorrhageStacks: 2, secondWindReady: false },
      },
      combo: fullCombo,
    },
  },

  {
    name: 'persistent-only-attacker',
    proves: 'persistent accumulations (SPEC §3.3, folded in before the sequence) survive on the attacker with combat state empty',
    scenario: {
      version: 1,
      attacker: { ...bareChampion('Nasus'), persistent: { nasusQStacks: 812 } },
      defender: bareChampion('Malphite'),
      combo: [{ id: 'a', kind: 'ability', ref: 'Q' }],
    },
  },

  {
    name: 'combat-state-only-defender',
    proves: 'combat state (SPEC §3.3, seeded then mutated) survives on the defender with persistent empty — the Darius/Hemorrhage case named in the spec',
    scenario: {
      version: 1,
      attacker: bareChampion('Darius'),
      defender: { ...bareChampion('Sett'), entryState: { hemorrhageStacks: 2 } },
      combo: [{ id: 'a', kind: 'ability', ref: 'R' }],
    },
  },

  {
    name: 'both-entry-state-kinds-both-champions',
    proves: 'persistent and combat state are carried as two separate things on BOTH champions and never merged into one',
    scenario: {
      version: 1,
      attacker: {
        ...bareChampion('Senna'),
        persistent: { sennaSouls: 92 },
        entryState: { conquerorStacks: 5 },
      },
      defender: {
        ...bareChampion('Kindred'),
        persistent: { kindredMarks: 8 },
        entryState: { bonePlating: true },
      },
      combo: [],
    },
  },

  {
    name: 'combo-order-q-then-auto',
    proves: 'an ordered combo, half of an order-matters pair',
    scenario: {
      version: 1,
      attacker: bareChampion('Riven'),
      defender: bareChampion('Riven'),
      combo: [
        { id: 'x', kind: 'ability', ref: 'Q' },
        { id: 'y', kind: 'basic-attack', ref: 'basic' },
      ],
    },
  },

  {
    name: 'combo-order-auto-then-q',
    proves: 'the same two steps in the other order — must round-trip AND must not share a link with its pair',
    scenario: {
      version: 1,
      attacker: bareChampion('Riven'),
      defender: bareChampion('Riven'),
      combo: [
        { id: 'y', kind: 'basic-attack', ref: 'basic' },
        { id: 'x', kind: 'ability', ref: 'Q' },
      ],
    },
  },

  {
    name: 'options-absent-vs-empty',
    proves: 'a step that carried no options does not come back carrying an empty bag, and one that carried an empty bag keeps it',
    scenario: {
      version: 1,
      attacker: bareChampion('Zed'),
      defender: bareChampion('Zed'),
      combo: [
        { id: 'none', kind: 'ability', ref: 'Q' },
        { id: 'empty', kind: 'ability', ref: 'W', options: {} },
      ],
    },
  },

  {
    name: 'keystone-null',
    proves: 'no keystone chosen is carried as "none"',
    scenario: {
      version: 1,
      attacker: { ...bareChampion('Yuumi'), runes: { keystone: null, primary: [1], secondary: [2], shards: ['a', 'b', 'c'] } },
      defender: bareChampion('Yuumi'),
      combo: [],
    },
  },

  {
    name: 'keystone-zero',
    proves: 'a keystone id of 0 is a different thing from no keystone and must not collapse into null',
    scenario: {
      version: 1,
      attacker: { ...bareChampion('Yuumi'), runes: { keystone: 0, primary: [1], secondary: [2], shards: ['a', 'b', 'c'] } },
      defender: bareChampion('Yuumi'),
      combo: [],
    },
  },

  {
    name: 'boolean-false-entry-state',
    proves: 'a combat-state toggle explicitly set to false survives as false and is not dropped for being falsy',
    scenario: {
      version: 1,
      attacker: bareChampion('Rell'),
      defender: { ...bareChampion('Rell'), entryState: { bonePlating: false, secondWind: false, stacks: 0 } },
      combo: [],
    },
  },

  {
    name: 'fractional-and-negative-state',
    proves: 'non-integer and negative accumulations survive exactly (armour shred is negative, some stacks are fractional)',
    scenario: {
      version: 1,
      attacker: { ...bareChampion('Kayle'), persistent: { gatheringStorm: 2.5, oddity: -17.25 } },
      defender: { ...bareChampion('Kayle'), entryState: { armorShred: -24, ratio: 0.3333333333333333 } },
      combo: [],
    },
  },

  {
    name: 'unicode-and-awkward-keys',
    proves: 'state keys and champion names with non-ASCII characters survive base64 and UTF-8 without mangling',
    scenario: {
      version: 1,
      attacker: { ...bareChampion('Kaisa'), persistent: { 'plasma·stacks': 4, 'ünïcode': 1 } },
      defender: { ...bareChampion('Chogath'), entryState: { 'ключ': true, '日本語': 3 } },
      combo: [{ id: 'ステップ', kind: 'ability', ref: 'Q', options: { note: 'sweet~spot=yes&no#hash' } }],
    },
  },

  {
    name: 'duplicate-and-ordered-items',
    proves: 'the item list keeps duplicates and keeps its order — it is a list, not a set',
    scenario: {
      version: 1,
      attacker: { ...bareChampion('Sion'), items: [3071, 3071, 3053, 1001, 3053] },
      defender: bareChampion('Sion'),
      combo: [],
    },
  },

  {
    name: 'all-five-step-kinds',
    proves: 'every one of the five ComboStepKind values encodes and comes back as itself',
    scenario: {
      version: 1,
      attacker: bareChampion('Jhin'),
      defender: bareChampion('Jhin'),
      combo: fullCombo,
    },
  },

  {
    name: 'nested-options',
    proves: 'a step-options bag holding nested objects, arrays, nulls and booleans survives structurally',
    scenario: {
      version: 1,
      attacker: bareChampion('Aphelios'),
      defender: bareChampion('Aphelios'),
      combo: [
        {
          id: 'deep',
          kind: 'ability',
          ref: 'Q',
          options: {
            guns: ['calibrum', 'severum'],
            marks: { count: 2, applied: true, source: null },
            empty: [],
            zero: 0,
            emptyString: '',
          },
        },
      ],
    },
  },

  {
    name: 'long-combo-twenty-steps',
    proves: 'a long ordered combo survives with every step in place — length and order together',
    scenario: {
      version: 1,
      attacker: bareChampion('Katarina'),
      defender: bareChampion('Katarina'),
      combo: Array.from({ length: 20 }, (_, i): ComboStep => ({
        id: `step-${i}`,
        kind: i % 2 === 0 ? 'basic-attack' : 'ability',
        ref: i % 2 === 0 ? 'basic' : 'QWER'[i % 4],
        ...(i % 3 === 0 ? { options: { n: i } } : {}),
      })),
    },
  },

  {
    name: 'max-level-max-ranks',
    proves: 'the top of the documented level range and full ability ranks survive',
    scenario: {
      version: 1,
      attacker: { ...bareChampion('Jax'), level: 18, abilityRanks: { Q: 5, W: 5, E: 5, R: 3 } },
      defender: { ...bareChampion('Jax'), level: 18, abilityRanks: { Q: 5, W: 5, E: 5, R: 3 } },
      combo: [],
    },
  },

  {
    name: 'empty-strings-everywhere',
    proves: 'empty-string ids and refs are carried as empty strings rather than becoming missing fields',
    scenario: {
      version: 1,
      attacker: { ...bareChampion('Ryze'), runes: { keystone: null, primary: [], secondary: [], shards: ['', '', ''] } },
      defender: bareChampion('Ryze'),
      combo: [{ id: '', kind: 'on-hit', ref: '' }],
    },
  },

  {
    name: 'asymmetric-champions',
    proves: 'attacker and defender are carried independently and are never swapped or shared',
    scenario: {
      version: 1,
      attacker: {
        apiname: 'Attacker',
        level: 3,
        abilityRanks: { Q: 2, W: 1, E: 0, R: 0 },
        items: [1055],
        runes: { keystone: 8005, primary: [9101], secondary: [], shards: ['adaptive'] },
        persistent: { a: 1 },
        entryState: { a: true },
      },
      defender: {
        apiname: 'Defender',
        level: 16,
        abilityRanks: { Q: 5, W: 5, E: 5, R: 2 },
        items: [3068, 3047],
        runes: { keystone: null, primary: [], secondary: [8299], shards: ['armor', 'health'] },
        persistent: { b: 2 },
        entryState: { b: false },
      },
      combo: [{ id: 'only', kind: 'item-active', ref: '3068' }],
    },
  },
];
