# /curated/ — the project's irreplaceable, hand-authored source

This top-level directory holds the **curated override files** (ability damage and ratios,
item passive values, rune values, per-ability stack yields). Everything else in this project
can be re-fetched from the wiki or Data Dragon. **This cannot.** It is hand-authored and
verified by a human, and it is the one input whose loss cannot be undone.

## The rule

**No script may write to or delete anything under `/curated/`.** The data pipeline only ever
**reads** this directory. The build step **copies** it into `public/data/curated/` to serve —
that copy is disposable; this source is not.

## Two mechanical guards enforce this (it is not just a request)

1. **A Claude Code hook** (`.claude/hooks/protect-curated.sh`, wired in `.claude/settings.json`)
   refuses `Write`, `Edit`, and `MultiEdit` tool calls that target this directory, and refuses
   obvious destructive `Bash` commands (`rm`, `>`, `sed -i`, `truncate`, `tee`, …) that name it.
2. **Filesystem read-only permissions** on this directory and its files. A stray write — even
   one buried inside a Node or Python script the hook cannot inspect — fails with a permission
   error instead of silently destroying data.

## To edit it deliberately (the sanctioned path)

Authoring the curated data is a supervised, review-gated task. To unlock for that work:

```bash
chmod -R u+w curated/          # unlock
# … make the change deliberately …
chmod -R a-w curated/          # re-lock when done
```

The friction is intentional. Modifying the irreplaceable asset should be a conscious act,
never an accident.
