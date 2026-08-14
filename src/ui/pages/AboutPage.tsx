// ABOUT — what this is, who built it, and why.
//
// THE AUTHOR'S NOTE IS HERE IN FULL. The landing page carries its first sentence only; the rest
// is here. It sits in its own band, and — as everywhere else on this site — NEVER in the same
// container as the Riot disclaimer, which is the footer's. The note mentions wanting to work with
// Riot's legal team one day, and a personal line adjacent to "not endorsed by Riot Games" invites
// a reader to connect the two. `AboutPage.test.tsx` asserts the separation.

import { CAPABILITY, COVERAGE } from '../coverage';
import { SOURCE_URL, pageById } from '../shell';
import { GitHubMark } from '../shell/SiteFooter';
import './pages.css';

export function AboutPage() {
  return (
    <>
      <section className="prose" aria-label="What this is">
        <h2 className="prose__title">What this is</h2>
        <p className="prose__p">
          A damage calculator for League of Legends. You configure two champions — level, ability
          ranks, items — order a combo, and get an itemised breakdown of what each instance did,
          a running total, and whether the defender survives it. The verdict is given twice: once
          against the burst alone, and once including damage that keeps arriving afterwards.
        </p>
        <p className="prose__p">
          Item effects are part of a result — actives you place in the combo, and{' '}
          {CAPABILITY.itemRiders} on-hit and Spellblade effects that ride on the attack carrying
          them, each as its own row. <strong>Runes are not:</strong>{' '}
          {CAPABILITY.runesModelled} of {CAPABILITY.runesPublished} have a modelled effect. Nor are
          the {CAPABILITY.defensiveStored} defensive effects read from champions’ own kits — the
          shields, heals and damage reductions a defender uses against you. Both gaps are stated
          here rather than left to be inferred from a result that looks finished.
        </p>
        <p className="prose__p">
          It runs entirely in your browser. There is no account, no database and no server holding
          your scenarios: a scenario lives in its own link, which is why sharing one is copying a
          URL. Nothing you configure is sent anywhere.
        </p>
      </section>

      <section className="prose" aria-label="Why it exists">
        <h2 className="prose__title">Why it exists</h2>
        <p className="prose__p">
          Every damage calculator claims to be accurate, and none of them can be checked on it. So
          people use whichever loads fastest and quietly distrust the number.
        </p>
        <p className="prose__p">
          The thing this one does differently is not that its numbers are better. It is that it
          tells you which numbers it will not stand behind. Of {COVERAGE.abilities} ability entries
          in the game, {COVERAGE.incomplete} are refused rather than estimated — and each one says
          what is missing.{' '}
          <a href={pageById('checks').path}>{pageById('checks').navLabel}</a> sets out what each
          status claims and, more usefully, what it does not.
        </p>
      </section>

      <section className="prose" aria-label="How it is built">
        <h2 className="prose__title">How it is built</h2>
        <p className="prose__p">
          Champion statistics come from the League of Legends Wiki’s structured data module and
          from Riot’s Data Dragon, with a documented rule for which wins each field and what
          happens when they disagree. Ability damage is harvested from the wiki and checked
          mechanically before anything is shown. The calculation itself is ordinary arithmetic
          with tests written from the documented formulas rather than from the code’s own output.
        </p>
        <p className="prose__p">
          All of it is public — data, checks and tests.{' '}
          <a href={SOURCE_URL} rel="noreferrer">
            <GitHubMark />
            Read it, or disagree with it
          </a>
          .
        </p>
      </section>

      {/* THE AUTHOR'S NOTE, in full. Its own band, outside the footer. */}
      <aside className="colophon" aria-label="A note from the author">
        <p className="colophon__note">
          Built by RKT, a paralegal in London studying to qualify as a solicitor. The long-term
          goal is to work with Riot’s legal team. Until then, this is a contribution to Riot’s
          players.
        </p>
      </aside>
    </>
  );
}
