// THE CONFIRMED POPULATION — every entry here was read as a sentence by a person.
//
// The detector in `defensive.ts` proposed 289 candidate pages. This file records what a person
// found when they read them. It is the ONLY thing the census may count as a defensive effect;
// the candidate count is reported alongside it and never in place of it.
//
// ADDING A MEMBER MEANS READING ITS SENTENCE. It does not mean widening a pattern in
// `defensive.ts`. That rule is in CLAUDE.md and it is here because the variable-hit detector fired
// on 24 entries where a person reading them found 17, and mis-shaped one of the 17.
//
// Each rejection carries a CLASS, and each class is swept over all 937 pages by
// `defensive-defects.ts` so the same mistake can be found everywhere rather than fixed once.

import type { Kind } from './defensive.ts';

/** One page's verdict. `kinds` is empty when every candidate signal on the page was rejected. */
export interface Verdict {
  key: string;
  kinds: Kind[];
  /** Set when the page was proposed and rejected, naming the class of the over-fire. */
  rejectedAs?: RejectClass;
  /** Free-text note kept where the reading is not obvious from the key alone. */
  note?: string;
}

export type RejectClass =
  | 'mitigation-tooltip'
  | 'penetration-not-resistance'
  | 'stat-read-as-ratio'
  | 'shield-as-prop'
  | 'shield-destruction'
  | 'dealt-side-reduction'
  | 'non-champion-recipient'
  | 'applies-existing-lifesteal'
  | 'trigger-mention-only'
  | 'target-amplification'
  | 'cc-immunity-only'
  | 'untargetable-only'
  | 'health-pool-property';

export const REJECT_CLASSES: Record<RejectClass, string> = {
  'mitigation-tooltip':
    'the match is inside the wiki\'s own tooltip phrase "pre-mitigation damage", ' +
    '"post-mitigation damage" or "after resistances". That phrase says WHICH damage number a ' +
    'heal or a store scales from. It is not a defensive effect, and it is the single largest ' +
    'over-fire in the run.',
  'penetration-not-resistance':
    '"armor" or "magic resistance" matched inside "armor penetration" / "magic penetration" / ' +
    '"armor reduction". A different stat, applied to somebody else. §37.4 defect 4 in item form.',
  'stat-read-as-ratio':
    'the ability READS a resistance or health pool as a damage coefficient — "(+ 15% bonus ' +
    'armor)" inside a damage expression. Reading a defensive stat is not granting one.',
  'shield-as-prop':
    'the word "shield" names a physical object or an ability title ("Leona illuminates her ' +
    'shield", "Shield of Daybreak", "Shield Vault"), not an absorbing pool.',
  'shield-destruction':
    'the ability DESTROYS enemy shields. It changes damage the holder deals, not damage taken.',
  'dealt-side-reduction':
    'THE TRAP. The sentence reduces damage the ability DEALS, not damage its owner TAKES. ' +
    '"Targets hit after the first take 50% reduced damage" (Xayah Q) reads almost exactly like ' +
    'a defensive reduction and is its opposite.',
  'non-champion-recipient':
    'the protected thing is a summoned unit — a trap, a clone, a sand soldier, a sapling, a ' +
    'tentacle, a bloblet. Not a champion, so not the defender.',
  'applies-existing-lifesteal':
    '"applies life steal" means this ability\'s damage triggers a life steal the champion ' +
    'already has from items. The kit grants nothing; the value lives on the attacker\'s stat ' +
    'block. Distinct from "gains life steal", which IS a grant and is confirmed.',
  'trigger-mention-only':
    'a heal, shield or mitigation is named only as the CONDITION for something else ' +
    '("whenever Lucian is healed or shielded by an ally"). The effect belongs to another page.',
  'target-amplification':
    'the enemy is made to take MORE damage (Vladimir R, Amumu P). Real and engine-relevant, ' +
    'but it is an attacker-side amplifier, not a defensive kit effect. Counted separately.',
  'cc-immunity-only':
    'immunity to crowd control only. The source does not say damage is prevented.',
  'untargetable-only':
    'the source says untargetable, and says nothing about damage. Untargetability is not stated ' +
    'to prevent damage, so it is NOT counted as immunity. Counted separately, with its own row.',
  'health-pool-property':
    'the sentence states a property of the champion\'s health pool (Pyke cannot gain maximum ' +
    'health; Kled\'s health is not improved by bonus health). It changes the survival verdict ' +
    'and it is not a grant. Counted separately.',
};

/**
 * ACTIVATION, per SPECIFICATION §5. Three buckets, never two.
 *
 * - `always-active`: the source states the effect as a permanent property with no trigger, no
 *   cast, no duration and no precondition. These bake into the defender's resolved stat block.
 * - `conditional`: the source states a cast, a duration, a trigger, a stack count or a target
 *   state. These become toggles in the interface.
 * - `not-stated`: the source does not settle it. **This is a real bucket and not a coin toss.**
 *   An effect landed here is not a 50/50 guess to be resolved later by convention.
 */
export type Activation = 'always-active' | 'conditional' | 'not-stated';

export interface ConfirmedEffect {
  key: string;
  kinds: Kind[];
  activation: Activation;
  /** Why the activation was classified that way — the words in the source that decided it. */
  activationEvidence: string;
}

/**
 * The confirmed defensive effects, hand-read 2026-08-13 against the cached wikitext of all 937
 * ability pages (`build/proposed-curated/ability-wikitext.json`, patch as manifest).
 */
