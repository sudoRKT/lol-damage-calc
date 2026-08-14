import { createRoot } from 'react-dom/client';
import '../ui/tokens.css';
import { PageShell } from '../ui/shell';
import { ChangelogPage } from '../ui/pages';
import { pageById } from '../ui/shell';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root not found');
const page = pageById('changelog');
createRoot(rootEl).render(
  <PageShell current="changelog" standfirst={page.blurb}>
    <ChangelogPage />
  </PageShell>,
);
