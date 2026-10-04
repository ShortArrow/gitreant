# ADR 0031: Exempt a one-language rewording from the bilingual check by a commit mark

## Status

Accepted (2026-10-05)

## Context

For bilingual documents (`X.jp.md` and `X.md`), CI checks that a change to
one side changes the other in the same push
(`.github/scripts/check-docs-tandem.sh`). Japanese is canonical, and the
check keeps the English from failing to follow what the Japanese says. A
change that only re-breaks lines is already exempt: it has nothing for the
other language to follow.

Proofreading the Japanese produces many changes that alter the wording but
not what it says: a literal-translation metaphor turned into plain words, a
dash or colon turned into a full stop, a subject and predicate made to
agree. The English has nothing to fix, yet the check demands an English
change. Making a meaningless English change to pass it defeats the check's
purpose.

## Decision

- **A file changed only by commits whose message contains `[wording-only]`
  is exempt from the bilingual check.** The decision is per file: it is
  exempt only when every commit in the checked range that touched it
  carries the mark. If one unmarked commit touched it, the other language
  must change as before.
- **The mark works for either language.** A rewording of the English alone
  is treated the same way.
- **`[jp-only]` and `[en-only]` name the side that changes.** `[jp-only]`
  exempts only a change to a `.jp.md` file and `[en-only]` only a change to
  an English `.md` file. A file on the other side is not exempted, so a
  misplaced mark cannot hide a missed change in the other language. Commits
  touching the same file may carry different marks, as long as each mark
  applies to that file.
- **The mark is only for changes the other language has nothing to follow
  in.** A change that makes the meaning clearer in a way the other language
  should reflect goes unmarked and changes both sides.
- Examples of the check's behaviour live in
  `.github/scripts/test-docs-tandem.sh`, which CI runs.

## Consequences

- Japanese proofreading can land without touching the English.
- Whether to mark is the author's judgement, which CI cannot check. A mark
  on a change that alters the meaning lets a missed English update through,
  so review asks of a marked commit whether it really only rewords.
- Rewording and changes of meaning go into separate commits.
