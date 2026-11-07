<!--
Thanks for upstreaming this. Read CONTRIBUTING.md before you submit. Keep it small: one defect, one fix,
one regression test. If you cannot test against a real jXchange core or a live AWS stack, say so plainly
below; an honest "not verified" is expected, an unstated gap is not.
-->

## What changed and why

<!-- The defect or deployment problem, the smallest fix, and what you deliberately did not add. -->

Fixes #

## Verification — what was actually run

Paste the real output, not a claim. `npm run verify` covers the template sync check and the full suite.

- [ ] `npm run verify` passes — summary: `# tests ___ / # pass ___ / # fail ___`
- [ ] `npm run build` run and `template.yaml` regenerated (required when `src/` or `infra/template.yaml` changed)
- [ ] Regression test added or updated for this bug fix — test name or path:
- [ ] New behavior covered by a test, not only by a manual call
- [ ] `git status` is clean except for the intended files

## What this was validated against

Check every box that is true. Do not check a box for a run that did not happen.

- [ ] Local fake jXchange core via `npm run dev` or `npm test`
- [ ] Deployed AWS stack (say which region and whether it was a sandbox)
- [ ] A real jXchange core (say which core, environment, and whether shapes were redacted)
- [ ] Template or docs inspection only

## Not validated — required disclosure

- [ ] **Not validated against a real jXchange core.**
- [ ] **Not validated against a live AWS deployment.**

If either box is checked, explain what remains unproven and what a deployer should watch:

<!-- e.g. "Only exercised against mock/jxchange.js; real AcctHistSrch element names may differ." -->

## Security and data handling

- [ ] No API keys, invite codes, consumer credentials, client certificates, account numbers, customer data,
      or full upstream payloads appear in this description, the diff, tests, fixtures, logs, or screenshots.
- [ ] No account, customer, or transaction data is now stored at rest, and no new runtime dependency was added.
- [ ] No write or money-movement path was added (or this PR is the separately reviewed design for one).
- [ ] Persona masking, persona selection, and invite validation still fail closed (or this PR does not touch them).
- [ ] `template.yaml` stays in sync with `infra/template.yaml` and still fits the 51,200-byte limit.

## Docs updated

- [ ] `README.md` / `AGENTS.md` / `CONTRIBUTING.md` / `llms.txt` / `index.html` updated if behavior, API,
      deployment, or security changed — or this PR does not change any of them.
- [ ] `todo.md` ticked and `history.md` appended for a behavior change.

## Reviewer notes

<!-- Anything a maintainer should know: follow-up issues, known limits, parts you are unsure about. -->
