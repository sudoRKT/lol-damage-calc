// THE TWO THINGS SPECIFICATION §15 AND §8 REQUIRE ON EVERY RESULT.
//
// Both were absent from the built page and DESIGN-AUDIT.md recorded them as layout-affecting, to
// be folded into a layout pass rather than bolted on afterwards. They land in the RESULT REGION,
// which now exists.
//
// ═══ 1. THE SCOPE DISCLAIMER (§15, "displayed alongside results") ═══
//
// A fixed sentence, quoted verbatim, always visible whenever a result is on screen and never
// dismissible.
//
// **IT DOES NOT REPLACE THE EXCLUDED-MECHANICS LIST, AND THAT LIST DOES NOT REPLACE IT.** The
// engine's list is generated, specific and changes with the scenario — "every rune, including
// keystones and stat shards", "every form of penetration". §15's sentence is fixed and legal.
// Merging one into the other would lose whichever half is not generated, which is the tidy-up a
// later session will be tempted to make. It is written here so it is refused.
//
// ═══ 2. REPORT A WRONG NUMBER (§8, "every result carries", "in one action") ═══
//
// A pre-filled GitHub issue: the title carries the matchup and patch, and the body carries the
// scenario LINK, the totals, the verdict and the verification status. One click, no backend, and
// it lands in the same public place the changelog draws from.
//
// **THE HONEST LIMIT: that needs a GitHub account.** So the same text is offered as a copyable
// block on /report/ for anyone without one, and the fallback carries the identical body — a
// report sent by any route reproduces the scenario exactly.
//
// **THE SCENARIO LINK IS THE WHOLE POINT.** A report saying "Lux Q looks wrong" is unactionable;
// a report carrying a link that reproduces the exact configuration is a bug that can be fixed.
// If the scenario cannot be encoded, the control SAYS SO rather than sending a report that
// silently lacks the one thing that makes it useful.

import type { Result, Scenario } from '../../types';
import { encodeScenario, FRAGMENT_KEY, CALCULATOR_PATH } from '../../url';
import { SOURCE_URL } from '../shell';
import './notices.css';

/** SPECIFICATION §15, verbatim. Quoted, never paraphrased — a tidier sentence is a different one. */
export const SCOPE_DISCLAIMER =
  'This calculator computes champion ability damage, item stats, and rune bonuses only. It does ' +
  'not account for crowd control, map-based damage, seasonal changes, or passive effects ' +
  'requiring specific gameplay conditions.';

export interface ReportDraft {
  title: string;
  body: string;
  /** The GitHub issue URL, pre-filled. Null when the scenario could not be encoded. */
  href: string | null;
  /** Present when the scenario could not be encoded — shown instead of a link. */
  problem: string | null;
}

/**
 * Build the report a reader sends.
 *
 * `origin` is passed in rather than read from `window`, so this is a pure function of its inputs
 * and a test can check the exact text a reader would send.
 */
export function buildReport(
  scenario: Scenario,
  result: Result,
  origin: string,
  attackerName: string,
  defenderName: string,
): ReportDraft {
  const title = `Wrong number: ${attackerName} vs ${defenderName} (patch ${result.patch})`;

  let link: string | null = null;
  let problem: string | null = null;
  try {
    link = `${origin}${CALCULATOR_PATH}#${FRAGMENT_KEY}=${encodeScenario(scenario)}`;
  } catch (e) {
    problem = e instanceof Error ? e.message : String(e);
  }

  const statuses = [...new Set(result.perInstance.map((i) => i.verification))].join(', ');
  const body = [
    '<!-- Thank you for reporting this. Please add what you expected to see, and where you',
    '     checked it — the practice tool, another calculator, or the wiki. -->',
    '',
    '**What I think is wrong:**',
    '',
    '',
    '**What I expected instead:**',
    '',
    '',
    '---',
    '_Filled in automatically — please leave this._',
    '',
    `- Scenario: ${link ?? `could not be encoded — ${problem}`}`,
    `- Patch: ${result.patch}`,
    `- Matchup: ${attackerName} vs ${defenderName}`,
    `- Burst total: ${result.burst.total}`,
    `- Verdict: ${result.verdict.burstOnly.lethal ? 'lethal' : `survives with ${result.verdict.burstOnly.remainingHp} HP`}`,
    `- Verification statuses in this combo: ${statuses}`,
    `- Excluded from the total: ${result.incompleteContributors.map((c) => c.sourceLabel).join(', ') || 'nothing'}`,
  ].join('\n');

  const href =
    link === null
      ? null
      : `${SOURCE_URL}/issues/new?${new URLSearchParams({ title, body, labels: 'wrong-number' }).toString()}`;

  return { title, body, href, problem };
}

export interface ResultNoticesProps {
  scenario: Scenario;
  result: Result;
  attackerName: string;
  defenderName: string;
  /** Defaults to the page's own origin; injected so a test never depends on a location. */
  origin?: string;
}

export function ResultNotices({
  scenario,
  result,
  attackerName,
  defenderName,
  origin = typeof window === 'undefined' ? '' : window.location.origin,
}: ResultNoticesProps) {
  const report = buildReport(scenario, result, origin, attackerName, defenderName);

  return (
    <section className="notices" aria-label="About this result">
      <p className="notices__scope">{SCOPE_DISCLAIMER}</p>

      <div className="notices__report">
        {report.href ? (
          <a className="notices__go" href={report.href} rel="noreferrer">
            Report a wrong number
          </a>
        ) : (
          <p className="notices__blocked">
            This scenario cannot be turned into a link, so a report cannot carry it: {report.problem}
          </p>
        )}
        <p className="notices__aside">
          It opens a pre-filled report carrying this exact scenario. No account?{' '}
          <a href="/report/">Send it another way</a>.
        </p>
      </div>
    </section>
  );
}
