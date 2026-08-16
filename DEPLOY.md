# DEPLOY.md — putting the site on limittest.site

Written 2026-08-16. Everything below was measured on this machine on that date against a real
build; where something was not measured, it says so.

This file is the record of what deployment consists of. SPECIFICATION §14 asks for five things —
a static site on a CDN with denial-of-service protection, source in a remote repository,
automatic deploys on merge to main, continuous integration that blocks failing merges, and error
monitoring. **Four of the five are ready. The fifth is deliberately not built, and §5 below says
why.**

**THE SITE IS LIVE.** `limittest.site` and `www.limittest.site` are attached to the Cloudflare
Pages project, both Active with SSL, since 2026-08-16. Steps 1–5 of §3 are DONE and are kept
below as the record of what was done rather than as a worklist. **Step 6 — branch protection —
is the only one outstanding**, and it is gated on CI being green.

Verified against the live site on 2026-08-16: all eight pages 200, an unknown path serves the
site's own 404, every header in `public/_headers` is applied by Cloudflare including the
corrected content-security policy, and the calculator renders with **zero console errors, 12 of
12 Data Dragon images loading and 8 of 8 font faces loaded, none failed.**

---

## 0. §14's CI claim is PARTLY FALSE, by a measured amount

**CI runs 2,877 of the project's 3,127 tests. The other 250 run on the project owner's machine
only** — not in CI, not on a fresh clone, nowhere else.

Nine test files read the harvester's output from `build/proposed-curated/`: about 4.3 MB across
six files, the largest `ability-wikitext.json` at 3.1 MB. That directory is in `.gitignore` by
deliberate policy — *"Draft curated entries produced by scripts/extract. Proposals only"* — so it
is absent from every clone, and it cannot be regenerated in CI because it comes from harvesting
the wiki over the network (~20 minutes, PLAN.md §2).

**This was not introduced by the deployment work. It was revealed by it.** The first CI run ever,
on 2026-08-16, failed on seven of the nine. The suite had been green on one machine since it was
written, because the files were sitting on that machine. Nothing had ever run it anywhere else,
so nothing had said so.

**The list was wrong the first time, and how it was wrong is worth keeping.** It was built by
searching test files for the artifact's path, which found seven. The next CI run failed on two
more — `defensive-counts.test.ts` and `per-tick-read.test.ts` — which reach the same file through
a helper and so never name it themselves. A search over source text cannot see that.

**So the check is now made by observation rather than by pattern.** CI runs each of the nine and
requires it to fail *for the missing artifact*. A file that quietly stops needing the exclusion is
caught by the guard finding it passing; a file that starts needing one is caught by the main run
failing and naming it, which is exactly how the two extra files surfaced. **Verified by hiding the
artifact directory on this machine and running both steps against it: all nine failed only for the
missing file, and the remaining 2,877 passed.**

**What is and is not covered.** A green CI run is evidence about the engine, the interface, the
URL encoder and the site. **It is not evidence about the ability harvester or the fetch
pipeline** — which PLAN.md §3 calls "the area where a defect costs the most". One of the nine is
`tests/cross-area-seams.test.ts`, so the sweep that exists to catch two areas holding opposite
rules is itself a check CI does not run. Those 250 tests are not unrun; they are run by one person
on one machine, and nobody else can reproduce them.

The real fix is PLAN.md §7.

---

## 1. What the build produces

`npm run build` does three things in order: regenerates the landing page's coverage figures from
the published data, typechecks the whole project, then emits a folder called `dist/`.

`dist/` is the entire website. It is ordinary files — no server, no database, no process running
anywhere. **It is ready to serve as it stands**, which was not assumed: the built folder was
served by a plain static file server with no framework and no rewrite rules, and every page was
opened in a real browser.

What comes out, measured 2026-08-16:

