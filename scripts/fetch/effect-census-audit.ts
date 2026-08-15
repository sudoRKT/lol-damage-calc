// THE HAND AUDIT of the census's `candidate` bucket.
//
// The classifier splits damage three ways: `instance` (the source wraps a damage type
// together with its value, so a parser can read it), `candidate` (the text is about damage
// but the value is not structurally attached, so a person must read the sentence — the
// DATA-SOURCES §26.3 hard case), and `none`.
//
// The `candidate` bucket is deliberately a SUPERSET. It is cheaper to hand-read a few
// effects that turn out to deal nothing than to silently drop one that deals something.
// This file is the record of that reading, done once on 2026-08-13 against the live text.
//
// WHAT A VERDICT HERE IS, AND IS NOT. It is one person's reading of one sentence, recorded
// with the words it rests on. It is NOT a verification: nothing here is independently
// re-derived, no value is extracted, and no entry may claim better than `derived` because of
// it. Its only job is to size the work honestly — how many of the sentences a person has to
// read actually contain damage.
//
// If a patch changes an effect's wording, an entry here can go stale. `effect-census.test.ts`
// fails when an audited entry is no longer in the candidate bucket, which is what makes that
// visible rather than silent.

export interface AuditVerdict {
  /** Item or rune name, exactly as the census records it. */
  ownerName: string;
  /** Effect key — 'pass' / 'pass2' / 'act' / 'consume' for items, 'rune' for runes. */
  key: string;
  /** Does this effect itself deal damage to another champion? */
  dealsDamage: boolean;
  /** The words the verdict rests on, quoted from the source. */
  because: string;
}

/**
 * Effects the census flagged `candidate`, read by hand.
 *
 * The pattern in the false ones is worth naming, because it is the single most common shape
 * in item text: the damage is the TRIGGER, not the payload. "Dealing physical damage to an
 * enemy champion inflicts Grievous Wounds" is five separate items, and none of them deals
 * damage of its own.
 */
