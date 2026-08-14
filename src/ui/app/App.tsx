// THE PAGE — two champions, a combo, and a real number.
//
// This is the composition layer and almost nothing else: every part of it already existed and had
// never been joined up. The champion picker, the configuration panels, the item pickers, the combo
// builder, the stat blocks, the per-instance breakdown and the HP burndown are all unchanged; what
// is new is that a user's choices now become a `Scenario`, the published data becomes a
// `Catalogue`, and `simulate(scenario, catalogue)` turns the two into a `Result` on every edit.
//
// ═══ THE THREE THINGS THIS FILE EXISTS TO GET RIGHT ═══
//
// 1. **A REFUSAL NEVER LOOKS LIKE A SMALL NUMBER.** `simulate` refuses a scenario whose champion
//    or item it cannot find, and it refuses BY NAME. When it does, this page shows the named
//    refusals and NO total, no verdict and no chart — because a total that quietly excluded half
//    the scenario is the exact failure this product exists to prevent. A single unmodellable STEP
//    is different: it stays in the table as an `incomplete` instance contributing no damage and
//    naming its reason, which `InstanceBreakdown` prints in full.
//
// 2. **THE PATCH SITS BESIDE THE RESULT** (SPECIFICATION §8), never in a footer. Both the burndown
//    and the breakdown print it, and the result header prints it a third time with the
//    verification summary, because it is the first thing a reader needs in order to know what the
//    numbers describe.
//
// 3. **A CONTESTED CHAMPION IS DECLARED** (SPECIFICATION §8). Where Riot's two sources disagree
//    about a base statistic and nothing settles it, the value that ships with the patch is used
//    and the result must say so — naming the field and both observed values. Four of the 173
//    champions carry one today: Jhin, Kled, Tristana, Twitch.
//
// ═══ WHAT HAPPENS WHEN A CHAMPION HAS NO PUBLISHED ABILITIES ═══
//
// **All 173 champions have a published abilities file as of 2026-08-14 15:37**, which changed
// under this session: at 15:30 `public/data/abilities/` held `Lux.json` alone, and the
// data-pipeline area published the rest while this page was being built. The count is measured by
// `../data/catalogue.test.ts`, not asserted here.
//
// The page still handles the absent case, and must: a champion whose file 404s gets NO invented
// ability shelf. It gets a notice naming the champion, a shelf carrying only the basic attack —
// which needs no harvested data, being the attacker's own attack damage — and, for any ability
// step left in the sequence, a named refusal in the result rather than a silent zero.

import { useEffect, useMemo, useState } from 'react';
import type {
  Champion,
  ChampionConfig,
  ComboStep,
  Item,
  Scenario,
  VerificationStatus,
} from '../../types';
import { simulate, type Catalogue, type SimulationResult } from '../../engine';
import { CURRENT_URL_VERSION } from '../../url';
import { ChampionConfigPanel } from '../config';
import { ComboBuilder, type ShelfAbility } from '../combo';
import { ItemPicker } from '../items';
import { StatBlockPanel } from '../stats';
import { InstanceBreakdown } from '../breakdown';
import { HpBurndown } from '../burndown';
import { VerificationStatusMark } from '../primitives';
import { loadRoster, portraitUrl } from '../data/roster';
import {
  buildCatalogue,
  contestedFor,
  loadAbilities,
  loadItems,
  loadOverrides,
  rosterPatch,
  type AbilitiesFile,
  type StatOverrideRecord,
} from '../data/catalogue';
import '../tokens.css';
import './app.css';

/** Which champion each side starts on. Both are the user's to change immediately. */
export const DEFAULT_ATTACKER = 'Lux';
export const DEFAULT_DEFENDER = 'Garen';

/**
 * A configuration with nothing assumed in it.
 *
 * Level 6 and rank 1 are STARTING POINTS, not modelling assumptions: every one is a control on
 * screen. Items, runes, persistent stacks and entry state are all empty, because an empty entry
 * state is the only one the user has actually stated (SPECIFICATION §3.3).
 */
export function startingConfig(apiname: string): ChampionConfig {
  return {
    apiname,
    level: 6,
    abilityRanks: { Q: 1, W: 1, E: 1, R: 1 },
    items: [],
    runes: { keystone: null, primary: [], secondary: [], shards: [] },
    persistent: {},
    entryState: {},
  };
}

/** The combo the page opens on. Every step is removable and the shelf adds more. */
export function startingCombo(): ComboStep[] {
  return [
    { id: 'q1', kind: 'ability', ref: 'Q' },
    { id: 'e1', kind: 'ability', ref: 'E' },
    { id: 'aa1', kind: 'basic-attack', ref: 'basic' },
    { id: 'r1', kind: 'ability', ref: 'R' },
  ];
}

