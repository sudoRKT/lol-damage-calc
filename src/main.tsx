// Area 0 bootstrap ONLY. This mounts a placeholder so `npm run dev` serves a page and so the
// tokens + frozen types are proven to load and typecheck. The real composition root (App.tsx)
// is owned by the LAYOUT area and will replace this placeholder.

import { createRoot } from 'react-dom/client';
import './ui/tokens.css';
import { MOCK_RESULT } from './types';

function FoundationPlaceholder() {
  const r = MOCK_RESULT;
  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'var(--bg-base)',
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-body)',
        padding: 'var(--space-6)',
        boxSizing: 'border-box',
      }}
    >
      <p
        style={{
          fontSize: 'var(--type-eyebrow)',
          letterSpacing: 'var(--ls-eyebrow)',
          textTransform: 'uppercase',
          color: 'var(--text-secondary)',
          margin: 0,
        }}
      >
        Bench Test · foundation
      </p>
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--type-display-xl)',
          lineHeight: 'var(--lh-display-xl)',
          margin: 'var(--space-2) 0 var(--space-4)',
        }}
      >
        Area 0 scaffolding is in place
      </h1>
      <p style={{ maxWidth: '60ch', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        The engine, data pipeline, and UI are built by separate agents against the frozen
        types in <code style={{ fontFamily: 'var(--font-mono)' }}>src/types/</code>. This
        placeholder will be replaced by the LAYOUT area's real interface.
      </p>
      <p
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--type-num-m)',
          color: 'var(--text-secondary)',
          marginTop: 'var(--space-5)',
        }}
      >
        mock result loaded — patch {r.patch} · {r.perInstance.length} instances · burst{' '}
        {r.burst.total} · verdict{' '}
        {r.verdict.burstOnly.lethal ? 'LETHAL' : 'SURVIVES'}
      </p>
    </main>
  );
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root not found');
createRoot(rootEl).render(<FoundationPlaceholder />);
