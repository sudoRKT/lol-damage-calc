// HOW THE NUMBERS ARE CHECKED — the page the product's whole claim rests on.
//
// It explains the four statuses SPECIFICATION §8 defines, what each one claims, and — the part
// that matters most — what each one DOES NOT claim. Every count on it is generated from the same
// published data the calculator reads; nothing here is typed.
//
// The status names, glyphs and labels come from `VerificationStatusMark`, the same component the
// calculator uses on every row. A page explaining a mark should show the mark, not a picture of
// one that can drift away from it.
//
// ═══ WHAT THIS PAGE HAD TO LEARN TO SAY, 2026-08-14 ═══
//
// Until that day the page explained ability statuses and nothing else, which was survivable while
// abilities were the only thing that reached a result. Three things changed at once and each one
// made the silence a false claim rather than a gap:
//
//   • ITEM EFFECTS WENT LIVE. Actives, on-hit and Spellblade riders now appear in a breakdown.
//     A page listing only ability evidence implies the rest of a build does nothing.
//   • DAMAGE OVER TIME BEGAN TO EXIST. SPECIFICATION §3.8 requires the survival verdict twice, and
//     until now the second one received a zero in every real scenario — satisfied in form, not in
//     substance. A reader shown two verdicts must be told what makes them disagree.
//   • DERIVED FELL AND INCOMPLETE ROSE, because entries carrying a per-tick figure were withdrawn.
//     A count that only ever grows is a score; this one is evidence, so it has to be able to fall,
//     and the page has to say why or the fall reads as a regression.
//
// The rule the new sections follow is the old one: NO COUNT WITHOUT ITS DEFINITION BESIDE IT. A
// bare "N item effects" can mean four different populations — stored, complete, firing, or
// reaching a result — and a reader has no way to tell which one they are being shown.

import type { IncompleteReason } from '../../types/result';
import { VerificationStatusMark } from '../primitives';
import { CAPABILITY, COVERAGE } from '../coverage';
import { SOURCE_URL, pageById } from '../shell';
import { GitHubMark } from '../shell/SiteFooter';
import './pages.css';

const PERMANENT: IncompleteReason = { kind: 'permanent', missingFacts: [] };

/**
 * Effects that are stored, named on screen, and apply to nothing — because the source withholds
 * the one fact each needs. Arithmetic on generated counts, never typed, and the four item-effect
 * rows sum to the whole stored population, which `pages.test.tsx` asserts.
 */
const ITEM_EFFECTS_NAMED_NEVER_APPLIED =
  CAPABILITY.itemBurnsWithNoTickCount +
  CAPABILITY.itemBurnsWithNoStatedTrigger +
  CAPABILITY.itemEffectsWithNoStatedDelivery;