interface LoadedData {
  roster: Champion[];
  items: Item[];
  overrides: StatOverrideRecord[];
  patch: string;
}

export interface AppProps {
  /**
   * Injected so a test never touches the network. The default is the browser's own `fetch`,
   * which is how the real page loads the four published files.
   */
  fetchImpl?: typeof fetch;
  /**
   * What the page opens on, when something other than the defaults should be shown.
   *
   * These exist for two reasons and neither is decoration. A test needs to open the page on a
   * scenario that exercises a refusal or a contested champion without clicking through twelve
   * controls first; and SPECIFICATION §12 makes a shared link the primary way scenarios are
   * distributed, so the page has to be able to open on a scenario it was HANDED. The encoder in
   * `src/url/` already decodes a link into exactly these three pieces — wiring it up is a change
   * to `src/main.tsx`, which is the lead's file.
   */
  initialAttacker?: ChampionConfig;
  initialDefender?: ChampionConfig;
  initialCombo?: ComboStep[];
  /**
   * A sentence explaining why a shared link could not be opened.
   *
   * IT IS SHOWN, NEVER SWALLOWED. `src/url` refuses a damaged link rather than substituting a
   * scenario, on the grounds that "a link that decodes into something subtly different from what
   * was shared is the same class of failure as a wrong damage number". Opening the DEFAULT
   * matchup without a word would be exactly that substitution, one step later: the reader would
   * be looking at Lux against Garen believing it was the matchup they were sent.
   *
   * Absent when the URL carried no scenario at all, which is not a failure — it is somebody
   * opening the page.
   */
  linkNotice?: string;
}

