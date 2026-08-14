// THE RESOLVED STAT BLOCK — what a champion actually is when the combo begins.
//
// SPECIFICATION §2, step 9: "the simulator returns the full computed stat block for both
// champions". Full means full: this prints every field of the frozen `StatBlock`
// (src/types/result.ts), including the ones that are zero. A stat that is absent from the
// screen is indistinguishable from a stat that was never modelled, and this product's whole
// claim is that a reader can tell those apart.
//
// TWO SPLITS ARE SHOWN, NOT COLLAPSED, because the engine needs both halves and so does the
// reader:
//   • armor and magic resistance are printed as total AND base + bonus, because percentage
//     BONUS penetration applies to the bonus portion alone (src/types/result.ts) — a single
//     total makes that effect unmodellable, and hiding the split hides why.
//   • attack damage is printed as base + bonus + total for the same reason.
//
// NOTHING HERE IS A DAMAGE FIGURE. Armor is not damage, attack damage is not damage dealt, and
// none of these carries a P/M/T tag — the tag says what RESISTANCE a figure was measured
// against, and a stat has not been measured against anything. `DamageValue` is deliberately
// not used in this file; the one place a tag belongs in a stat block is nowhere.

import type { StatBlock } from '../../types';
import { formatDamage, formatReadout, roundReadout } from '../primitives';
import { ChampionPortrait } from '../art/ChampionPortrait';
import './stats.css';

/**
 * A stat is a READOUT, so it is printed to `READOUT_DECIMALS` places — see ../primitives/readout.ts
 * for the defect this exists to prevent and why the rule lives in one place rather than here.
 */

/**
 * Group thousands the way every other number in the product does, to `STAT_DECIMALS` places.
 *
 * Grouping delegates to the primitive rather than reimplementing it — two implementations of
 * thousands grouping are two chances for the same number to be printed two ways.
 */
function formatStat(value: number): string {
  return formatDamage(roundReadout(value));
}

/**
 * The spoken form of a stat.
 *
 * **THE SPOKEN STRING IS A SECOND PLACE THE SAME DEFECT LIVED, AND NO AMOUNT OF LOOKING AT THE
 * PAGE WOULD HAVE FOUND IT.** Rounding only the visible value left every hidden accessible name
 * reading "129.98874999999998, 49.988749999999996 base plus 80 bonus" — fourteen digits for a
 * screen reader user where a sighted user got four, from the same row.
 */
const spokenStat = formatReadout;

