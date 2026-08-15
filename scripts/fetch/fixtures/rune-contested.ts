// Verbatim excerpts of the live sources that decide the six contested runes, captured
// 2026-08-15 against Data Dragon 16.16.1 and wiki.leagueoflegends.com/en-us.
//
// EVERY STRING HERE IS RE-CHECKED AGAINST THE LIVE SOURCE by `rune-contested-run.ts`, the
// same way `rune-census.ts` anchors its readings: a fixture that no longer appears in the
// source is a failure, not a stale pass. So a transcription slip in this file cannot survive
// a live run, and the tests below can run offline without pretending they are evidence about
// today's wiki.

/** Raw `longDesc` from runesReforged.json 16.16.1 — markup INTACT. The markup is the point. */
export const DDRAGON_LONG_DESC: Record<string, string> = {
  // The whole First Strike question is in the two <truedamage> tags. Lower-case here;
  // <trueDamage> elsewhere. Both spellings are live in the same file.
  'First Strike':
    "Attacks or abilities against an enemy champion within 0.25s of entering champion combat grant 10 gold and <b>First Strike</b> for 3 seconds, causing you to deal <truedamage>7%</truedamage> extra <truedamage> damage</truedamage> against champions, and granting <gold>50% (35% for ranged champions)</gold> of bonus damage dealt as <gold>gold</gold>.<br><br>Cooldown: <scaleLevel>25 - 15</scaleLevel>s",

  // Says "adaptive damage" and states no resolution rule of any kind.
  Electrocute:
    "Hitting a champion with 3 <b>separate</b> attacks or abilities within 3s deals bonus <lol-uikit-tooltipped-keyword key='LinkTooltip_Description_AdaptiveDmg'><font color='#48C4B7'>adaptive damage</font></lol-uikit-tooltipped-keyword>.<br><br>Damage: 70 - 240 (+0.1 bonus AD, +0.05 AP) damage.<br>Cooldown: 20s<br><br><i>'We called them the Thunderlords, for to speak of their lightning was to invite disaster.'</i>",

  // Carries the V26.09 rework (15 - 100 base, distance amplification), so Data Dragon is
  // demonstrably NOT a patch behind on this rune.
  'Arcane Comet':
    "Damaging a champion with an ability hurls a comet at their location, dealing increased damage based on distance.<br><br><lol-uikit-tooltipped-keyword key='LinkTooltip_Description_AdaptiveDmg'><font color='#48C4B7'>Adaptive Damage</font></lol-uikit-tooltipped-keyword>: 15 - 100 based on level (<scaleAP>+0.05 AP</scaleAP> and <scaleAD>+0.1 bonus AD</scaleAD>)<br>Cooldown: 20 - 8s<br><rules><br>Damage amplification scales up to 100% at 750 range.<br></rules>",

  // The three adaptive-FORCE runes. None states a tiebreak; all list Attack Damage first.
  'Absolute Focus':
    "While above 70% health, gain an <lol-uikit-tooltipped-keyword key='LinkTooltip_Description_Adaptive'><font color='#48C4B7'>adaptive</font></lol-uikit-tooltipped-keyword> bonus of up to 18 Attack Damage or 30 Ability Power (based on level). <br><br>Grants 1.8 Attack Damage or 3 Ability Power at level 1. ",
  Waterwalking:
    "Gain <speed>10 Move Speed</speed> and <lol-uikit-tooltipped-keyword key='LinkTooltip_Description_Adaptive'><font color='#48C4B7'>13 - 30 Adaptive Force</font></lol-uikit-tooltipped-keyword> (based on level) when in the river.<br><br><i>May you be as swift as the rushing river and agile as a startled Rift Scuttler.</i>",
  'Gathering Storm':
    "Every 10 min gain AP or AD, <lol-uikit-tooltipped-keyword key='LinkTooltip_Description_Adaptive'><font color='#48C4B7'>adaptive</font></lol-uikit-tooltipped-keyword>.<br><br><i>10 min</i>: + 8 AP or 5 AD <br><i>20 min</i>: + 24 AP or 14 AD<br><i>30 min</i>: + 48 AP or 29 AD<br><i>40 min</i>: + 80 AP or 48 AD<br><i>50 min</i>: + 120 AP or 72 AD<br><i>60 min</i>: + 168 AP or 101 AD<br>etc...",

  // The control cases for the stripping check: the type is INSIDE the tag as words, so
  // stripping loses nothing and the check must NOT fire.
  'Hail of Blades':
    'Gain 90% (60% for ranged champions) Attack Speed and <trueDamage>bonus true damage</trueDamage> when you attack an enemy champion for up to 3 attacks.<br><br>No more than 3s can elapse between attacks or this effect will end.<br><br>Cooldown: 10s.<br>On-Hit Damage: 2 - 20 (+0.12 bonus AD, +0.1 AP) damage.<br><br><rules>Attack resets increase the attack limit by 1.<br>Allows you to temporarily exceed the Attack Speed limit.</rules>',
  'Sudden Impact':
    'Damaging basic attacks and abilities deal a bonus <trueDamage>20 - 80 True Damage</trueDamage> based on level to enemy champions after using a dash, leap, blink, teleport, or when leaving stealth for 4s.<br><br>Cooldown: 10s',

  // States no damage type anywhere, in markup or in words. The check must not fire, and the
  // census's `not-stated` for this rune is right.
  'Summon Aery':
    'Damaging enemy champions with basic attacks or abilities sends Aery to them, dealing 10 - 50 based on level (+<scaleAP>0.05 AP</scaleAP>) (+<scaleAD>0.1 bonus AD</scaleAD>).<br><br>Empowering or protecting allies with abilities sends Aery to them, shielding them for 20 - 100 based on level (+<scaleAP>0.05 AP</scaleAP>) (+<scaleAD>0.1 bonus AD</scaleAD>).<br><br>Aery cannot be sent out again until she returns to you.',
};