export function App({
  fetchImpl = fetch,
  initialAttacker,
  initialDefender,
  initialCombo,
  linkNotice,
}: AppProps = {}) {
  const [data, setData] = useState<LoadedData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [attackerConfig, setAttackerConfig] = useState<ChampionConfig>(
    initialAttacker ?? startingConfig(DEFAULT_ATTACKER),
  );
  const [defenderConfig, setDefenderConfig] = useState<ChampionConfig>(
    initialDefender ?? startingConfig(DEFAULT_DEFENDER),
  );
  const [combo, setCombo] = useState<ComboStep[]>(initialCombo ?? startingCombo);

  /** Abilities per champion, `null` for a champion the pipeline has published none for. */
  const [abilityFiles, setAbilityFiles] = useState<Record<string, AbilitiesFile | null>>({});

  useEffect(() => {
    let live = true;
    Promise.all([loadRoster(fetchImpl), loadItems(fetchImpl), loadOverrides(fetchImpl)])
      .then(([roster, items, overrides]) => {
        if (!live) return;
        setData({ roster, items, overrides, patch: rosterPatch(roster) });
      })
      .catch((e: unknown) => {
        if (live) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      live = false;
    };
  }, [fetchImpl]);

  // The attacker's abilities are what the combo builder offers and what the engine reads. They are
  // fetched per champion and remembered, so switching back and forth costs one request each.
  const attackerName = attackerConfig.apiname;
  useEffect(() => {
    let live = true;
    if (attackerName in abilityFiles) return undefined;
    loadAbilities(attackerName, fetchImpl)
      .then((file) => {
        if (live) setAbilityFiles((prev) => ({ ...prev, [attackerName]: file }));
      })
      .catch((e: unknown) => {
        if (live) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      live = false;
    };
  }, [attackerName, abilityFiles, fetchImpl]);

  const attackerFile = abilityFiles[attackerName];
  const shelf: ShelfAbility[] = attackerFile?.abilities ?? [];

  const catalogue: Catalogue | null = useMemo(() => {
    if (!data) return null;
    const abilities = new Map<string, readonly ShelfAbility[]>();
    for (const [apiname, file] of Object.entries(abilityFiles)) {
      if (file) abilities.set(apiname, file.abilities);
    }
    return buildCatalogue({ champions: data.roster, items: data.items, abilities });
  }, [data, abilityFiles]);

  const scenario: Scenario = useMemo(
    () => ({
      version: CURRENT_URL_VERSION,
      attacker: attackerConfig,
      defender: defenderConfig,
      combo,
    }),
    [attackerConfig, defenderConfig, combo],
  );

  const simulation: SimulationResult | null = useMemo(() => {
    if (!catalogue || !data) return null;
    if (combo.length === 0) return null;
    return simulate(scenario, catalogue, { patch: data.patch });
  }, [catalogue, data, scenario, combo.length]);

  if (error) {
    return (
      <main className="app">
        <p className="app__error">
          The published data could not be loaded, so nothing on this page can be calculated:{' '}
          {error}
        </p>
      </main>
    );
  }
  if (!data || !catalogue) {
    return (
      <main className="app">
        <p className="app__loading">Loading the champion roster and item pool…</p>
      </main>
    );
  }

  const attacker = data.roster.find((c) => c.apiname === attackerConfig.apiname) ?? null;
  const defender = data.roster.find((c) => c.apiname === defenderConfig.apiname) ?? null;
  const contested = contestedFor(data.overrides, [attackerConfig.apiname, defenderConfig.apiname]);

  return (
    <main className="app">
      <header className="app__head">
        <div className="app__nameplate">
          <p className="app__eyebrow">Bench Test — League of Legends damage simulator</p>
          <h1 className="app__title">
            {attacker?.name ?? 'No attacker'} <span className="app__vs">vs</span>{' '}
            {defender?.name ?? 'No defender'}
          </h1>
        </div>
        <p className="app__sub">
          Two champions, an ordered combo, and an itemised damage breakdown. The calculation runs
          entirely in this browser.
        </p>
      </header>

      {/* A SHARED LINK THAT COULD NOT BE OPENED. First on the page, above everything, because
          the reader arrived expecting a specific scenario and is looking at a different one. */}
      {linkNotice ? (
        <section className="app__notice" aria-label="This shared link could not be opened">
          <h2 className="app__notice-title">This shared link could not be opened</h2>
          <p>
            {linkNotice} Nothing from the link has been applied — the configuration below is this
            page’s starting point, not the scenario you were sent.
          </p>
        </section>
      ) : null}

      {/* SPECIFICATION §8 — a result involving a champion whose base statistics Riot's own
          sources disagree about carries a visible note naming the field and both values. */}
      {contested.length > 0 ? (
        <section className="app__notice" aria-label="Contested base statistics">
          <h2 className="app__notice-title">One base statistic is disputed between Riot’s sources</h2>
          <ul>
            {contested.map((c) => (
              <li key={`${c.apiname}-${c.stat}`}>
                <strong>
                  {c.championName} — {c.stat}
                </strong>
                : the wiki states {c.wikiValue} and Data Dragon states {c.dataDragonValue}. This
                result uses {c.applied}, the value that ships with the patch. {c.reason}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ═══ REGION 1 — SETUP: what is being tested ═══
          The two combatants and the combo are one question, so they are one region and sit at
          the region's own --space-4. DESIGN.md §7a's locked arrangement is unchanged:
          configuration across the top row, burndown full width beneath. */}
      <div className="app__region app__region--setup">
      {/* ---- The two combatants (DESIGN.md §7a: configuration across the top row) ---- */}
      <div className="app__row">
        <div className="app__col">
          <ChampionConfigPanel
            role="Attacker"
            champions={data.roster}
            champion={attacker}
            config={attackerConfig}
            onChange={(next) => setAttackerConfig(next)}
            patch={data.patch}
            notConfigured={CONFIGURED_ELSEWHERE}
          />
          <ItemPicker
            role="attacker"
            items={data.items}
            selected={attackerConfig.items}
            onChange={(items) => setAttackerConfig({ ...attackerConfig, items })}
          />
        </div>
        <div className="app__col">
          <ChampionConfigPanel
            role="Defender"
            champions={data.roster}
            champion={defender}
            config={defenderConfig}
            onChange={(next) => setDefenderConfig(next)}
            patch={data.patch}
            notConfigured={CONFIGURED_ELSEWHERE}
          />
          <ItemPicker
            role="defender"
            items={data.items}
            selected={defenderConfig.items}
            onChange={(items) => setDefenderConfig({ ...defenderConfig, items })}
          />
        </div>
      </div>

      {/* ---- The combo ---- */}
      {attackerFile === undefined ? (
        <p className="app__loading">Loading {attacker?.name ?? attackerName}’s abilities…</p>
      ) : null}
      {attackerFile === null ? (
        <section className="app__notice" aria-label="No ability data for this champion">
          <h2 className="app__notice-title">
            No ability data has been published for {attacker?.name ?? attackerName}
          </h2>
          <p>
            The data pipeline has published a harvested ability file for one champion so far, so
            this champion’s abilities cannot be offered on the shelf and cannot be calculated. The
            basic attack below is modelled in full: it is the attacker’s own attack damage and needs
            no harvested data. An ability step left in the sequence is refused by name in the result
            rather than counted as zero.
          </p>
        </section>
      ) : null}
      <ComboBuilder
        abilities={shelf}
        steps={combo}
        onChange={setCombo}
        patch={data.patch}
        championName={attacker?.name ?? attackerName}
      />
      </div>

      {/* ---- The result ---- */}
      {combo.length === 0 ? (
        <section className="app__notice" aria-label="Result">
          <h2 className="app__notice-title">The combo is empty</h2>
          <p>Add a step above and the result appears here. Nothing is calculated from no steps.</p>
        </section>
      ) : null}

      {simulation && simulation.ok === false ? (
        <section className="app__refusal" aria-label="This scenario was refused">
          <h2 className="app__refusal-title">No result — this scenario cannot be simulated</h2>
          <p>
            Nothing is shown rather than a number that would exclude part of the scenario without
            saying so. Each line names exactly what is missing:
          </p>
          <ul>
            {simulation.refusals.map((r) => (
              <li key={`${r.path}-${r.reason}`}>
                <strong>{r.path}</strong> — {r.reason}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {simulation && simulation.ok ? (
        <>
          {/* ═══ REGION 2 — RESULT: what happened ═══
              The caption plate and the burndown are one instrument, so they sit at the
              tightest step in the region grade. DESIGN.md §7 calls the burndown "the product's
              remembered object"; putting it in a region of its own is what says so in layout
              rather than only in prose. */}
          <div className="app__region app__region--result">
          <section className="app__resulthead" aria-label="What this result describes">
            {/* SPECIFICATION §8: the patch sits ADJACENT to the result, never in a footer. */}
            <p className="app__patch">Patch {simulation.result.patch}</p>
            <VerificationStatusMark
              status={simulation.result.verificationSummary}
              spokenSubject="Least-evidenced ability in this combo"
            />
            <p className="app__resultnote">{summaryNote(simulation.result.verificationSummary)}</p>
          </section>

          <HpBurndown result={simulation.result} />
          </div>

          {/* ═══ REGION 3 — DETAIL: the itemised evidence ═══ */}
          <div className="app__region app__region--detail">
          <InstanceBreakdown result={simulation.result} />

          <div className="app__row">
            <StatBlockPanel
              role="Attacker"
              championName={attacker?.name ?? attackerName}
              portraitSrc={attacker ? portraitUrl(data.patch, attacker.icon) : null}
              stats={simulation.result.attackerStats}
            />
            <StatBlockPanel
              role="Defender"
              championName={defender?.name ?? defenderConfig.apiname}
              portraitSrc={defender ? portraitUrl(data.patch, defender.icon) : null}
              stats={simulation.result.defenderStats}
            />
          </div>
          </div>
        </>
      ) : null}
    </main>
  );
}

/**
 * The sentence beside the combo's weakest verification status.
 *
 * IT HAS TO MATCH THE STATUS IT SITS NEXT TO. A fixed sentence about *derived* being the ordinary
 * state read as reassurance beside a mark saying "Not yet modelled" — which is the one case where
 * the reader needs to be told that damage is MISSING from the total, not that the evidence is
 * normal. DESIGN.md §6 and SPECIFICATION §8 both turn on the same point: *derived* must never read
 * as a shortfall, and *incomplete* must never read as ordinary.
 */
export function summaryNote(status: VerificationStatus): string {
  switch (status) {
    case 'incomplete':
      return (
        'At least one ability in this combo could not be modelled. It contributes no damage, it ' +
        'is named below with the reason, and the total excludes it.'
      );
    case 'no-damage':
      return 'Nothing in this combo deals damage, so there is no figure to have evidence about.';
    case 'verified':
      return (
        'Every ability in this combo has been independently re-derived — the strongest evidence ' +
        'this product records, and rarer than derived rather than better than normal.'
      );
    default:
      return (
        'The status above is the weakest evidence behind any ability in this combo. Derived is ' +
        'the ordinary state: checked against the source three ways.'
      );
  }
}

/**
 * What the configuration panels still do not cover, now that items do.
 *
 * The panel prints this list on screen so a user is never invited to read a result as though their
 * whole build had been modelled. Items left the list on 2026-08-14 because the page now configures
 * them; runes and entry state remain, and the engine repeats the same facts in the result's
 * excluded-mechanics list from its own side.
 */
export const CONFIGURED_ELSEWHERE = [
  'Runes — keystone, minor runes and stat shards',
  'Entry state — stacks and debuffs already active when the combo begins',
  'Items are configured below this panel, and only their structured statistics are applied',
];
