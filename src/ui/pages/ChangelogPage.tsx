// CHANGELOG — SPECIFICATION §8: "Every correction to a data value or engine behaviour is logged
// publicly with its patch number and what changed."
//
// ═══ IT IS EMPTY, AND SAYING SO IS THE HONEST THING ═══
//
// Nothing has been corrected in public because nothing has been published in public. Inventing
// entries to make the page look established would be the exact failure this product exists to
// prevent, on the page whose whole job is to record when the product got something wrong.
//
// The page therefore states what will be logged and what will not, so the promise is legible
// before there is anything to test it against. `ENTRIES` is the list; a test asserts that the
// page says it is empty when it is, so this cannot silently become a page that looks maintained.

import { pageById } from '../shell';
import './pages.css';

export interface ChangeEntry {
  /** Patch the correction shipped in, e.g. "16.16.1". */
  patch: string;
  /** The date it landed, ISO. */
  date: string;
  /** What was wrong, in plain English, and what it is now. */
  what: string;
}

/** Corrections to a published value or to engine behaviour. Newest first. */
export const ENTRIES: ChangeEntry[] = [];

export function ChangelogPage() {
  return (
    <>
      <section className="prose" aria-label="What gets logged here">
        <h2 className="prose__title">What gets logged here</h2>
        <p className="prose__p">
          Every correction to a number this site has shown, and every change to how a number is
          calculated, with the patch it landed in and what it was before. If a figure you relied
          on changes, it appears here — including when the change means we were wrong.
        </p>
        <p className="prose__p">
          What does not appear here: new champions and items arriving with a patch, which are an
          ordinary data update rather than a correction, and work on abilities that were never
          shown in the first place. Those change what the calculator{' '}
          <em>covers</em>, not what it previously told you.
        </p>
      </section>

      <section className="prose" aria-label="Corrections">
        <h2 className="prose__title">Corrections</h2>
        {ENTRIES.length === 0 ? (
          <p className="prose__p">
            <strong>Nothing yet.</strong> Not because nothing has been wrong — plenty has, during
            building — but because nothing has been published for anyone to rely on yet. The first
            entry will appear the first time a figure this site has shown turns out to be wrong.
            An empty page here is a true statement, and filling it with development history to
            look established would be the same kind of dishonesty this whole product is against.
          </p>
        ) : (
          <ul className="prose__list">
            {ENTRIES.map((entry) => (
              <li key={`${entry.date}-${entry.what}`}>
                <span className="prose__stamp">
                  {entry.date} · patch {entry.patch}
                </span>
                {entry.what}
              </li>
            ))}
          </ul>
        )}
        <p className="prose__p">
          Found one before we did? <a href={pageById('report').path}>Report a wrong number</a>.
        </p>
      </section>
    </>
  );
}
