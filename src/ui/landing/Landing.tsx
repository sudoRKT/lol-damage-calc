// THE LANDING PAGE.
//
// ═══ THE CLAIM, AND WHY IT IS SHAPED LIKE THIS ═══
//
// Every damage calculator says its numbers are accurate. None of them can be checked on that,
// which is why nobody believes any of them and everybody uses whichever one loads fastest.
//
// This product can say something none of them can, and it is not "our numbers are right" — it is
// **"here is what we will not show you, and why"**. 247 abilities in the game are refused rather
// than estimated, and every one of them states what is missing. That is a claim a reader can
// falsify in ten minutes by downloading the same files, which is the only kind worth making.
//
// So the page is built around a COUNT, not a promise. Every figure comes from `coverage.json`,
// generated from `public/data/` and re-derived by `coverage.test.ts` on every run. Nothing on
// this page is typed by a person, and nothing on it can go quietly stale after a patch.
//
// ═══ WHAT IS DELIBERATELY NOT HERE ═══
//
// No example damage figure. The obvious way to make a landing page for a calculator look good is
// to print a big number on it — and a big number on a page nobody can trace is exactly the
// plausible wrong figure this whole product exists to prevent. The verification marks below are
// real components showing real counts; there is no fabricated result anywhere on this page.
//
// No hue, either. DESIGN.md §1 reserves colour for the three damage types, so the front page is
// graphite, steel and bone — which is what makes the calculator's coloured figures the first
// coloured thing a reader ever sees on this site.

import type { IncompleteReason } from '../../types/result';
import { VerificationStatusMark } from '../primitives';
import { GitHubMark, SOURCE_URL, pageById } from '../shell';
import coverage from './coverage.json';
import './landing.css';

/**
 * FIVE ROWS, NOT FOUR — and the difference is an accuracy problem, not a presentation one.
 *
 * SPECIFICATION §8 has four statuses, but `incomplete` splits into two states that say opposite
 * things about the future, and DESIGN.md §6 gives each its own glyph and label. Printing all
 * `incomplete` entries under "not yet modelled" would tell a reader that 23 abilities are
 * awaiting work when no amount of work will ever complete them: no source records the fact they
 * need. On the page whose whole claim is that this product does not overstate what it knows,
 * that would be the page overstating what it knows.
 *
 * Both figures are arithmetic on generated counts. Neither is typed.
 */
const PERMANENT: IncompleteReason = { kind: 'permanent', missingFacts: [] };

const STATUSES = [
  {
    status: 'verified' as const,
    count: coverage.verified,
    of: 'shown',
    meaning:
      'Everything “derived” claims, plus an independent re-derivation by someone who did not use ' +
      'this product’s code. Deliberately rare. It is not a target to be maximised, and a number ' +
      'without it is not doubtful.',
  },
  {
    status: 'derived' as const,
    count: coverage.derived,
    of: 'shown',
    meaning:
      'The normal, well-evidenced state, checked mechanically on every run: it agrees with the ' +
      'wiki’s own rendering of the same ability, it reconciles with the total the source states, ' +
      'and it matches Riot’s shipped game data wherever a counterpart exists.',
  },
  {
    status: 'incomplete' as const,
    count: coverage.incomplete - coverage.permanentlyUnanswerable,
    of: 'not shown',
    meaning:
      'Something about the ability is unmodelled, unreconciled, or disputed between sources. It ' +
      'contributes no damage to any result, it is named in the result it is missing from, and it ' +
      'says what is missing. This one will improve with work.',
  },
  {
    status: 'incomplete' as const,
    reason: PERMANENT,
    count: coverage.permanentlyUnanswerable,
    of: 'not shown, and never will be',
    meaning:
      'A fact the ability needs is stated by no source at all — most often a damage ratio whose ' +
      'owner is never named, so a person reading the page is guessing exactly as a parser would. ' +
      'No amount of work will supply it, and the interface says so rather than implying somebody ' +
      'will get to it.',
  },
  {
    status: 'no-damage' as const,
    count: coverage.noDamage,
    of: 'no figure to have evidence about',
    meaning:
      'The ability deals no damage at all. Not a statement about trustworthiness — a statement ' +
      'that there is nothing to make one about.',
  },
];

