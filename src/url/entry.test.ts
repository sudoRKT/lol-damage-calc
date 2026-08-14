// WHERE A URL BELONGS — the rule that keeps a shared scenario out of the landing page.
//
// This is the test the inline-script version of this logic could never have had. It runs a real
// encoded scenario through the redirect and then decodes it on the other side, so the check is
// not "does the string look right" but "does the scenario survive the move".

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CALCULATOR_PATH, calculatorRedirectFor, carriesScenario } from './entry';
import { encodeScenario, scenarioFromUrl, FRAGMENT_KEY } from './index';
import { NAMED_SCENARIOS } from './fixtures';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('entry/does this URL carry a scenario', () => {
  it('says yes for a scenario fragment, in either position', () => {
    expect(carriesScenario('https://bench.test/#s=2~abc~d')).toBe(true);
    expect(carriesScenario('https://bench.test/#a=1&s=2~abc~d')).toBe(true);
  });

  it('says no for a URL with nothing to carry', () => {
    expect(carriesScenario('https://bench.test/')).toBe(false);
    expect(carriesScenario('https://bench.test/#')).toBe(false);
    expect(carriesScenario('https://bench.test/#s=')).toBe(false);
    expect(carriesScenario('https://bench.test/about/')).toBe(false);
  });

  it('does not fire on "s=" buried inside another value', () => {
    // `#notes=1` contains "s=" but is not a scenario, and treating it as one would bounce a
    // reader off a page they asked for.
    expect(carriesScenario('https://bench.test/#notes=1')).toBe(false);
    expect(carriesScenario('https://bench.test/#x=as=1')).toBe(false);
  });
});

describe('entry/where it sends them', () => {
  it('sends a scenario at the root to the calculator', () => {
    expect(calculatorRedirectFor('https://bench.test/#s=2~abc~d')).toBe(
      `https://bench.test${CALCULATOR_PATH}#s=2~abc~d`,
    );
  });

  it('LEAVES A SCENARIO ALREADY ON THE CALCULATOR ALONE — or it would replace itself forever', () => {
    expect(calculatorRedirectFor(`https://bench.test${CALCULATOR_PATH}#s=2~abc~d`)).toBeNull();
  });

  it('leaves every page without a scenario alone', () => {
    for (const path of ['/', '/about/', '/checks/', '/report/', '/changelog/']) {
      expect(calculatorRedirectFor(`https://bench.test${path}`)).toBeNull();
    }
  });

  it('carries the query string across as well as the fragment', () => {
    expect(calculatorRedirectFor('https://bench.test/?utm=x#s=2~abc~d')).toBe(
      `https://bench.test${CALCULATOR_PATH}?utm=x#s=2~abc~d`,
    );
  });

  it('THE SCENARIO SURVIVES THE MOVE, character for character', () => {
    // The claim that matters. Not "the string looks right" — the scenario decodes on the other
    // side into the same scenario, for every fixture the format is tested against.
    for (const { name, scenario } of NAMED_SCENARIOS) {
      const shared = `https://bench.test/#${FRAGMENT_KEY}=${encodeScenario(scenario)}`;
      const moved = calculatorRedirectFor(shared);
      expect(moved, name).not.toBeNull();
      const decoded = scenarioFromUrl(moved!);
      expect(decoded.ok, name).toBe(true);
      if (decoded.ok) expect(decoded.scenario).toEqual(scenario);
    }
  });
});

describe('entry/the landing page actually calls it', () => {
  // A pure function nobody invokes protects nothing. These read the real HTML.
  const landing = readFileSync(join(REPO, 'index.html'), 'utf8');

  it('the landing page loads the redirect', () => {
    expect(landing).toContain('/src/entries/redirect.ts');
  });

  it('AND LOADS IT BEFORE ITS OWN PAGE, so the landing page is never painted first', () => {
    // Module scripts run in document order. If the landing entry came first, a reader with a
    // shared link would see the front page flash before being moved — which is the visible half
    // of the defect this whole file exists to prevent.
    const redirectAt = landing.indexOf('/src/entries/redirect.ts');
    const landingAt = landing.indexOf('/src/entries/landing.tsx');
    expect(redirectAt).toBeGreaterThan(-1);
    expect(landingAt).toBeGreaterThan(-1);
    expect(redirectAt).toBeLessThan(landingAt);
  });
});
