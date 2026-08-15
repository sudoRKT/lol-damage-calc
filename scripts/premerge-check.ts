// THE PRE-MERGE CHECK — run the whole suite against the curated file you are ABOUT to merge.
//
//   node scripts/premerge-check.ts [path-to-proposal]
//
// Default proposal: build/proposed-curated/merged-proposal.json
//
// ═══ WHY THIS EXISTS, WRITTEN THE DAY IT WAS NEEDED AND WAS NOT THERE ═══
//
// On 2026-08-15 a merge into `/curated/` was verified carefully and handed over with commands.
// The verification was real: the file's hash, its entry count, its component count, gate 8 over
// it, and the four abilities it was meant to fix, all measured. The suite was green — against the
// OLD file. Nothing ran it against the NEW one.
//
// The merge was correct. **Fifteen tests failed the moment it landed**, and the project owner
// found them instead of the session that handed over the commands. None was a bad merge; all
// fifteen were checks pinned to data the merge legitimately moved. But the person merging could
// not tell that from the failure list, and the difference between "your merge broke the build"
// and "your merge moved twelve pinned figures, here they are" is the whole cost.
//
// A merge changes the data that a dozen tests measure. So the suite must run against the merged
// state BEFORE the merge, not after. That is all this is.
//
// ═══ HOW IT WORKS, AND WHY IT COPIES RATHER THAN SUBSTITUTES IN PLACE ═══
//
// It builds a throwaway copy of the repository in a temporary directory, puts the PROPOSED file
// where the curated one goes, regenerates the served per-champion ability files from it, and runs
// the real suite there. Nothing in the working tree is touched and `/curated/` is never opened
// for writing.
//
// The copy is what makes it honest. Every path in this project resolves from the repository root
// (`published-files.ts` walks up from `import.meta.url`), so a copied tree resolves entirely
// within itself — the tests read the proposed data because it is the only data there. No test
// needs to know this tool exists, no loader needs an override hook, and there is no way for a
// substitution to leak into a real run.
//
// ═══ THE GUARD IT ENFORCES ON ITSELF ═══
//
// CLAUDE.md: no script may write `/curated/`, and the hooks that enforce it inspect tool calls
// rather than what a script does once running. This script therefore checks its own target: it
// refuses to run unless the file it is about to write is inside the temporary root, and it
// compares against the real path rather than against a string it was passed. Writing the check
// into the tool is the only protection available to a tool the hooks cannot see inside.

