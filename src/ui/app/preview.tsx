// DEV-ONLY mount for the composed page.
//
// `src/main.tsx` and `index.html` are outside this area, so the real mount is the lead's to write
// (one line: `createRoot(...).render(<App />)`). This page exists so the whole thing can be LOADED
// IN A REAL BROWSER before it has a home — jsdom computes no layout, runs no animation and
// downloads no image, and two real defects on this project were found only by opening a page.
//
// It also catches what jsdom cannot report: anything written to `console.error`, and any uncaught
// error or unhandled promise rejection, is printed into a visible panel at the top of the page.
// A screenshot of this page is therefore evidence about the console as well as about the layout.
//
// `vite build` builds index.html only, so nothing here reaches `dist/`.

// LOADS THE PRODUCT'S TYPEFACES. Added 2026-08-15 to every preview entry at once.
//
// `fonts.css` was imported by `shell/PageShell.tsx` and by nothing else, and no harness renders
// the shell — so every preview page rendered in system faces. Measured: `document.fonts.size` was
// **0** on a harness against **42** on the calculator, and strings came out 1–5% wide.
//
// **That is not cosmetic on a page whose job is measuring.** It misled a session: overhang figures
// taken here implied an axis label the shipping face does not produce, and a second agent spent
// time reconciling two correct measurements of two different typefaces.
//
// `fonts.css`'s own header records the identical defect in the product itself on 2026-08-14 —
// the whole site rendering in two system faces with nothing checking. This is that defect's
// second home, found the same way: by measuring rather than by reading.
import '../fonts.css';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import '../tokens.css';
import './app.css';

function ConsoleWatch() {
  const [problems, setProblems] = useState<string[]>([]);

  useEffect(() => {
    const original = console.error;
    console.error = (...args: unknown[]) => {
      setProblems((p) => [...p, args.map((a) => String(a)).join(' ')]);
      original(...args);
    };
    const onError = (e: ErrorEvent) => setProblems((p) => [...p, `uncaught: ${e.message}`]);
    const onRejection = (e: PromiseRejectionEvent) =>
      setProblems((p) => [...p, `unhandled rejection: ${String(e.reason)}`]);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      console.error = original;
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return (
    <section className="app__notice" aria-label="Console watch (dev preview only)">
      <h2 className="app__notice-title">
        {problems.length === 0 ? 'Console clean — 0 errors' : `Console: ${problems.length} error(s)`}
      </h2>
      {problems.length > 0 ? (
        <ul>
          {problems.map((p, i) => (
            <li key={`${i}-${p.slice(0, 40)}`}>{p}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function Preview() {
  return (
    <>
      <ConsoleWatch />
      <App />
    </>
  );
}

const root = document.getElementById('app-preview-root');
if (root) createRoot(root).render(<Preview />);