export function ChecksPage() {
  return (
    <>
      <section className="prose" aria-label="What derived means">
        <h2 className="prose__title">Derived is the normal state, and it is well evidenced</h2>
        <p className="prose__p">
          Most numbers this calculator shows are <em>derived</em>. That is not a caveat and it is
          not a lesser grade. It means three things, all of them checked mechanically on every
          entry, on every run — not once, and not on a sample:
        </p>
        <ol className="prose__ol">
          <li>
            It agrees with the <strong>source’s own rendering</strong> of the same ability — the
            wiki’s software expanding the same template our parser read, compared value by value
            at the precision the wiki itself prints.
          </li>
          <li>
            It <strong>reconciles with the total the source states</strong>. Where the source
            publishes a total for the ability, our parts sum to it. That catches damage counted
            twice as well as damage missing.
          </li>
          <li>
            Where <strong>Riot’s own shipped game data</strong> carries a counterpart, it agrees
            with that too — a source that is not the wiki and is not derived from it.
          </li>
        </ol>
        <p className="prose__p">
          <strong>What derived does not claim</strong> is that a second person re-derived it from
          scratch. Agreement with a source cannot detect a source read wrongly in a consistent
          way: a value can be transcribed perfectly and still be attached to the wrong statistic,
          land the wrong number of times, or be missing an instance the ability also has. That is
          what the rarer status below is for.
        </p>
      </section>

      {/* ═══ THE COUNT THAT FELL ═══
          Placed before the ledger, because it explains the ledger's own numbers. Without it a
          reader who checks back after a patch sees "derived" smaller than last time and has no
          way to tell an improvement from a regression. */}
      <section className="prose" aria-label="Why derived can fall">
        <h2 className="prose__title">Derived is not a number that only goes up</h2>
        <p className="prose__p">
          The count of abilities we will show is not a score, and it moves in both directions. When
          a stored figure turns out to possibly mean something other than what it was being used
          for, the entry is <strong>withdrawn</strong>: it stops contributing damage, it becomes
          incomplete, and it says why. <em>Derived</em> falls and <em>incomplete</em> rises. That is
          evidence arriving, not a regression — a plausible wrong number is worse than no number.
        </p>
        <p className="prose__p">
          The live example is a figure stated <strong>per tick</strong>.{' '}
          {CAPABILITY.perTickComponents} parts of an ability, across{' '}
          {CAPABILITY.perTickAbilities} entries, carry a label saying so — that is the wiki’s own
          name for the row, not our reading of a sentence. A per-tick figure and a per-arrow figure
          are the same field with opposite meanings: arrows all land at once and belong in the
          burst, ticks arrive over time and do not. Stored one way and reported the other, the
          number on screen is wrong and nothing says so.
        </p>
        <p className="prose__p">
          So the sentence has to be read, one ability at a time.{' '}
          <strong>{CAPABILITY.abilityComponentsOverTime}</strong> have been, across{' '}
          {CAPABILITY.abilitiesWithOverTime} abilities, and those now go to the damage-over-time
          line instead of the burst. Being read is not on its own enough to be shown:{' '}
          <strong>
            {CAPABILITY.perTickAbilitiesIncomplete} of the {CAPABILITY.perTickAbilities}
          </strong>{' '}
          entries are incomplete today and contribute nothing to any total. Every one of those
          sentences has now been read, and reading them cleared none of these entries — which is
          worth saying plainly, because it is the opposite of what we expected. Nine are held back
          by the tick count itself: six state a duration that depends on something the page never
          fixes, and two are contested between the page’s own sentence and its own leveling row.
          The other eight have a settled tick count and are missing something else entirely — a
          stat whose owner no source names, or a total that will not reconcile against its own
          parts. Several are well-known damage — a good part of the game’s burn roster — and they
          are absent rather than approximated.
        </p>
      </section>

      <section className="ledger" aria-label="Every status, and how many abilities hold it">
        <header className="ledger__head">
          <h2 className="ledger__title">Every status, and how many abilities hold it</h2>
          <p className="ledger__defn">
            Counted from the {COVERAGE.abilities} ability entries across {COVERAGE.champions}{' '}
            champions this site ships on patch {COVERAGE.patch}. Regenerated every time the site is
            built, so this table cannot fall out of step with what the calculator does.
          </p>
        </header>
        <ul className="ledger__rows">
          <StatusRow
            count={COVERAGE.verified}
            status="verified"
            of="shown"
            body={`Everything derived claims, and in addition an independent re-derivation by a party that did not use this product’s code or share its assumptions, recorded with its evidence. It is deliberately a small set. It is not a target to be maximised, and a number without it is not doubtful — expecting this everywhere would mean re-deriving ${COVERAGE.abilities} abilities on every patch, which is not a promise anyone can keep.`}
          />
          <StatusRow
            count={COVERAGE.derived}
            status="derived"
            of="shown"
            body="The three checks above, on every run. Presented exactly like verified — same size, same weight, no italics and no caution mark — because it is the ordinary, expected state and styling it as a shortfall would be a lie about the evidence behind it."
          />
          <StatusRow
            count={COVERAGE.incomplete - COVERAGE.permanentlyUnanswerable}
            status="incomplete"
            of="not shown — will improve"
            body="Something about the ability is unmodelled, unreconciled, or disputed between sources. It contributes no damage to any result, it is named in the result it is missing from, and it says what is missing rather than only that something is. This one will improve with work."
          />
          <StatusRow
            count={COVERAGE.permanentlyUnanswerable}
            status="incomplete"
            reason={PERMANENT}
            of="not shown — never will be"
            body="A fact the ability needs is stated by no source at all. The clearest case is a damage ratio whose owner is unstated: the source says an ability scales with armor and never says whose, so a person reading the page is guessing exactly as a parser would. No amount of work supplies it, and the interface says so instead of implying somebody will get to it."
          />
          <StatusRow
            count={COVERAGE.noDamage}
            status="no-damage"
            of="nothing to have evidence about"
            body="The ability deals no damage at all. Not a statement about trustworthiness — a statement that there is nothing to make one about. Claimed only when the ability’s own data template and the wiki’s damage-classification module are silent together; where they disagree it is incomplete instead."
          />
        </ul>
        <p className="ledger__headline">
          <strong>
            {COVERAGE.incompleteWithReason} of the {COVERAGE.incomplete}
          </strong>{' '}
          abilities this calculator refuses to show name what is missing. A result containing one
          says which ability and why, and the total excludes it.
        </p>
      </section>

      {/* ═══ DAMAGE OVER TIME AND THE TWO VERDICTS ═══
          A reader shown two survival verdicts needs to know what makes them disagree. Until
          2026-08-14 nothing did: the second verdict was real code receiving a zero, so the two
          lines were identical in every real scenario and the page said nothing about why. */}
      <section className="prose" aria-label="Damage over time and the second verdict">
        <h2 className="prose__title">Damage over time, and why the two verdicts can differ</h2>
        <p className="prose__p">
          A result gives the survival verdict <strong>twice</strong>: once against the burst —
          everything that lands while the combo is being executed — and once including damage that
          keeps arriving afterwards. Damage over time is never folded into the burst total. It is
          its own line, stating the total across the effect’s full duration, and the burst figure
          is what it says it is.
        </p>
        <p className="prose__p">
          Two things can put a figure into that second line, and if your scenario contains neither
          then the two verdicts agree — which is a real answer, not a placeholder:
        </p>
        <ol className="prose__ol">
          <li>
            <strong>{CAPABILITY.abilityComponentsOverTime} ability components</strong>, across{' '}
            {CAPABILITY.abilitiesWithOverTime} abilities. Parts of a champion ability whose source
            sentence a person read and confirmed states a recurring figure. The split is per
            component, not per ability: an ability that hits once <em>and</em> burns has the hit in
            the burst and the burn over time.
          </li>
          <li>
            <strong>
              {CAPABILITY.itemBurnsThatFire} of the {CAPABILITY.itemBurns} item burns
            </strong>{' '}
            — item effects the source describes as recurring at an interval. One produces a figure
            only when three things hold together: the entry is complete, the source states how many
            times it lands, and the source states what sets it off.
          </li>
        </ol>
        <p className="prose__p">
          <strong>The count of ticks is never invented.</strong> This calculator models an ordered
          sequence and has no clock in it, so “every half-second for three seconds” cannot be turned
          into a number of hits — the count has to be stated. {CAPABILITY.itemBurnsWithNoTickCount}{' '}
          burns say how hard they burn and never how many times, and{' '}
          {CAPABILITY.itemBurnsWithNoStatedTrigger} say both and never what starts them. All{' '}
          {CAPABILITY.itemBurnsWithNoTickCount + CAPABILITY.itemBurnsWithNoStatedTrigger} are named
          on the result as incomplete, with that reason, rather than left off it. An item missing
          from a breakdown reads as an item that does nothing, which is false.
        </p>
      </section>

      {/* ═══ WHAT ELSE REACHES A RESULT ═══
          Item effects went live on 2026-08-14 and this page had never mentioned them. Silence
          about a mechanic is read as absence, and absence was the wrong answer in both
          directions: items now fire, runes still do nothing. */}
      <section className="ledger" aria-label="Item effects, and which of them fire">
        <header className="ledger__head">
          <h2 className="ledger__title">Item effects, and which of them reach a result</h2>
          <p className="ledger__defn">
            <strong>{CAPABILITY.itemEffectsStored} item effects</strong> are stored and published on
            patch {CAPABILITY.patch} — every passive and active in the item pool whose damage the
            source states structurally. Each carries its own verification status, shown the same way
            an ability’s is. The four rows below account for all of them.
          </p>
        </header>
        <ul className="ledger__rows">
          <CapabilityRow
            count={CAPABILITY.itemRiders}
            of="on an attack"
            body={`On-hit (${CAPABILITY.itemOnHit}) and Spellblade (${CAPABILITY.itemSpellblade}). Each gets its own row in the breakdown rather than being folded into the attack that carried it, so its damage type and its resistance step are its own — and a rider never crits, which folding would get wrong. On-hit fires on every basic attack; Spellblade fires on the first attack after an ability and is consumed.`}
          />
          <CapabilityRow
            count={CAPABILITY.itemActives}
            of="in the combo"
            body="Item actives. You order them among the abilities like any other step, and they resolve as an instance with no rank axis."
          />
          <CapabilityRow
            count={CAPABILITY.itemBurnsThatFire}
            of="over time"
            body={`Of ${CAPABILITY.itemBurns} effects the source describes as recurring, these state both a tick count and a trigger, so a full-duration total exists. They go to the damage-over-time line and never into the burst.`}
          />
          <CapabilityRow
            count={ITEM_EFFECTS_NAMED_NEVER_APPLIED}
            of="named only"
            body={`A fact each one needs is absent from the source: ${CAPABILITY.itemBurnsWithNoTickCount} burns state no number of ticks, ${CAPABILITY.itemBurnsWithNoStatedTrigger} state no trigger, and ${CAPABILITY.itemEffectsWithNoStatedDelivery} never say how the effect reaches the target at all. None is guessed onto a carrier. Every one is named on the result with its reason.`}
          />
        </ul>
        <p className="ledger__headline">
          The timing rules these effects carry in game — a Spellblade cooldown, a burn’s duration —
          are <strong>not modelled and are listed on the result</strong>. This engine has no clock,
          so the sequence rule is applied and the omission is stated rather than approximated with
          an invented interval.
        </p>
      </section>

      <section className="prose" aria-label="Runes and the defender's own kit">
        <h2 className="prose__title">What is not applied yet, and how much of it there is</h2>
        <p className="prose__p">
          <strong>
            Runes: {CAPABILITY.runesModelled} of {CAPABILITY.runesPublished}.
          </strong>{' '}
          All {CAPABILITY.runesPublished} runes in the game are published to this site — that is the
          full pool, names and icons — and {CAPABILITY.runesCurated} have a value read from source
          and stored. Storing a value is not applying it: {CAPABILITY.runesModelled} of them
          actually change a figure, because the engine fires a rune only where a person has read
          the sentence that says how it reaches its target. There is no rune page to configure yet,
          so even that one arrives only through a shared link. A keystone is often a large
          share of a real combo, so a total here is a total <em>without</em> runes and should be
          read that way.
        </p>
        <p className="prose__p">
          <strong>
            The defender’s own kit: {CAPABILITY.defensiveApplied} of {CAPABILITY.defensiveStored}.
          </strong>{' '}
          {CAPABILITY.defensiveStored} defensive effects — shields, heals and damage reductions in
          champions’ own abilities — have been read from the source and stored.{' '}
          {CAPABILITY.defensiveReadyToApply} of them state a number, are complete, and name
          something this engine already has a step for — and{' '}
          <strong>{CAPABILITY.defensiveApplied} actually change a figure</strong>, measured by
          switching each on alone against a level-11 defender. The{' '}
          {CAPABILITY.defensiveReadyToApply - CAPABILITY.defensiveApplied} between those two counts
          are refused for a reason the shape alone could not show, and none of them is fixable by
          us: three restore a share of the damage the defender deals, which cannot exist because
          the defender does not act; one amplifies other healing, which no step models; and two
          read “the target”, which on a defensive effect is ambiguous — for one of them the target
          is the attacker, for the other an ally who is not in the scenario at all.{' '}
          <strong>
            The largest cause used to be recurrence and it is now cleared entirely.
          </strong>{' '}
          Eighteen effects spread a figure over a duration and the engine could not tell one
          occurrence from the whole channel. Nine now say which, and apply. The other nine say
          they are one occurrence and state no count of them, so they are honestly not shown —
          and that is a sentence somebody can still supply, not a fact no source states. The rest read a share of damage the defender deals, which cannot exist because the
          defender does not act; amplify other healing, which has no step; or read “the target”,
          which on a defensive effect is ambiguous. Every one is conditional — it
          depends on whether the defender had it up when the combo landed, and you state that.
          A defence you have not switched on is treated as down: assuming otherwise would credit
          a build with a defence nobody chose.
        </p>
        <p className="prose__p">
          Both figures are counted from the same published files as everything else on this page,
          and both are stated here rather than left to be inferred from a result that looks
          complete.
        </p>
      </section>

      <section className="prose" aria-label="Contested base statistics">
        <h2 className="prose__title">When Riot’s own sources disagree</h2>
        <p className="prose__p">
          A champion’s base statistics come from two places that can contradict each other. Where
          evidence settles it — usually the patch notes — the settled value is used and nothing is
          said. Where nothing settles it, the champion is marked <em>contested</em>: the value that
          ships with the patch is used, and{' '}
          <strong>every result involving that champion carries a visible note</strong> naming the
          field and both observed values. It is never presented as verified.
        </p>
      </section>

      <section className="prose" aria-label="Checking it yourself">
        <h2 className="prose__title">Checking this yourself</h2>
        <p className="prose__p">
          None of the above is worth anything if you have to take our word for it. The data files,
          the checks that run over them and the test suite are all public, and the counts on this
          page are generated from the same files the calculator loads — so the same count is
          available to anyone who downloads them.
        </p>
        <p className="prose__p">
          <a href={SOURCE_URL} rel="noreferrer">
            <GitHubMark />
            Source, data and test suite
          </a>{' '}
          · <a href={pageById('report').path}>Report a number you think is wrong</a>
        </p>
      </section>
    </>
  );
}

/**
 * A ledger row with no verification mark — the figure is a count of effects, not a claim about
 * evidence, and borrowing the status glyph would say something about trust that is not meant.
 * Same three-column grid, so the figures still share an edge with the ones above.
 */
function CapabilityRow({ count, of, body }: { count: number; of: string; body: string }) {
  return (
    <li className="ledger__row">
      <span className="ledger__count">{count}</span>
      <span className="ledger__mark">
        <span className="ledger__of">{of}</span>
      </span>
      <span className="ledger__meaning">{body}</span>
    </li>
  );
}

function StatusRow({
  count,
  status,
  reason,
  of,
  body,
}: {
  count: number;
  status: 'verified' | 'derived' | 'incomplete' | 'no-damage';
  reason?: IncompleteReason;
  of: string;
  body: string;
}) {
  return (
    <li className="ledger__row">
      <span className="ledger__count">{count}</span>
      <span className="ledger__mark">
        <VerificationStatusMark
          status={status}
          reason={reason}
          spokenSubject={`${count} abilities`}
        />
        <span className="ledger__of">{of}</span>
      </span>
      <span className="ledger__meaning">{body}</span>
    </li>
  );
}
