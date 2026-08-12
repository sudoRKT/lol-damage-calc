# League of Legends Damage & Stats Simulator

A free, browser-based combat simulator for League of Legends theorycrafting. Configure an
attacking and a defending champion — level, ability ranks, items, runes, and pre-existing
combat state — execute an ordered ability combo, and get an exact, itemised damage breakdown
and a survival verdict.

The calculation runs **entirely in the browser**: no accounts, no server-side state, no
database, no authenticated Riot API access. A scenario is shareable purely through its URL.

This product's only value is that its numbers are right, so correctness is established from
documented formulas and known-answer tests, and every ability carries a visible verification
status (`verified` / `derived` / `incomplete`). See `SPECIFICATION.md` for the full scope and
`DESIGN.md` for the visual direction.

## Status

Early. The project foundation is in place (toolchain, the frozen type contract in
`src/types/`, design tokens, and the mock result the UI is built against). The engine, data
pipeline, curated data, URL sharing, and the interface are not built yet.

## Development

Requires Node.js. After cloning, run `npm install` once, then:

```bash
npm run dev        # Vite dev server (default http://localhost:5173)
npm run typecheck  # tsc --noEmit
npm test           # known-answer test suite (pass/fail counts)
npm run build      # typecheck, then emit the static site to dist/
```

The app is a pure static site — nothing here starts a server or a database.

## Licence

Copyright (C) 2026 RKT

This project's **code** is licensed under the **GNU Affero General Public License, version 3
(AGPL-3.0)**. The full, unmodified licence text is in [`LICENSE`](LICENSE).

In plain English, AGPL-3.0 means:

- You may **use** this code and **modify** it freely.
- If you **distribute** it, or **run a modified version as a public / networked service**
  (for example, hosting your own changed copy of this calculator as a website), you must
  **make your complete corresponding source code available to those users, under this same
  AGPL-3.0 licence**.
- The clause about network use is the specific thing that makes AGPL stricter than the
  ordinary GPL: with the GPL you only have to share source when you *distribute* the software;
  with the AGPL, letting the public *use a modified version over a network* also triggers the
  obligation to publish your source. Running an unmodified copy privately carries no such
  obligation.

This is not legal advice; the authoritative terms are in [`LICENSE`](LICENSE).

## Data and assets — licensed separately from the code

The AGPL-3.0 above covers **this project's own code** (the engine, the site, the tooling). It
does **not** cover the third-party game data and art, which are separate works under their own
terms — the two licences cover different things:

- **Champion and ability data derived from the League of Legends Wiki**
  (`wiki.leagueoflegends.com`) remains under **Creative Commons Attribution-ShareAlike
  (CC BY-SA)**, the wiki's own licence, with attribution to the wiki. That licence — not the
  AGPL — governs reuse of that derived data.
- **Game assets** (champion portraits, ability / item / rune icons) come from Riot's Data
  Dragon and are used within Riot's permitted asset usage. They are Riot Games' property, not
  covered by either licence above.

So: **my code is AGPL-3.0; the wiki-derived data is CC BY-SA; Riot's assets are Riot's.** Using
this repository means honouring all three where they apply.

## About

Built by RKT — a paralegal in London working towards qualifying as a solicitor, with the
long-term hope of one day joining Riot's legal team. Until then, this is a small contribution
to Riot's players.

Contact: rushiholycode@gmail.com

---

## Legal

This project is not endorsed by Riot Games and does not reflect the views or opinions of Riot
Games or anyone officially involved in producing or managing Riot Games properties. League of
Legends and Riot Games are trademarks or registered trademarks of Riot Games, Inc.