/** A 0..1 fraction as a percentage, e.g. 0.5 → "50%", 0.125 → "12.5%". */
export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 1000) / 10}%`;
}

export interface CombatantNameplateProps {
  /** "Attacker" or "Defender" — the role, spoken before the name. */
  role: string;
  championName: string;
  /** Full Data Dragon portrait URL, or null when no champion is chosen yet. */
  portraitSrc: string | null;
  level: number;
}

/**
 * The 64px nameplate for one of the two combatants (DESIGN.md §9).
 *
 * This is the ONE place a portrait is shown in full colour: §9 resolves portraits to full
 * colour "only for the two active combatants", and gives the active one a 2px bone border.
 * Everywhere else — picker rows, lists — stays desaturated.
 */
export function CombatantNameplate({
  role,
  championName,
  portraitSrc,
  level,
}: CombatantNameplateProps) {
  return (
    <div className="nameplate">
      {portraitSrc ? (
        <ChampionPortrait
          src={portraitSrc}
          name={championName}
          size="nameplate"
          active
          decorative
        />
      ) : null}
      <div>
        <p className="nameplate__role" aria-hidden="true">
          {role}
        </p>
        <p className="nameplate__name" aria-hidden="true">
          {championName}
        </p>
        <p className="nameplate__level" aria-hidden="true">
          Level {level}
        </p>
        {/* One text node, so nothing is announced run together. */}
        <span className="u-visually-hidden">{`${role}: ${championName}, level ${level}`}</span>
      </div>
    </div>
  );
}

export interface StatBlockPanelProps {
  role: string;
  championName: string;
  portraitSrc: string | null;
  stats: StatBlock;
}

interface Row {
  label: string;
  value: string;
  /** Spoken instead of `value` where the printed form would be read badly. */
  spoken?: string;
}

/** Every row of the block, in one place, so the table and its tests read the same list. */
export function statRows(stats: StatBlock): Row[] {
  const p = stats.penetration;
  return [
    {
      // MAXIMUM HEALTH IS SPLIT LIKE THE RESISTANCES ARE (2026-08-13). Bonus health is not
      // derivable from a total — it is maximum minus the champion's own base at this level —
      // and an ability scaling on it is unmodellable without the figure. The split shown is of
      // MAXIMUM health: a damaged champion has lost health, and which pool it came from is not
      // a fact the game states, so `hp` is printed against `maxHp` and not against either part.
      label: 'Health',
      value:
        `${formatStat(stats.hp)} / ${formatStat(stats.maxHp)} ` +
        `(${formatStat(stats.maxHpBase)} + ${formatStat(stats.maxHpBonus)})`,
      spoken:
        `${spokenStat(stats.hp)} of ${spokenStat(stats.maxHp)} maximum, ` +
        `${spokenStat(stats.maxHpBase)} base plus ${spokenStat(stats.maxHpBonus)} bonus`,
    },
    // MANA IS PRINTED ONLY FOR A CHAMPION WHOSE RESOURCE IS MANA. Absent is not zero: 11 of the
    // roster have no resource pool and 19 module entries state a NON-MANA one with a non-zero
    // value (Shen 400 energy, Yone 500 flow). A row reading "Mana 0" would claim an empty mana
    // pool, and a row reading "Mana 400" for Shen would label energy as mana. So the row is
    // omitted entirely, which is the same thing the stat block itself says.
    ...(stats.maxMana !== undefined
      ? [
          {
            label: 'Mana',
            value: `${formatStat(stats.mana ?? 0)} / ${formatStat(stats.maxMana)}`,
            spoken: `${spokenStat(stats.mana ?? 0)} of ${spokenStat(stats.maxMana)} maximum`,
          },
        ]
      : []),
    {
      label: 'Armor',
      value: `${formatStat(stats.armor)} (${formatStat(stats.armorBase)} + ${formatStat(stats.armorBonus)})`,
      spoken: `${spokenStat(stats.armor)}, ${spokenStat(stats.armorBase)} base plus ${spokenStat(stats.armorBonus)} bonus`,
    },
    {
      label: 'Magic resist',
      value: `${formatStat(stats.magicResist)} (${formatStat(stats.magicResistBase)} + ${formatStat(stats.magicResistBonus)})`,
      spoken: `${spokenStat(stats.magicResist)}, ${spokenStat(stats.magicResistBase)} base plus ${spokenStat(stats.magicResistBonus)} bonus`,
    },
    {
      label: 'Attack damage',
      value: `${formatStat(stats.attackDamage.total)} (${formatStat(stats.attackDamage.base)} + ${formatStat(stats.attackDamage.bonus)})`,
      spoken: `${spokenStat(stats.attackDamage.total)}, ${spokenStat(stats.attackDamage.base)} base plus ${spokenStat(stats.attackDamage.bonus)} bonus`,
    },
    { label: 'Ability power', value: formatStat(stats.abilityPower) },
    { label: 'Critical strike chance', value: formatPercent(stats.critChance) },
    {
      label: 'Critical strike damage',
      value: `×${stats.critDamage}`,
      spoken: `${stats.critDamage} times normal damage`,
    },
    { label: 'Attack speed', value: formatStat(stats.attackSpeed) },
    {
      label: 'Adaptive force',
      value: stats.adaptiveType === 'physical' ? 'Physical' : 'Magic',
    },
    { label: 'Armor penetration, flat', value: formatStat(p.flatArmor) },
    { label: 'Armor penetration, percent', value: formatPercent(p.percentArmor) },
    { label: 'Bonus armor penetration, percent', value: formatPercent(p.percentBonusArmor) },
    { label: 'Magic penetration, flat', value: formatStat(p.flatMagic) },
    { label: 'Magic penetration, percent', value: formatPercent(p.percentMagic) },
  ];
}

export function StatBlockPanel({
  role,
  championName,
  portraitSrc,
  stats,
}: StatBlockPanelProps) {
  const rows = statRows(stats);

  return (
    <section className="statblock" aria-label={`${role} stat block — ${championName}`}>
      <CombatantNameplate
        role={role}
        championName={championName}
        portraitSrc={portraitSrc}
        level={stats.level}
      />

      <table className="statblock__table">
        <caption className="u-visually-hidden">
          {`${championName}'s resolved statistics at level ${stats.level}, as the combo begins`}
        </caption>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              <td>
                <span className="statblock__value" aria-hidden="true">
                  {row.value}
                </span>
                <span className="u-visually-hidden">{row.spoken ?? row.value}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
