// THE SITE'S PAGE LIST — one place, so nothing can drift out of step.
//
// The navigation, the footer's link list, the `aria-current` marking and the build's entry-point
// map all read from this array. A page added here and nowhere else is a page with no link to it;
// `site-structure.test.ts` fails on exactly that, and on a link that points at a page which is
// not built.
//
// WHY EIGHT AND NOT FIVE. Five were proposed. Three more are required by documents already in
// this repository rather than by preference:
//   • CHANGELOG — SPECIFICATION §8: "Every correction to a data value or engine behaviour is
//     logged publicly with its patch number and what changed."
//   • PRIVACY and COOKIES — SPECIFICATION §15, and they are the gate on §16. Advertising cannot
//     be switched on before they exist without putting the product out of compliance with its
//     own specification. Recorded in PLAN.md so it is not rediscovered.

export interface SitePage {
  /** Stable id — the build's entry name and the test's key. */
  id: string;
  /** Served path. Every page is a real directory with its own index.html. */
  path: string;
  /** The `<title>`, and the page's own heading. */
  title: string;
  /** What the navigation calls it — shorter than the title. */
  navLabel: string;
  /** One line describing the page, used as the meta description. */
  blurb: string;
  /** False for pages that belong in the footer's legal group rather than the main nav. */
  inMainNav: boolean;
}

export const SITE_PAGES: SitePage[] = [
  {
    id: 'landing',
    path: '/',
    title: 'Limit Test — a League of Legends damage calculator that shows its working',
    navLabel: 'Home',
    blurb:
      'A League of Legends damage calculator whose numbers are checked against the source, and ' +
      'which shows you the ones it will not stand behind.',
    inMainNav: true,
  },
  {
    id: 'calculator',
    path: '/calculator/',
    title: 'Calculator — Limit Test',
    navLabel: 'Calculator',
    blurb:
      'Two champions, an ordered combo, and an itemised damage breakdown with a survival verdict.',
    inMainNav: true,
  },
  {
    id: 'checks',
    path: '/checks/',
    title: 'How the numbers are checked — Limit Test',
    navLabel: 'How the numbers are checked',
    blurb:
      'What each verification status claims, what it does not claim, and the current count of ' +
      'each across every ability in the game.',
    inMainNav: true,
  },
  {
    id: 'changelog',
    path: '/changelog/',
    title: 'Changelog — Limit Test',
    navLabel: 'Changelog',
    blurb: 'Every correction to a data value or to engine behaviour, with the patch it landed in.',
    inMainNav: true,
  },
  {
    id: 'report',
    path: '/report/',
    title: 'Report a wrong number — Limit Test',
    navLabel: 'Report a wrong number',
    blurb: 'How to report a figure you believe is wrong, and what happens to the report.',
    inMainNav: true,
  },
  {
    id: 'about',
    path: '/about/',
    title: 'About — Limit Test',
    navLabel: 'About',
    blurb: 'What this is, who built it, and why.',
    inMainNav: true,
  },
  {
    id: 'privacy',
    path: '/privacy/',
    title: 'Privacy policy — Limit Test',
    navLabel: 'Privacy',
    blurb: 'What personal data this site processes, and what it does not.',
    inMainNav: false,
  },
  {
    id: 'cookies',
    path: '/cookies/',
    title: 'Cookie policy — Limit Test',
    navLabel: 'Cookies',
    blurb: 'What cookies this site sets, and how to change your choice.',
    inMainNav: false,
  },
];

/** The repository. Named once — it appears in the footer, the landing page and the report flow. */
export const SOURCE_URL = 'https://github.com/sudoRKT/lol-damage-calc';

export function pageById(id: string): SitePage {
  const found = SITE_PAGES.find((p) => p.id === id);
  if (!found) throw new Error(`No site page with id "${id}". See src/ui/shell/pages.ts.`);
  return found;
}