| | |
|---|---|
| Total size | **6.0 MB**, of which 4.0 MB is the published champion, item and rune data |
| Pages | 8 real HTML files at 8 real paths |
| Largest page's JavaScript | the calculator, **187 kB — 57 kB over the wire** after compression |
| Landing page's JavaScript | **7 kB**, because it ships none of the calculator's code |
| Fonts | 3 families, self-hosted; nothing is fetched from a font network |
| Images | none of our own — champion, ability, item and rune art is loaded from Riot's Data Dragon |

**The eight pages resolve correctly from a CDN and not only from the development server.** This
was the specific risk worth checking, because a development server invents conveniences that a
CDN does not. Measured against a plain static server, and then again against a stand-in that
applies the real header rules:

| Address | Result |
|---|---|
| `/` `/calculator/` `/checks/` `/changelog/` `/report/` `/about/` `/privacy/` `/cookies/` | all **200 OK** |
| `/calculator` (no trailing slash) | **301** to `/calculator/` — the same thing Cloudflare Pages does |
| `/anything-else` | **404**, serving the site's own error page |
| A shared scenario link arriving at the root, `/#s=…` | **moved to `/calculator/#s=…`, fragment identical** |

That last row is the one that would have hurt. Shared links are how scenarios travel
(SPECIFICATION §12), and the redirect that catches one arriving at the front door is written in
TypeScript that the build compiles away into a shared chunk. It survives the build and it runs
before anything is painted — confirmed in a browser, not inferred from the source.

**Nothing in the shipped code assumes localhost, a development server, or a path that will not
exist in production.** Five files mention `http://localhost:5173`; all five are developer preview
harnesses under `src/ui/`, none is one of the eight entry points, and none appears anywhere in
`dist/`. Every link the site builds is either a root-relative path (`/calculator/`, `/data/…`) or
an absolute URL to Data Dragon, GitHub or Creative Commons.

---

## 2. What was added for deployment, and why each exists

Six files. All are new; none changed how the calculator works.

| File | What it does |
|---|---|
| `.github/workflows/ci.yml` | Runs typecheck, **2,877 of the 3,127 tests** (§0 says which 250 are missing and why) and a production build, on every push and every pull request |
| `.node-version` | Names the Node version — read by BOTH the CI workflow and Cloudflare Pages, so the runtime that proves the build green is the runtime that performs the deploy |
| `public/_headers` | The CDN's header rules: the content-security policy, four other security headers, and how long each kind of file may be cached |
| `public/404.html` | The page served for an address that is not a page |
| `public/robots.txt` + `public/sitemap.xml` | What a search engine reads first, and the list of the eight pages |
| `public/favicon.svg` | The browser-tab icon |

Two of them are also protected by tests, in `tests/deployment-assets.test.ts` (22 tests). The
sitemap is compared against the page list in both directions, so a ninth page cannot be added
without the sitemap noticing; and the security policy is compared against the art host the code
actually builds URLs from, so changing one without the other fails rather than silently blanking
every icon on the site. **Both checks were proved by breaking them on purpose and watching them
go red**, then restored.

### The security policy was measured, and the first version was wrong

A content-security policy is a list of what the browser is allowed to load. Written from
reasoning alone, the first version broke the site's typography: Vite embeds any file under 4 kB
directly into the stylesheet, and nine of the smaller font subsets are under that — the browser
blocked all nine and fell back to system fonts. Nothing errored visibly; the site was simply in
the wrong typeface.

It was found by serving the real build under the real headers and opening the calculator with the
browser console open. Corrected, re-measured: **zero console errors, all three font families
loaded, all eight data files fetched, the page rendering "Lux vs Garen" with its numbers.**

---

## 3. What you do by hand, in order

Steps 1–7 get the site live. Steps 8–10 are ten minutes each and are the difference between a
site that works and one that looks looked-after.

**Nothing below can be done from this session** — each needs an account only you can sign into.

---

**1. Push this branch and let CI run once.**

```bash
git push origin main
```

*Why first:* GitHub cannot offer a check as "required" in step 3 until it has seen that check run
at least once. This push is what teaches it the name `suite`. Watch it go green under the
repository's Actions tab; it takes about two minutes, most of which is installing dependencies.