export function Landing() {
  const calculator = pageById('calculator');
  const checks = pageById('checks');

  return (
    <>
      <section className="lede" aria-label="What this is">
        <p className="lede__eyebrow">Bench Test · patch {coverage.patch}</p>
        <h1 className="lede__claim">
          A damage calculator that tells you which numbers it will not stand behind.
        </h1>
        <p className="lede__stand">
          Two champions, an ordered combo, and an itemised breakdown of exactly what kills whom.
          Every ability that contributes carries its evidence beside the figure — and{' '}
          <strong>{coverage.incomplete} abilities are not shown at all</strong>, because we cannot
          stand behind them yet. Each one says why.
        </p>
        <p className="lede__actions">
          <a className="lede__go" href={calculator.path}>
            Open the calculator
          </a>
          <span className="lede__aside">No account. Nothing is sent anywhere. It runs in this browser.</span>
        </p>
      </section>

      {/* ═══ THE EVIDENCE. Every figure generated from the published data. ═══ */}
      <section className="ledger" aria-label="What is known about every ability in the game">
        <header className="ledger__head">
          <h2 className="ledger__title">Every ability in the game, and what we can say about each</h2>
          <p className="ledger__defn">
            <strong>{coverage.abilities} ability entries</strong> across{' '}
            <strong>{coverage.champions} champions</strong>, counted from the data this site
            actually ships on patch {coverage.patch}. Not a sample, not an estimate — the whole
            roster, every time the site is built.
          </p>
        </header>

        <ul className="ledger__rows">
          {STATUSES.map((row) => (
            <li className="ledger__row" key={`${row.status}-${row.of}`}>
              <span className="ledger__count">{row.count}</span>
              <span className="ledger__mark">
                <VerificationStatusMark
                  status={row.status}
                  reason={'reason' in row ? row.reason : undefined}
                  spokenSubject={`${row.count} abilities`}
                />
                <span className="ledger__of">{row.of}</span>
              </span>
              <span className="ledger__meaning">{row.meaning}</span>
            </li>
          ))}
        </ul>

        {/* THE SENTENCE THE WHOLE PAGE IS FOR. A fraction rather than a percentage, and printed
            as two counts so it is visibly a ratio of one measured thing to another. */}
        <p className="ledger__headline">
          <strong>
            {coverage.incompleteWithReason} of the {coverage.incomplete}
          </strong>{' '}
          abilities we refuse to show tell you what is missing — not merely that something is
          missing. That is the difference between a calculator you can plan around and one you
          have to trust.
        </p>

        <p className="ledger__source">
          <a href={SOURCE_URL} rel="noreferrer">
            <GitHubMark />
            Every check above runs in public — source, data and test suite
          </a>
        </p>
      </section>

      <section className="plain" aria-label="What it does not do">
        <h2 className="plain__title">What it will not do</h2>
        <ul className="plain__list">
          <li>
            It will not guess. An ability it cannot model contributes nothing and is named in the
            result, rather than being folded in at a value that looks reasonable.
          </li>
          <li>
            It does not model elapsed time. A combo is an ordered sequence, so nothing decays
            between instances and attack speed does not decide how many attacks fit in a window.
          </li>
          <li>
            The defender does not fight back. Results are damage dealt to a stationary target, and
            every mechanic left out is listed on the result itself.
          </li>
          <li>
            It has no account system and no database. A scenario lives entirely in its own link,
            so sharing one is copying a URL. <a href={checks.path}>{checks.navLabel}</a> explains
            the evidence behind every status above.
          </li>
        </ul>
      </section>

      {/* ═══ THE AUTHOR'S NOTE ═══
          Its own band, outside the footer, with nothing legal in it. The full note is on the
          About page; only the first sentence sits here.
          IT MUST NEVER SHARE A CONTAINER WITH THE RIOT DISCLAIMER. The rest of the note mentions
          wanting to work with Riot's legal team one day, and a personal line adjacent to "not
          endorsed by Riot Games" invites a reader to connect the two — the one reading nobody
          wants is that the author is hinting at a relationship that does not exist. The footer is
          a separate element rendered by PageShell, and `landing.test.tsx` asserts they are not
          nested in one another. */}
      <aside className="colophon" aria-label="A note from the author">
        <p className="colophon__note">
          Built by RKT, a paralegal in London studying to qualify as a solicitor.{' '}
          <a href={pageById('about').path}>More about why this exists</a>.
        </p>
      </aside>
    </>
  );
}
