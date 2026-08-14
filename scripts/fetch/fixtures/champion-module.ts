// Fixtures for the champion tests, authored by hand from values observed live on
// 2026-08-12 against patch 16.16.1. Every number below was read out of the real
// `Module:ChampionData/data`, then trimmed to the fields the pipeline reads (plus a few
// extras — comments, ARAM blocks, arithmetic — that the parser must tolerate).
//
// Nothing here is invented. If a value in a test disagrees with the live source, the
// finding is reported, not patched away.

/**
 * A faithful slice of the OFFICIAL wiki module (wiki.leagueoflegends.com/en-us).
 *
 * Deliberately included, each for a reason:
 *   - Aatrox        — the reference champion of DATA-SOURCES §1 (ad_lvl 5, the value Data
 *                     Dragon reports as 0).
 *   - Wukong        — the wiki name and the Data Dragon apiname differ ("MonkeyKing").
 *   - Mega Gnar     — apiname "GnarBig", which Data Dragon does not ship: the roster gate
 *                     must withhold it.
 *   - Kled          — the canonical row, integer id 240.
 *   - Kled & Skaarl — an alternate form reusing apiname "Kled", with a fractional id and
 *                     an hp_lvl written as ARITHMETIC (84+1000/17), which the live file
 *                     really does contain.
 *   - Azir-style inline comment on `range`, which the live file also really contains.
 */
export const OFFICIAL_MODULE_LUA = `-- <pre>
return {
  ["Aatrox"] = {
    ["id"]         = 266,
    ["apiname"]    = "Aatrox",
    ["title"]      = "The Darkin Blade",
    ["resource"]   = "Blood Well",
    ["stats"] = {
      ["hp_base"]  = 650,
      ["hp_lvl"]   = 114,
      ["mp_base"]  = 0,
      ["mp_lvl"]   = 0,
      ["arm_base"] = 38,
      ["arm_lvl"]  = 4.8,
      ["mr_base"]  = 32,
      ["mr_lvl"]   = 2.05,
      ["dam_base"] = 60,
      ["dam_lvl"]  = 5,
      ["as_base"]  = 0.651,
      ["as_lvl"]   = 2.5,
      ["range"]    = 175,--the live file really does put comments here
      ["ms"]       = 345,
      ["as_ratio"] = 0.651,
      ["aram"] = {
        ["dmg_dealt"] = 1.05,
        ["dmg_taken"] = 1,
      },
    },
    ["rangetype"]   = "Melee",
    ["changes"]     = "V26.12",
    ["adaptivetype"]= "Physical",
    ["skill_i"]     = {[1] = "Deathbringer Stance"},
    ["skill_q"]     = {[1] = "The Darkin Blade", [2] = "The Darkin Blade 2"},
    ["skill_w"]     = {[1] = "Infernal Chains"},
    ["skill_e"]     = {[1] = "Umbral Dash"},
    ["skill_r"]     = {[1] = "World Ender"},
  },
  ["Wukong"] = {
    ["id"]         = 62,
    ["apiname"]    = "MonkeyKing",
    ["resource"]   = "Mana",
    ["stats"] = {
      ["hp_base"]  = 610,
      ["hp_lvl"]   = 99,
      ["mp_base"]  = 330,
      ["mp_lvl"]   = 65,
      ["arm_base"] = 31,
      ["arm_lvl"]  = 4.7,
      ["mr_base"]  = 28,
      ["mr_lvl"]   = 2.05,
      ["dam_base"] = 66,
      ["dam_lvl"]  = 3.5,
      ["as_base"]  = 0.69,
      ["as_lvl"]   = 3,
      ["range"]    = 175,
      ["as_ratio"] = 0.657999992370605,
    },
    ["rangetype"]   = "Melee",
    ["changes"]     = "V26.10",
    ["adaptivetype"]= "Physical",
    ["skill_i"]     = {[1] = "Stone Skin"},
    ["skill_q"]     = {[1] = "Crushing Blow"},
    ["skill_w"]     = {[1] = "Warrior Trickster"},
    ["skill_e"]     = {[1] = "Nimbus Strike"},
    ["skill_r"]     = {[1] = "Cyclone"},
  },
  ["Mega Gnar"] = {
    ["id"]         = 150.2,
    ["apiname"]    = "GnarBig",
    ["resource"]   = "Rage",
    ["stats"] = {
      ["hp_base"]  = 640,
      ["hp_lvl"]   = 122,
      ["mp_base"]  = 100,
      ["mp_lvl"]   = 0,
      ["arm_base"] = 35.5,
      ["arm_lvl"]  = 6.7,
      ["mr_base"]  = 33.5,
      ["mr_lvl"]   = 4.8,
      ["dam_base"] = 66,
      ["dam_lvl"]  = 5.7,
      ["as_base"]  = 0.625,
      ["as_lvl"]   = 0.5,
      ["range"]    = 175,
      ["as_ratio"] = 0.625,
      ["attack_delay_offset"] = -0.153999999165534,
    },
    ["rangetype"]   = "Melee",
    ["changes"]     = "V14.9",
    ["adaptivetype"]= "Physical",
    ["skill_i"]     = {[1] = "Rage Gene"},
    ["skill_q"]     = {[1] = "Boulder Toss"},
    ["skill_w"]     = {[1] = "Wallop"},
    ["skill_e"]     = {[1] = "Crunch"},
    ["skill_r"]     = {[1] = "GNAR!"},
  },
  ["Kled"] = {
    ["id"]         = 240,
    ["apiname"]    = "Kled",
    ["resource"]   = "Courage",
    ["stats"] = {
      ["hp_base"]  = 410,
      ["hp_lvl"]   = 84,
      ["mp_base"]  = 100,
      ["mp_lvl"]   = 0,
      ["arm_base"] = 35,
      ["arm_lvl"]  = 5.2,
      ["mr_base"]  = 28,
      ["mr_lvl"]   = 2.05,
      ["dam_base"] = 65,
      ["dam_lvl"]  = 3.5,
      ["as_base"]  = 0.625,
      ["as_lvl"]   = 3.5,
      ["range"]    = 250,
      ["as_ratio"] = 0.625,
    },
    ["rangetype"]   = "Melee",
    ["changes"]     = "V25.16",
    ["adaptivetype"]= "Physical",
    ["skill_q"]     = {[1] = "Bear Trap on a Rope", [2] = "Pocket Pistol"},
  },
  ["Kled & Skaarl"] = {
    ["id"]         = 240.1,
    ["apiname"]    = "Kled",
    ["resource"]   = "Courage",
    ["stats"] = {
      ["hp_base"]  = 810,
      ["hp_lvl"]   = 84+1000/17,
      ["mp_base"]  = 100,
      ["mp_lvl"]   = 0,
      ["arm_base"] = 35,
      ["arm_lvl"]  = 5.2,
      ["mr_base"]  = 28,
      ["mr_lvl"]   = 2.05,
      ["dam_base"] = 65,
      ["dam_lvl"]  = 3.5,
      ["as_base"]  = 0.625,
      ["as_lvl"]   = 3.5,
      ["range"]    = 125,
      ["as_ratio"] = 0.625,
    },
    ["rangetype"]   = "Melee",
    ["changes"]     = "V12.10",
    ["adaptivetype"]= "Physical",
    ["skill_q"]     = {[1] = "Bear Trap on a Rope"},
  }
}
-- </pre>
-- [[Category:Lua]]`;

