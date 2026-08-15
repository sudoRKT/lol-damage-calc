// EVERY COLLAPSED SECTION STATES ITS OWN SIZE.
//
// ═══ THE RULE THIS ENFORCES, AND WHERE IT COMES FROM ═══
//
// SPECIFICATION §11 was ruled on 2026-08-15: a control reading "Mechanics this result excludes —
// 22" satisfies "stated visibly", and the list may start collapsed. **The ruling is conditional,
// and this file is the condition.** In the owner's words: a collapsed section that hides how much
// it hides is the thing being ruled against.
//
// So the permission to collapse is not general. It is a permission to collapse things that ANNOUNCE
// THEIR SIZE, and without a mechanical check the two drift apart the first time somebody adds a
// disclosure in a hurry.
//
// ═══ WHAT IT CHECKS, AND WHAT IT CANNOT ═══
//
// It reads the SOURCE of every component in `src/ui/`, finds every `<Disclosure ...>` element, and
// requires each to pass a `count`. It does not render anything, so it costs nothing and cannot be
// defeated by a fixture that happens not to exercise a code path.
//
// **IT CANNOT SEE A DISCLOSURE BUILT BY HAND** — a `useState` plus a button plus `aria-expanded`,
// which is how `InstanceBreakdown`'s per-row "Full state" control is written and how anyone could
// write the next one. That gap is real and is named here rather than papered over: the second half
// of the check is therefore a sweep for the PATTERN, which fails on any NEW hand-rolled disclosure
// so that its author has to either pass through `Disclosure` or come and read this file.

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const UI_DIR = dirname(fileURLToPath(import.meta.url));

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const COMPONENTS = walk(UI_DIR).filter(
  (f) => (f.endsWith('.tsx') || f.endsWith('.ts')) && !/\.test\.tsx?$/.test(f),
);
const rel = (f: string) => relative(UI_DIR, f);
const read = (f: string) => readFileSync(f, 'utf8');

/** Every `<Disclosure ...>` opening tag in the area, with the file it is in. */
function disclosureTags(): Array<{ file: string; tag: string }> {
  const out: Array<{ file: string; tag: string }> = [];
  for (const file of COMPONENTS) {
    if (rel(file) === 'primitives/Disclosure.tsx') continue; // the component itself
    for (const m of read(file).matchAll(/<Disclosure\b[\s\S]*?>/g)) {
      out.push({ file: rel(file), tag: m[0] });
    }
  }
  return out;
}

/**
 * `aria-expanded` OUTSIDE THE PRIMITIVE, each named with why it is not a collapsed content
 * section. Two of these three are not disclosures at all — the attribute is simply the correct
 * ARIA for the widget — and the sweep was too broad on its first run for exactly that reason.
 *
 * A NEW entry may not be added without a sentence saying why the thing has no count to state.
 * That is what makes this a tripwire rather than a list.
 */
const NOT_A_COUNTABLE_SECTION: Record<string, string> = {
  'picker/ChampionPicker.tsx':
    'a combobox. `aria-expanded` is required by the combobox pattern and describes a listbox of ' +
    'search results, whose size changes with every keystroke — a count on the control would be a ' +
    'number that never stops moving.',
  'shell/SiteNav.tsx':
    'a menu button. The attribute is required by the pattern; the menu is navigation, not the ' +
    'result content SPECIFICATION §11 governs.',
  'breakdown/InstanceBreakdown.tsx':
    'predates the primitive. Its per-row "Full state" control expands ONE row\'s state snapshot ' +
    'inside a table cell — a single thing, not a list with a size worth announcing.',
};

describe('collapsed sections/every one states its size', () => {
  it('the sweep is looking at something — there are disclosures to check', () => {
    // Without this, deleting every Disclosure would make the suite pass by finding nothing.
    expect(disclosureTags().length).toBeGreaterThanOrEqual(3);
  });

  it('every <Disclosure> passes a count (SPECIFICATION §11, ruled 2026-08-15)', () => {
    const missing = disclosureTags()
      .filter(({ tag }) => !/\bcount=/.test(tag))
      .map(({ file, tag }) => `${file}: ${tag.replace(/\s+/g, ' ').slice(0, 90)}`);
    expect(missing).toEqual([]);
  });

  it('the count reaches the accessible name, not just the visible label', () => {
    // A count a screen reader cannot hear is not a count. `disclosureName` is the single place the
    // spoken sentence is built; this asserts it actually interpolates the number.
    const source = read(join(UI_DIR, 'primitives', 'Disclosure.tsx'));
    expect(source).toMatch(/aria-label=\{disclosureName\(/);
    expect(source).toMatch(/\$\{count\}/);
  });

  it('no NEW hand-rolled disclosure appears outside the primitive', () => {
    // The stated limit of this file: it cannot inspect a hand-rolled control for a count, so it
    // refuses new ones instead. An author who needs one has to come here and decide deliberately.
    const rolled = COMPONENTS.filter((f) => /aria-expanded=/.test(read(f)))
      .map(rel)
      .filter((f) => f !== 'primitives/Disclosure.tsx' && !(f in NOT_A_COUNTABLE_SECTION));
    expect(rolled).toEqual([]);

    // And the allow-list holds no DEAD entry — a file that stopped using the attribute should
    // lose its exemption rather than keep a permanent excuse.
    const dead = Object.keys(NOT_A_COUNTABLE_SECTION).filter(
      (f) => !/aria-expanded=/.test(read(join(UI_DIR, f))),
    );
    expect(dead).toEqual([]);
  });
});