/** `Template:Rune data <Name>` wikitext excerpts. */
export const WIKI_TEMPLATE: Record<string, string> = {
  // The complete rule, tiebreak included, added 2026-05-02.
  Electrocute:
    "|description2 = {{sbc|Variable Damage:}} This effect deals either {{as|physical|physical damage}} or {{as|magic damage}} depending on the damage contribution from your {{as|{{sti|attack damage}}}} and {{as|{{sti|ability power}}}} to the effect's damage formula.<ul><li>Greater '''bonus damage''' from the {{as|{{sti|AD ratio}}}} → {{as|Physical damage}}</li><li>Greater '''bonus damage''' from the {{as|{{sti|AP ratio}}}} → {{as|Magic damage}}</li></ul>If the damage contribution of {{as|{{sti|AD}}}} and {{as|{{sti|AP}}}} are zero or otherwise equal, the damage type defaults to {{as|magic damage}}.",
  'Arcane Comet':
    "|description2 = {{sbc|Variable Damage:}} This effect deals either {{as|physical|physical damage}} or {{as|magic damage}} depending on the damage contribution from your {{as|{{sti|attack damage}}}} and {{as|{{sti|ability power}}}} to the effect's damage formula.<ul><li>Greater '''bonus damage''' from the {{as|{{sti|AD ratio}}}} → {{as|Physical damage}}</li><li>Greater '''bonus damage''' from the {{as|{{sti|AP ratio}}}} → {{as|Magic damage}}</li></ul>If the damage contribution of {{as|{{sti|AD}}}} and {{as|{{sti|AP}}}} are zero or otherwise equal, the damage type defaults to {{as|magic damage}}.",

  // The 2017 line, identical on all three, and on nothing else in the current 62.
  'Absolute Focus':
    "|description2 = {{sbc|Adaptive:}} Grants bonuses based on which stat you already have the most bonuses for. ''Defaults to the first listed.''",
  Waterwalking:
    "|description2 = {{sbc|Adaptive:}} Grants bonuses based on which stat you already have the most bonuses for. ''Defaults to the first listed.''",
  'Gathering Storm':
    "|description2 = {{sbc|Adaptive:}} Grants bonuses based on which stat you already have the most bonuses for. ''Defaults to the first listed.''",

  // Grants adaptive force and carries NO tiebreak line — so the article's rule is the only
  // one that reaches it. Two of the five adaptive-force runes are in this state.
  Conqueror:
    "|description2 = Each stack of ''Conqueror'' grants {{adaptive|1.8 + (4-1.8)/17*(x-1)|20}}",

  // Says true damage in words, and has since the rune shipped.
  'First Strike':
    "causing all of your {{tt|post-mitigation damage|Damage calculated after modifiers}} dealt against champions to deal {{as|7% '''bonus''' true damage}}",
};