/**
 * A slice of the ABANDONED Fandom copy (leagueoflegends.fandom.com), reproducing the
 * evidence recorded in DATA-SOURCES §1: it tops out around V25, and its Volibear base AD
 * (60) and base armor (31) are simply wrong — the live values are 65 and 35. Serving this
 * silently would corrupt every champion stat in the product, so the guard must reject it.
 */
export const STALE_FANDOM_MODULE_LUA = `return {
  ["Aatrox"] = {
    ["id"]         = 266,
    ["apiname"]    = "Aatrox",
    ["stats"] = {
      ["hp_base"]  = 650, ["hp_lvl"] = 114,
      ["mp_base"]  = 0,   ["mp_lvl"] = 0,
      ["arm_base"] = 38,  ["arm_lvl"] = 4.8,
      ["mr_base"]  = 32,  ["mr_lvl"] = 2.05,
      ["dam_base"] = 60,  ["dam_lvl"] = 5,
      ["as_base"]  = 0.651, ["as_lvl"] = 2.5,
      ["range"]    = 175, ["as_ratio"] = 0.651,
    },
    ["rangetype"]   = "Melee",
    ["changes"]     = "V14.14",
    ["adaptivetype"]= "Physical",
    ["skill_q"]     = {[1] = "The Darkin Blade"},
  },
  ["Volibear"] = {
    ["id"]         = 106,
    ["apiname"]    = "Volibear",
    ["stats"] = {
      ["hp_base"]  = 650, ["hp_lvl"] = 104,
      ["mp_base"]  = 350, ["mp_lvl"] = 40,
      ["arm_base"] = 31,  ["arm_lvl"] = 4.6,
      ["mr_base"]  = 32,  ["mr_lvl"] = 2.05,
      ["dam_base"] = 60,  ["dam_lvl"] = 3.5,
      ["as_base"]  = 0.7, ["as_lvl"] = 2,
      ["range"]    = 175, ["as_ratio"] = 0.7,
    },
    ["rangetype"]   = "Melee",
    ["changes"]     = "V14.10",
    ["adaptivetype"]= "Physical",
    ["skill_q"]     = {[1] = "Thundering Smash"},
  }
}`;

/**
 * The Data Dragon roster, as a set of apinames. This is the SHORT list used by the join
 * tests: it deliberately contains "Kled" and not "GnarBig", exactly as the live
 * champion.json does.
 */
export const DATA_DRAGON_APINAMES = new Set(['Aatrox', 'MonkeyKing', 'Gnar', 'Kled']);
