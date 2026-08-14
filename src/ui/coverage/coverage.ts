// WHAT THE PRODUCT CAN HONESTLY SAY ABOUT EVERY ABILITY IN THE GAME — counted, never claimed.
//
// ═══ WHY THIS EXISTS RATHER THAN A PARAGRAPH ═══
//
// The landing page's whole claim is that this product's numbers are checked and that the ones
// it cannot check are marked rather than guessed. A claim like that typed into a page as prose
// is marketing: it is unfalsifiable by the reader, and it goes stale on the next patch without
// anyone noticing. Counted from the published data it is neither — anyone can download the same
// files and get the same figures.
//
// So NO FIGURE ON THE LANDING PAGE IS TYPED. Every one comes through this function, from the
// same `public/data/abilities/` files the calculator itself reads.
//
// ═══ THE FOUR STATUSES ARE THE SPECIFICATION'S, NOT THIS FILE'S ═══
//
// SPECIFICATION §8 defines them and says what each claims. Restating them here would be a second
// definition that could drift, so this only COUNTS them:
//
//   verified   — everything derived claims, plus an independent re-derivation. Deliberately rare,
//                and never a target to maximise.
//   derived    — the normal, well-evidenced state: agrees with the source's own rendering,
//                reconciles with the total the source states, and matches Riot's shipped arrays
//                where those exist.
//   incomplete — we will not show a number we cannot stand behind. Contributes NO damage, and
//                says what is missing.
//   no-damage  — the ability deals none. Not a statement about trust; a statement that there is
//                nothing to make one about.

/** One ability entry, as `public/data/abilities/<Champion>.json` publishes it. */
export interface CoverageEntry {
  verification: string;
  notes?: string | null;
  unresolvable?: unknown[] | null;
}

export interface Coverage {
  /** Patch the published data was fetched for. */
  patch: string;
  champions: number;
  abilities: number;
  verified: number;
  derived: number;
  incomplete: number;
  noDamage: number;
  /**
   * Incomplete entries that name what is missing. SPECIFICATION §8 requires BOTH pending and
   * permanent to say what is absent, so this should equal `incomplete` — and the landing page
   * prints it as a fraction precisely so that it is visible if it ever stops equalling it.
   */
  incompleteWithReason: number;
  /** Incomplete because NO source states the fact — no amount of work will ever supply it. */
  permanentlyUnanswerable: number;
}

/**
 * Count the published entries.
 *
 * IT THROWS ON A STATUS IT DOES NOT KNOW. A fifth status would otherwise be silently dropped
 * from the totals, and the landing page would print a breakdown that does not add up to its own
 * total while looking perfectly reasonable.
 */
export function summariseCoverage(
  entries: readonly CoverageEntry[],
  meta: { patch: string; champions: number },
): Coverage {
  const counts = { verified: 0, derived: 0, incomplete: 0, 'no-damage': 0 };
  let incompleteWithReason = 0;
  let permanentlyUnanswerable = 0;

  for (const entry of entries) {
    if (!(entry.verification in counts)) {
      throw new Error(
        `summariseCoverage: unknown verification status "${entry.verification}". ` +
          `SPECIFICATION §8 defines four. Add it here rather than letting the breakdown ` +
          `silently stop adding up to the total.`,
      );
    }
    counts[entry.verification as keyof typeof counts] += 1;

    if (entry.verification === 'incomplete') {
      const permanent = Array.isArray(entry.unresolvable) && entry.unresolvable.length > 0;
      if (permanent) permanentlyUnanswerable += 1;
      if (permanent || (entry.notes ?? '').trim().length > 0) incompleteWithReason += 1;
    }
  }

  return {
    patch: meta.patch,
    champions: meta.champions,
    abilities: entries.length,
    verified: counts.verified,
    derived: counts.derived,
    incomplete: counts.incomplete,
    noDamage: counts['no-damage'],
    incompleteWithReason,
    permanentlyUnanswerable,
  };
}

/** The four statuses must account for every entry. Cheap, and it catches a dropped arm. */
export function coverageAddsUp(c: Coverage): boolean {
  return c.verified + c.derived + c.incomplete + c.noDamage === c.abilities;
}
