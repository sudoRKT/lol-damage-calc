// A PAGE THAT EXISTS AND SAYS WHAT IT WILL HOLD.
//
// The eight pages are built in one commit so the routing, the navigation and the shared-link
// redirect can be tested against a real site rather than against one page and seven intentions.
// Their prose lands in its own commit afterwards.
//
// It says what is missing rather than showing a blank page, which is the same rule the
// calculator follows for an ability it cannot model (SPECIFICATION §8): an absence is stated,
// never left to be inferred. This component is deleted as each page is written; a test asserts
// the count of pages still using it, so it cannot quietly become permanent.

import { pageById } from '../shell';
import './pages.css';

export function PageNotWritten({ id }: { id: string }) {
  const page = pageById(id);
  return (
    <section className="notwritten" aria-label="This page is not written yet">
      <p className="notwritten__lead">{page.blurb}</p>
      <p className="notwritten__note">
        This page has not been written yet. The site’s structure was built first so that every
        link, every page and the shared-link redirect could be tested against a real site rather
        than one page and seven intentions. Nothing here is hidden — there is simply nothing here
        yet.
      </p>
    </section>
  );
}