export const CONFIRMED: ConfirmedEffect[] = [
  // ---------- damage reduction, received side ----------
  { key: 'Alistar/R/Unbreakable Will', kinds: ['damage-reduction'], activation: 'conditional', activationEvidence: 'Active cast; "For the next 7 seconds"' },
  { key: "Bel'Veth/E/Royal Maelstrom", kinds: ['damage-reduction', 'heal'], activation: 'conditional', activationEvidence: 'Active; "enters a frenzy for 1.5 seconds"' },
  { key: 'Braum/E/Unbreakable', kinds: ['damage-reduction'], activation: 'conditional', activationEvidence: 'Active; directional — "from enemies in the target direction"' },
  { key: 'Briar/E/Chilling Scream', kinds: ['damage-reduction', 'heal'], activation: 'conditional', activationEvidence: 'Active; "while charging"' },
  { key: 'Fizz/P/Nimble Fighter', kinds: ['damage-reduction'], activation: 'always-active', activationEvidence: 'Innate; "permanently ghosted and reduces every instance of damage taken" — no trigger, no duration' },
  { key: 'Garen/W/Courage', kinds: ['damage-reduction', 'resistance-grant', 'shield'], activation: 'conditional', activationEvidence: 'Active for the reduction and shield; the per-stack resistances are a passive accumulation' },
  { key: 'Gragas/W/Drunken Rage', kinds: ['damage-reduction'], activation: 'conditional', activationEvidence: 'Active; "for 2.5 seconds"' },
  { key: 'Irelia/W/Defiant Dance', kinds: ['damage-reduction'], activation: 'conditional', activationEvidence: 'Active channel; "retains the damage reduction for 0.5 seconds"' },
  { key: 'Jax/E/Counter Strike', kinds: ['damage-reduction', 'immunity'], activation: 'conditional', activationEvidence: 'Active; "a defensive stance"; dodges basic attacks outright, 25% off AoE' },
  { key: "K'Sante/W/Path Maker", kinds: ['damage-reduction'], activation: 'conditional', activationEvidence: 'Active channel; 30%, "increased to 75%" in All Out form' },
  { key: 'Leona/W/Eclipse', kinds: ['damage-reduction', 'resistance-grant'], activation: 'conditional', activationEvidence: 'Active; "raises her guard for 3 seconds"' },
  { key: 'Malzahar/P/Void Shift', kinds: ['damage-reduction'], activation: 'conditional', activationEvidence: 'Innate but gated: the source states it is lost on taking damage and returns after a delay' },
  { key: 'Master Yi/W/Meditate', kinds: ['damage-reduction', 'heal'], activation: 'conditional', activationEvidence: 'Active channel; "while channeling"' },
  { key: 'Warwick/E/Primal Howl', kinds: ['damage-reduction'], activation: 'conditional', activationEvidence: 'Active; "for up to 2.75 seconds"' },
  { key: 'Zaahen/R/Grim Deliverance', kinds: ['damage-reduction', 'heal'], activation: 'conditional', activationEvidence: 'Active; "from the start of the cast time"' },

  // ---------- damage-type-specific reduction ----------
  { key: 'Amumu/E/Tantrum', kinds: ['type-specific-reduction'], activation: 'always-active', activationEvidence: 'Passive half of the ability; "reduces every instance of physical damage taken" — no trigger stated' },
  { key: 'Galio/W/Shield of Durand', kinds: ['type-specific-reduction', 'shield'], activation: 'conditional', activationEvidence: 'Passive shield is periodic ("Gain a shield"), the physical/magic reduction is on the Active channel' },
  { key: 'Nilah/W/Jubilant Veil', kinds: ['type-specific-reduction', 'immunity'], activation: 'conditional', activationEvidence: 'Active; "for 2.25 seconds"; magic only, plus dodging basic attacks' },

  // ---------- resistance grants ----------
  { key: 'Anivia/P/Rebirth', kinds: ['resistance-grant', 'execute-threshold', 'immunity', 'heal'], activation: 'conditional', activationEvidence: '"upon taking fatal damage"; resistances apply only "while under resurrection"' },
  { key: 'Braum/W/Stand Behind Me', kinds: ['resistance-grant'], activation: 'conditional', activationEvidence: 'Active; "for 3 seconds"; separate self and ally rows' },
  { key: 'Briar/R/Certain Death', kinds: ['resistance-grant', 'heal'], activation: 'conditional', activationEvidence: 'Active; resistances "equal to 20% AD" for the duration' },
  { key: 'Graves/E/Quickdraw', kinds: ['resistance-grant'], activation: 'conditional', activationEvidence: '"For each stack" — a stack count the user must set' },
  { key: 'Gwen/W/Hallowed Mist', kinds: ['resistance-grant'], activation: 'conditional', activationEvidence: 'Active; "While inside the mist"' },
  { key: 'Hecarim/W/Spirit of Dread', kinds: ['resistance-grant', 'heal'], activation: 'conditional', activationEvidence: 'Active; "While active"' },
  { key: 'Jax/R/Grandmaster-at-Arms', kinds: ['resistance-grant'], activation: 'conditional', activationEvidence: 'Active; "If this hits a champion", scaling with champions hit' },
  { key: 'Jayce/R/Transform Mercury Hammer', kinds: ['resistance-grant'], activation: 'conditional', activationEvidence: 'Form toggle; the resistances hold only in Hammer Stance' },
  { key: "K'Sante/R/All Out", kinds: ['resistance-grant', 'execute-threshold', 'heal'], activation: 'conditional', activationEvidence: 'Active; NEGATIVE — "his base armor and magic resistance are reduced by 85%". The one confirmed effect that makes its owner take MORE damage' },
  { key: 'Kennen/R/Slicing Maelstrom', kinds: ['resistance-grant'], activation: 'conditional', activationEvidence: 'Active; "for 3 seconds"' },
  { key: 'Kled/P/Dismounted Skaarl the Cowardly Lizard', kinds: ['resistance-grant'], activation: 'conditional', activationEvidence: 'Only while Dismounted, and scaled by nearby visible enemy champions' },
  { key: 'Malphite/W/Thunderclap', kinds: ['resistance-grant'], activation: 'conditional', activationEvidence: 'Passive armor, "tripled while Granite Shield is active" — the tripling is conditional' },
  { key: 'Nasus/R/Fury of the Sands', kinds: ['resistance-grant', 'health-grant'], activation: 'conditional', activationEvidence: 'Active; "for 15 seconds"' },
  { key: 'Olaf/R/Ragnarok', kinds: ['resistance-grant'], activation: 'conditional', activationEvidence: 'Active; the resistances are the passive half but are lost while the active runs' },
  { key: 'Orianna/E/Command: Protect', kinds: ['resistance-grant', 'shield'], activation: 'conditional', activationEvidence: 'The resistances hold only for the unit The Ball is attached to' },
  { key: 'Ornn/P/Living Forge', kinds: ['resistance-grant', 'health-grant'], activation: 'conditional', activationEvidence: 'An AMPLIFIER: "increases his bonus armor, bonus magic resistance and bonus health by 10% from all sources", scaling with Masterwork upgrades' },
  { key: 'Pantheon/E/Aegis Assault', kinds: ['resistance-grant', 'immunity'], activation: 'conditional', activationEvidence: 'Active channel; invulnerable to damage from the target direction, resistances only "after recasting"' },
  { key: 'Rammus/W/Defensive Ball Curl', kinds: ['resistance-grant'], activation: 'conditional', activationEvidence: 'Active; "for 7 seconds"' },
  { key: 'Rell/P/Break the Mold', kinds: ['resistance-grant'], activation: 'conditional', activationEvidence: '"equal to the sum of resistances reduced from all afflicted enemies" — depends on enemies afflicted' },
  { key: 'Rell/W/Ferromancy: Mount Up', kinds: ['resistance-grant'], activation: 'conditional', activationEvidence: '"While Rell is Dismounted" — a form state' },
  { key: 'Sejuani/P/Fury of the North', kinds: ['resistance-grant'], activation: 'conditional', activationEvidence: 'Frost Armor "lingers for 3 seconds after taking damage" — it drops out of combat' },
  { key: 'Shyvana/P/Scalemail', kinds: ['resistance-grant'], activation: 'conditional', activationEvidence: '"For each stack" — a stack count' },
  { key: 'Singed/R/Insanity Potion', kinds: ['resistance-grant'], activation: 'conditional', activationEvidence: 'Active; "for 25 seconds"' },
  { key: 'Taric/W/Bastion', kinds: ['resistance-grant', 'shield'], activation: 'conditional', activationEvidence: 'Passive armor to self, and to the ally only "while the tether persists"' },
  { key: 'Thresh/P/Damnation', kinds: ['resistance-grant'], activation: 'conditional', activationEvidence: '"For each stack" — souls collected' },
  { key: 'Trundle/R/Subjugate', kinds: ['resistance-grant', 'heal'], activation: 'conditional', activationEvidence: 'Active; steals resistances from the target, so it depends on the target' },
  { key: 'Wukong/P/Stone Skin', kinds: ['resistance-grant', 'heal'], activation: 'conditional', activationEvidence: 'Base armor is flat per level, but "For each stack, Stone Skin\'s effects are increased" — nearby enemy champions' },

  // ---------- shields ----------
  { key: 'Akshan/P/Dirty Fighting', kinds: ['shield'], activation: 'conditional', activationEvidence: '"if the target is a champion"; "only once every few seconds"' },
  { key: 'Ambessa/W/Repudiation', kinds: ['shield'], activation: 'conditional', activationEvidence: 'Active; "for 1.5 seconds"' },
  { key: 'Annie/E/Molten Shield', kinds: ['shield'], activation: 'conditional', activationEvidence: 'Active; "for 3 seconds"' },
  { key: 'Aphelios/P/Severum', kinds: ['shield', 'heal'], activation: 'conditional', activationEvidence: 'Only the overheal becomes a shield; the heal requires attacks landing' },
  { key: 'Azir/E/Shifting Sands', kinds: ['shield'], activation: 'conditional', activationEvidence: 'Active; "for 1.5 seconds"' },
  { key: 'Blitzcrank/P/Mana Barrier', kinds: ['shield'], activation: 'conditional', activationEvidence: '"when damaged to 30% maximum health" — a health threshold' },
  { key: 'Camille/P/Adaptive Defenses', kinds: ['shield', 'type-specific-reduction'], activation: 'conditional', activationEvidence: 'Periodic; the shield absorbs physical OR magic "based on which type" — the type is decided by the incoming damage' },
  { key: 'Diana/W/Pale Cascade', kinds: ['shield'], activation: 'conditional', activationEvidence: 'Active; doubled "if all three spheres detonate"' },
  { key: 'Ekko/W/Parallel Convergence', kinds: ['shield'], activation: 'conditional', activationEvidence: '"If Ekko enters the sphere before it expires"' },
  { key: "Galio/R/Hero's Entrance", kinds: ['shield'], activation: 'conditional', activationEvidence: 'Active; grants Shield of Durand to allies in the area' },
  { key: 'Hwei/W/Pool of Reflection', kinds: ['shield'], activation: 'conditional', activationEvidence: 'Active; "while within the area"; "reduced to 85% for allies"' },
  { key: 'Ivern/E/Triggerseed', kinds: ['shield'], activation: 'conditional', activationEvidence: 'Active; "for 2 seconds"' },
  { key: 'Janna/E/Eye of the Storm', kinds: ['shield'], activation: 'conditional', activationEvidence: 'Active; "for 4 seconds"' },
  { key: 'Jarvan IV/W/Golden Aegis', kinds: ['shield'], activation: 'conditional', activationEvidence: 'Active; "increased by 1.3% of his maximum health for each enemy champion hit"' },
  { key: "K'Sante/E/Footwork", kinds: ['shield'], activation: 'conditional', activationEvidence: 'Active; "for 2 seconds"; ally receives it only "if the target ally is a champion"' },
  { key: "Kai'Sa/R/Killer Instinct", kinds: ['shield'], activation: 'conditional', activationEvidence: 'Active; requires a Plasma-affected enemy within 4 seconds' },
  { key: 'Karma/E/Inspire', kinds: ['shield'], activation: 'conditional', activationEvidence: 'Active; "for 2.5 seconds"' },
  { key: 'Karma/E/Defiance', kinds: ['shield'], activation: 'conditional', activationEvidence: 'Mantra-empowered form of Inspire — requires Mantra' },
  { key: 'Kassadin/Q/Null Sphere', kinds: ['shield'], activation: 'conditional', activationEvidence: 'Active; magic-only shield "for 1.5 seconds"' },
  { key: 'Kled/R/Chaaaaaaaarge!!!', kinds: ['shield'], activation: 'conditional', activationEvidence: 'Active; grows "for every 0.25 seconds of traveling"' },
  { key: 'Lee Sin/W/Safeguard', kinds: ['shield'], activation: 'conditional', activationEvidence: 'Active; "for 2 seconds"' },
  { key: 'Lulu/E/Help, Pix!', kinds: ['shield'], activation: 'conditional', activationEvidence: 'Active; "If the target is a champion"' },
  { key: 'Lux/W/Prismatic Barrier', kinds: ['shield'], activation: 'conditional', activationEvidence: 'Active; "can stack up to 2 times" — out and back' },
  { key: 'Malphite/P/Granite Shield', kinds: ['shield'], activation: 'conditional', activationEvidence: 'Innate, but "lasts until it is broken, and replenishes to full strength after a few seconds of not taking damage" — a combat state, not a permanent property' },
  { key: 'Mel/W/Rebuttal', kinds: ['shield', 'spell-shield'], activation: 'conditional', activationEvidence: 'Active; "for 0.75 seconds"; also destroys hostile projectiles that collide' },
  { key: 'Milio/E/Warm Hugs', kinds: ['shield'], activation: 'conditional', activationEvidence: 'Active; "for 2.5 seconds"' },
  { key: 'Mordekaiser/W/Indestructible', kinds: ['shield', 'heal'], activation: 'conditional', activationEvidence: 'Active consumes a Potential Shield built from damage dealt and taken — depends on prior sequence' },
  { key: 'Morgana/E/Black Shield', kinds: ['shield'], activation: 'conditional', activationEvidence: 'Active; magic-only; "for 5 seconds"' },
  { key: "Naafiri/R/Hounds' Pursuit", kinds: ['shield'], activation: 'conditional', activationEvidence: 'Active; "for 3 seconds"' },
  { key: "Nautilus/W/Titan's Wrath", kinds: ['shield'], activation: 'conditional', activationEvidence: 'Active; "for 6 seconds"' },
  { key: 'Nunu & Willump/R/Absolute Zero', kinds: ['shield'], activation: 'conditional', activationEvidence: 'Active channel; "any of the duo\'s remaining shield will decay over 3 seconds"' },
  { key: 'Olaf/W/Tough It Out', kinds: ['shield'], activation: 'conditional', activationEvidence: 'Active; "capped at 70% missing health" — depends on current health' },
  { key: 'Poppy/P/Iron Ambassador', kinds: ['shield'], activation: 'conditional', activationEvidence: '"Poppy can move over the buckler to retrieve it" — she must pick it up' },
  { key: 'Rakan/P/Fey Feathers', kinds: ['shield'], activation: 'conditional', activationEvidence: 'Periodic; "lasts until broken", restored only after 5 seconds out of combat' },
  { key: 'Rakan/E/Battle Dance', kinds: ['shield'], activation: 'conditional', activationEvidence: 'Active; "for 3 seconds"' },
  { key: 'Rell/W/Ferromancy: Crash Down', kinds: ['shield'], activation: 'conditional', activationEvidence: 'Active; "lasts until destroyed or casting Ferromancy"' },
  { key: 'Renata Glasc/E/Loyalty Program', kinds: ['shield'], activation: 'conditional', activationEvidence: 'Active; "for 3 seconds"' },
  { key: 'Riven/E/Valor', kinds: ['shield'], activation: 'conditional', activationEvidence: 'Active; "for 1.5 seconds"' },
  { key: 'Rumble/W/Scrap Shield', kinds: ['shield'], activation: 'conditional', activationEvidence: 'Active; enhanced by 50% in the Danger Zone heat state' },
  { key: 'Senna/R/Dawning Shadow', kinds: ['shield'], activation: 'conditional', activationEvidence: 'Active; "for 3 seconds"' },
  { key: 'Seraphine/W/Surround Sound', kinds: ['shield', 'heal'], activation: 'conditional', activationEvidence: 'Active; the heal fires only "If Seraphine already had a shield at the time of cast"' },
  { key: 'Sett/W/Haymaker', kinds: ['shield', 'heal'], activation: 'conditional', activationEvidence: 'Active; the shield equals stored Grit, which comes from damage taken earlier in the sequence' },
  { key: 'Shen/P/Ki Barrier', kinds: ['shield'], activation: 'conditional', activationEvidence: 'Passive, but "After completing an ability\'s effects" and on a cooldown' },
  { key: 'Shen/R/Stand United', kinds: ['shield'], activation: 'conditional', activationEvidence: 'Active channel; scales with "target\'s missing health"' },
  { key: 'Shyvana/W/Inferno Aegis', kinds: ['shield', 'heal'], activation: 'conditional', activationEvidence: 'Active; "increased by 30% for every nearby enemy champion"' },
  { key: 'Sion/W/Soul Furnace', kinds: ['shield', 'health-grant'], activation: 'conditional', activationEvidence: 'Active shield; the bonus health is a permanent kill-stack accumulation' },
  { key: 'Skarner/W/Seismic Bastion', kinds: ['shield'], activation: 'conditional', activationEvidence: 'Active; "for 2.5 seconds"' },
  { key: 'Sona/W/Aria of Perseverance', kinds: ['shield', 'heal'], activation: 'conditional', activationEvidence: 'Active; "for 1.5 seconds"' },
  { key: 'Tahm Kench/E/Thick Skin', kinds: ['shield', 'heal'], activation: 'conditional', activationEvidence: 'Grey health accumulates from damage taken, then is converted on the Active' },
  { key: 'Tahm Kench/R/Devour', kinds: ['shield'], activation: 'conditional', activationEvidence: 'Active; only "If the target is an ally"' },
  { key: 'Thresh/W/Dark Passage', kinds: ['shield'], activation: 'conditional', activationEvidence: 'Active; "the first allied champion to come near the lantern"' },
  { key: 'Udyr/W/Iron Mantle', kinds: ['shield', 'heal'], activation: 'conditional', activationEvidence: 'Active stance; awakened form stacks a second shield' },
  { key: 'Urgot/E/Disdain', kinds: ['shield'], activation: 'conditional', activationEvidence: 'Active; "for 4 seconds"' },
  { key: 'Vex/W/Personal Space', kinds: ['shield'], activation: 'conditional', activationEvidence: 'Active; "for 2.5 seconds"' },
  { key: 'Vi/P/Blast Shield', kinds: ['shield'], activation: 'conditional', activationEvidence: 'Periodic; "Vi\'s next ability hit grants her a shield"' },
  { key: 'Viktor/Q/Siphon Power', kinds: ['shield'], activation: 'conditional', activationEvidence: 'Active; "for 2.5 seconds"; +60% after the device hits' },
  { key: 'Volibear/E/Sky Splitter', kinds: ['shield'], activation: 'conditional', activationEvidence: '"If Volibear is within the strike"' },
  { key: 'Yasuo/P/Way of the Wanderer', kinds: ['shield'], activation: 'conditional', activationEvidence: 'Requires full Flow and "upon taking damage from an enemy champion or monster"' },
  { key: 'Yone/W/Spirit Cleave', kinds: ['shield'], activation: 'conditional', activationEvidence: '"If this hits an enemy"; increased per champion hit' },
  { key: 'Yuumi/E/Zoomies', kinds: ['shield'], activation: 'conditional', activationEvidence: 'Active; "for 3 seconds"' },
  { key: 'Yuumi/R/Final Chapter', kinds: ['shield', 'heal'], activation: 'conditional', activationEvidence: 'Active channel; only the overheal becomes a shield' },

  // ---------- spell shields ----------
  { key: 'Nocturne/W/Shroud of Darkness', kinds: ['spell-shield'], activation: 'conditional', activationEvidence: 'Active; "for 1.5 seconds"' },
  { key: 'Sivir/E/Spell Shield', kinds: ['spell-shield', 'heal'], activation: 'conditional', activationEvidence: 'Active; "for 1.5 seconds"; the heal fires only "Upon successfully blocking a hostile effect"' },

  // ---------- immunity: the source states damage cannot be taken ----------
  { key: 'Bard/R/Tempered Fate', kinds: ['immunity'], activation: 'conditional', activationEvidence: 'Active; stasis "for 2.5 seconds", applied to ALL units including enemies' },
  { key: 'Ekko/R/Chronobreak', kinds: ['immunity', 'heal'], activation: 'conditional', activationEvidence: 'Active; "enters stasis at the start of the cast time"' },
  { key: "Kalista/R/Fate's Call", kinds: ['immunity'], activation: 'conditional', activationEvidence: 'Active; renders the Oathsworn ALLY "invulnerable and untargetable for the duration"' },
  { key: 'Karthus/P/Death Defied', kinds: ['immunity'], activation: 'conditional', activationEvidence: '"upon taking fatal damage"; "prevents all incoming damage" only in that state' },
  { key: 'Kayle/R/Divine Judgment', kinds: ['immunity'], activation: 'conditional', activationEvidence: 'Active; "invulnerability for 2.5 seconds", self or ally' },
  { key: "Kindred/R/Lamb's Respite", kinds: ['immunity', 'execute-threshold', 'heal'], activation: 'conditional', activationEvidence: 'Active zone; invulnerable only on reaching the 10% maximum-health threshold' },
  { key: "Kog'Maw/P/Icathian Surprise", kinds: ['immunity'], activation: 'conditional', activationEvidence: 'On death only; "becomes invulnerable, untargetable"' },
  { key: 'Lissandra/R/Frozen Tomb', kinds: ['immunity', 'heal'], activation: 'conditional', activationEvidence: 'Self-cast Active; "entering stasis for 2.5 seconds"' },
  { key: 'Sion/P/Glory in Death', kinds: ['immunity', 'execute-threshold', 'heal'], activation: 'conditional', activationEvidence: '"Upon taking fatal damage"; stasis 1.5s, then a health-draining revived state' },
  { key: 'Taric/R/Cosmic Radiance', kinds: ['immunity'], activation: 'conditional', activationEvidence: 'Active; "become invulnerable for 2.5 seconds" after a delay' },
  { key: 'Xin Zhao/R/Crescent Guard', kinds: ['immunity'], activation: 'not-stated', activationEvidence: '"invulnerable against enemy champions far away from him" — the condition is a DISTANCE, and the engine models no positions. The source states the condition; this project cannot represent it' },
  { key: 'Zaahen/P/Cultivation of War', kinds: ['immunity', 'execute-threshold'], activation: 'conditional', activationEvidence: '"if Zaahen would take lethal damage while at maximum stacks of Determination"' },
  { key: 'Zac/P/Cell Division', kinds: ['immunity', 'execute-threshold', 'heal'], activation: 'conditional', activationEvidence: '"Periodically, upon taking fatal damage"; "cannot take damage from sources other than the redirected damage from his bloblets"' },
  { key: 'Zilean/R/Chronoshift', kinds: ['immunity', 'execute-threshold', 'heal'], activation: 'conditional', activationEvidence: '"If the target takes fatal damage within the duration"' },
  { key: 'Kayn/P/The Darkin Scythe', kinds: ['immunity', 'heal'], activation: 'not-stated', activationEvidence: 'Invulnerable only "While near his team\'s summoning platform" during form selection — outside any combat sequence this engine models' },

  // ---------- execute thresholds / death prevention ----------
  { key: 'Tryndamere/R/Undying Rage', kinds: ['execute-threshold'], activation: 'conditional', activationEvidence: 'Active; "a minimum health threshold for 5 seconds"' },
  { key: 'Renata Glasc/W/Bailout', kinds: ['execute-threshold', 'heal'], activation: 'conditional', activationEvidence: '"If the target takes fatal damage while Bailout is active"; the restore is paid back as a true-damage burn' },

  // ---------- health grants ----------
  { key: "Bel'Veth/R/Endless Banquet", kinds: ['health-grant', 'heal'], activation: 'conditional', activationEvidence: 'True Form; the heal needs a Void Coral' },
  { key: "Cho'Gath/R/Feast", kinds: ['health-grant'], activation: 'conditional', activationEvidence: '"Each stack of Feast … grants Cho\'Gath bonus health" — a stack count' },
  { key: 'Dr. Mundo/R/Maximum Dosage', kinds: ['health-grant', 'heal'], activation: 'conditional', activationEvidence: 'Active; "for 10 seconds"; rank 3 scales with nearby enemy champions' },
  { key: 'Lulu/R/Wild Growth', kinds: ['health-grant'], activation: 'conditional', activationEvidence: 'Active; "For the next 7 seconds"' },
  { key: 'Renekton/R/Dominus', kinds: ['health-grant'], activation: 'conditional', activationEvidence: 'Active; "for 15 seconds"' },
  { key: "Shyvana/R/Dragon's Descent", kinds: ['health-grant'], activation: 'conditional', activationEvidence: 'Dragon form; the bonus health holds only in form' },
  { key: 'Swain/P/Ravenous Flock', kinds: ['health-grant', 'heal'], activation: 'conditional', activationEvidence: '"For each stack, Swain gains 15 bonus health permanently" — permanent, but the stack count is a state' },
  { key: 'Vladimir/P/Crimson Pact', kinds: ['health-grant'], activation: 'always-active', activationEvidence: 'Innate; "gains (% bonus health) as ability power and (% AP) as bonus health" — a permanent two-way stat conversion with no trigger' },
  { key: 'Volibear/R/Stormbringer', kinds: ['health-grant'], activation: 'conditional', activationEvidence: 'Active; the bonus health holds for the duration' },

  // ---------- heals (self or ally), and life-steal GRANTS ----------
  { key: 'Aatrox/P/Deathbringer Stance', kinds: ['heal'], activation: 'conditional', activationEvidence: 'Requires the empowered attack to land' },
  { key: 'Aatrox/E/Umbral Dash', kinds: ['heal'], activation: 'always-active', activationEvidence: 'Passive half: "Aatrox heals for 16% … of damage he deals against enemy champions" — no trigger beyond dealing damage' },
  { key: 'Aatrox/R/World Ender', kinds: ['heal'], activation: 'conditional', activationEvidence: 'Active; an AMPLIFIER — "receives increased self-healing from all sources"' },
  { key: 'Ahri/P/Essence Theft', kinds: ['heal'], activation: 'conditional', activationEvidence: '"At 9 stacks"; and on a champion takedown' },
  { key: 'Alistar/P/Triumphant Roar', kinds: ['heal'], activation: 'conditional', activationEvidence: '"At 7 stacks"' },
  { key: 'Ambessa/R/Public Execution', kinds: ['heal'], activation: 'conditional', activationEvidence: 'Active; heals for a percentage of damage dealt' },
  { key: 'Aphelios/R/Moonlight Vigil', kinds: ['heal'], activation: 'conditional', activationEvidence: '"if at least one enemy champion is hit", and only with Severum equipped' },
  { key: 'Aurora/P/Spirit Abjuration', kinds: ['heal'], activation: 'conditional', activationEvidence: '"For each active Spirit" — a stack count' },
  { key: "Bard/W/Caretaker's Shrine", kinds: ['heal'], activation: 'conditional', activationEvidence: 'The shrine must be walked over, and its power grows with time' },
  { key: 'Briar/P/Crimson Curse', kinds: ['heal'], activation: 'conditional', activationEvidence: 'Bleed stacks; an AMPLIFIER too — "increases healing from all sources by … per 1% missing health"' },
  { key: 'Briar/W/Snack Attack', kinds: ['heal'], activation: 'conditional', activationEvidence: 'Empowered attack; requires Blood Frenzy' },
  { key: 'Cassiopeia/E/Twin Fang', kinds: ['heal'], activation: 'conditional', activationEvidence: '"Against a poisoned target"' },
  { key: "Cho'Gath/P/Carnivore", kinds: ['heal'], activation: 'conditional', activationEvidence: '"Whenever Cho\'Gath kills an enemy"' },
  { key: 'Darius/Q/Decimate', kinds: ['heal'], activation: 'conditional', activationEvidence: '"Against champions and large monsters hit"; scales with targets hit' },
  { key: 'Dr. Mundo/P/Goes Where He Pleases', kinds: ['heal'], activation: 'conditional', activationEvidence: 'The canister must be picked up' },
  { key: 'Dr. Mundo/Q/Infected Bonesaw', kinds: ['heal'], activation: 'conditional', activationEvidence: '"increased to 100% against champions or monsters"' },
  { key: 'Dr. Mundo/W/Heart Zapper', kinds: ['heal'], activation: 'conditional', activationEvidence: 'Grey health stored from damage taken, then converted on detonation' },
  { key: 'Evelynn/P/Demon Shade', kinds: ['heal'], activation: 'conditional', activationEvidence: '"While below … health" — a health threshold' },
  { key: 'Fiddlesticks/W/Bountiful Harvest', kinds: ['heal'], activation: 'conditional', activationEvidence: 'Active channel; heals for a portion of damage dealt' },
  { key: "Fiora/P/Duelist's Dance", kinds: ['heal'], activation: 'conditional', activationEvidence: 'Requires hitting a Vital' },
  { key: 'Fiora/R/Grand Challenge', kinds: ['heal'], activation: 'conditional', activationEvidence: 'The Victory Zone appears only on the target\'s death' },
  { key: 'Gangplank/W/Remove Scurvy', kinds: ['heal'], activation: 'conditional', activationEvidence: 'Active; scales with missing health' },
  { key: 'Garen/P/Perseverance', kinds: ['heal'], activation: 'conditional', activationEvidence: 'Regeneration that the source states is suppressed by recent damage' },
  { key: 'Gragas/P/Happy Hour', kinds: ['heal'], activation: 'conditional', activationEvidence: '"Periodically, after casting an ability"' },
  { key: 'Gwen/P/A Thousand Cuts', kinds: ['heal'], activation: 'always-active', activationEvidence: 'Innate; "Heals Gwen for 67% of damage" with no stated trigger beyond dealing it' },
  { key: 'Illaoi/P/Prophet of an Elder God', kinds: ['heal'], activation: 'conditional', activationEvidence: '"if it hits at least one enemy champion"' },
  { key: 'Irelia/Q/Bladesurge', kinds: ['heal'], activation: 'conditional', activationEvidence: 'Active; on collision' },
  { key: 'Janna/R/Monsoon', kinds: ['heal'], activation: 'conditional', activationEvidence: 'Active channel; "for up to 3 seconds"' },
  { key: 'Karma/W/Renewal', kinds: ['heal'], activation: 'conditional', activationEvidence: 'Mantra form; heals on-cast and again on tether completion' },
  { key: 'Kayle/W/Celestial Blessing', kinds: ['heal'], activation: 'conditional', activationEvidence: 'Active' },
  { key: 'Kayn/E/Shadow Step', kinds: ['heal'], activation: 'conditional', activationEvidence: '"upon entering terrain for the first time"' },
  { key: 'Kayn/R/Umbral Trespass', kinds: ['heal'], activation: 'conditional', activationEvidence: 'Rhaast form only, and only after the recast' },
  { key: "Kha'Zix/W/Void Spike", kinds: ['heal'], activation: 'conditional', activationEvidence: '"if he is within the explosion"' },
  { key: "Kindred/W/Wolf's Frenzy", kinds: ['heal'], activation: 'conditional', activationEvidence: '"At maximum stacks"; "not triggered if Kindred is at full health"' },
  { key: 'Lee Sin/W/Iron Will', kinds: ['heal'], activation: 'conditional', activationEvidence: 'Active; "gains omnivamp for 4 seconds" — a GRANT, not an application of an existing stat' },
  { key: 'Lillia/P/Dream-Laden Bough', kinds: ['heal'], activation: 'conditional', activationEvidence: 'Requires the Dream Dust burn to be applied' },
  { key: 'Locke/W/Soul Ignition', kinds: ['heal'], activation: 'conditional', activationEvidence: 'Grey health stored from damage taken, converted when the ability ends' },
  { key: 'Maokai/P/Sap Magic', kinds: ['heal'], activation: 'conditional', activationEvidence: '"Periodically" — an empowered attack' },
  { key: 'Milio/W/Cozy Campfire', kinds: ['heal'], activation: 'conditional', activationEvidence: 'Allies must be near the fuemigo' },
  { key: 'Milio/R/Breath of Life', kinds: ['heal'], activation: 'conditional', activationEvidence: 'Active' },
  { key: 'Mordekaiser/R/Realm of Death', kinds: ['heal'], activation: 'conditional', activationEvidence: '"consumes the target\'s soul", only after the target dies in the realm' },
  { key: 'Morgana/P/Soul Siphon', kinds: ['heal'], activation: 'always-active', activationEvidence: 'Innate; heals for 18% of ability damage dealt to champions with no other stated trigger' },
  { key: 'Naafiri/Q/Darkin Daggers', kinds: ['heal'], activation: 'conditional', activationEvidence: '"If that target is also a champion or large monster"' },
  { key: 'Nami/W/Ebb and Flow', kinds: ['heal'], activation: 'conditional', activationEvidence: 'Active; bounce count changes the effectiveness' },
  { key: 'Nasus/P/Soul Eater', kinds: ['heal'], activation: 'always-active', activationEvidence: 'Innate; "Nasus gains life steal" as a flat rank-scaled stat, no trigger — a GRANT' },
  { key: 'Nidalee/E/Primal Surge', kinds: ['heal'], activation: 'conditional', activationEvidence: 'Active; increased by the target\'s missing health' },
  { key: 'Nilah/P/Joy Unending', kinds: ['heal', 'shield'], activation: 'conditional', activationEvidence: 'An AMPLIFIER: fires only "Whenever a nearby allied champion uses an ability to heal or shield"' },
  { key: 'Nilah/Q/Formless Blade', kinds: ['heal'], activation: 'conditional', activationEvidence: 'Scales with critical strike chance; heals from damage dealt to champions' },
  { key: 'Nilah/R/Apotheosis', kinds: ['heal'], activation: 'conditional', activationEvidence: 'Active; heals self and nearby allied champions from damage dealt' },
  { key: 'Nocturne/P/Umbra Blades', kinds: ['heal'], activation: 'conditional', activationEvidence: '"Periodically"; scales with enemies hit' },
  { key: 'Nunu & Willump/Q/Consume', kinds: ['heal'], activation: 'conditional', activationEvidence: '"increased … while he is below 50% maximum health"' },
  { key: 'Olaf/P/Berserker Rage', kinds: ['heal'], activation: 'conditional', activationEvidence: 'Life steal GRANT scaling with missing health' },
  { key: 'Olaf/E/Reckless Swing', kinds: ['heal'], activation: 'conditional', activationEvidence: '"If Reckless Swing kills the target"' },
  { key: 'Pyke/P/Gift of the Drowned Ones', kinds: ['heal'], activation: 'conditional', activationEvidence: 'Grey health from damage taken, healed back only "While Pyke is not visible to enemies"' },
  { key: 'Rakan/Q/Gleaming Quill', kinds: ['heal'], activation: 'conditional', activationEvidence: '"After 3 seconds or if an allied champion enters the radius"' },
  { key: "Rek'Sai/P/Fury of the Xer'Sai", kinds: ['heal'], activation: 'conditional', activationEvidence: '"When Rek\'Sai becomes Burrowed", consuming Fury' },
  { key: 'Renekton/Q/Cull the Meek', kinds: ['heal'], activation: 'conditional', activationEvidence: 'Scales with enemies hit; "Against champions, the healing is increased"; tripled at full Fury' },
  { key: 'Rengar/W/Battle Roar', kinds: ['heal', 'resistance-grant'], activation: 'conditional', activationEvidence: 'Grey health from damage taken in the last 1.5 seconds, consumed on cast' },
  { key: 'Senna/P/Absolution', kinds: ['heal'], activation: 'conditional', activationEvidence: 'Excess critical strike chance is converted into life steal — a GRANT gated on crit chance above 100%' },
  { key: 'Senna/Q/Piercing Darkness', kinds: ['heal'], activation: 'conditional', activationEvidence: 'Active; heals Senna and allied champions hit' },
  { key: 'Sett/P/Pit Grit', kinds: ['heal'], activation: 'conditional', activationEvidence: 'Regeneration scaling "per 5% of his missing health"' },
  { key: 'Smolder/R/MMOOOMMMM!', kinds: ['heal'], activation: 'conditional', activationEvidence: 'Active; the wave heals Smolder' },
  { key: 'Soraka/Q/Starcall', kinds: ['heal'], activation: 'conditional', activationEvidence: 'The heal fires only on hitting an enemy champion' },
  { key: 'Soraka/W/Astral Infusion', kinds: ['heal'], activation: 'conditional', activationEvidence: 'Active; paid for with her own health' },
  { key: 'Soraka/R/Wish', kinds: ['heal'], activation: 'conditional', activationEvidence: 'Active; "increased by 50% on targets below 40% of their maximum health"' },
  { key: 'Swain/R/Demonic Ascension', kinds: ['heal'], activation: 'conditional', activationEvidence: 'Active drain; "per target affected"' },
  { key: 'Sylas/W/Kingslayer', kinds: ['heal'], activation: 'conditional', activationEvidence: '"If this damages a champion"; increased by his missing health' },
  { key: 'Tahm Kench/Q/Tongue Lash', kinds: ['heal'], activation: 'conditional', activationEvidence: '"If this hits an enemy champion"' },
  { key: 'Talon/Q/Noxian Diplomacy', kinds: ['heal'], activation: 'conditional', activationEvidence: '"If Noxian Diplomacy kills the target"' },
  { key: "Taric/Q/Starlight's Touch", kinds: ['heal'], activation: 'conditional', activationEvidence: '"per charge … that he periodically stocks"' },
  { key: "Trundle/P/King's Tribute", kinds: ['heal'], activation: 'conditional', activationEvidence: '"Whenever a nearby enemy dies"' },
  { key: 'Trundle/W/Frozen Domain', kinds: ['heal'], activation: 'conditional', activationEvidence: 'An AMPLIFIER: "25% increased healing from all sources" while inside the area' },
  { key: 'Tryndamere/Q/Bloodlust', kinds: ['heal'], activation: 'conditional', activationEvidence: 'Active; scales with Fury consumed' },
  { key: "Viego/P/Sovereign's Domination", kinds: ['heal'], activation: 'conditional', activationEvidence: 'On possessing a slain champion' },
  { key: 'Viego/Q/Blade of the Ruined King', kinds: ['heal'], activation: 'conditional', activationEvidence: 'The second strike only' },
  { key: 'Vladimir/Q/Transfusion', kinds: ['heal'], activation: 'conditional', activationEvidence: 'Active; the additional heal requires Crimson Rush' },
  { key: 'Vladimir/W/Sanguine Pool', kinds: ['heal'], activation: 'conditional', activationEvidence: 'Active; heals for 30% of damage dealt' },
  { key: 'Vladimir/R/Hemoplague', kinds: ['heal'], activation: 'conditional', activationEvidence: '"for each infected champion, reduced to 40% for champions beyond the first"' },
  { key: 'Volibear/W/Frenzied Maul', kinds: ['heal'], activation: 'conditional', activationEvidence: '"If the target is already Wounded"' },
  { key: 'Warwick/P/Eternal Hunger', kinds: ['heal'], activation: 'conditional', activationEvidence: 'The 100% rate applies only "While below 50% maximum health"' },
  { key: 'Warwick/Q/Jaws of the Beast', kinds: ['heal'], activation: 'conditional', activationEvidence: 'Active; heals for a percentage of damage dealt' },
  { key: 'Warwick/R/Infinite Duress', kinds: ['heal'], activation: 'conditional', activationEvidence: 'Active channel; heals for 100% of damage dealt' },
  { key: 'Xin Zhao/P/Determination', kinds: ['heal'], activation: 'conditional', activationEvidence: '"The third stack consumes them all"' },
  { key: 'Xin Zhao/W/Wind Becomes Lightning', kinds: ['heal'], activation: 'conditional', activationEvidence: 'Heals "for 33.3% of his life steal" — depends on an item stat' },
  { key: 'Yorick/Q/Last Rites', kinds: ['heal'], activation: 'conditional', activationEvidence: 'Empowered attack; "reduced by 50% against non-champions"' },
  { key: 'Yuumi/P/Feline Friendship', kinds: ['heal'], activation: 'conditional', activationEvidence: 'The buff must be consumed by a hit' },
  { key: 'Yuumi/W/You and Me!', kinds: ['heal', 'shield'], activation: 'conditional', activationEvidence: 'An AMPLIFIER: "Yuumi gains heal and shield power" while attached' },
  { key: 'Zaahen/Q/The Darkin Glaive', kinds: ['heal'], activation: 'conditional', activationEvidence: '"If the target was a champion, minion, or monster"' },
  { key: 'Elise/P/Spider Queen', kinds: ['heal'], activation: 'conditional', activationEvidence: 'Spider Form only; heals on-hit' },
  { key: 'Camille/W/Tactical Sweep', kinds: ['heal'], activation: 'conditional', activationEvidence: '"against enemy champions in the outer half" — the outer half of the cone only' },

  // ---------- adjacent: the enemy's damage OUTPUT is reduced ----------
  // Counted and reported SEPARATELY. These lower damage received indirectly, by debuffing the
  // attacker, and they are not in the task's definition of a defensive kit effect.
  { key: 'Trundle/Q/Chomp', kinds: ['attacker-debuff'], activation: 'conditional', activationEvidence: 'Active; "reduces the target\'s bonus attack damage by half that amount for the same duration"' },
  { key: 'Tryndamere/W/Mocking Shout', kinds: ['attacker-debuff'], activation: 'conditional', activationEvidence: 'Active; "reduces the bonus attack damage of nearby enemy champions for 4 seconds"' },
];

