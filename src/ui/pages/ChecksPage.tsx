// HOW THE NUMBERS ARE CHECKED — the page the product's whole claim rests on.
//
// It explains the four statuses SPECIFICATION §8 defines, what each one claims, and — the part
// that matters most — what each one DOES NOT claim. Every count on it is generated from the same
// published data the calculator reads; nothing here is typed.
//
// The status names, glyphs and labels come from `VerificationStatusMark`, the same component the
// calculator uses on every row. A page explaining a mark should show the mark, not a picture of
// one that can drift away from it.

import type { IncompleteReason } from '../../types/result';
import { VerificationStatusMark } from '../primitives';
import { COVERAGE } from '../coverage';
import { SOURCE_URL, pageById } from '../shell';
import { GitHubMark } from '../shell/SiteFooter';
import './pages.css';

const PERMANENT: IncompleteReason = { kind: 'permanent', missingFacts: [] };

export function ChecksPage() {
  return (
    <>
      <section className="prose" aria-label="What derived means">
        <h2 className="prose__title">Derived is the normal state, and it is well evidenced</h2>
        <p className="prose__p">
          Most numbers this calculator shows are <em>derived</em>. That is not a caveat and it is
          not a lesser grade. It means three things, all of them checked mechanically on every
          entry, on every run — not once, and not on a sample:
        </p>
        <ol className="prose__ol">
          <li>
            It agrees with the <strong>source’s own rendering</strong> of the same ability — the
            wiki’s software expanding the same template our parser read, compared value by value
            at the precision the wiki itself prints.
          </li>
          <li>
            It <strong>reconciles with the total the source states</strong>. Where the source
            publishes a total for the ability, our parts sum to it. That catches damage counted
            twice as well as damage missing.
          </li>
          <li>
            Where <strong>Riot’s own shipped game data</strong> carries a counterpart, it agrees
            with that too — a source that is not the wiki and is not derived from it.
          </li>
        </ol>
        <p className="prose__p">
          <strong>What derived does not claim</strong> is that a second person re-derived it from
          scratch. Agreement with a source cannot detect a source read wrongly in a consistent
          way: a value can be transcribed perfectly and still be attached to the wrong statistic,
          land the wrong number of times, or be missing an instance the ability also has. That is
          what the rarer status below is for.
        </p>
      </section>

      <section className="ledger" aria-label="Every status, and how many abilities hold it">
        <header className="ledger__head">
          <h2 className="ledger__title">Every status, and how many abilities hold it</h2>
          <p className="ledger__defn">
            Counted from the {COVERAGE.abilities} ability entries across {COVERAGE.champions}{' '}
            champions this site ships on patch {COVERAGE.patch}. Regenerated every time the site is
            built, so this table cannot fall out of step with what the calculator does.
          </p>
        </header>
        <ul className="ledger__rows">
          <StatusRow
            count={COVERAGE.verified}
            status="verified"
            of="shown"
            body="Everything derived claims, and in addition an independent re-derivation by a party that did not use this product’s code or share its assumptions, recorded with its evidence. It is deliberately a small set. It is not a target to be maximised, and a number without it is not doubtful — expecting this everywhere would mean re-deriving 937 abilities on every patch, which is not a promise anyone can keep."
          />
          <StatusRow
            count={COVERAGE.derived}
            status="derived"
            of="shown"
            body="The three checks above, on every run. Presented exactly like verified — same size, same weight, no italics and no caution mark — because it is the ordinary, expected state and styling it as a shortfall would be a lie about the evidence behind it."
          />
          <StatusRow
            count={COVERAGE.incomplete - COVERAGE.permanentlyUnanswerable}
            status="incomplete"
            of="not shown — will improve"
            body="Something about the ability is unmodelled, unreconciled, or disputed between sources. It contributes no damage to any result, it is named in the result it is missing from, and it says what is missing rather than only that something is. This one will improve with work."
          />
          <StatusRow
            count={COVERAGE.permanentlyUnanswerable}
            status="incomplete"
            reason={PERMANENT}
            of="not shown — never will be"
            body="A fact the ability needs is stated by no source at all. The clearest case is a damage ratio whose owner is unstated: the source says an ability scales with armor and never says whose, so a person reading the page is guessing exactly as a parser would. No amount of work supplies it, and the interface says so instead of implying somebody will get to it."
          />
          <StatusRow
            count={COVERAGE.noDamage}
            status="no-damage"
            of="nothing to have evidence about"
            body="The ability deals no damage at all. Not a statement about trustworthiness — a statement that there is nothing to make one about. Claimed only when the ability’s own data template and the wiki’s damage-classification module are silent together; where they disagree it is incomplete instead."
          />
        </ul>
        <p className="ledger__headline">
          <strong>
            {COVERAGE.incompleteWithReason} of the {COVERAGE.incomplete}
          </strong>{' '}
          abilities this calculator refuses to show name what is missing. A result containing one
          says which ability and why, and the total excludes it.
        </p>
      </section>

      <section className="prose" aria-label="Contested base statistics">
        <h2 className="prose__title">When Riot’s own sources disagree</h2>
        <p className="prose__p">
          A champion’s base statistics come from two places that can contradict each other. Where
          evidence settles it — usually the patch notes — the settled value is used and nothing is
          said. Where nothing settles it, the champion is marked <em>contested</em>: the value that
          ships with the patch is used, and{' '}
          <strong>every result involving that champion carries a visible note</strong> naming the
          field and both observed values. It is never presented as verified.
        </p>
      </section>

      <section className="prose" aria-label="Checking it yourself">
        <h2 className="prose__title">Checking this yourself</h2>
        <p className="prose__p">
          None of the above is worth anything if you have to take our word for it. The data files,
          the checks that run over them and the test suite are all public, and the counts on this
          page are generated from the same files the calculator loads — so the same count is
          available to anyone who downloads them.
        </p>
        <p className="prose__p">
          <a href={SOURCE_URL} rel="noreferrer">
            <GitHubMark />
            Source, data and test suite
          </a>{' '}
          · <a href={pageById('report').path}>Report a number you think is wrong</a>
        </p>
      </section>
    </>
  );
}

function StatusRow({
  count,
  status,
  reason,
  of,
  body,
}: {
  count: number;
  status: 'verified' | 'derived' | 'incomplete' | 'no-damage';
  reason?: IncompleteReason;
  of: string;
  body: string;
}) {
  return (
    <li className="ledger__row">
      <span className="ledger__count">{count}</span>
      <span className="ledger__mark">
        <VerificationStatusMark
          status={status}
          reason={reason}
          spokenSubject={`${count} abilities`}
        />
        <span className="ledger__of">{of}</span>
      </span>
      <span className="ledger__meaning">{body}</span>
    </li>
  );
}
