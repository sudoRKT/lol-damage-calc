// COOKIE POLICY — SPECIFICATION §15. Short for the same reason the privacy policy is short.
//
// Like the privacy policy, this page carries the advertising gate, and a test asserts it still
// does. See `PrivacyPage.tsx` for why that matters.

import { pageById } from '../shell';
import './pages.css';

export function CookiesPage() {
  return (
    <>
      <section className="prose" aria-label="Cookies this site sets">
        <h2 className="prose__title">This site sets no cookies</h2>
        <p className="prose__p">
          None. Not for preferences, not for analytics, not for anything. It also writes nothing to
          local storage or session storage.
        </p>
        <p className="prose__p">
          That is why you have not been asked to consent to anything: there is nothing to consent
          to. A banner asking permission to set no cookies would be theatre.
        </p>
        <p className="prose__p">
          Everything the site remembers between visits, it remembers because{' '}
          <strong>you</strong> kept the link. A scenario is encoded in the address itself, which is
          also why a bookmark reopens exactly the case you saved rather than an approximation of
          it.
        </p>
      </section>

      <section className="prose" aria-label="What changes when advertising is introduced">
        <h2 className="prose__title">What changes when advertising is introduced</h2>
        <p className="prose__p">
          Advertising sets cookies, and it sets them on behalf of companies that are not this site.
          When that happens this page will name them, say what each is for and how long it lasts,
          and a consent interface will let you refuse the ones that are not strictly necessary —
          before any of them is set, not after.
        </p>
        <p className="prose__p">
          <strong>Until all of that exists, no advertising runs.</strong> That order is deliberate
          and it is written into the project’s plan rather than left to good intentions. See also
          the <a href={pageById('privacy').path}>privacy policy</a>.
        </p>
      </section>
    </>
  );
}
