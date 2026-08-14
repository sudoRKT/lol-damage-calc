import { createRoot } from 'react-dom/client';
import '../ui/tokens.css';
import { PageShell } from '../ui/shell';
import { PageNotWritten } from '../ui/pages';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root not found');
createRoot(rootEl).render(
  <PageShell current="changelog">
    <PageNotWritten id="changelog" />
  </PageShell>,
);