export const CANDIDATE_AUDIT: AuditVerdict[] = [
  // --- items that DO deal damage; the value is there, just not machine-attached ---
  {
    ownerName: 'Blade of The Ruined King',
    key: 'pass',
    dealsDamage: true,
    because: "bonus physical damage on-hit equal to 9%/6% of the target's current health",
  },
  {
    ownerName: 'Eclipse',
    key: 'pass',
    dealsDamage: true,
    because: "2 stacks deal bonus physical damage equal to 8%/5% of target's maximum health",
  },
  {
    ownerName: 'Fiendhunter Bolts',
    key: 'pass2',
    dealsDamage: true,
    because: 'the empowered attacks critically strike for bonus damage stated inside a {{ft}} footnote',
  },
  {
    ownerName: 'Hollow Radiance',
    key: 'pass2',
    dealsDamage: true,
    because: 'the eruption on death deals magic damage; the value sits inside a {{ft}} footnote',
  },
  {
    ownerName: "Liandry's Torment",
    key: 'pass',
    dealsDamage: true,
    because: "the burn deals 1% of the target's maximum health as magic damage every 0.5 seconds",
  },
  {
    ownerName: 'Malignance',
    key: 'pass2',
    dealsDamage: true,
    because: "the scorched zone's Curse deals magic damage every 0.25 seconds",
  },
  {
    ownerName: 'Sundered Sky',
    key: 'pass',
    dealsDamage: true,
    because: 'the empowered attack critically strikes for a stated critical damage figure',
  },
  {
    ownerName: "Zeke's Convergence",
    key: 'pass2',
    dealsDamage: true,
    because: 'the storm deals magic damage every 0.25 seconds to enemy champions',
  },

  // --- items where the damage is the TRIGGER, not the payload ---
  {
    ownerName: 'Black Cleaver',
    key: 'pass',
    dealsDamage: false,
    because: 'dealing physical damage APPLIES a stack; the effect itself only shreds armor',
  },
  {
    ownerName: 'Chempunk Chainsword',
    key: 'pass',
    dealsDamage: false,
    because: 'dealing physical damage inflicts Grievous Wounds — healing reduction, no damage',
  },
  {
    ownerName: "Executioner's Calling",
    key: 'pass',
    dealsDamage: false,
    because: 'Grievous Wounds only',
  },
  { ownerName: 'Morellonomicon', key: 'pass', dealsDamage: false, because: 'Grievous Wounds only' },
  { ownerName: 'Mortal Reminder', key: 'pass', dealsDamage: false, because: 'Grievous Wounds only' },
  { ownerName: 'Oblivion Orb', key: 'pass', dealsDamage: false, because: 'Grievous Wounds only' },
  {
    ownerName: "Serpent's Fang",
    key: 'pass',
    dealsDamage: false,
    because: 'dealing damage inflicts venom, which reduces shields the target gains',
  },
  {
    ownerName: 'Horizon Focus',
    key: 'pass',
    dealsDamage: false,
    because: 'marks the target and increases damage dealt to them by 10% — an amplifier',
  },
  {
    ownerName: 'Hubris',
    key: 'pass',
    dealsDamage: false,
    because: 'a takedown grants bonus attack damage; nothing is dealt by the item',
  },
  {
    ownerName: 'Force of Nature',
    key: 'pass',
    dealsDamage: false,
    because: 'taking magic damage generates Steadfast stacks, which grant magic resistance',
  },
  {
    ownerName: 'Stormsurge',
    key: 'pass',
    dealsDamage: false,
    because: "applies Squall; the damage is in Stormsurge's pass2, which the census reads as an instance",
  },
  {
    ownerName: 'Shadowflame',
    key: 'pass',
    dealsDamage: false,
    because: 'magic and true damage critically strike for 120% — an amplifier on other damage',
  },
  {
    ownerName: 'The Collector',
    key: 'pass',
    dealsDamage: false,
    because: 'executes a champion below 5% maximum health; the source states no damage figure',
  },
  {
    ownerName: "Death's Dance",
    key: 'pass',
    dealsDamage: false,
    because: 'postpones damage the HOLDER takes; nothing is dealt to another champion',
  },
  {
    ownerName: "Death's Dance",
    key: 'pass2',
    dealsDamage: false,
    because: 'a takedown removes stored damage and heals',
  },
  {
    ownerName: "Knight's Vow",
    key: 'pass',
    dealsDamage: false,
    because: "redirects 14% of an ally's incoming damage to the holder",
  },
  {
    ownerName: 'Echoes of Helia',
    key: 'pass',
    dealsDamage: false,
    because: 'converts damage dealt into Soul Charges, which heal an ally',
  },
  {
    ownerName: 'Elixir of Wrath',
    key: 'consume',
    dealsDamage: false,
    because: 'grants bonus attack damage and heals for 12% of physical damage dealt',
  },

  // --- runes that DO deal damage; their prose simply has no wrappers at all ---
  { ownerName: 'Cheap Shot', key: 'rune', dealsDamage: true, because: 'deals 10 - 45 bonus true damage' },
  { ownerName: 'Sudden Impact', key: 'rune', dealsDamage: true, because: 'deals a bonus 20 - 80 true damage' },
  {
    ownerName: 'Press the Attack',
    key: 'rune',
    dealsDamage: true,
    because: 'deals 40 - 160 bonus adaptive damage on the third consecutive attack',
  },
  {
    ownerName: 'Lethal Tempo',
    key: 'rune',
    dealsDamage: true,
    because: 'at max stacks, deals 9-30 (melee) / 6-24 (ranged) bonus adaptive damage on-attack',
  },
  {
    ownerName: 'Grasp of the Undying',
    key: 'rune',
    dealsDamage: true,
    because: "deals bonus magic damage equal to 3.5% of the holder's maximum health",
  },
  {
    ownerName: 'Shield Bash',
    key: 'rune',
    dealsDamage: true,
    because: 'the next basic attack deals 5 - 30 (+2.5% bonus health) bonus adaptive damage',
  },
  {
    ownerName: 'Summon Aery',
    key: 'rune',
    dealsDamage: true,
    because: 'Aery deals 10 - 50 based on level (+0.05 AP) (+0.1 bonus AD) — the source never says the word "damage"',
  },
  {
    // ADDED 2026-08-15, and it is the only verdict here that rests on MARKUP rather than words.
    // First Strike's damage type is stated by Data Dragon nowhere but the tag —
    // `<truedamage>7%</truedamage> extra <truedamage> damage</truedamage>` — and the wiki says
    // the same thing in words: "causing all of your post-mitigation damage dealt against
    // champions to deal 7% bonus true damage". The census read the stripped sentence and
    // classified the rune as dealing NO damage at all. See confirmed-readings.ts for the full
    // record, including what was published before the correction.
    ownerName: 'First Strike',
    key: 'rune',
    dealsDamage: true,
    because:
      'deals bonus TRUE damage equal to 7% of post-mitigation damage dealt to champions — Data ' +
      'Dragon states the type in the tag, the wiki states it in words, and Riot\'s launch note ' +
      '(V11.23) says "bonus true damage"',
  },
  {
    ownerName: 'Deathfire Touch',
    key: 'rune',
    dealsDamage: true,
    because: 'burns for 3 - 12 based on level (+2.5% AP) (+7% bonus AD) magic damage',
  },
  {
    ownerName: 'Scorch',
    key: 'rune',
    dealsDamage: true,
    because: 'sets champions on fire dealing 20 - 40 bonus magic damage based on level',
  },
  {
    ownerName: 'Demolish',
    key: 'rune',
    dealsDamage: true,
    because:
      'deals bonus physical damage — but ONLY to towers, so it never appears in a champion-versus-champion result',
  },

  // --- runes that do not ---
  {
    ownerName: 'Conqueror',
    key: 'rune',
    dealsDamage: false,
    because: 'grants adaptive force per stack and heals at max stacks',
  },
  {
    ownerName: 'Coup de Grace',
    key: 'rune',
    dealsDamage: false,
    because: 'deal 8% MORE damage to low-health champions — an amplifier',
  },
  {
    ownerName: 'Cut Down',
    key: 'rune',
    dealsDamage: false,
    because: 'deal 8% MORE damage to high-health champions — an amplifier',
  },
  {
    ownerName: 'Bone Plating',
    key: 'rune',
    dealsDamage: false,
    because: 'the next 3 instances the holder receives deal 30-60 LESS damage — a reduction',
  },
];

