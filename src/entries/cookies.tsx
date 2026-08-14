import { createRoot } from 'react-dom/client';
import '../ui/tokens.css';
import { PageShell } from '../ui/shell';
import { CookiesPage } from '../ui/pages';
import { pageById } from '../ui/shell';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root not found');
const page = pageById('cookies');
createRoot(rootEl).render(
  <PageShell current="cookies" standfirst={page.blurb}>
    <CookiesPage />
  </PageShell>,
);