---

**2. Create a Cloudflare account and add the domain.**

At `dash.cloudflare.com`, sign up, then **Add a site** → `limittest.site` → **Free** plan.

Cloudflare will scan for existing DNS records and then show you **two nameservers**, something
like `xxx.ns.cloudflare.com`. Write them down — step 3 needs them.

*Why:* this is what puts Cloudflare in front of the domain. §14's denial-of-service protection is
part of the Free plan and is on by default once the domain is served through Cloudflare; there is
nothing to switch on.

---

**3. Change the nameservers at Fasthosts.**

Sign in to Fasthosts, find `limittest.site` in the domain list, and look for **Nameservers** (it
may be under "Manage domain" or "DNS settings"). Choose the option for **custom** or
**third-party** nameservers — *not* "use Fasthosts nameservers" — and enter the two Cloudflare
gave you in step 2, replacing whatever is there.

*Why:* this hands DNS to Cloudflare. Until it takes effect, nothing else in this list can point
the domain anywhere.

*How long:* Cloudflare usually confirms within an hour, but the change is allowed to take up to
48 hours and occasionally does. **Cloudflare emails you when the domain goes active.** Do not
wait for it — step 4 works immediately and independently.

---

**4. Create the Cloudflare Pages project.**

In the Cloudflare dashboard: **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
Authorise GitHub, choose `sudoRKT/lol-damage-calc`, then set:

| Setting | Value |
|---|---|
| Production branch | `main` |
| Framework preset | **None** |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | leave blank |

Save and deploy.

*Why:* this is §14's "merges to the main branch deploy automatically". From here on, every push to
`main` rebuilds and republishes the site with no further action.

*What to expect:* the first build takes a few minutes. It ends by giving you an address like
`lol-damage-calc.pages.dev`. **Open it and click through all eight pages.** This is the site,
live, before the domain is involved at all — if something is wrong, it is easier to find here.

*If the build fails on the Node version:* the project needs a recent Node because the build runs
a TypeScript file directly. `.node-version` in the repository asks for `26.4.0`. If Cloudflare
says it cannot provide that version, edit that one file to `24` and push; nothing else changes,
and CI will re-verify the build on that version before Cloudflare does.

---

**5. Attach the domain.** *(Needs step 3 to have completed — Cloudflare will have emailed you.)*

In the Pages project: **Custom domains** → **Set up a custom domain** → `limittest.site`.
Cloudflare creates the DNS record itself. Then add `www.limittest.site` the same way.

*Why:* until this is done the site answers only on `pages.dev`. HTTPS certificates are issued
automatically and take a few minutes.

*Then check:* `https://limittest.site` loads, and `http://limittest.site` upgrades itself to
HTTPS.

---

**6. Turn on branch protection, which is the half of §14 that CI cannot do itself.**

The workflow file makes the tests **run**. Only this setting makes a failure **block a merge** —
without it a red cross appears and the merge button still works.

On GitHub: repository → **Settings** → **Branches** → **Add branch ruleset** (or "Add rule") for
`main`, and enable:

- **Require a pull request before merging**
- **Require status checks to pass before merging** → search for and tick **`suite`**
- **Require branches to be up to date before merging**

*Why:* SPECIFICATION §14 says continuous integration blocks merges that fail. This is that
sentence.

*Note:* this also means you can no longer push straight to `main` — changes go through a pull
request. That is the intended trade. If you would rather keep direct pushes for now, skip this
step and say so, rather than leaving it half-done and believing it is on.

---

**7. Check the live site against this list.**

Open `https://limittest.site` and confirm:

- [ ] All eight pages load from the navigation and the footer
- [ ] Champion portraits and ability icons appear (they come from Riot's servers, not ours)
- [ ] A combo produces numbers, and the burndown chart draws
- [ ] `https://limittest.site/nonsense` shows the site's own "There is no page at this address"
- [ ] Copy a shared scenario link, paste it into a new tab, and confirm it opens the calculator
      with the same matchup

---

**8. Create the `wrong-number` label on GitHub.** *(Two minutes.)*

Repository → **Issues** → **Labels** → **New label** → name it exactly `wrong-number`.

*Why:* the "report a wrong number" control builds a pre-filled GitHub issue and asks for that
label. **The label does not currently exist on the repository.** GitHub's behaviour with a label
that does not exist could not be determined from here without signing in — it may ignore it, or
it may show the reporter an error. Creating the label costs two minutes and removes the question.

---

**9. Give the repository a description and topics.** *(Two minutes.)*

The repository currently has no description. Four pages on the site link to it, and a reader who
follows one arrives at a page that does not say what the project is.

Suggested: *"A League of Legends damage calculator whose numbers are checked against the source —
and which shows you the ones it will not stand behind. limittest.site"* — plus topics
`league-of-legends`, `damage-calculator`, `typescript`, `react`.

---

**10. Submit the site to Riot's developer programme.** *(Not urgent, but it is a §15 requirement.)*

SPECIFICATION §15 requires registration with Riot's developer programme for products serving
players, whether or not they use the official API. This is a form, and it needs a live URL —
which is why it comes after step 5 rather than before.

---

## 4. What is deliberately NOT set up

**Analytics, advertising, and consent management.** PLAN.md §6 gates advertising behind the
privacy and cookie policies having real content covering it, and that gate stands.

The gate is now mechanical as well as written down: `public/_headers` forbids third-party and
inline script (`script-src 'self'`). **An advertising or analytics tag added to a page will be
blocked by the browser rather than quietly starting to work.** Switching advertising on therefore
requires a deliberate edit to the security policy — which is the intended shape of a decision
that PLAN.md says must not happen by accident.

---

## 5. §14's error monitoring is NOT built, and this is why

SPECIFICATION §14 asks for error monitoring that reports client-side failures. It is the one item
of the five that is not ready, and it is not an oversight.

Every error-monitoring service available to a static site is a third-party script that receives
each visitor's address, browser and page. **The privacy policy currently on the site says, in
bold: "No page-view tracking, no session recording, no fingerprinting, no third-party script of
any kind."** Adding error monitoring makes that sentence false the moment it deploys.

That is the same failure SPECIFICATION §15 records against the old scope disclaimer, which
claimed the product computed rune bonuses when it did not — a paragraph a careful reader trusts to
be conservative, overclaiming. It is worth avoiding twice.

**So error monitoring is a decision, not a task**, and it needs one of:

1. Add it and rewrite the privacy policy's third-party paragraph in the same commit. This is the
   ordinary answer and takes about an hour, most of it prose.
2. Use a monitor that stores nothing personal — Cloudflare's own Workers-based logging, for
   instance, which sees requests it already handles rather than adding a script to the page.
3. Ship without it and record it as outstanding. The site is a static page with no server: the
   failures error monitoring would catch are browser-specific rendering faults, which is a real
   category but not a data-loss one.

**Recommendation: option 3 for launch, option 1 within the first week.** Nothing about launching
is blocked by it, and rewriting the privacy policy under time pressure on launch day is how a
policy page ends up inaccurate.

---

## 6. Known gaps, stated rather than left to be found

- **No social share image.** Every page carries a title, description and canonical address, so a
  link shared to Discord or Reddit unfurls as a titled card. It has no picture, because there is
  no mark in DESIGN.md to make one from. A *broken* image would be worse than none, so the tag is
  omitted rather than pointed at a file that does not exist.
- **The favicon is provisional.** DESIGN.md specifies no mark. The icon is the burndown staircase
  §7 describes, in tokens, with no hue. The design pass should confirm or replace it; it is one
  file and one line in each of eight HTML heads.
- **`/favicon.ico` will 404** for browsers too old to accept an SVG icon. They show no icon rather
  than a broken one.
- **The sitemap has no `lastmod` dates.** A date here would have to be maintained by hand and
  would be wrong within a day. A stale one is worse than none, because a crawler believes it.
