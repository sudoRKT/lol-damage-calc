// PRIVACY POLICY — SPECIFICATION §15.
//
// ═══ IT DESCRIBES WHAT THE SITE DOES TODAY, AND SAYS WHEN THAT WILL CHANGE ═══
//
// Today the site processes no personal data at all: it is static files, the calculation runs in
// the reader's browser, and nothing is transmitted. That is an unusually short privacy policy and
// it is short because it is TRUE, not because anything is being left out.
//
// §16 introduces advertising, and advertising introduces processing this page does not yet
// describe. PLAN.md §6 records the gate: advertising cannot be switched on before this page and
// the cookie policy describe it, because §16 without §15 puts the product out of compliance with
// its own specification. `pages.test.tsx` asserts this page still says so, so the warning cannot
// be quietly dropped on the day it becomes inconvenient.

import { pageById } from '../shell';
import './pages.css';

export function PrivacyPage() {
  return (
    <>
      <section className="prose" aria-label="What is processed today">
        <h2 className="prose__title">What this site processes today: nothing</h2>
        <p className="prose__p">
          This is a static site. The pages are files, and the calculation runs entirely in your own
          browser. There is no account system, no database, and no server that receives what you
          configure.
        </p>
        <ul className="prose__list">
          <li>
            <strong>Your scenarios are not sent anywhere.</strong> A scenario lives in the part of
            the address after the <code>#</code>, which browsers never transmit to a server. It is
            not in any request log, here or at the host.
          </li>
          <li>
            <strong>No analytics.</strong> No page-view tracking, no session recording, no
            fingerprinting, no third-party script of any kind.
          </li>
          <li>
            <strong>No cookies and no local storage.</strong> See the{' '}
            <a href={pageById('cookies').path}>cookie policy</a>, which is equally short.
          </li>
          <li>
            <strong>No fonts from third parties.</strong> The typefaces are served from
            this site rather than from a font network, so opening a page tells nobody else that you
            did.
          </li>
        </ul>
        <p className="prose__p">
          Champion and item artwork is loaded from Riot’s Data Dragon, which is a request your
          browser makes to Riot’s content network. That request carries what any image request
          carries — your address and browser — and it goes to Riot rather than to this site.
        </p>
      </section>

      <section className="prose" aria-label="What changes when advertising is introduced">
        <h2 className="prose__title">What changes when advertising is introduced</h2>
        <p className="prose__p">
          This site intends to carry advertising, which is how it stays free. Advertising
          introduces processing that this page does not yet describe — at minimum, a third party
          receiving your address and setting identifiers.
        </p>
        <p className="prose__p">
          <strong>
            No advertising will run until this page and the cookie policy describe it accurately
            and a consent interface is in place.
          </strong>{' '}
          Turning on advertising before that is prevented on purpose, and the reason is written
          into the project’s plan rather than left to memory. When it does change, the change will
          be dated here.
        </p>
      </section>

      <section className="prose" aria-label="Contact">
        <h2 className="prose__title">Questions</h2>
        <p className="prose__p">
          If something here is wrong or unclear, say so through the project’s issue tracker —{' '}
          <a href={pageById('report').path}>the same route as reporting a wrong number</a>.
        </p>
      </section>
    </>
  );
}