/**
 * Rejections, with the class each one belongs to. Every class becomes a mechanical sweep in
 * `defensive-defects.ts` so it can be found on all 937 pages rather than on the one that revealed
 * it. Only entries a person actually read appear here.
 */
export const REJECTED: Verdict[] = [
  { key: 'Aatrox/P/Deathbringer Stance', kinds: [], rejectedAs: 'mitigation-tooltip', note: 'the damage-reduction signal was "post-mitigation"; the page is confirmed for its heal' },
  { key: 'Amumu/P/Cursed Touch', kinds: [], rejectedAs: 'target-amplification', note: 'cursed targets RECEIVE 10% bonus true damage — an attacker-side amplifier' },
  { key: 'Vladimir/R/Hemoplague', kinds: [], rejectedAs: 'target-amplification', note: 'the +10% damage taken is on the enemy; the page is confirmed for its heal' },
  { key: 'Mordekaiser/R/Realm of Death', kinds: [], rejectedAs: 'target-amplification', note: 'reduces the target\'s armor, magic resistance and maximum health by 10%' },
  { key: 'Illaoi/E/Test of Spirit', kinds: [], rejectedAs: 'target-amplification', note: 'redirects damage received by the Spirit onto the tethered champion' },
  { key: 'Xayah/Q/Double Daggers', kinds: [], rejectedAs: 'dealt-side-reduction', note: 'THE TRAP: "Targets hit after the first take 50% reduced damage" is Xayah dealing less, not taking less. The detector\'s dealt-side marker did NOT fire on it' },
  { key: 'Pantheon/Q/Comet Spear', kinds: [], rejectedAs: 'dealt-side-reduction', note: '"affected by the previous damage reductions" describes how its own damage is computed' },
  { key: 'Blitzcrank/R/Static Field', kinds: [], rejectedAs: 'shield-destruction' },
  { key: 'Rell/Q/Shattering Strike', kinds: [], rejectedAs: 'shield-destruction' },
  { key: 'Renekton/W/Ruthless Predator', kinds: [], rejectedAs: 'shield-destruction' },
  { key: "Braum/Q/Winter's Bite", kinds: [], rejectedAs: 'shield-as-prop' },
  { key: 'Braum/R/Glacial Fissure', kinds: [], rejectedAs: 'shield-as-prop' },
  { key: 'Leona/Q/Shield of Daybreak', kinds: [], rejectedAs: 'shield-as-prop' },
  { key: 'Pantheon/W/Shield Vault', kinds: [], rejectedAs: 'shield-as-prop' },
  { key: 'Lucian/P/Lightslinger', kinds: [], rejectedAs: 'trigger-mention-only', note: '"Whenever Lucian is healed or shielded by an ally" is a trigger for an OFFENSIVE empowerment' },
  { key: 'Sona/P/Power Chord', kinds: [], rejectedAs: 'trigger-mention-only', note: 'mitigating damage is the stack condition; the shield lives on Sona W' },
  { key: 'Mel/P/Searing Brilliance', kinds: [], rejectedAs: 'trigger-mention-only', note: 'reads the target\'s shields to decide when the stored damage detonates' },
  { key: 'Warwick/W/Blood Hunt', kinds: [], rejectedAs: 'trigger-mention-only', note: 'healing above 50% is the condition that CLEARS the mark' },
  { key: 'Olaf/R/Ragnarok', kinds: [], rejectedAs: 'cc-immunity-only', note: 'the "immune to them" clause is crowd control; the page is confirmed for its resistances' },
  { key: "Kha'Zix/W/Evolved Spike Racks", kinds: [], rejectedAs: 'trigger-mention-only', note: 'states only that multiple explosions do NOT give extra healing' },
  { key: 'Elise/R/Spider Form', kinds: [], rejectedAs: 'non-champion-recipient', note: 'heals her Spiderlings' },
  { key: 'Naafiri/E/Eviscerate', kinds: [], rejectedAs: 'non-champion-recipient', note: 'heals her Packmates' },
  { key: 'Zyra/R/Stranglethorns', kinds: [], rejectedAs: 'non-champion-recipient', note: 'restores health to her Plants' },
  { key: 'Shaco/W/Jack in the Box', kinds: [], rejectedAs: 'non-champion-recipient' },
  { key: 'Shaco/R/Hallucinate', kinds: [], rejectedAs: 'non-champion-recipient', note: 'the clone is invulnerable, not Shaco' },
  { key: 'Syndra/W/Force of Will', kinds: [], rejectedAs: 'non-champion-recipient', note: 'stasis on a grabbed minion or monster' },
  { key: 'Urgot/R/Fear Beyond Death', kinds: [], rejectedAs: 'target-amplification', note: 'prevents the suppressed VICTIM taking damage from others — applied by the attacker, to its victim' },
  { key: 'Pyke/P/Gift of the Drowned Ones', kinds: [], rejectedAs: 'health-pool-property', note: 'as a health GRANT only: "maximum health cannot increase except through growth". The page is confirmed for its grey-health heal' },
  { key: 'Kled/P/Skaarl the Cowardly Lizard', kinds: [], rejectedAs: 'health-pool-property', note: 'his base health "is not improved by sources of bonus health"; healing routes to Skaarl first' },

];