/**
 * The Adaptive force article, the part that decides three of the six. Last edited
 * 2026-05-27 and tagged [[V26.11]]; the adaptive-type explanation was written 2026-05-02.
 */
export const ADAPTIVE_FORCE_ARTICLE = `1 point of Adaptive Force provides {{as|{{fd|0.6}} '''bonus''' AD}} or {{as|1 AP}}.

If the {{as|'''bonus''' attack damage}} and the {{as|ability power}} of the unit are '''equal''', the stat granted depends on the [[File:Rune_shard_Adaptive_Force.png|16px]] '''adaptive type''' of the champion.</onlyinclude>
* If the champion's '''adaptive type''' is {{sti|physical damage|{{as|physical|physical damage}}}}, they are granted {{as|'''bonus''' AD}}.
* If the champion's '''adaptive type''' is {{sti|magic damage|{{as|magic|magic damage}}}}, they are granted {{as|AP}}.

== Adaptive damage ==
A similar effect can be found on:

{{tip data/Adaptive damage|pst2|description}}

Despite also having variable damage types, {{ri|Arcane Comet}} and {{ri|Electrocute}} do not utilize the {{tip|adaptive damage|nolink=true}} formula to determine their damage types.`;

/**
 * The rune's own article Patch History, which reproduces the launch note verbatim. This is
 * what makes "Defaults to the first listed" datable rather than merely old-looking: it is
 * the V7.22 (2017) note, still sitting in the template nine years later.
 */
export const ABSOLUTE_FOCUS_LAUNCH_NOTE = `;[[V7.22]] Added
* [[File:Sorcery icon.png|20px|link=Sorcery]] [[Sorcery]] Slot 2 rune.
** {{sbc|Passive:}} Gain {{adaptive|5 to 40}} while above {{as|70% of your '''maximum''' health}}.
** {{sbc|Adaptive:}} Grants bonuses based on which stat you already have the most bonuses for. ''Defaults to the first listed.''`;

/**
 * First Strike's launch note. The percentage has moved five times since; the TYPE never has.
 * Riot's own note says "bonus true damage", which is the wiki's reading, not the amplifier
 * reading the stripped Data Dragon text suggested.
 */
export const FIRST_STRIKE_LAUNCH_NOTE = `;[[V11.23]] - Added
** {{sbc|Passive:}} Dealing damage or applying a {{tip|crowd control}} effect to an enemy champion within the first {{fd|0.25}} seconds of champion combat, grants {{g|5}} and ''First Strike'' for 3 seconds, causing all of your {{tt|post-mitigation damage|Damage calculated after modifiers}} dealt against champions to deal {{as|10% '''bonus''' true damage}}.`;

/**
 * Electrocute's launch note, which states the CONTRIBUTION rule — "which would deal the most
 * damage" — and not the bonus-AD-versus-AP rule the adaptive damage tip states. Riot's own
 * wording has agreed with the template's Variable Damage block since 2017.
 */
export const ELECTROCUTE_LAUNCH_NOTE = `** {{sbc|Adaptive:}} Deals either physical or magic depending on which would deal the most damage.`;