/** Effects the audit says deal damage even though nothing structural states the value. */
export function auditedAsDealingDamage(): AuditVerdict[] {
  return CANDIDATE_AUDIT.filter((v) => v.dealsDamage);
}

export interface AuditReconciliation {
  audited: number;
  /** Audited entries the census no longer classifies as `candidate` — the audit has drifted. */
  notCandidateAnyMore: { ownerName: string; key: string; nowIs: string }[];
  /** Candidates with no audit verdict — nobody has read these sentences yet. */
  unaudited: { ownerName: string; key: string }[];
  dealsDamage: number;
  dealsNoDamage: number;
}

/** Compare the audit against a census run, so drift is reported rather than assumed absent. */
export function reconcileAudit(
  rows: { ownerName: string; key: string; damage: string }[],
): AuditReconciliation {
  const byKey = new Map(rows.map((r) => [`${r.ownerName}|${r.key}`, r]));
  const notCandidateAnyMore: AuditReconciliation['notCandidateAnyMore'] = [];
  for (const verdict of CANDIDATE_AUDIT) {
    const row = byKey.get(`${verdict.ownerName}|${verdict.key}`);
    if (!row) {
      notCandidateAnyMore.push({ ...verdict, nowIs: 'absent from the census' });
    } else if (row.damage !== 'candidate') {
      notCandidateAnyMore.push({ ...verdict, nowIs: row.damage });
    }
  }
  const audited = new Set(CANDIDATE_AUDIT.map((v) => `${v.ownerName}|${v.key}`));
  const unaudited = rows
    .filter((r) => r.damage === 'candidate' && !audited.has(`${r.ownerName}|${r.key}`))
    .map((r) => ({ ownerName: r.ownerName, key: r.key }));
  return {
    audited: CANDIDATE_AUDIT.length,
    notCandidateAnyMore,
    unaudited,
    dealsDamage: CANDIDATE_AUDIT.filter((v) => v.dealsDamage).length,
    dealsNoDamage: CANDIDATE_AUDIT.filter((v) => !v.dealsDamage).length,
  };
}
