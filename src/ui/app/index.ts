// THE COMPOSED PAGE. This is what the lead mounts.
//
//   import { App } from './ui/app';
//   createRoot(document.getElementById('root')!).render(<App />);
//
// `src/main.tsx` and `index.html` are outside this area, so the mount itself is the lead's to
// write. `App` needs no props: it fetches the published data files itself and injects nothing.

export {
  App,
  CONFIGURED_ELSEWHERE,
  DEFAULT_ATTACKER,
  DEFAULT_DEFENDER,
  startingCombo,
  startingConfig,
  summaryNote,
} from './App';
export type { AppProps } from './App';
