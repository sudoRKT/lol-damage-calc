// REPORT A WRONG NUMBER — the route for somebody who cannot, or would rather not, use GitHub.
//
// ═══ WHY THIS PAGE CAN RECEIVE A SCENARIO ═══
//
// The control on a result is a pre-filled GitHub issue, which is one action and needs an account.
// "Send it another way" links here WITH THE SCENARIO IN THE FRAGMENT — the same encoding a shared
// link uses — so this page can rebuild the identical report text and hand it over as something to
// copy. Without that the fallback would be a form asking a reader to describe a scenario from
// memory, and the report would arrive missing the one thing that makes it actionable.
//
// The landing page's redirect does not apply here: only `index.html` loads it, and
// `src/url/entry.test.ts` asserts no other page does. A scenario fragment on THIS page belongs to
// this page.
//
// ═══ COPYABLE MEANS COPYABLE ═══
//
// A `<textarea readonly>` holding the whole report, not a styled block a reader has to select by
// dragging. It selects on focus, there is a copy button for pointer users, and the text is
// complete — so it can be pasted into an email, a Discord message or a forum post and still carry
// the scenario, the patch, the totals and the verification statuses.

import { useEffect, useMemo, useRef, useState } from 'react';
import { scenarioFromUrl } from '../../url';
import { SOURCE_URL } from '../shell';
import './pages.css';

/** Built from a scenario link when this page was opened with one; otherwise a blank template. */
export function reportTemplate(scenarioLink: string | null): string {
  return [
    'Wrong number report',
    '',
    'What I think is wrong:',
    '  (which champion, which ability, and what the calculator showed)',
    '',
    'What I expected instead:',
    '  (and where you checked it — the practice tool, the wiki, another calculator)',
    '',
    '---',
    scenarioLink
      ? `Scenario: ${scenarioLink}`
      : 'Scenario: (paste the address bar from the calculator — it carries the whole scenario)',
  ].join('\n');
}

export function ReportPage() {
  const [copied, setCopied] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const scenarioLink = useMemo(() => {
    if (typeof window === 'undefined') return null;
    // Only offer the link if it actually decodes. A fragment that does not is not a scenario,
    // and printing it would put a broken link into somebody's report.
    return scenarioFromUrl(window.location.href).ok ? window.location.href : null;
  }, []);

  const text = reportTemplate(scenarioLink);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <>
      <section className="prose" aria-label="The quickest route">
        <h2 className="prose__title">The quickest route</h2>
        <p className="prose__p">
          Every result in the calculator carries a <strong>Report a wrong number</strong> control.
          It opens a report already filled in with the exact scenario, the patch, the totals and
          the evidence status of every ability involved — one click, nothing to describe from
          memory. Use that if you can: it needs a GitHub account, and it is the fastest way for a
          report to become a fix.
        </p>
      </section>

      <section className="prose" aria-label="Without a GitHub account">
        <h2 className="prose__title">Without a GitHub account</h2>
        <p className="prose__p">
          {scenarioLink
            ? 'This page was opened with a scenario, so the report below is complete. Copy it and send it by any route you like.'
            : 'Copy the text below, fill in the two blanks, and send it by any route you like. The one line that matters most is the scenario link — open the calculator, set up the case, and copy the address bar. It carries the entire configuration.'}
        </p>

        <label className="report__label" htmlFor="report-text">
          Your report, ready to copy
        </label>
        <textarea
          id="report-text"
          className="report__text"
          ref={areaRef}
          readOnly
          rows={14}
          value={text}
          onFocus={(e) => e.currentTarget.select()}
        />
        <p className="report__actions">
          <button
            type="button"
            className="report__copy"
            onClick={async () => {
              areaRef.current?.select();
              try {
                await navigator.clipboard.writeText(text);
              } catch {
                // A browser that refuses clipboard access still leaves the text selected by the
                // line above, so Ctrl+C works. Nothing is lost and nothing needs saying.
              }
              setCopied(true);
            }}
          >
            Copy the report
          </button>
          <span className="report__said" role="status" aria-live="polite">
            {copied ? 'Copied. Paste it wherever suits you.' : ''}
          </span>
        </p>

        <p className="prose__p">
          Send it to the project’s issue tracker at{' '}
          <a href={`${SOURCE_URL}/issues`} rel="noreferrer">
            {SOURCE_URL.replace('https://', '')}/issues
          </a>{' '}
          if you can, or by any other route you have. A report with the scenario line in it can be
          acted on whichever way it arrives.
        </p>
      </section>

      <section className="prose" aria-label="What happens to it">
        <h2 className="prose__title">What happens to it</h2>
        <p className="prose__p">
          The scenario is reopened and the figure checked against the source. If the number is
          wrong it is corrected, and the correction is logged publicly with the patch it landed in
          — including what the figure used to be. If the number turns out to be right, the reply
          says why, with the working, so you can disagree with the reasoning rather than the
          conclusion.
        </p>
        <p className="prose__p">
          If the disagreement is with a source rather than with this calculator — the wiki and
          Riot’s shipped data do sometimes contradict each other — that is worth reporting too. It
          is exactly the case the evidence statuses exist for.
        </p>
      </section>
    </>
  );
}