import { execFileSync, execSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'));
const REAL_CURATED_DIR = join(ROOT, 'curated');

const argv = process.argv.slice(2);
const baselineFlag = argv.indexOf('--baseline');
/**
 * The file to treat as "what is live". Defaults to the real curated file, which is what you want
 * before a merge. It is overridable so the tool can be pointed at any two curated files — which
 * is how it was proved: replaying the 2026-08-15 merge with the pre-merge file as baseline.
 */
const BASELINE = baselineFlag === -1 ? join(REAL_CURATED_DIR, 'curated-data.json') : resolve(argv[baselineFlag + 1]!);
if (baselineFlag !== -1) argv.splice(baselineFlag, 2);
const PROPOSAL = resolve(argv[0] ?? join(ROOT, 'build', 'proposed-curated', 'merged-proposal.json'));

/**
 * Top-level entries the copy does not need. `node_modules` is symlinked instead of copied.
 *
 * `build/` IS copied, deliberately, and that was not obvious: `build-ability-files.ts` reads
 * `build/proposed-curated/merge-refusals.json` so the 18 entries gate 1 refused are carried into
 * the served files as named gaps rather than falling off the edge (DATA-SOURCES §53.2). Skipping
 * it made the rebuild fail outright. It is 6 MB and the whole copy still takes under a second.
 */
const SKIP = new Set(['node_modules', '.git', 'dist']);

function die(message: string): never {
  console.error(`premerge-check: ${message}`);
  process.exit(2);
}

if (!existsSync(PROPOSAL)) die(`no proposal at ${PROPOSAL}`);

const proposal = JSON.parse(readFileSync(PROPOSAL, 'utf8')) as {
  patch?: string;
  abilities?: unknown[];
};
if (!Array.isArray(proposal.abilities)) {
  die(`${PROPOSAL} has no 'abilities' array — this is not a curated file`);
}

if (!existsSync(BASELINE)) die(`no baseline at ${BASELINE}`);
const live = JSON.parse(readFileSync(BASELINE, 'utf8')) as {
  abilities: Array<Record<string, unknown>>;
};

const workspace = mkdtempSync(join(tmpdir(), 'premerge-'));
let failed = false;

interface SuiteRun {
  output: string;
  failing: string[];
  tally: string;
  files: string;
  failed: boolean;
}

/** Run the real suite in the workspace and parse what failed. */
function runSuite(): SuiteRun {
  let output = '';
  let crashed = false;
  try {
    output = execSync('npx vitest run --reporter=basic', {
      cwd: workspace,
      stdio: 'pipe',
      maxBuffer: 1 << 28,
      env: { ...process.env, CI: '1' },
    }).toString();
  } catch (error) {
    const e = error as { stdout?: Buffer; stderr?: Buffer };
    output = `${e.stdout?.toString() ?? ''}${e.stderr?.toString() ?? ''}`;
    crashed = true;
  }
  // Vitest emits ANSI escapes even into a pipe, and leaving them in makes both the parse and the
  // printed tally unreadable. The failing lines are the basic reporter's `×` rows; a `FAIL`
  // pattern matches nothing, because that word only appears in the detailed error blocks the
  // basic reporter does not print.
  const plain = output.replace(/\u001b\[[0-9;]*m/g, '');
  return {
    output: plain,
    failing: [
      ...new Set(
        [...plain.matchAll(/^\s*×\s+(.+?)(?:\s+\d+ms)?\s*$/gm)].map((m) => m[1].trim()),
      ),
    ],
    tally: plain.match(/Tests\s+(.+)$/m)?.[1]?.trim() ?? 'not reported',
    files: plain.match(/Test Files\s+(.+)$/m)?.[1]?.trim() ?? 'not reported',
    failed: crashed,
  };
}

try {
  console.log(`premerge-check: proposal ${PROPOSAL}`);
  console.log(`premerge-check: workspace ${workspace}`);

  // ── copy the repository, minus what does not need copying ────────────────────────────────
  cpSync(ROOT, workspace, {
    recursive: true,
    dereference: false,
    filter: (src) => {
      const rel = src.slice(ROOT.length + 1);
      const top = rel.split('/')[0];
      return !(top && SKIP.has(top));
    },
  });
  symlinkSync(join(ROOT, 'node_modules'), join(workspace, 'node_modules'), 'dir');

  // ── THE GUARD: prove the target is the copy and not the real thing ───────────────────────
  const target = resolve(join(workspace, 'curated', 'curated-data.json'));
  if (!target.startsWith(resolve(workspace) + '/')) {
    die(`refusing to write ${target}: it is outside the temporary workspace`);
  }
  if (resolve(dirname(target)) === REAL_CURATED_DIR) {
    die(`refusing to write ${target}: that is the project's protected curated directory`);
  }

  // `cpSync` carries the source's read-only mode across, so the copy needs unlocking.
  execFileSync('chmod', ['-R', 'u+w', join(workspace, 'curated')]);
  // The baseline file goes in first, so the "before" run measures the baseline and not whatever
  // happened to be in the working tree's curated directory.
  writeFileSync(target, readFileSync(BASELINE));
  execSync('node scripts/build-ability-files.ts', { cwd: workspace, stdio: 'pipe' });

  // ── what this merge would change, stated before the suite runs ───────────────────────────
  const changed = (proposal.abilities as Array<Record<string, unknown>>).filter((a) => {
    const b = live.abilities.find(
      (x) => x.champion === a.champion && x.slot === a.slot && x.abilityName === a.abilityName,
    );
    return !b || JSON.stringify(a) !== JSON.stringify(b);
  });
  const mix = (rows: Array<Record<string, unknown>>) => {
    const m: Record<string, number> = {};
    for (const r of rows) m[String(r.verification)] = (m[String(r.verification)] ?? 0) + 1;
    return m;
  };
  const components = (rows: Array<Record<string, unknown>>) =>
    rows.reduce((n, r) => n + ((r.components as unknown[]) ?? []).length, 0);

  console.log('\n─── what this merge would change ───');
  console.log(`entries: ${live.abilities.length} -> ${proposal.abilities.length}`);
  console.log(`entries differing from the live file: ${changed.length}`);
  console.log(`damage components: ${components(live.abilities)} -> ${components(proposal.abilities as never)}`);
  console.log(`verification mix, live    : ${JSON.stringify(mix(live.abilities))}`);
  console.log(`verification mix, proposed: ${JSON.stringify(mix(proposal.abilities as never))}`);

  // ── the real suite, twice ────────────────────────────────────────────────────────────────
  //
  // TWICE, AND THIS IS THE PART THAT MAKES THE TOOL USABLE RATHER THAN NOISY. Running once
  // against the merged state answers "what is red", which is not the question — a working tree
  // mid-task has red tests that have nothing to do with any merge. The question is what the
  // MERGE changes, so the baseline is measured first, in the same copied tree, and the two
  // failure sets are differenced.
  console.log('\n─── running the suite against the BASELINE, before substituting ───');
  const baselineRun = runSuite();
  console.log(`Tests      ${baselineRun.tally}`);

  writeFileSync(target, readFileSync(PROPOSAL));
  console.log('\npremerge-check: rebuilding the served ability files from the proposal…');
  execSync('node scripts/build-ability-files.ts', { cwd: workspace, stdio: 'pipe' });

  console.log('\n─── running the suite against the MERGED state ───');
  const mergedRun = runSuite();
  const { output, failing: mergedFailing, tally, files } = mergedRun;
  failed = mergedRun.failed;

  console.log(`\nTest Files ${files}`);
  console.log(`Tests      ${tally}`);

  const wasAlreadyRed = baselineRun.failing;
  const newlyRed = mergedFailing.filter((f) => !wasAlreadyRed.includes(f));
  const nowGreen = wasAlreadyRed.filter((f) => !mergedFailing.includes(f));

  if (failed && mergedFailing.length === 0) {
    // A run that failed but produced no parsable line is a DIFFERENT and worse outcome than a
    // clean pass: the suite did not get as far as running tests. Never report it as green.
    console.log('\nTHE SUITE DID NOT COMPLETE against the merged state, and no individual test');
    console.log('failure was reported. That is a build or import error rather than a moved figure.');
    console.log('The last 40 lines of its output:\n');
    console.log(output.trimEnd().split('\n').slice(-40).join('\n'));
  } else if (newlyRed.length === 0) {
    console.log('\nTHIS MERGE BREAKS NOTHING. No test passes on the baseline and fails on it.');
    if (wasAlreadyRed.length > 0) {
      console.log(
        `\n(${wasAlreadyRed.length} test(s) are already failing on the BASELINE and are not this ` +
          `merge's doing. They are listed below so the number is not mistaken for a clean run.)`,
      );
      for (const f of wasAlreadyRed) console.log(`  already red: ${f}`);
    }
  } else {
    console.log(`\n${newlyRed.length} TEST(S) WOULD FAIL THE MOMENT THIS MERGE LANDS:\n`);
    for (const f of newlyRed) console.log(`  ${f}`);
    if (wasAlreadyRed.length > 0) {
      console.log(`\n${wasAlreadyRed.length} were ALREADY failing before it and are not its doing:`);
      for (const f of wasAlreadyRed) console.log(`  already red: ${f}`);
    }
    console.log(
      '\nA failure here is NOT proof the merge is wrong. Every one of these is a check measuring ' +
        'data the merge moves, and each asks the same question: is this figure a fact about the ' +
        "world, or a pin on yesterday's data? Answer it before merging, not after — that is the " +
        'whole point of running this first.',
    );
  }
  if (nowGreen.length > 0) {
    console.log(`\n${nowGreen.length} test(s) FAIL on the baseline and PASS after the merge:`);
    for (const f of nowGreen) console.log(`  fixed by the merge: ${f}`);
  }

  // Exit non-zero only for what this merge would BREAK. A tree that was already red stays the
  // caller's problem and not this tool's verdict.
  failed = newlyRed.length > 0 || (failed && mergedFailing.length === 0);
} finally {
  rmSync(workspace, { recursive: true, force: true });
}

process.exit(failed ? 1 : 0);
