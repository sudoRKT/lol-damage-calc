// Item fixtures, copied verbatim out of the live item.json for patch 16.16.1 on
// 2026-08-12 and trimmed to the fields the filter reads. The gold figures, the ids and
// the map flags are the real ones — including the awkward pairs the filter exists to
// resolve.

import type { RawItemMap } from '../items.ts';

function maps(map11: boolean): Record<string, boolean> {
  // Only map 11 matters to the filter; the rest are carried so the fixture looks like the
  // real record rather than a stub.
  return { '11': map11, '12': true, '21': true, '22': false, '30': false, '33': false };
}

export const RAW_ITEMS: RawItemMap = {
  // --- kept: cheap starting items -----------------------------------------------------
  '1001': {
    name: 'Boots',
    gold: { total: 300, purchasable: true },
    stats: { FlatMovementSpeedMod: 25 },
    image: { full: '1001.png' },
    maps: maps(true),
  },
  '1055': {
    name: "Doran's Blade",
    gold: { total: 450, purchasable: true },
    stats: { FlatHPPoolMod: 80, FlatPhysicalDamageMod: 10 },
    image: { full: '1055.png' },
    maps: maps(true),
  },
  '1056': {
    name: "Doran's Ring",
    gold: { total: 400, purchasable: true },
    stats: { FlatHPPoolMod: 90, FlatMagicDamageMod: 18 },
    image: { full: '1056.png' },
    maps: maps(true),
  },

  // --- dropped: zero-gold trinkets ----------------------------------------------------
  '3340': {
    name: 'Stealth Ward',
    gold: { total: 0, purchasable: true },
    stats: {},
    image: { full: '3340.png' },
    maps: maps(true),
  },
  '3363': {
    name: 'Farsight Alteration',
    gold: { total: 0, purchasable: true },
    stats: {},
    image: { full: '3363.png' },
    maps: maps(true),
  },

  // --- kept vs dropped: the mode-variant pairs ----------------------------------------
  '3031': {
    name: 'Infinity Edge',
    gold: { total: 3500, purchasable: true },
    stats: { FlatCritChanceMod: 0.25, FlatPhysicalDamageMod: 75 },
    image: { full: '3031.png' },
    maps: maps(true),
  },
  // The Arena copy is already off map 11 — it is the 32xxxx / 66xxxx copies below that
  // the old three-part filter let through.
  '223031': {
    name: 'Infinity Edge',
    gold: { total: 2500, purchasable: true },
    stats: { FlatCritChanceMod: 0.25, FlatPhysicalDamageMod: 75 },
    image: { full: '223031.png' },
    maps: maps(false),
  },
  '3107': {
    name: 'Redemption',
    gold: { total: 2300, purchasable: true },
    stats: { FlatMagicDamageMod: 30 },
    image: { full: '3107.png' },
    maps: maps(true),
  },
  '323107': {
    name: 'Redemption',
    gold: { total: 2800, purchasable: true },
    stats: { FlatHPPoolMod: 400, FlatMagicDamageMod: 30 },
    image: { full: '323107.png' },
    maps: maps(true),
  },
  '3075': {
    name: 'Thornmail',
    gold: { total: 2450, purchasable: true },
    stats: { FlatHPPoolMod: 150, FlatArmorMod: 75 },
    image: { full: '3075.png' },
    maps: maps(true),
  },
  '323075': {
    name: 'Thornmail',
    gold: { total: 2650, purchasable: true },
    stats: { FlatHPPoolMod: 200, FlatArmorMod: 85 },
    image: { full: '323075.png' },
    maps: maps(true),
  },
  '3146': {
    name: 'Hextech Gunblade',
    gold: { total: 3000, purchasable: true },
    stats: { FlatMagicDamageMod: 80, FlatPhysicalDamageMod: 40 },
    image: { full: '3146.png' },
    maps: maps(true),
  },
  '663146': {
    name: 'Hextech Gunblade',
    gold: { total: 2500, purchasable: true },
    stats: { FlatMagicDamageMod: 90, FlatPhysicalDamageMod: 45 },
    image: { full: '663146.png' },
    maps: maps(true),
  },

  // --- the one duplicate pair that survives the id cutoff -----------------------------
  // Two jungle-pet rows share a name below 200000; the name de-duplication keeps 1101.
  '1101': {
    name: 'Scorchclaw Pup',
    gold: { total: 450, purchasable: true },
    stats: {},
    image: { full: '1101.png' },
    maps: maps(true),
  },
  '1107': {
    name: 'Scorchclaw Pup',
    gold: { total: 450, purchasable: true },
    stats: {},
    image: { full: '1107.png' },
    maps: maps(true),
  },
};
